<?php

namespace App\Jobs;

use App\Services\MediaScannerService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Log;

class MediaScanJob implements ShouldQueue
{
    use Queueable;

    /**
     * Create a new job instance.
     */
    public function __construct(public ?int $storageBoxId = null) {}

    /**
     * Execute the job.
     */
    public function handle(MediaScannerService $scannerService): void
    {
        Log::info('MediaScanJob başlatıldı...');

        if ($this->storageBoxId) {
            $box = \App\Models\StorageBox::find($this->storageBoxId);
            if ($box) {
                $result = $scannerService->scan($box);
                Log::info("MediaScanJob tamamlandı ({$box->name}): ", $result);
            }
        } else {
            $result = $scannerService->scanAll();
            Log::info('MediaScanJob tüm Storage Box alanları için tamamlandı: ', $result);
        }
    }
}
