<?php

namespace App\Console\Commands;

use App\Jobs\ProcessRemoteTransferJob;
use App\Models\RemoteTransfer;
use App\Models\StorageBox;
use App\Services\RemoteTransferService;
use Illuminate\Console\Command;

class RemoteTransferCommand extends Command
{
    protected $signature = 'storagebox:transfer 
                            {url : İndirilecek uzaktan URL adresi} 
                            {--box= : Hedef Storage Box ID (boş bırakılırsa ilk aktif seçilir)} 
                            {--folder=Filmler : Hedef klasör (Filmler veya Diziler)} 
                            {--name= : Özel dosya adı (boş bırakılırsa linkten otomatik tespit edilir)} 
                            {--sync : Arka plana atmadan terminalde anlık olarak çalıştır}';

    protected $description = 'Uzaktaki bir URL adresindeki video dosyasını Hetzner Storage Box içerisine doğrudan aktarır';

    public function handle(RemoteTransferService $transferService): int
    {
        $url = $this->argument('url');
        $boxId = $this->option('box');
        $folder = $this->option('folder') ?: 'Filmler';
        $customName = $this->option('name');
        $isSync = $this->option('sync');

        $this->info("🔍 URL bilgileri taranıyor...");
        $probe = $transferService->probeUrl($url);

        if (! $probe['success']) {
            $this->error("❌ URL taranamadı veya ulaşılamadı.");
            return Command::FAILURE;
        }

        $fileName = $customName ?: $probe['file_name'];
        $fileSize = $probe['file_size'];
        $folder = $folder ?: $probe['suggested_folder'];

        $this->line("📁 Dosya Adı: <comment>{$fileName}</comment>");
        $this->line("📦 Boyut: <comment>{$probe['file_size_formatted']}</comment>");
        $this->line("🎯 Önerilen Tür: <comment>{$probe['suggested_type']}</comment>");

        $storageBox = $boxId ? StorageBox::find($boxId) : StorageBox::where('is_active', true)->first();

        if (! $storageBox) {
            $this->error("❌ Aktif bir Storage Box bulunamadı.");
            return Command::FAILURE;
        }

        $this->line("🗄️ Hedef Storage Box: <info>{$storageBox->name}</info> [Klasör: {$folder}]");

        $relativePath = trim($folder, '/\\') . '/' . $fileName;

        $transfer = RemoteTransfer::create([
            'storage_box_id' => $storageBox->id,
            'source_url' => $url,
            'target_folder' => $folder,
            'file_name' => $fileName,
            'relative_path' => $relativePath,
            'total_bytes' => $fileSize,
            'transferred_bytes' => 0,
            'progress_percent' => 0.00,
            'speed_bps' => 0,
            'status' => 'pending',
            'auto_add_media' => true,
        ]);

        if (! $isSync) {
            ProcessRemoteTransferJob::dispatch($transfer);
            $this->info("🚀 Transfer arka plan kuyruğuna alındı (Transfer ID: #{$transfer->id}).");
            $this->line("Web arayüzünden veya 'php artisan queue:work' çalıştırarak takip edebilirsiniz.");
            return Command::SUCCESS;
        }

        $this->info("🚀 Aktarım başlatılıyor...");
        $bar = $this->output->createProgressBar(100);
        $bar->start();

        $success = $transferService->executeTransfer($transfer, function ($transferred, $total, $speedBps) use ($bar, $transferService) {
            if ($total > 0) {
                $percent = (int) round(($transferred / $total) * 100);
                $bar->setProgress($percent);
            }
            $speedFormatted = $transferService->formatBytes($speedBps) . '/s';
            $transferredFormatted = $transferService->formatBytes($transferred);
            $totalFormatted = $transferService->formatBytes($total);
            $bar->setMessage("{$transferredFormatted} / {$totalFormatted} ({$speedFormatted})");
        });

        $bar->finish();
        $this->newLine();

        if ($success) {
            $this->info("✅ Dosya başarıyla '{$storageBox->name}' içerisindeki '{$folder}' klasörüne aktarıldı ve Medya Kütüphanesine eklendi!");
            return Command::SUCCESS;
        }

        $transfer->refresh();
        $this->error("❌ Aktarım başarısız: " . ($transfer->error_message ?: 'Bilinmeyen hata'));
        return Command::FAILURE;
    }
}
