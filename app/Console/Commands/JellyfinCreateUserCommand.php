<?php

namespace App\Console\Commands;

use App\Models\JellyfinAccount;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\JellyfinService;
use Exception;
use Illuminate\Console\Command;

class JellyfinCreateUserCommand extends Command
{
    protected $signature = 'jellyfin:create-user 
                            {username : Jellyfin üzerinde oluşturulacak kullanıcı adı} 
                            {--password= : Kullanıcı şifresi} 
                            {--user-id= : Eşleştirilecek MedyaHub User ID}';

    protected $description = 'Jellyfin API üzerinden yeni bir kullanıcı hesabı oluşturur';

    public function handle(JellyfinService $jellyfinService, AuditLogService $auditLogService): int
    {
        $username = trim((string) $this->argument('username'));
        $password = $this->option('password') ? (string) $this->option('password') : null;
        $userId = $this->option('user-id') ? (int) $this->option('user-id') : null;

        if (empty($username)) {
            $this->error('Kullanıcı adı boş olamaz.');
            return 1;
        }

        $user = null;
        if ($userId) {
            $user = User::find($userId);
            if (! $user) {
                $this->error("ID: {$userId} olan MedyaHub kullanıcısı bulunamadı.");
                return 1;
            }
        }

        $this->info("Jellyfin sunucusunda kullanıcı oluşturuluyor: {$username}...");

        try {
            $created = $jellyfinService->createUser($username, $password);

            $jellyfinUserId = $created['id'];

            // Sync with local database
            $account = JellyfinAccount::updateOrCreate(
                ['jellyfin_user_id' => $jellyfinUserId],
                [
                    'user_id' => $user?->id,
                    'username' => $username,
                    'is_administrator' => $created['is_administrator'] ?? false,
                    'metadata' => $created['raw'] ?? [],
                ]
            );

            $auditLogService->log(
                action: 'jellyfin_user_created',
                targetType: 'JellyfinAccount',
                targetId: (string) $account->id,
                newValues: [
                    'username' => $username,
                    'jellyfin_user_id' => $jellyfinUserId,
                    'user_id' => $user?->id,
                ]
            );

            $this->info("✓ Jellyfin kullanıcısı başarıyla oluşturuldu!");
            $this->table(
                ['Alan', 'Değer'],
                [
                    ['Kullanıcı Adı', $username],
                    ['Jellyfin ID', $jellyfinUserId],
                    ['Şifre', $password ? '••••••••' : '(Şifresiz)'],
                    ['MedyaHub Kullanıcısı', $user ? "{$user->name} (#{$user->id})" : 'Bağımsız'],
                ]
            );

            return 0;
        } catch (Exception $e) {
            $this->error("Hata: " . $e->getMessage());
            return 1;
        }
    }
}
