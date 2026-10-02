<?php

namespace App\Jobs;

use App\Models\Media;
use App\Services\TmdbService;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
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

            if ($mediaList->isEmpty()) {
                $mediaList = Media::all();
            }
        }

        $total = $mediaList->count();
        $success = 0;
        $failed = 0;

        Log::info("TmdbSyncJob: Toplam {$total} medya için TMDB bilgileri çekiliyor...");

        foreach ($mediaList as $media) {
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
        }

        Log::info("TmdbSyncJob tamamlandı: Toplam {$total}, Başarılı: {$success}, Başarısız: {$failed}");
    }
}
