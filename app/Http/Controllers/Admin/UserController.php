<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\QuotaService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    public function __construct(
        protected QuotaService $quotaService,
        protected AuditLogService $auditLogService,
    ) {}

    public function index(Request $request): Response
    {
        $users = User::with(['activeQuota', 'quotaPlan'])
            ->orderBy('id', 'desc')
            ->paginate(15);

        return Inertia::render('Admin/Users/Index', [
            'users' => $users,
        ]);
    }

    public function updateQuota(User $user, Request $request): RedirectResponse
    {
        $request->validate([
            'quota_limit_gb' => ['required', 'numeric', 'min:1'],
        ]);

        $newLimitBytes = (int) round($request->input('quota_limit_gb') * 1073741824);
        $oldQuota = $user->activeQuota;
        $oldLimit = $oldQuota ? $oldQuota->quota_limit_bytes : 0;

        $this->quotaService->updateQuotaLimit($user, $newLimitBytes);

        $this->auditLogService->log(
            action: 'quota_updated',
            targetType: 'User',
            targetId: (string) $user->id,
            oldValues: ['quota_limit_bytes' => $oldLimit],
            newValues: ['quota_limit_bytes' => $newLimitBytes]
        );

        return back()->with('message', 'Kullanıcı kotası başarıyla güncellendi.');
    }

    public function updatePermissions(User $user, Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:active,suspended,banned'],
            'download_enabled' => ['required', 'boolean'],
            'plex_enabled' => ['required', 'boolean'],
            'max_concurrent_downloads' => ['required', 'integer', 'min:1', 'max:50'],
        ]);

        $oldValues = $user->only(['status', 'download_enabled', 'plex_enabled', 'max_concurrent_downloads']);

        $user->update($validated);

        $this->auditLogService->log(
            action: 'permissions_updated',
            targetType: 'User',
            targetId: (string) $user->id,
            oldValues: $oldValues,
            newValues: $user->only(['status', 'download_enabled', 'plex_enabled', 'max_concurrent_downloads'])
        );

        return back()->with('message', 'Kullanıcı yetkileri ve eşzamanlı indirme sınırı güncellendi.');
    }
}
