<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DownloadSession;
use App\Models\Media;
use App\Models\PlexUsageSession;
use App\Models\User;
use App\Services\JellyfinService;
use App\Services\PlexService;
use App\Services\StorageBoxService;
use Inertia\Inertia;
use Inertia\Response;

class AdminDashboardController extends Controller
{
    public function index(PlexService $plexService, StorageBoxService $storageBoxService, JellyfinService $jellyfinService): Response
    {
        $totalUsers = User::count();
        $activeUsers = User::where('status', 'active')->count();

        $totalMedia = Media::count();
        $totalStorageBytes = Media::sum('file_size');

        $activeDownloads = DownloadSession::where('status', 'active')->count();
        $activePlexSessions = PlexUsageSession::where('status', 'active')->count();

        $plexStatus = $plexService->getStatus();
        $storageBoxMounted = $storageBoxService->isMounted();
        $jellyfinStatus = $jellyfinService->getStatus();

        return Inertia::render('Admin/Dashboard', [
            'stats' => [
                'total_users' => $totalUsers,
                'active_users' => $activeUsers,
                'total_media' => $totalMedia,
                'total_storage_gb' => round($totalStorageBytes / 1073741824, 1),
                'active_downloads' => $activeDownloads,
                'active_plex_sessions' => $activePlexSessions,
            ],
            'system_status' => [
                'storage_box' => $storageBoxMounted ? 'ONLINE' : 'OFFLINE',
                'plex' => $plexStatus['online'] ? 'ONLINE' : 'OFFLINE',
                'plex_version' => $plexStatus['version'] ?? null,
                'jellyfin' => $jellyfinStatus['online'] ? 'ONLINE' : 'OFFLINE',
                'jellyfin_version' => $jellyfinStatus['version'] ?? null,
                'jellyfin_configured' => $jellyfinStatus['configured'] ?? false,
            ],
        ]);
    }
}
