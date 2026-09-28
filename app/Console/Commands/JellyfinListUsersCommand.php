<?php

namespace App\Console\Commands;

use App\Models\JellyfinAccount;
use App\Services\JellyfinService;
use Exception;
use Illuminate\Console\Command;

class JellyfinListUsersCommand extends Command
{
    protected $signature = 'jellyfin:list-users {--sync : Sunucudaki kullanıcıları yerel veritabanına da eşitler}';

    protected $description = 'Jellyfin sunucusundaki tüm kullanıcıları listeler';

    public function handle(JellyfinService $jellyfinService): int
    {
        $this->info("Jellyfin sunucu durumu kontrol ediliyor...");
        $status = $jellyfinService->getStatus();

        if (! $status['online']) {
            $this->error("Jellyfin sunucusuna bağlanılamadı: " . ($status['message'] ?? 'Bilinmeyen hata'));
            return 1;
        }

        $this->info("Sunucu: {$status['server_name']} (v{$status['version']})");
        $this->info("Kullanıcılar getiriliyor...");

        try {
            $users = $jellyfinService->getUsers();

            if (empty($users)) {
                $this->warn("Jellyfin üzerinde kayıtlı kullanıcı bulunamadı.");
                return 0;
            }

            $sync = (bool) $this->option('sync');
            $rows = [];

            foreach ($users as $u) {
                if ($sync) {
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

                $localAccount = JellyfinAccount::where('jellyfin_user_id', $u['id'])->first();

                $rows[] = [
                    $u['id'],
                    $u['name'],
                    $u['is_administrator'] ? 'Admin' : 'Kullanıcı',
                    $u['is_disabled'] ? 'Devre Dışı' : 'Aktif',
                    $u['has_password'] ? 'Evet' : 'Hayır',
                    $localAccount && $localAccount->user ? "{$localAccount->user->name} (#{$localAccount->user->id})" : '-',
                    $u['last_activity_date'] ? date('Y-m-d H:i', strtotime($u['last_activity_date'])) : 'Yok',
                ];
            }

            $this->table(
                ['Jellyfin ID', 'Kullanıcı Adı', 'Rol', 'Durum', 'Şifreli', 'MedyaHub Bağlantısı', 'Son Aktivite'],
                $rows
            );

            if ($sync) {
                $this->info("✓ " . count($users) . " kullanıcı yerel veritabanı ile eşitlendi.");
            }

            return 0;
        } catch (Exception $e) {
            $this->error("Hata: " . $e->getMessage());
            return 1;
        }
    }
}
