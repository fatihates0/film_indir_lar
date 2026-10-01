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

    public int $tries = 3;

    public bool $deleteWhenMissingModels = true;

    public function __construct(
        public RemoteTransfer $transfer
    ) {
        $this->onQueue('file_transfers');
    }

    public function handle(RemoteTransferService $transferService): void
    {
        $transfer = $this->transfer->fresh();
        if (! $transfer || in_array($transfer->status, ['cancelled', 'completed', 'transferring', 'failed'])) {
            return;
        }

        $maxConcurrent = $transferService->getMaxConcurrency();
        $activeTransferring = RemoteTransfer::where('status', 'transferring')->count();

        if ($activeTransferring >= $maxConcurrent) {
            Log::info("ProcessRemoteTransferJob: Concurrency limit ({$maxConcurrent}) reached (active transferring: {$activeTransferring}). Reverting transfer #{$transfer->id} to pending.");
            RemoteTransfer::where('id', $transfer->id)
                ->where('status', 'queued')
                ->update(['status' => 'pending']);

            return;
        }

        $claimed = RemoteTransfer::where('id', $transfer->id)
            ->whereIn('status', ['pending', 'queued'])
            ->update(['status' => 'transferring']);

        if (! $claimed) {
            return;
        }

        Log::info("ProcessRemoteTransferJob started for transfer #{$this->transfer->id}");
        $transfer->refresh();
        $transferService->executeTransfer($transfer);
    }
}
