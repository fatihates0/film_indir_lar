<?php

namespace App\Jobs;

use App\Models\Media;
use App\Services\TmdbService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Log;

class TmdbSyncJob implements ShouldQueue
{
    use InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 3600;

    public int $tries = 1;

    /**
     * Create a new job instance.
     *
     * @param  array<int>|null  $mediaIds
     */
    public function __construct(public ?array $mediaIds = null)
    {
        $this->onQueue('tmdb_sync');
    }

    /**
     * Execute the job.
     */
    public function handle(TmdbService $tmdbService): void
    {
        Log::info('TmdbSyncJob başlatıldı (Kuyruk: tmdb_sync)...');

        if (! empty($this->mediaIds)) {
            $mediaList = Media::whereIn('id', $this->mediaIds)->get();
        } else {
            $mediaList = Media::where(function ($q) {
                $q->whereNull('tmdb_id')->orWhere('tmdb_id', 0);
            })->get();
        }

        $total = $mediaList->count();
        $success = 0;
        $failed = 0;

        Log::info("TmdbSyncJob: Toplam {$total} medya için TMDB bilgileri çekiliyor...");

        Cache::put('tmdb_sync_progress', [
            'status' => 'running',
            'current' => 0,
            'total' => $total,
            'percent' => 0,
            'current_title' => 'Başlatılıyor...',
            'success_count' => 0,
            'fail_count' => 0,
            'updated_at' => now()->toDateTimeString(),
        ], 86400);

        foreach ($mediaList as $index => $media) {
            $progress = Cache::get('tmdb_sync_progress');
            if ($progress && ($progress['status'] ?? '') === 'cancelled') {
                Log::info('TmdbSyncJob kullanıcı tarafından iptal edildi.');

                return;
            }

            $currentNum = $index + 1;
            $percent = $total > 0 ? (int) round(($currentNum / $total) * 100) : 100;

            try {
                $res = $tmdbService->fetchAndApply($media);
                if ($res) {
                    $success++;
                } else {
                    $failed++;
                }
            } catch (\Throwable $e) {
                $failed++;
                Log::warning("TmdbSyncJob hata (Media ID #{$media->id}): ".$e->getMessage());
            }

            Cache::put('tmdb_sync_progress', [
                'status' => 'running',
                'current' => $currentNum,
                'total' => $total,
                'percent' => $percent,
                'current_title' => $media->title,
                'success_count' => $success,
                'fail_count' => $failed,
                'updated_at' => now()->toDateTimeString(),
            ], 86400);
        }

        Cache::put('tmdb_sync_progress', [
            'status' => 'completed',
            'current' => $total,
            'total' => $total,
            'percent' => 100,
            'current_title' => 'Tüm TMDB Bilgileri Başarıyla Güncellendi!',
            'success_count' => $success,
            'fail_count' => $failed,
            'completed_at' => now()->toDateTimeString(),
        ], 86400);

        Log::info("TmdbSyncJob tamamlandı: Toplam {$total}, Başarılı: {$success}, Başarısız: {$failed}");
    }
}
