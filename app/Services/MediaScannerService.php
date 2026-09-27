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
    ) {}

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

        $videoExtensions = ['mkv', 'mp4', 'avi', 'm4v', 'ts', 'mov'];
        $scannedPaths = [];
        $added = 0;
        $updated = 0;

        $dirIterator = new \RecursiveDirectoryIterator($scanPath, \FilesystemIterator::SKIP_DOTS);

        $filterIterator = new \RecursiveCallbackFilterIterator($dirIterator, function (\SplFileInfo $current) {
            $filename = $current->getFilename();
            if ($current->isDir()) {
                if (Str::startsWith($filename, ['$Recycle', '$RECYCLE', 'System Volume Information', '.Trash', '.git', '.tmp'])) {
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

                $fullPath = $file->getRealPath() ?: $file->getPathname();
                $normFullPath = str_replace('\\', '/', $fullPath);
                $normMountPath = str_replace('\\', '/', realpath($mountPath) ?: $mountPath);

                $relativePath = ltrim(Str::after($normFullPath, rtrim($normMountPath, '/')), '/');

                $scannedPaths[] = $relativePath;

                $fileSize = $file->getSize();
                $fileName = $file->getFilename();
                $title = pathinfo($fileName, PATHINFO_FILENAME);

                // Determine media type based on directory or filename pattern
                $type = MediaType::MOVIE;
                if (Str::contains($relativePath, ['Diziler', 'Series', 'TV Shows'], true) || preg_match('/S\d+E\d+/i', $fileName)) {
                    $type = MediaType::EPISODE;
                }

                // Extract year if present, e.g. "Inception (2010)"
                $year = null;
                if (preg_match('/\(?(\d{4})\)?/', $title, $matches)) {
                    $year = (int) $matches[1];
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

                if (! $existing) {
                    // Generate guaranteed unique slug
                    $slug = Media::generateUniqueSlug($title, $year);

                    // Try probing metadata
                    $meta = [];
                    try {
                        $meta = $this->storageBoxService->probeMetadata($relativePath, $storageBox);
                    } catch (Exception $e) {
                        Log::info("Metadata probe skipped for {$relativePath}: " . $e->getMessage());
                    }

                    Media::create([
                        'storage_box_id' => $storageBox?->id,
                        'type' => $type,
                        'title' => $title,
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
                    $added++;
                } else {
                    // Update if size changed or marked unavailable
                    if ($existing->file_size !== $fileSize || ! $existing->is_available) {
                        $existing->update([
                            'file_size' => $fileSize,
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

        // Mark deleted files as unavailable for this storage box
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
