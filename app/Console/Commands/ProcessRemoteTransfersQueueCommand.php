<?php

namespace App\Console\Commands;

use App\Services\RemoteTransferService;
use Illuminate\Console\Command;

class ProcessRemoteTransfersQueueCommand extends Command
{
    protected $signature = 'storagebox:process-queue {--daemon : Sürekli döngüde çalışarak yeni gelen transferleri işler}';

    protected $description = '.env dosyasındaki eşzamanlılık sınırına (REMOTE_TRANSFER_CONCURRENCY) göre bekleyen aktarımları paralel olarak işler';

    public function handle(RemoteTransferService $transferService): int
    {
        $isDaemon = (bool) $this->option('daemon');
        $maxConcurrent = $transferService->getMaxConcurrency();

        $this->info("Uzaktan dosya aktarım kuyruk işleyicisi başlatıldı.");
        $this->line("Eşzamanlılık Sınırı (Concurrency): <comment>{$maxConcurrent}</comment>");

        do {
            $started = $transferService->processQueue();
            if ($started > 0) {
                $this->info("Paralel aktarım başlatıldı: {$started} adet işlem yürütülüyor.");
            }

            if ($isDaemon) {
                sleep(2);
            }
        } while ($isDaemon);

        return 0;
    }
}
