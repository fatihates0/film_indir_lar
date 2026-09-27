<?php

namespace App\Console\Commands;

use App\Models\DownloadSession;
use App\Models\Media;
use App\Services\StorageBoxService;
use Illuminate\Console\Command;

class FixStorageSizesCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'storage:fix-sizes {--force : Re-check size for all media even if already set}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Recalculate and repair media file sizes from Hetzner Storage Box via WebDAV';

    /**
     * Execute the console command.
     */
    public function handle(StorageBoxService $storageBoxService): int
    {
        $force = $this->option('force');

        $query = Media::with('storageBox');
        if (! $force) {
            $query->where('file_size', '<=', 0);
        }

        $mediaList = $query->get();

        if ($mediaList->isEmpty()) {
            $this->info('Tüm medya dosyalarının boyutları güncel ve 0-baytlık medya bulunamadı.');

            return self::SUCCESS;
        }

        $this->info("Toplam {$mediaList->count()} adet medya dosyası boyutu kontrol ediliyor...");

        $updatedCount = 0;
        $rows = [];

        foreach ($mediaList as $media) {
            $oldSize = $media->file_size;
            $oldFormatted = round($oldSize / (1024 * 1024 * 1024), 2) . ' GB';

            $newSize = 0;

            // 1. Try local real file if > 0 bytes
            $fullPath = null;
            try {
                $fullPath = $storageBoxService->resolveRealPath($media->file_path, $media->storageBox);
            } catch (\Exception $e) {
                // Ignore
            }

            if ($fullPath && file_exists($fullPath) && is_file($fullPath) && filesize($fullPath) > 0) {
                $newSize = filesize($fullPath);
            } elseif ($media->storageBox) {
                // 2. Query remote WebDAV file size
                $newSize = $storageBoxService->fetchRemoteFileSize($media->file_path, $media->storageBox);
            }

            if ($newSize > 0 && $newSize !== $oldSize) {
                $media->update(['file_size' => $newSize]);

                DownloadSession::where('media_id', $media->id)
                    ->where('file_size', '<=', 0)
                    ->update(['file_size' => $newSize]);

                $updatedCount++;
                $newFormatted = round($newSize / (1024 * 1024 * 1024), 2) . ' GB (' . number_format($newSize) . ' bytes)';

                $rows[] = [
                    $media->id,
                    $media->title,
                    $oldFormatted,
                    $newFormatted,
                    'GÜNCELLENDİ',
                ];
            } else {
                $rows[] = [
                    $media->id,
                    $media->title,
                    $oldFormatted,
                    $newSize > 0 ? round($newSize / (1024 * 1024 * 1024), 2) . ' GB' : 'Bulunamadı / 0 B',
                    $newSize > 0 ? 'Değişmedi' : 'BAŞARISIZ',
                ];
            }
        }

        $this->table(['ID', 'Başlık', 'Eski Boyut', 'Yeni Boyut', 'Durum'], $rows);

        $this->info("Tarama tamamlandı: {$updatedCount} adet medyanın dosya boyutu başarıyla güncellendi.");

        return self::SUCCESS;
    }
}
