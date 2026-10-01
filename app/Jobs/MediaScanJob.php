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

    public bool $deleteWhenMissingModels = true;

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
        // 1. Temizlik: 2 saattir güncellenmeyen takılı kalmış taramaları zaman aşımına uğrat
        MediaScan::whereIn('status', ['pending', 'running'])
            ->where('updated_at', '<', now()->subHours(2))
            ->update([
                'status' => 'failed',
                'error_message' => 'Tarama işlemi zaman aşımına uğradı (otomatik temizlendi).',
                'completed_at' => now(),
            ]);

        // 2. Zamanlanmış (otomatik) tarama kontrolü
        if (! $this->mediaScanId) {
            $activeScan = MediaScan::whereIn('status', ['pending', 'running'])->first();
            if ($activeScan) {
                Log::info("Zaten aktif bir tarama işlemi (ID: {$activeScan->id}) mevcut. Zamanlanmış MediaScanJob atlandı.");

                return;
            }

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
            $scan->refresh();
            if ($e->getMessage() === 'Tarama kullanıcı tarafından iptal edildi.') {
                Log::info("MediaScanJob kullanıcı tarafından iptal edildi (ID: {$this->mediaScanId})");
                $scan->update([
                    'status' => 'cancelled',
                    'completed_at' => now(),
                    'current_target' => 'İptal Edildi',
                ]);
            } else {
                Log::error("MediaScanJob hatası (ID: {$this->mediaScanId}): ".$e->getMessage(), [
                    'exception' => $e,
                ]);

                $scan->update([
                    'status' => 'failed',
                    'error_message' => mb_substr($e->getMessage(), 0, 1000),
                    'completed_at' => now(),
                    'current_target' => 'Hata oluştu',
                ]);
            }
        }
    }
}
