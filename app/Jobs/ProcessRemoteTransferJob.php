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
    ) {}

    public function handle(RemoteTransferService $transferService): void
    {
        Log::info("ProcessRemoteTransferJob started for transfer #{$this->transfer->id}");
        $transferService->executeTransfer($this->transfer);
    }
}
