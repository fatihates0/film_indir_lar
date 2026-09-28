<?php

namespace App\Console\Commands;

use App\Models\StorageBox;
use App\Services\RemoteTransferService;
use Illuminate\Console\Command;

class RemoteTransferBulkCommand extends Command
{
    protected $signature = 'storagebox:transfer-bulk
                            {--file= : Linklerin bulunduğu metin dosyası (.txt)}
                            {--box= : Hedef Storage Box ID}
                            {--folder=Filmler : Hedef klasör (Filmler veya Diziler veya auto)}';

    protected $description = 'Birden fazla indirme linkini toplu olarak sırayla Storage Box aktarım kuyruğuna ekler';

    public function handle(RemoteTransferService $transferService): int
    {
        $filePath = $this->option('file');
        $boxId = $this->option('box');
        $folder = $this->option('folder') ?: 'Filmler';

        $storageBox = $boxId ? StorageBox::find($boxId) : StorageBox::where('is_active', true)->first();

        if (! $storageBox) {
            $this->error("❌ Aktif bir Storage Box bulunamadı.");
            return Command::FAILURE;
        }

        $rawUrls = '';
        if ($filePath && file_exists($filePath)) {
            $rawUrls = file_get_contents($filePath);
        } else {
            $this->info("İndirilecek linkleri yapıştırın (Bitirmek için boş satırda Enter ve CTRL+D veya 'tamam' yazın):");
            $lines = [];
            while ($line = fgets(STDIN)) {
                $trimmed = trim($line);
                if (strtolower($trimmed) === 'tamam' || strtolower($trimmed) === 'exit') {
                    break;
                }
                $lines[] = $line;
            }
            $rawUrls = implode("\n", $lines);
        }

        if (empty(trim($rawUrls))) {
            $this->warn("⚠️ Hiç link girilmedi.");
            return Command::SUCCESS;
        }

        $this->info("🔍 Linkler çözümleniyor ve kuyruğa ekleniyor...");
        $result = $transferService->createBulkTransfers($rawUrls, $storageBox, $folder, true);

        $this->info("✅ Toplam {$result['queued']} / {$result['total']} adet link başarıyla '{$storageBox->name}' için kuyruğa eklendi!");

        if (count($result['errors']) > 0) {
            $this->warn("⚠️ " . count($result['errors']) . " adet link eklenemedi:");
            foreach ($result['errors'] as $err) {
                $this->line("  - {$err['url']}: {$err['error']}");
            }
        }

        $this->line("Arka planda aktarılmaları için 'php artisan queue:work' çalıştırabilirsiniz.");
        return Command::SUCCESS;
    }
}
