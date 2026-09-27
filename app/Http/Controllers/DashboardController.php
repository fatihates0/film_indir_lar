<?php

namespace App\Http\Controllers;

use App\Enums\UsageSource;
use App\Models\QuotaUsageRecord;
use App\Services\QuotaService;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class DashboardController extends Controller
{
    public function __construct(
        protected QuotaService $quotaService,
    ) {}

    public function index(Request $request): Response
    {
        $user = $request->user();
        $quota = $this->quotaService->ensureCurrentPeriod($user);

        // Fetch recent consumption records
        $recentUsage = QuotaUsageRecord::with('media')
            ->where('user_id', $user->id)
            ->latest()
            ->take(10)
            ->get();

        // Calculate breakdown by source
        $downloadUsageBytes = QuotaUsageRecord::where('user_id', $user->id)
            ->where('source', UsageSource::DOWNLOAD)
            ->sum('bytes');

        $plexUsageBytes = QuotaUsageRecord::where('user_id', $user->id)
            ->where('source', UsageSource::PLEX)
            ->sum('bytes');

        return Inertia::render('Dashboard', [
            'quota' => [
                'limit_bytes' => $quota->quota_limit_bytes,
                'used_bytes' => $quota->used_bytes,
                'remaining_bytes' => $quota->remaining_bytes,
                'limit_gb' => round($quota->quota_limit_bytes / 1073741824, 1),
                'used_gb' => round($quota->used_bytes / 1073741824, 1),
                'remaining_gb' => round($quota->remaining_bytes / 1073741824, 1),
                'period_started_at' => $quota->period_started_at->toIso8601String(),
                'period_expires_at' => $quota->period_expires_at->toIso8601String(),
                'days_left' => max(0, (int) now()->diffInDays($quota->period_expires_at, false)),
            ],
            'breakdown' => [
                'download_gb' => round($downloadUsageBytes / 1073741824, 2),
                'plex_gb' => round($plexUsageBytes / 1073741824, 2),
            ],
            'recent_usage' => $recentUsage,
        ]);
    }
}
