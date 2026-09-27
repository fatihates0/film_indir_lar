<?php

namespace App\Http\Controllers;

use App\Services\PlexUsageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class PlexWebhookController extends Controller
{
    public function __construct(
        protected PlexUsageService $plexUsageService,
    ) {}

    public function handle(Request $request): JsonResponse
    {
        $payload = $request->input('payload');
        if (! $payload) {
            return response()->json(['status' => 'ignored', 'reason' => 'missing_payload']);
        }

        $data = is_string($payload) ? json_decode($payload, true) : $payload;
        if (! is_array($data)) {
            return response()->json(['status' => 'ignored', 'reason' => 'invalid_json']);
        }

        $event = $data['event'] ?? '';
        $userTitle = $data['Account']['title'] ?? null;
        $sessionId = $data['Player']['machineIdentifier'] ?? ($data['Session']['id'] ?? null);
        $viewOffsetMs = $data['Metadata']['viewOffset'] ?? 0;
        $bitrate = $data['Metadata']['bitrate'] ?? 0;

        if (in_array($event, ['media.play', 'media.pause', 'media.scramble', 'media.resume'])) {
            $this->plexUsageService->processSessionTelemetry([
                'plex_username' => $userTitle,
                'plex_session_id' => $sessionId,
                'view_offset_ms' => $viewOffsetMs,
                'bitrate' => $bitrate,
            ]);
        } elseif ($event === 'media.stop' && $sessionId) {
            $this->plexUsageService->stopSession($sessionId);
        }

        return response()->json(['status' => 'processed']);
    }
}
