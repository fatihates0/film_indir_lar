<?php

namespace App\Services;

use App\Enums\PlexUsageMode;
use App\Models\Media;
use App\Models\PlexAccount;
use App\Models\PlexUsageSession;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\Log;

class PlexUsageService
{
    /**
     * Process an incoming Plex session telemetry (Polling or Webhook).
     */
    public function processSessionTelemetry(array $data): ?PlexUsageSession
    {
        $plexUsername = $data['plex_username'] ?? null;
        $plexSessionId = $data['plex_session_id'] ?? null;
        $mediaId = $data['media_id'] ?? null;
        $viewOffsetMs = (int) ($data['view_offset_ms'] ?? 0);
        $bitrate = (int) ($data['bitrate'] ?? 0); // kbps or bps

        if (! $plexUsername || ! $plexSessionId) {
            return null;
        }

        // Match Plex Account to Laravel User
        $plexAccount = PlexAccount::where('plex_username', $plexUsername)
            ->where('is_active', true)
            ->first();

        $user = $plexAccount ? $plexAccount->user : User::where('email', $plexUsername)->first();

        if (! $user || ! $user->isActive() || ! $user->plex_enabled) {
            Log::info("Plex telemetry ignored: user not found or disabled for {$plexUsername}");

            return null;
        }

        $media = $mediaId ? Media::find($mediaId) : null;
        $mediaBitrate = $bitrate > 0 ? $bitrate : ($media?->bitrate ?? 5000000); // Default 5 Mbps fallback

        // Normalize bitrate to bps
        if ($mediaBitrate < 100000) {
            $mediaBitrate = $mediaBitrate * 1000; // kbps to bps
        }

        $session = PlexUsageSession::where('plex_session_id', $plexSessionId)->first();

        $now = Carbon::now();

        if (! $session) {
            $session = PlexUsageSession::create([
                'user_id' => $user->id,
                'plex_account_id' => $plexAccount?->id,
                'media_id' => $media?->id,
                'plex_session_id' => $plexSessionId,
                'started_at' => $now,
                'last_seen_at' => $now,
                'last_position_ms' => $viewOffsetMs,
                'usage_bytes' => 0,
                'usage_mode' => PlexUsageMode::ESTIMATED,
                'status' => 'active',
            ]);
        }

        // Calculate delta progress ms
        $deltaMs = max(0, $viewOffsetMs - $session->last_position_ms);

        if ($deltaMs > 0) {
            $deltaSeconds = $deltaMs / 1000.0;
            // Estimated Bytes = (Seconds * Bitrate) / 8
            $bytesConsumed = (int) round(($deltaSeconds * $mediaBitrate) / 8.0);

            $session->update([
                'usage_bytes' => $session->usage_bytes + $bytesConsumed,
                'last_position_ms' => $viewOffsetMs,
                'last_seen_at' => $now,
            ]);
        } else {
            $session->update(['last_seen_at' => $now]);
        }

        return $session;
    }

    /**
     * Stop a Plex usage session.
     */
    public function stopSession(string $plexSessionId): void
    {
        $session = PlexUsageSession::where('plex_session_id', $plexSessionId)->first();
        if ($session && $session->status === 'active') {
            $session->update([
                'status' => 'stopped',
                'stopped_at' => Carbon::now(),
            ]);
        }
    }
}
