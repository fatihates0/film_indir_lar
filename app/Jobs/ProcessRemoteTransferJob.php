<?php

namespace App\Jobs;

use App\Models\RemoteTransfer;
use App\Services\RemoteTransferService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class ProcessRemoteTransferJob implements ShouldQueue
{
    use Queueable;

    public int $timeout = 86400; // 24 hours max for large multi-gigabyte files

    public int $tries = 1;

    public function __construct(
        public RemoteTransfer $transfer
    ) {
        $this->onQueue('file_transfers');
    }

    public function handle(RemoteTransferService $transferService): void
    {
        $transfer = $this->transfer->fresh();
        if (! $transfer || in_array($transfer->status, ['cancelled', 'completed'])) {
            return;
        }

        $maxConcurrent = $transferService->getMaxConcurrency();
        $activeCount = RemoteTransfer::where('status', 'transferring')
            ->where('id', '!=', $transfer->id)
            ->count();

        if ($activeCount >= $maxConcurrent) {
            Log::info("ProcessRemoteTransferJob: Concurrency limit ({$maxConcurrent}) reached (active: {$activeCount}). Releasing transfer #{$transfer->id} back to queue.");
            $this->release(5);

            return;
        }

        Log::info("ProcessRemoteTransferJob started for transfer #{$this->transfer->id}");
        $transferService->executeTransfer($transfer);
    }
}
