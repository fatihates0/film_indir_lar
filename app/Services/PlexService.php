<?php

namespace App\Services;

use Exception;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class PlexService
{
    protected string $url;
    protected string $token;

    public function __construct()
    {
        $this->url = rtrim(config('plex.url', 'http://127.0.0.1:32400'), '/');
        $this->token = config('plex.token', '');
    }

    /**
     * Check if Plex Server is online and accessible.
     */
    public function getStatus(): array
    {
        if (empty($this->token)) {
            return [
                'online' => false,
                'message' => 'Plex token configuration is missing.',
            ];
        }

        try {
            $response = Http::timeout(5)
                ->withHeaders([
                    'X-Plex-Token' => $this->token,
                    'Accept' => 'application/json',
                ])
                ->get("{$this->url}/identity");

            if ($response->successful()) {
                return [
                    'online' => true,
                    'version' => $response->json('MediaContainer.version', 'Unknown'),
                ];
            }

            return [
                'online' => false,
                'message' => 'Plex server returned status ' . $response->status(),
            ];
        } catch (Exception $e) {
            Log::warning('Plex status check failed: ' . $e->getMessage());

            return [
                'online' => false,
                'message' => 'Plex server unreachable.',
            ];
        }
    }

    /**
     * Fetch active playback sessions from Plex Server REST API.
     */
    public function getActiveSessions(): array
    {
        if (empty($this->token)) {
            return [];
        }

        try {
            $response = Http::timeout(5)
                ->withHeaders([
                    'X-Plex-Token' => $this->token,
                    'Accept' => 'application/json',
                ])
                ->get("{$this->url}/status/sessions");

            if (! $response->successful()) {
                return [];
            }

            $container = $response->json('MediaContainer') ?? [];
            $metadataList = $container['Metadata'] ?? [];

            $sessions = [];
            foreach ($metadataList as $item) {
                $user = $item['User'] ?? [];
                $player = $item['Player'] ?? [];
                $session = $item['Session'] ?? [];

                $sessions[] = [
                    'plex_session_id' => $session['id'] ?? ($player['machineIdentifier'] ?? null),
                    'plex_username' => $user['title'] ?? null,
                    'media_title' => $item['title'] ?? null,
                    'view_offset_ms' => $item['viewOffset'] ?? 0,
                    'duration_ms' => $item['duration'] ?? 0,
                    'bitrate' => $item['bitrate'] ?? 0,
                    'state' => $player['state'] ?? 'playing',
                    'device' => $player['title'] ?? 'Unknown Device',
                ];
            }

            return $sessions;
        } catch (Exception $e) {
            Log::error('Plex getActiveSessions error: ' . $e->getMessage());

            return [];
        }
    }
}
