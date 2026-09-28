<?php

namespace App\Console\Commands;

use App\Models\JellyfinAccount;
use App\Services\AuditLogService;
use App\Services\JellyfinService;
use Exception;
use Illuminate\Console\Command;

class JellyfinDeleteUserCommand extends Command
{
    protected $signature = 'jellyfin:delete-user 
                            {identifier : Jellyfin User UUID veya veritabanındaki kullanıcı adı} 
                            {--force : Onay istemeden zorla sil}';

    protected $description = 'Jellyfin API üzerinden belirtilen kullanıcıyı siler';

    public function handle(JellyfinService $jellyfinService, AuditLogService $auditLogService): int
    {
        $identifier = trim((string) $this->argument('identifier'));
        $force = (bool) $this->option('force');

        if (empty($identifier)) {
            $this->error('Kullanıcı UUID veya kullanıcı adı belirtilmedi.');
            return 1;
        }

        // Check if identifier is in local database by username or UUID
        $localAccount = JellyfinAccount::where('jellyfin_user_id', $identifier)
            ->orWhere('username', $identifier)
            ->first();

        $targetUserId = $localAccount ? $localAccount->jellyfin_user_id : $identifier;
        $targetUsername = $localAccount ? $localAccount->username : $identifier;

        if (! $force && ! $this->confirm("Jellyfin kullanıcısı '{$targetUsername}' (ID: {$targetUserId}) silinecek. Onaylıyor musunuz?")) {
            $this->warn('İşlem iptal edildi.');
            return 0;
        }

        $this->info("Jellyfin API üzerinden kullanıcı siliniyor: {$targetUserId}...");

        try {
            $jellyfinService->deleteUser($targetUserId);

            if ($localAccount) {
                $localAccount->delete();
            }

            $auditLogService->log(
                action: 'jellyfin_user_deleted',
                targetType: 'JellyfinAccount',
                targetId: (string) ($localAccount?->id ?? 0),
                oldValues: [
                    'jellyfin_user_id' => $targetUserId,
                    'username' => $targetUsername,
                ]
            );

            $this->info("✓ Jellyfin kullanıcısı '{$targetUsername}' başarıyla silindi!");
            return 0;
        } catch (Exception $e) {
            $this->error("Hata: " . $e->getMessage());
            return 1;
        }
    }
}
