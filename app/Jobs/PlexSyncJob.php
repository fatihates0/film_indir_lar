<?php

namespace App\Jobs;

use App\Services\PlexService;
use App\Services\PlexUsageService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class PlexSyncJob implements ShouldQueue
{
    use Queueable;

    public function handle(PlexService $plexService, PlexUsageService $plexUsageService): void
    {
        $status = $plexService->getStatus();
        if (! $status['online']) {
            Log::info('PlexSyncJob skipped: Plex server offline or token missing.');

            return;
        }

        $sessions = $plexService->getActiveSessions();
        foreach ($sessions as $sessionData) {
            $plexUsageService->processSessionTelemetry($sessionData);
        }
    }
}
