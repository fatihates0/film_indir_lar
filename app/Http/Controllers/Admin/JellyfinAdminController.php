<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\JellyfinAccount;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\JellyfinService;
use Exception;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class JellyfinAdminController extends Controller
{
    public function __construct(
        protected JellyfinService $jellyfinService,
        protected AuditLogService $auditLogService,
    ) {}

    public function index(): Response
    {
        $serverStatus = $this->jellyfinService->getStatus();
        $apiUsers = [];
        $apiError = null;

        if ($serverStatus['online']) {
            try {
                $apiUsers = $this->jellyfinService->getUsers();

                // Auto-sync or update local records
                foreach ($apiUsers as $u) {
                    JellyfinAccount::updateOrCreate(
                        ['jellyfin_user_id' => $u['id']],
                        [
                            'username' => $u['name'],
                            'is_administrator' => $u['is_administrator'],
                            'is_disabled' => $u['is_disabled'],
                            'last_activity_date' => ! empty($u['last_activity_date']) ? date('Y-m-d H:i:s', strtotime($u['last_activity_date'])) : null,
                            'metadata' => $u['raw'] ?? [],
                        ]
                    );
                }
            } catch (Exception $e) {
                $apiError = $e->getMessage();
            }
        }

        // Fetch local accounts with attached MedyaHub users
        $localAccounts = JellyfinAccount::with('user:id,name,email')
            ->orderBy('username', 'asc')
            ->get();

        // Merge API details with local associations
        $usersList = $localAccounts->map(function ($acc) use ($apiUsers) {
            $apiMatch = collect($apiUsers)->firstWhere('id', $acc->jellyfin_user_id);

            return [
                'id' => $acc->id,
                'jellyfin_user_id' => $acc->jellyfin_user_id,
                'username' => $acc->username,
                'is_administrator' => $apiMatch ? $apiMatch['is_administrator'] : $acc->is_administrator,
                'is_disabled' => $apiMatch ? $apiMatch['is_disabled'] : $acc->is_disabled,
                'has_password' => $apiMatch ? $apiMatch['has_password'] : false,
                'last_activity_date' => $acc->last_activity_date?->diffForHumans() ?? 'Yok',
                'user' => $acc->user ? [
                    'id' => $acc->user->id,
                    'name' => $acc->user->name,
                    'email' => $acc->user->email,
                ] : null,
            ];
        });

        // If some users were returned from API but not in DB yet (edge case)
        foreach ($apiUsers as $u) {
            if (! $usersList->contains('jellyfin_user_id', $u['id'])) {
                $usersList->push([
                    'id' => null,
                    'jellyfin_user_id' => $u['id'],
                    'username' => $u['name'],
                    'is_administrator' => $u['is_administrator'],
                    'is_disabled' => $u['is_disabled'],
                    'has_password' => $u['has_password'],
                    'last_activity_date' => ! empty($u['last_activity_date']) ? date('Y-m-d H:i', strtotime($u['last_activity_date'])) : 'Yok',
                    'user' => null,
                ]);
            }
        }

        // Available Laravel users for dropdown
        $availableUsers = User::select('id', 'name', 'email')
            ->orderBy('name', 'asc')
            ->get();

        return Inertia::render('Admin/Jellyfin/Index', [
            'server_status' => $serverStatus,
            'api_error' => $apiError,
            'jellyfin_users' => $usersList->values(),
            'available_users' => $availableUsers,
            'config' => [
                'url' => config('jellyfin.url'),
                'has_api_key' => ! empty(config('jellyfin.api_key')),
            ],
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'username' => ['required', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'min:3', 'max:255'],
            'user_id' => ['nullable', 'exists:users,id'],
        ]);

        try {
            $created = $this->jellyfinService->createUser(
                $validated['username'],
                $validated['password'] ?? null
            );

            $account = JellyfinAccount::updateOrCreate(
                ['jellyfin_user_id' => $created['id']],
                [
                    'user_id' => $validated['user_id'] ?? null,
                    'username' => $created['name'],
                    'is_administrator' => $created['is_administrator'] ?? false,
                    'metadata' => $created['raw'] ?? [],
                ]
            );

            $this->auditLogService->log(
                action: 'jellyfin_user_created',
                targetType: 'JellyfinAccount',
                targetId: (string) $account->id,
                newValues: [
                    'username' => $created['name'],
                    'jellyfin_user_id' => $created['id'],
                    'user_id' => $validated['user_id'] ?? null,
                ]
            );

            return back()->with('message', "Jellyfin kullanıcısı '{$created['name']}' başarıyla oluşturuldu.");
        } catch (Exception $e) {
            return back()->withErrors(['username' => 'Jellyfin kullanıcısı oluşturulamadı: ' . $e->getMessage()]);
        }
    }

    public function destroy(string $jellyfinUserId): RedirectResponse
    {
        try {
            $account = JellyfinAccount::where('jellyfin_user_id', $jellyfinUserId)->first();
            $username = $account ? $account->username : $jellyfinUserId;

            $this->jellyfinService->deleteUser($jellyfinUserId);

            if ($account) {
                $account->delete();
            }

            $this->auditLogService->log(
                action: 'jellyfin_user_deleted',
                targetType: 'JellyfinAccount',
                targetId: (string) ($account?->id ?? 0),
                oldValues: [
                    'jellyfin_user_id' => $jellyfinUserId,
                    'username' => $username,
                ]
            );

            return back()->with('message', "Jellyfin kullanıcısı '{$username}' başarıyla silindi.");
        } catch (Exception $e) {
            return back()->withErrors(['general' => 'Jellyfin kullanıcısı silinemedi: ' . $e->getMessage()]);
        }
    }

    public function updatePassword(string $jellyfinUserId, Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'password' => ['required', 'string', 'min:3', 'max:255'],
        ]);

        try {
            $this->jellyfinService->updateUserPassword($jellyfinUserId, $validated['password']);

            return back()->with('message', 'Jellyfin kullanıcısının şifresi başarıyla güncellendi.');
        } catch (Exception $e) {
            return back()->withErrors(['general' => 'Şifre güncellenemedi: ' . $e->getMessage()]);
        }
    }

    public function sync(): RedirectResponse
    {
        try {
            $users = $this->jellyfinService->getUsers();

            foreach ($users as $u) {
                JellyfinAccount::updateOrCreate(
                    ['jellyfin_user_id' => $u['id']],
                    [
                        'username' => $u['name'],
                        'is_administrator' => $u['is_administrator'],
                        'is_disabled' => $u['is_disabled'],
                        'last_activity_date' => ! empty($u['last_activity_date']) ? date('Y-m-d H:i:s', strtotime($u['last_activity_date'])) : null,
                        'metadata' => $u['raw'] ?? [],
                    ]
                );
            }

            return back()->with('message', count($users) . ' adet Jellyfin kullanıcısı başarıyla senkronize edildi.');
        } catch (Exception $e) {
            return back()->withErrors(['general' => 'Senkronizasyon başarısız: ' . $e->getMessage()]);
        }
    }
}
