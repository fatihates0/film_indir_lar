<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\DownloadSession;
use App\Models\Media;
use App\Models\PlexUsageSession;
use App\Models\QuotaUsageRecord;
use App\Models\User;
use App\Models\UserQuota;
use App\Services\PlexService;
use App\Services\StorageBoxService;
use Inertia\Inertia;
use Inertia\Response;

class AdminDashboardController extends Controller
{
    public function index(PlexService $plexService, StorageBoxService $storageBoxService): Response
    {
        $totalUsers = User::count();
        $activeUsers = User::where('status', 'active')->count();

        $totalMedia = Media::count();
        $totalStorageBytes = Media::sum('file_size');

        $totalQuotaBytes = UserQuota::sum('quota_limit_bytes');
        $totalUsedBytes = UserQuota::sum('used_bytes');

        $todayDownloadBytes = QuotaUsageRecord::where('source', 'download')
            ->whereDate('created_at', today())
            ->sum('bytes');

        $todayPlexBytes = QuotaUsageRecord::where('source', 'plex')
            ->whereDate('created_at', today())
            ->sum('bytes');

        $activeDownloads = DownloadSession::where('status', 'active')->count();
        $activePlexSessions = PlexUsageSession::where('status', 'active')->count();

        $plexStatus = $plexService->getStatus();
        $storageBoxMounted = $storageBoxService->isMounted();

        return Inertia::render('Admin/Dashboard', [
            'stats' => [
                'total_users' => $totalUsers,
                'active_users' => $activeUsers,
                'total_media' => $totalMedia,
                'total_storage_gb' => round($totalStorageBytes / 1073741824, 1),
                'total_quota_tb' => round($totalQuotaBytes / 1099511627776, 2),
                'total_used_tb' => round($totalUsedBytes / 1099511627776, 2),
                'today_download_gb' => round($todayDownloadBytes / 1073741824, 2),
                'today_plex_gb' => round($todayPlexBytes / 1073741824, 2),
                'active_downloads' => $activeDownloads,
                'active_plex_sessions' => $activePlexSessions,
            ],
            'system_status' => [
                'storage_box' => $storageBoxMounted ? 'ONLINE' : 'OFFLINE',
                'plex' => $plexStatus['online'] ? 'ONLINE' : 'OFFLINE',
                'plex_version' => $plexStatus['version'] ?? null,
            ],
        ]);
    }
}
