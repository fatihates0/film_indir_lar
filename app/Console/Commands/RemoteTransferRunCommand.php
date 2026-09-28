<?php

namespace App\Console\Commands;

use App\Models\RemoteTransfer;
use App\Services\RemoteTransferService;
use Exception;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

class RemoteTransferRunCommand extends Command
{
    protected $signature = 'storagebox:transfer-run {transfer_id : Yürütülecek RemoteTransfer ID}';

    protected $description = 'Belirtilen ID numarasına sahip tekil bir uzaktan dosya aktarımını arka planda yürütür';

    public function handle(RemoteTransferService $transferService): int
    {
        $transferId = (int) $this->argument('transfer_id');
        $transfer = RemoteTransfer::find($transferId);

        if (! $transfer) {
            $this->error("RemoteTransfer #{$transferId} bulunamadı.");
            return 1;
        }

        if (in_array($transfer->status, ['completed', 'cancelled'])) {
            $this->info("RemoteTransfer #{$transferId} zaten '{$transfer->status}' durumunda.");
            return 0;
        }

        Log::info("RemoteTransferRunCommand executing transfer #{$transferId} ({$transfer->file_name})");

        try {
            $success = $transferService->executeTransfer($transfer, function ($percent, $speed, $transferred) {
                // Background execution progress
            });

            return $success ? 0 : 1;
        } catch (Exception $e) {
            Log::error("RemoteTransferRunCommand failed for #{$transferId}: " . $e->getMessage());
            return 1;
        }
    }
}
