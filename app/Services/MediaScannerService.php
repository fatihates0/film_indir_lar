<?php

namespace App\Services;

use App\Enums\MediaType;
use App\Models\Media;
use App\Models\StorageBox;
use Exception;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class MediaScannerService
{
    public function __construct(
        protected StorageBoxService $storageBoxService,
        protected TmdbService $tmdbService,
    ) {}

    /**
     * Sunucuda bağlı (mount edilmiş) tüm Storage Box alanlarını otomatik tespit eder ve Veritabanı (StorageBox model) ile senkronize eder.
     */
    public function discoverAndSyncMounts(): array
    {
        $discovered = [];
        $searchPaths = [
            '/mnt/storageboxes',
            '/mnt/storagebox',
            '/mnt',
        ];

        $candidatePaths = [];

        // 1. Dizin taraması ile olası mount klasörlerini bul
        foreach ($searchPaths as $basePath) {
            if (file_exists($basePath) && is_dir($basePath)) {
                // Eğer doğrudan bir mount noktası ise
                if ($basePath !== '/mnt') {
                    $candidatePaths[] = str_replace('\\', '/', $basePath);
                }

                $items = @scandir($basePath);
                if (is_array($items)) {
                    foreach ($items as $item) {
                        if ($item === '.' || $item === '..') {
                            continue;
                        }
                        $full = str_replace('\\', '/', rtrim($basePath, '/') . '/' . $item);
                        if (is_dir($full) && (Str::contains($item, ['storage', 'box', 'film', 'dizi'], true) || Str::startsWith($basePath, '/mnt/storageboxes'))) {
                            $candidatePaths[] = $full;
                        }
                    }
                }
            }
        }

        // 2. /etc/fstab dosyasındaki CIFS mount kayıtlarını ayrıştır
        if (file_exists('/etc/fstab') && is_readable('/etc/fstab')) {
            $fstabContent = file_get_contents('/etc/fstab');
            $lines = explode("\n", $fstabContent);
            foreach ($lines as $line) {
                $line = trim($line);
                if (empty($line) || Str::startsWith($line, '#')) {
                    continue;
                }
                if (Str::contains($line, ['cifs', 'storagebox'])) {
                    $parts = preg_split('/\s+/', $line);
                    if (isset($parts[1]) && Str::startsWith($parts[1], '/mnt')) {
                        $candidatePaths[] = str_replace('\\', '/', $parts[1]);
                    }
                }
            }
        }

        $candidatePaths = array_unique($candidatePaths);

        foreach ($candidatePaths as $path) {
            if (! file_exists($path) || ! is_readable($path)) {
                continue;
            }

            // Klasör adı (Örn: box1, filmler vb.)
            $folderName = basename($path);
            if ($folderName === 'mnt') {
                continue;
            }

            // Veritabanında aynı mount_path veya slug kayıtlı mı?
            $box = StorageBox::where('mount_path', $path)
                ->orWhere('mount_path', str_replace('/', '\\', $path))
                ->first();

            $isOnline = file_exists($path) && is_readable($path);

            if (! $box) {
                $displayName = 'Storage Box (' . ucfirst($folderName) . ')';
                $slug = Str::slug($displayName);

                // Slug çakışması engelle
                $counter = 1;
                while (StorageBox::where('slug', $slug)->exists()) {
                    $slug = Str::slug($displayName) . '-' . $counter++;
                }

                $box = StorageBox::create([
                    'name' => $displayName,
                    'slug' => $slug,
                    'mount_path' => $path,
                    'disk_type' => 'cifs',
                    'is_active' => true,
                    'status' => $isOnline ? 'online' : 'offline',
                    'metadata' => [
                        'auto_discovered' => true,
                        'discovered_at' => now()->toDateTimeString(),
                    ],
                ]);

                Log::info("Otomatik Storage Box keşfedildi ve eklendi: {$displayName} -> {$path}");
            } else {
                $box->update([
                    'status' => $isOnline ? 'online' : 'offline',
                ]);
            }

            $discovered[] = $box;
        }

        return $discovered;
    }

    /**
     * Tüm aktif Storage Box alanlarını otomatik keşfeder ve medyalarını tarar.
     */
    public function scanAll(): array
    {
        // 1. Önce sunucudaki tüm bağlı Storage Box'ları keşfet & senkronize et
        $discoveredBoxes = $this->discoverAndSyncMounts();

        // 2. DB'deki aktif tüm Storage Box'ları çek
        $allBoxes = StorageBox::where('is_active', true)->get();

        $totalAdded = 0;
        $totalUpdated = 0;
        $totalMissing = 0;
        $totalScanned = 0;
        $boxResults = [];

        foreach ($allBoxes as $box) {
            $res = $this->scan($box);
            $totalAdded += $res['added'];
            $totalUpdated += $res['updated'];
            $totalMissing += $res['missing'];
            $totalScanned += $res['total_scanned'];
            $boxResults[$box->name] = $res;
        }

        return [
            'status' => 'success',
            'discovered_boxes_count' => count($discoveredBoxes),
            'total_boxes_scanned' => count($allBoxes),
            'added' => $totalAdded,
            'updated' => $totalUpdated,
            'missing' => $totalMissing,
            'total_scanned' => $totalScanned,
            'boxes' => $boxResults,
        ];
    }

    /**
     * Scan a specific Storage Box or the default mount directory for media files and update database records.
     */
    public function scan(?StorageBox $storageBox = null, string $subDirectory = ''): array
    {
        $mountPath = $storageBox ? $storageBox->mount_path : config('storagebox.mount_path', storage_path('app/storagebox'));

        if (! file_exists($mountPath) || ! is_readable($mountPath)) {
            if ($storageBox) {
                $storageBox->update(['status' => 'offline']);
            }

            return [
                'status' => 'error',
                'message' => "Storage Box mount path ({$mountPath}) does not exist or is not readable.",
                'processed' => 0,
                'added' => 0,
                'updated' => 0,
                'missing' => 0,
                'total_scanned' => 0,
            ];
        }

        if ($storageBox) {
            $storageBox->update(['status' => 'online']);
        }

        $scanPath = $subDirectory ? $this->storageBoxService->resolveRealPath($subDirectory, $storageBox) : $mountPath;

        $videoExtensions = ['mkv', 'mp4', 'avi', 'm4v', 'ts', 'mov', 'webm', 'flv'];
        $scannedPaths = [];
        $added = 0;
        $updated = 0;

        $dirIterator = new \RecursiveDirectoryIterator($scanPath, \FilesystemIterator::SKIP_DOTS);

        $filterIterator = new \RecursiveCallbackFilterIterator($dirIterator, function (\SplFileInfo $current) {
            $filename = $current->getFilename();
            if ($current->isDir()) {
                if (Str::startsWith($filename, ['$Recycle', '$RECYCLE', 'System Volume Information', '.Trash', '.git', '.tmp', 'sample', 'Sample'])) {
                    return false;
                }
            }

            return true;
        });

        $iterator = new \RecursiveIteratorIterator(
            $filterIterator,
            \RecursiveIteratorIterator::SELF_FIRST,
            \RecursiveIteratorIterator::CATCH_GET_CHILDREN
        );

        foreach ($iterator as $file) {
            try {
                if ($file->isFile()) {
                    $ext = strtolower($file->getExtension());
                    if (! in_array($ext, $videoExtensions)) {
                        continue;
                    }

                    // Örnek (sample) küçük videoları atla
                    $fileName = $file->getFilename();
                    if (Str::contains($fileName, ['sample', 'Sample', 'trailer', 'Trailer']) && $file->getSize() < 100 * 1024 * 1024) {
                        continue;
                    }

                    $fullPath = $file->getRealPath() ?: $file->getPathname();
                    $normFullPath = str_replace('\\', '/', $fullPath);
                    $normMountPath = str_replace('\\', '/', realpath($mountPath) ?: $mountPath);

                    $relativePath = ltrim(Str::after($normFullPath, rtrim($normMountPath, '/')), '/');
                    $scannedPaths[] = $relativePath;

                    $fileSize = $file->getSize();
                    $title = pathinfo($fileName, PATHINFO_FILENAME);

                    // Gelişmiş Medya Türü Tespiti (Dizi vs Film)
                    $type = MediaType::MOVIE;
                    if (
                        Str::contains($relativePath, ['Diziler', 'Series', 'TV Shows', 'Sezon', 'Season'], true) ||
                        preg_match('/S\d+E\d+/i', $fileName) ||
                        preg_match('/[0-9]+x[0-9]+/i', $fileName)
                    ) {
                        $type = MediaType::EPISODE;
                    }

                    // Yıl tespiti (Örn: "Inception (2010)" veya "Avatar.2009.1080p")
                    $year = null;
                    if (preg_match('/[\(\.\_\s](\d{4})[\)\.\_\s]/', $fileName, $matches)) {
                        $candidateYear = (int) $matches[1];
                        if ($candidateYear >= 1900 && $candidateYear <= 2099) {
                            $year = $candidateYear;
                        }
                    }

                    $query = Media::where(function ($q) use ($relativePath, $fullPath, $normFullPath) {
                        $q->where('file_path', $relativePath)
                            ->orWhere('file_path', str_replace('/', '\\', $relativePath))
                            ->orWhere('file_path', $fullPath)
                            ->orWhere('file_path', $normFullPath);
                    });

                    if ($storageBox) {
                        $query->where('storage_box_id', $storageBox->id);
                    }
                    $existing = $query->first();

                    if ($existing && $existing->file_path !== $relativePath) {
                        $existing->update(['file_path' => $relativePath]);
                    }

                    if ($fileSize <= 0 && $existing && $existing->file_size > 0) {
                        $fileSize = $existing->file_size;
                    }
                    if ($fileSize <= 0 && $storageBox) {
                        $remoteSize = $this->storageBoxService->fetchRemoteFileSize($relativePath, $storageBox);
                        if ($remoteSize > 0) {
                            $fileSize = $remoteSize;
                        }
                    }

                    if (! $existing) {
                        // Slug oluşturma
                        $cleanTitle = preg_replace('/(1080p|720p|2160p|4k|bluray|web-dl|x264|x265|hevc|remux|aac|dts)/i', '', $title);
                        $cleanTitle = trim(preg_replace('/[\.\_\-]/', ' ', $cleanTitle));
                        $displayTitle = ! empty($cleanTitle) ? $cleanTitle : $title;

                        $slug = Media::generateUniqueSlug($displayTitle, $year);

                        // Metadata tespiti
                        $meta = [];
                        try {
                            $meta = $this->storageBoxService->probeMetadata($relativePath, $storageBox);
                        } catch (Exception $e) {
                            Log::info("Metadata probe skipped for {$relativePath}: " . $e->getMessage());
                        }

                        $newMedia = Media::create([
                            'storage_box_id' => $storageBox?->id,
                            'type' => $type,
                            'title' => $displayTitle,
                            'year' => $year,
                            'slug' => $slug,
                            'file_path' => $relativePath,
                            'file_name' => $fileName,
                            'file_size' => $fileSize,
                            'extension' => $ext,
                            'mime_type' => $meta['mime_type'] ?? 'video/x-matroska',
                            'duration_seconds' => $meta['duration_seconds'] ?? null,
                            'width' => $meta['width'] ?? null,
                            'height' => $meta['height'] ?? null,
                            'video_codec' => $meta['video_codec'] ?? null,
                            'audio_codec' => $meta['audio_codec'] ?? null,
                            'bitrate' => $meta['bitrate'] ?? null,
                            'is_active' => true,
                            'is_available' => true,
                        ]);

                        // TMDB metadata çekme
                        try {
                            $this->tmdbService->fetchAndApply($newMedia);
                        } catch (\Exception $e) {
                            Log::info("TMDB auto-fetch failed for {$newMedia->title}: " . $e->getMessage());
                        }

                        $added++;
                    } else {
                        // Güncelleme
                        $shouldUpdateSize = ($fileSize > 0 && $existing->file_size !== $fileSize);
                        if ($shouldUpdateSize || ! $existing->is_available) {
                            $existing->update([
                                'file_size' => $fileSize > 0 ? $fileSize : $existing->file_size,
                                'is_available' => true,
                                'storage_box_id' => $storageBox?->id ?? $existing->storage_box_id,
                            ]);
                            $updated++;
                        }
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('Media scan error for file: ' . $e->getMessage());
                continue;
            }
        }

        // Silinmiş / yerinde bulunamayan medyaları unavailable işaretle
        $missingQuery = Media::where('is_available', true);
        if ($storageBox) {
            $missingQuery->where('storage_box_id', $storageBox->id);
        }
        $missingCount = $missingQuery->whereNotIn('file_path', $scannedPaths)->update(['is_available' => false]);

        return [
            'status' => 'success',
            'added' => $added,
            'updated' => $updated,
            'missing' => $missingCount,
            'total_scanned' => count($scannedPaths),
        ];
    }
}
