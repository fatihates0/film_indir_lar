<?php

namespace App\Services;

use App\Enums\MediaType;
use App\Jobs\ProcessRemoteTransferJob;
use App\Models\Media;
use App\Models\RemoteTransfer;
use App\Models\StorageBox;
use App\Services\Storage\StorageManager;
use Exception;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class RemoteTransferService
{
    protected StorageManager $storageManager;

    public function __construct(
        protected StorageBoxService $storageBoxService,
        protected AuditLogService $auditLogService,
        ?StorageManager $storageManager = null,
    ) {
        $this->storageManager = $storageManager ?? new StorageManager;
    }

    public function getMaxConcurrency(): int
    {
        return (int) config('storagebox.max_concurrent_transfers', config('storagebox.max_concurrency', 3));
    }

    public function getActiveTransfersCount(): int
    {
        return RemoteTransfer::whereIn('status', ['transferring', 'in_progress'])->count();
    }

    public function findExistingFileAcrossAllBoxes(string $fileName, int $fileSize, ?string $targetFolder = null): ?array
    {
        $relativePath = ($targetFolder ? trim($targetFolder, '/\\').'/' : '').$fileName;

        $existingTransfer = RemoteTransfer::where('file_name', $fileName)
            ->where('status', 'completed')
            ->first();

        if ($existingTransfer && $existingTransfer->storageBox) {
            $transferredSize = $existingTransfer->transferred_bytes ?: $existingTransfer->total_bytes;
            if ($fileSize <= 0 || $transferredSize <= 0 || $fileSize === $transferredSize) {
                return [
                    'box' => $existingTransfer->storageBox,
                    'size' => $transferredSize,
                ];
            }
        }

        $boxes = StorageBox::where('is_active', true)->get();
        foreach ($boxes as $box) {
            if ($this->storageBoxService->fileExists($relativePath, $box)) {
                return ['box' => $box, 'size' => $fileSize];
            }
        }

        return null;
    }

    public function hasAvailableSpace(StorageBox $storageBox, int $requiredBytes): bool
    {
        if ($requiredBytes <= 0) {
            return true;
        }

        $stats = $this->storageManager->driverForBox($storageBox)->getStorageStats();
        if ($stats['free'] !== null && $stats['free'] > 0) {
            return $stats['free'] >= $requiredBytes;
        }

        return true;
    }

    public function selectStorageBox(StorageBox|string|int|null $preference, int $requiredBytes = 0, array $excludeBoxIds = []): StorageBox
    {
        if ($preference instanceof StorageBox) {
            if (empty($excludeBoxIds) || ! in_array($preference->id, $excludeBoxIds)) {
                return $preference;
            }
        }

        if (is_numeric($preference)) {
            $boxId = (int) $preference;
            if (empty($excludeBoxIds) || ! in_array($boxId, $excludeBoxIds)) {
                $box = StorageBox::find($boxId);
                if ($box && $box->is_active) {
                    return $box;
                }
            }
        }

        $query = StorageBox::where('is_active', true);
        if (! empty($excludeBoxIds)) {
            $query->whereNotIn('id', $excludeBoxIds);
        }

        $box = $query->inRandomOrder()->first();
        if (! $box) {
            throw new Exception('Kullanılabilir aktif Storage Box bulunamadı.');
        }

        return $box;
    }

    public function processQueue(): int
    {
        $activeCount = $this->getActiveTransfersCount();
        $maxConcurrency = $this->getMaxConcurrency();

        if ($activeCount >= $maxConcurrency) {
            return 0;
        }

        $needed = $maxConcurrency - $activeCount;
        $pendingItems = RemoteTransfer::where('status', 'pending')->oldest()->take($needed)->get();
        $started = 0;

        foreach ($pendingItems as $next) {
            ProcessRemoteTransferJob::dispatch($next);
            $started++;
        }

        return $started;
    }

    /**
     * Inspect a remote URL to detect filename, size, and metadata without downloading the body.
     */
    public function probeUrl(string $url): array
    {
        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $url);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 10);
        curl_setopt($ch, CURLOPT_HEADER, true);
        curl_setopt($ch, CURLOPT_NOBODY, true);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_TIMEOUT, 20);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        $headers = curl_exec($ch);
        $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL) ?: $url;
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 400 || ! $headers) {
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
            curl_setopt($ch, CURLOPT_MAXREDIRS, 10);
            curl_setopt($ch, CURLOPT_HEADER, true);
            curl_setopt($ch, CURLOPT_RANGE, '0-0');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
            curl_setopt($ch, CURLOPT_TIMEOUT, 20);
            curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
            $headers = curl_exec($ch);
            $effectiveUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL) ?: $url;
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);
        }

        $fileName = null;
        if (preg_match('/Content-Disposition:.*?filename\*=UTF-8\'\'([^\r\n;\s]+)/i', $headers, $m)) {
            $fileName = urldecode($m[1]);
        } elseif (preg_match('/Content-Disposition:.*?filename="([^"]+)"/i', $headers, $m)) {
            $fileName = $m[1];
        } elseif (preg_match('/Content-Disposition:.*?filename=([^\r\n;\s]+)/i', $headers, $m)) {
            $fileName = trim($m[1], "\"'");
        }

        if (! $fileName) {
            $path = parse_url($effectiveUrl, PHP_URL_PATH);
            $fileName = $path ? basename($path) : 'download_'.time().'.mkv';
        }

        $fileName = str_replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], '', $fileName);

        $fileSize = 0;
        if (preg_match('/Content-Range:\s*bytes\s+\d+-\d+\/(\d+)/i', $headers, $matches)) {
            $fileSize = (int) $matches[1];
        } elseif (preg_match_all('/Content-Length:\s*(\d+)/i', $headers, $matches)) {
            $fileSize = (int) end($matches[1]);
        }

        $parsedMeta = $this->parseTitleAndType($fileName);

        return [
            'success' => true,
            'source_url' => $url,
            'effective_url' => $effectiveUrl,
            'file_name' => $fileName,
            'file_size' => $fileSize,
            'file_size_formatted' => $this->formatBytes($fileSize),
            'suggested_type' => $parsedMeta['type'],
            'suggested_title' => $parsedMeta['title'],
            'suggested_year' => $parsedMeta['year'],
            'suggested_folder' => $parsedMeta['type'] === 'movie' ? 'Filmler' : 'Diziler',
        ];
    }

    /**
     * Fast URL path/filename parsing without synchronous HTTP requests.
     */
    public function fastParseUrl(string $url): array
    {
        $path = parse_url($url, PHP_URL_PATH);
        $fileName = $path ? urldecode(basename($path)) : '';
        $fileName = str_replace(['\\', '/', ':', '*', '?', '"', '<', '>', '|'], '', $fileName);

        if (empty($fileName) || ! str_contains($fileName, '.')) {
            $fileName = 'media_'.time().'_'.Str::random(5).'.mkv';
        }

        $parsedMeta = $this->parseTitleAndType($fileName);

        return [
            'file_name' => $fileName,
            'suggested_type' => $parsedMeta['type'],
            'suggested_title' => $parsedMeta['title'],
            'suggested_year' => $parsedMeta['year'],
            'suggested_folder' => $parsedMeta['type'] === 'movie' ? 'Filmler' : 'Diziler',
        ];
    }

    /**
     * Parse bulk URLs and enqueue all valid transfers.
     */
    public function createBulkTransfers(string|array $rawUrls, StorageBox|string|null $storageBox = null, ?string $targetFolder = null, bool $autoAddMedia = true): array
    {
        $lines = is_array($rawUrls) ? $rawUrls : preg_split('/[\r\n]+/', trim($rawUrls));
        $validUrls = [];

        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) {
                continue;
            }

            if (preg_match('/https?:\/\/[^\s]+/', $line, $matches)) {
                $url = $matches[0];
                if (filter_var($url, FILTER_VALIDATE_URL)) {
                    $validUrls[] = $url;
                }
            }
        }

        $validUrls = array_values(array_unique($validUrls));
        $queued = [];
        $errors = [];

        foreach ($validUrls as $url) {
            try {
                $fastInfo = $this->fastParseUrl($url);
                $fileName = $fastInfo['file_name'];

                $folder = ! empty($targetFolder) && $targetFolder !== 'auto'
                    ? trim($targetFolder, '/\\')
                    : ($fastInfo['suggested_folder'] ?? 'Filmler');

                $relativePath = ($folder ? $folder.'/' : '').$fileName;

                $targetBox = $this->selectStorageBox($storageBox, 0);

                $transfer = RemoteTransfer::create([
                    'storage_box_id' => $targetBox->id,
                    'source_url' => $url,
                    'target_folder' => $folder,
                    'file_name' => $fileName,
                    'relative_path' => $relativePath,
                    'total_bytes' => 0,
                    'transferred_bytes' => 0,
                    'progress_percent' => 0.00,
                    'speed_bps' => 0,
                    'status' => 'pending',
                    'auto_add_media' => $autoAddMedia,
                ]);

                ProcessRemoteTransferJob::dispatch($transfer);
                $queued[] = $transfer;
            } catch (Exception $e) {
                $errors[] = [
                    'url' => $url,
                    'error' => $e->getMessage(),
                ];
            }
        }

        $auditTargetId = $storageBox instanceof StorageBox ? (string) $storageBox->id : 'random';
        $this->auditLogService->log(
            action: 'bulk_remote_transfers_queued',
            targetType: 'StorageBox',
            targetId: $auditTargetId,
            newValues: [
                'total_requested' => count($validUrls),
                'queued_count' => count($queued),
                'error_count' => count($errors),
            ]
        );

        return [
            'total' => count($validUrls),
            'queued' => count($queued),
            'transfers' => $queued,
            'errors' => $errors,
        ];
    }

    /**
     * Perform the actual streaming transfer from Source URL to Storage Box using modular StorageManager.
     */
    public function executeTransfer(RemoteTransfer $transfer, ?callable $progressCallback = null): bool
    {
        $transfer->refresh();
        if ($transfer->status === 'cancelled') {
            return false;
        }

        $storageBox = $transfer->storageBox;
        if (! $storageBox) {
            $transfer->update([
                'status' => 'failed',
                'error_message' => 'Hedef Storage Box bulunamadı.',
            ]);

            return false;
        }

        try {
            $probe = $this->probeUrl($transfer->source_url);
            $probedSize = $probe['file_size'] ?? 0;
            $probedName = ! empty($probe['file_name']) ? $probe['file_name'] : $transfer->file_name;

            $folder = $transfer->target_folder ?: ($probe['suggested_folder'] ?? 'Filmler');
            $relativePath = ($folder ? $folder.'/' : '').$probedName;

            $transfer->update([
                'file_name' => $probedName,
                'total_bytes' => $probedSize > 0 ? $probedSize : $transfer->total_bytes,
                'target_folder' => $folder,
                'relative_path' => $relativePath,
            ]);
            $transfer->refresh();
        } catch (Exception $e) {
            Log::warning("RemoteTransfer #{$transfer->id} probeUrl failed in background: ".$e->getMessage());
        }

        // Check duplicate matching file
        $existingMatch = $this->findExistingFileAcrossAllBoxes(
            $transfer->file_name,
            $transfer->total_bytes,
            $transfer->target_folder
        );

        if ($existingMatch !== null) {
            $foundBox = $existingMatch['box'];
            $matchedSize = $existingMatch['size'];
            $finalSize = $transfer->total_bytes > 0 ? $transfer->total_bytes : $matchedSize;

            Log::info("RemoteTransfer #{$transfer->id} ({$transfer->file_name}): Aynı isim ve boyutta dosya '{$foundBox->name}' kutusunda mevcut.");
            $transfer->update([
                'storage_box_id' => $foundBox->id,
                'status' => 'completed',
                'progress_percent' => 100.00,
                'total_bytes' => $finalSize,
                'transferred_bytes' => $finalSize,
                'speed_bps' => 0,
                'error_message' => "Dosya '{$foundBox->name}' üzerinde aynı isim ve boyutta mevcut.",
            ]);

            if ($transfer->auto_add_media) {
                $this->registerMedia($transfer, $foundBox);
            }

            $this->processQueue();

            return true;
        }

        $transfer->update([
            'status' => 'transferring',
            'error_message' => null,
        ]);

        // Space check & auto-reroute
        if ($transfer->total_bytes > 0 && ! $this->hasAvailableSpace($storageBox, $transfer->total_bytes)) {
            try {
                $alternateBox = $this->selectStorageBox('random', $transfer->total_bytes, [$storageBox->id]);
                Log::info("Storage Box '{$storageBox->name}' dolu olduğu için transfer #{$transfer->id} ({$transfer->file_name}) '{$alternateBox->name}' kutusuna yönlendirildi.");
                $transfer->update(['storage_box_id' => $alternateBox->id]);
                $storageBox = $alternateBox;
            } catch (Exception $e) {
                $transfer->update([
                    'status' => 'failed',
                    'error_message' => "Hedef Storage Box ({$storageBox->name}) üzerinde yeterli boş alan yok ve alternatif kutu bulunamadı.",
                ]);

                return false;
            }
        }

        try {
            $driver = $this->storageManager->driverForBox($storageBox);
            $targetRelativePath = ($transfer->target_folder ? trim($transfer->target_folder, '/\\').'/' : '').$transfer->file_name;

            $transferredBytes = $driver->uploadStream(
                $transfer->source_url,
                $targetRelativePath,
                function ($transferredNow, $totalBytesNow, $speedBps) use ($transfer, $progressCallback) {
                    $totalBytes = $transfer->total_bytes > 0 ? $transfer->total_bytes : $totalBytesNow;
                    $percent = $totalBytes > 0 ? round(($transferredNow / $totalBytes) * 100, 2) : 0.00;

                    $transfer->update([
                        'transferred_bytes' => $transferredNow,
                        'progress_percent' => min($percent, 99.99),
                        'speed_bps' => $speedBps,
                    ]);

                    if ($progressCallback) {
                        $progressCallback($transferredNow, (int) $totalBytes, $speedBps);
                    }
                },
                function () use ($transfer) {
                    $currentStatus = RemoteTransfer::where('id', $transfer->id)->value('status');

                    return $currentStatus === null || $currentStatus === 'cancelled';
                }
            );

            $freshStatus = RemoteTransfer::where('id', $transfer->id)->value('status');
            if ($freshStatus === null || $freshStatus === 'cancelled') {
                $this->cleanupPartialFiles($transfer);
                $this->processQueue();

                return false;
            }

            $transfer->update([
                'status' => 'completed',
                'progress_percent' => 100.00,
                'transferred_bytes' => $transferredBytes,
                'total_bytes' => $transfer->total_bytes ?: $transferredBytes,
                'speed_bps' => 0,
            ]);

            if ($transfer->auto_add_media) {
                $this->registerMedia($transfer, $storageBox);
            }

            $this->auditLogService->log(
                action: 'remote_transfer_completed',
                targetType: 'RemoteTransfer',
                targetId: (string) $transfer->id,
                newValues: [
                    'file_name' => $transfer->file_name,
                    'storage_box' => $storageBox->name,
                    'size' => $transferredBytes,
                ]
            );

            $this->processQueue();

            return true;
        } catch (Exception $e) {
            $freshStatus = RemoteTransfer::where('id', $transfer->id)->value('status');
            if ($freshStatus === null || $freshStatus === 'cancelled') {
                $this->cleanupPartialFiles($transfer);
                $this->processQueue();

                return false;
            }

            Log::error("Remote transfer #{$transfer->id} failed: ".$e->getMessage());

            $transfer->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'speed_bps' => 0,
            ]);

            $this->processQueue();

            return false;
        }
    }

    public function registerMedia(RemoteTransfer $transfer, StorageBox $storageBox): void
    {
        $relativePath = trim($transfer->relative_path, '/\\');
        $fileName = $transfer->file_name;
        $size = $transfer->transferred_bytes ?: $transfer->total_bytes;

        $parsed = $this->parseTitleAndType($fileName);

        $media = Media::updateOrCreate(
            [
                'storage_box_id' => $storageBox->id,
                'file_path' => $relativePath,
            ],
            [
                'type' => $parsed['type'] === 'movie' ? MediaType::MOVIE : MediaType::EPISODE,
                'title' => $parsed['title'],
                'year' => $parsed['year'],
                'slug' => Media::generateUniqueSlug($parsed['title'], $parsed['year']),
                'file_name' => $fileName,
                'file_size' => $size,
                'mime_type' => 'video/x-matroska',
                'extension' => pathinfo($fileName, PATHINFO_EXTENSION) ?: 'mkv',
                'is_active' => true,
                'is_available' => true,
            ]
        );

        $transfer->update(['media_id' => $media->id]);
    }

    public function parseTitleAndType(string $fileName): array
    {
        $clean = pathinfo($fileName, PATHINFO_FILENAME);

        $year = null;
        if (preg_match('/[\.\s\-\(](19\d{2}|20\d{2})[\.\s\-\)]/i', $clean, $matches)) {
            $year = (int) $matches[1];
        }

        $isEpisode = preg_match('/[sS](\d{1,2})[eE](\d{1,2})|(\d{1,2})x(\d{1,2})/i', $clean);

        $titleCandidate = $clean;
        if ($year) {
            $pos = strpos($titleCandidate, (string) $year);
            if ($pos !== false) {
                $titleCandidate = substr($titleCandidate, 0, $pos);
            }
        }

        $titleCandidate = preg_replace('/(720p|1080p|2160p|4k|web-?dl|webrip|bluray|x264|x265|hevc|aac|dual)/i', '', $titleCandidate);
        $titleCandidate = str_replace(['.', '_', '-'], ' ', $titleCandidate);
        $titleCandidate = trim(preg_replace('/\s+/', ' ', $titleCandidate));

        return [
            'title' => $titleCandidate ?: pathinfo($fileName, PATHINFO_FILENAME),
            'year' => $year,
            'type' => $isEpisode ? 'episode' : 'movie',
        ];
    }

    public function formatBytes(int $bytes): string
    {
        if ($bytes <= 0) {
            return '0 B';
        }
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = floor(log($bytes, 1024));

        return round($bytes / pow(1024, $i), 2).' '.$units[$i];
    }

    public function cancelTransfer(RemoteTransfer $transfer): void
    {
        $transfer->update([
            'status' => 'cancelled',
            'error_message' => 'Kullanıcı tarafından iptal edildi.',
            'speed_bps' => 0,
        ]);

        $this->cleanupPartialFiles($transfer);
    }

    public function cleanupPartialFiles(RemoteTransfer $transfer): void
    {
        // Cleanup partial file logic
    }
}
