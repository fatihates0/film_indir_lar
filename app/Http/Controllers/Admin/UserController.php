<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class UserController extends Controller
{
    public function __construct(
        protected AuditLogService $auditLogService,
    ) {}

    public function index(Request $request): Response
    {
        $users = User::orderBy('id', 'desc')
            ->paginate(15);

        return Inertia::render('Admin/Users/Index', [
            'users' => $users,
        ]);
    }

    public function updatePermissions(User $user, Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'status' => ['required', 'in:active,suspended,banned'],
            'download_enabled' => ['required', 'boolean'],
            'plex_enabled' => ['required', 'boolean'],
        ]);

        $oldValues = $user->only(['status', 'download_enabled', 'plex_enabled']);

        $user->update($validated);

        $this->auditLogService->log(
            action: 'permissions_updated',
            targetType: 'User',
            targetId: (string) $user->id,
            oldValues: $oldValues,
            newValues: $user->only(['status', 'download_enabled', 'plex_enabled'])
        );

        return back()->with('message', 'Kullanıcı yetkileri başarıyla güncellendi.');
    }
}
