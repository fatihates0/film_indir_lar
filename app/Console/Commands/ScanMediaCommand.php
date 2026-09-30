<?php

namespace App\Console\Commands;

use App\Models\StorageBox;
use App\Services\MediaScannerService;
use Illuminate\Console\Command;

class ScanMediaCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'media:scan {--box= : Belirli bir Storage Box ID veya slug} {--discover-only : Sadece bağlı mount noktalarını keşfet}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sunucudaki bağlı Storage Box alanlarını keşfeder ve medya dosyalarını otomatik tarar.';

    /**
     * Execute the console command.
     */
    public function handle(MediaScannerService $scannerService): int
    {
        $this->info('Storage Box keşfi ve medya taraması başlatılıyor...');

        if ($this->option('discover-only')) {
            $discovered = $scannerService->discoverAndSyncMounts();
            $this->info(sprintf('%d adet Storage Box otomatik keşfedildi ve senkronize edildi.', count($discovered)));

            return Command::SUCCESS;
        }

        $boxId = $this->option('box');

        if ($boxId) {
            $storageBox = StorageBox::where('id', $boxId)
                ->orWhere('slug', $boxId)
                ->first();

            if (! $storageBox) {
                $this->error("Storage Box bulunamadı: {$boxId}");

                return Command::FAILURE;
            }

            $this->info("Taranıyor: {$storageBox->name} ({$storageBox->mount_path})...");
            $res = $scannerService->scan($storageBox);

            $this->table(
                ['Durum', 'Eklenen', 'Güncellenen', 'Eksik İşaretlenen', 'Toplam Taranan'],
                [[$res['status'], $res['added'], $res['updated'], $res['missing'], $res['total_scanned']]]
            );
        } else {
            $res = $scannerService->scanAll();

            $this->info(sprintf(
                'Tüm tarama tamamlandı! %d yeni Storage Box keşfedildi, %d toplam kutu tarandı.',
                $res['discovered_boxes_count'],
                $res['total_boxes_scanned']
            ));

            $this->table(
                ['Yeni Eklenen', 'Güncellenen', 'Eksik', 'Toplam Taranan Dosya'],
                [[$res['added'], $res['updated'], $res['missing'], $res['total_scanned']]]
            );
        }

        return Command::SUCCESS;
    }
}
