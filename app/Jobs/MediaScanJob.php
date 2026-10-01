<?php

namespace App\Jobs;

use App\Models\MediaScan;
use App\Models\StorageBox;
use App\Services\MediaScannerService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;

class MediaScanJob implements ShouldQueue
{
    use InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Create a new job instance.
     */
    public function __construct(public ?int $mediaScanId = null)
    {
        $this->onQueue('disk_scans');
    }

    /**
     * Execute the job.
     */
    public function handle(MediaScannerService $scannerService): void
    {
        if (! $this->mediaScanId) {
            $scan = MediaScan::create([
                'scan_type' => 'all',
                'status' => 'pending',
                'current_target' => 'Zamanlanmış tarama bekliyor...',
            ]);
            $this->mediaScanId = $scan->id;
        } else {
            $scan = MediaScan::find($this->mediaScanId);
        }

        if (! $scan || $scan->status === 'cancelled') {
            Log::info("MediaScanJob pas geçildi veya iptal edilmiş (ID: {$this->mediaScanId})");

            return;
        }

        $scan->update([
            'status' => 'running',
            'started_at' => now(),
            'current_target' => 'Hazırlanıyor...',
        ]);

        try {
            if ($scan->scan_type === 'all') {
                $result = $scannerService->scanAll($scan);
            } else {
                $box = $scan->storage_box_id ? StorageBox::find($scan->storage_box_id) : null;
                $targetName = $box ? $box->name : 'Varsayılan Depolama';
                if (! empty($scan->sub_directory)) {
                    $targetName .= " ({$scan->sub_directory})";
                }
                $scan->update(['current_target' => "{$targetName} taranıyor..."]);

                $result = $scannerService->scan($box, $scan->sub_directory ?? '', $scan);
            }

            $scan->refresh();
            if ($scan->status !== 'cancelled') {
                $scan->update([
                    'status' => 'completed',
                    'progress_percent' => 100,
                    'total_scanned' => $result['total_scanned'] ?? $scan->total_scanned,
                    'added_count' => $result['added'] ?? $scan->added_count,
                    'updated_count' => $result['updated'] ?? $scan->updated_count,
                    'missing_count' => $result['missing'] ?? $scan->missing_count,
                    'completed_at' => now(),
                    'current_target' => 'Tamamlandı',
                ]);

                Log::info("MediaScanJob başarıyla tamamlandı (ID: {$this->mediaScanId})", $result);
            }
        } catch (\Throwable $e) {
            Log::error("MediaScanJob hatası (ID: {$this->mediaScanId}): ".$e->getMessage());

            $scan->refresh();
            if ($scan->status !== 'cancelled') {
                $scan->update([
                    'status' => 'failed',
                    'error_message' => $e->getMessage(),
                    'completed_at' => now(),
                    'current_target' => 'Hata oluştu',
                ]);
            }
        }
    }
}
