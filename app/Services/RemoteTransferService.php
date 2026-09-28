<?php

namespace App\Services;

use App\Enums\MediaType;
use App\Models\Media;
use App\Models\RemoteTransfer;
use App\Models\StorageBox;
use Exception;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class RemoteTransferService
{
    public function __construct(
        protected StorageBoxService $storageBoxService,
        protected AuditLogService $auditLogService,
    ) {}

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
            // Fallback: Try a Range 0-0 GET request if HEAD is blocked by server/CDN
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
            $fileName = $path ? basename($path) : 'download_' . time() . '.mkv';
        }

        // Clean filename of potential invalid path characters
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
     * Parse bulk URLs and enqueue all valid transfers.
     */
    public function createBulkTransfers(string|array $rawUrls, StorageBox $storageBox, ?string $targetFolder = null, bool $autoAddMedia = true): array
    {
        $lines = is_array($rawUrls) ? $rawUrls : preg_split('/[\r\n]+/', trim($rawUrls));
        $validUrls = [];

        foreach ($lines as $line) {
            $line = trim($line);
            if (empty($line)) continue;

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
                $probe = $this->probeUrl($url);
                $fileName = $probe['file_name'] ?: 'media_' . time() . '_' . Str::random(5) . '.mkv';

                $folder = ! empty($targetFolder) && $targetFolder !== 'auto'
                    ? trim($targetFolder, '/\\')
                    : ($probe['suggested_folder'] ?? 'Filmler');

                $relativePath = ($folder ? $folder . '/' : '') . $fileName;

                $transfer = RemoteTransfer::create([
                    'storage_box_id' => $storageBox->id,
                    'source_url' => $url,
                    'target_folder' => $folder,
                    'file_name' => $fileName,
                    'relative_path' => $relativePath,
                    'total_bytes' => $probe['file_size'] ?? 0,
                    'transferred_bytes' => 0,
                    'progress_percent' => 0.00,
                    'speed_bps' => 0,
                    'status' => 'pending',
                    'auto_add_media' => $autoAddMedia,
                ]);

                \App\Jobs\ProcessRemoteTransferJob::dispatch($transfer);
                $queued[] = $transfer;
            } catch (Exception $e) {
                $errors[] = [
                    'url' => $url,
                    'error' => $e->getMessage(),
                ];
            }
        }

        $this->auditLogService->log(
            action: 'bulk_remote_transfers_queued',
            targetType: 'StorageBox',
            targetId: (string) $storageBox->id,
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
     * Perform the actual streaming transfer from Source URL to Storage Box.
     */
    public function executeTransfer(RemoteTransfer $transfer, ?callable $progressCallback = null): bool
    {
        $transfer->refresh();
        if ($transfer->status === 'cancelled') {
            return false;
        }

        $transfer->update([
            'status' => 'transferring',
            'error_message' => null,
        ]);

        $storageBox = $transfer->storageBox;
        if (! $storageBox) {
            $transfer->update([
                'status' => 'failed',
                'error_message' => 'Hedef Storage Box bulunamadı.',
            ]);

            return false;
        }

        try {
            $mountPath = $storageBox->mount_path;
            $isLocalMount = ! empty($mountPath) && is_dir($mountPath) && is_writable($mountPath);

            if ($isLocalMount) {
                $this->transferToLocalMount($transfer, $storageBox, $progressCallback);
            } elseif (! empty($storageBox->host) && ! empty($storageBox->username) && ! empty($storageBox->password)) {
                $this->transferToWebdav($transfer, $storageBox, $progressCallback);
            } else {
                throw new Exception("Storage Box '{$storageBox->name}' ne yerel mount olarak ne de WebDAV erişimiyle bağlanabilir durumda.");
            }

            // Check if transfer was cancelled during execution before completing
            $freshStatus = RemoteTransfer::where('id', $transfer->id)->value('status');
            if ($freshStatus === null || $freshStatus === 'cancelled') {
                $this->cleanupPartialFiles($transfer);
                return false;
            }

            // Mark as completed
            $transfer->update([
                'status' => 'completed',
                'progress_percent' => 100.00,
                'transferred_bytes' => $transfer->total_bytes ?: $transfer->transferred_bytes,
                'speed_bps' => 0,
            ]);

            // Auto-register to Media library if requested
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
                    'size' => $transfer->transferred_bytes,
                ]
            );

            return true;
        } catch (Exception $e) {
            $freshStatus = RemoteTransfer::where('id', $transfer->id)->value('status');
            if ($freshStatus === null || $freshStatus === 'cancelled') {
                $this->cleanupPartialFiles($transfer);
                return false;
            }

            Log::error("Remote transfer #{$transfer->id} failed: " . $e->getMessage(), [
                'exception' => $e,
                'transfer' => $transfer->toArray(),
            ]);

            $transfer->update([
                'status' => 'failed',
                'error_message' => $e->getMessage(),
                'speed_bps' => 0,
            ]);

            return false;
        }
    }

    /**
     * Transfer directly into local mount path.
     */
    protected function transferToLocalMount(RemoteTransfer $transfer, StorageBox $storageBox, ?callable $progressCallback = null): void
    {
        $targetFolder = trim($transfer->target_folder, '/\\');
        $fullDir = rtrim($storageBox->mount_path, '/\\') . ($targetFolder ? DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $targetFolder) : '');

        if (! is_dir($fullDir)) {
            mkdir($fullDir, 0775, true);
        }

        $destFilePath = $fullDir . DIRECTORY_SEPARATOR . $transfer->file_name;
        $destHandle = fopen($destFilePath, 'wb');
        if (! $destHandle) {
            throw new Exception("Hedef dosya yazılamadı: {$destFilePath}");
        }

        $lastUpdateTime = microtime(true);
        $lastBytes = 0;
        $totalBytes = $transfer->total_bytes;

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $transfer->source_url);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0');
        curl_setopt($ch, CURLOPT_NOPROGRESS, false);

        curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($ch, $data) use ($destHandle) {
            return fwrite($destHandle, $data);
        });

        curl_setopt($ch, CURLOPT_PROGRESSFUNCTION, function ($ch, $dlTotal, $dlNow, $ulTotal, $ulNow) use (&$lastUpdateTime, &$lastBytes, &$totalBytes, $transfer, $progressCallback) {
            if ($dlTotal > 0 && $totalBytes <= 0) {
                $totalBytes = (int) $dlTotal;
                $transfer->update(['total_bytes' => $totalBytes]);
            }

            $now = microtime(true);
            $timeDiff = $now - $lastUpdateTime;

            if ($timeDiff >= 1.5) { // update database every 1.5s
                // Check if user cancelled or deleted
                $currentStatus = RemoteTransfer::where('id', $transfer->id)->value('status');
                if ($currentStatus === null || $currentStatus === 'cancelled') {
                    return 1; // abort curl
                }

                $bytesDiff = $dlNow - $lastBytes;
                $speedBps = $timeDiff > 0 ? (int) round($bytesDiff / $timeDiff) : 0;
                $percent = $totalBytes > 0 ? round(($dlNow / $totalBytes) * 100, 2) : 0.00;

                $transfer->update([
                    'transferred_bytes' => (int) $dlNow,
                    'progress_percent' => min($percent, 99.99),
                    'speed_bps' => $speedBps,
                ]);

                if ($progressCallback) {
                    $progressCallback((int) $dlNow, (int) $totalBytes, $speedBps);
                }

                $lastUpdateTime = $now;
                $lastBytes = $dlNow;
            }

            return 0;
        });

        $success = curl_exec($ch);
        $err = curl_error($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        fclose($destHandle);

        $finalStatus = RemoteTransfer::where('id', $transfer->id)->value('status');
        if ($finalStatus === null || $finalStatus === 'cancelled') {
            @unlink($destFilePath);
            throw new Exception("İşlem kullanıcı tarafından iptal edildi.");
        }

        if (! $success || $httpCode >= 400) {
            @unlink($destFilePath);
            throw new Exception("İndirme hatası (HTTP {$httpCode}): " . ($err ?: 'Bilinmeyen hata'));
        }

        $finalSize = file_exists($destFilePath) ? filesize($destFilePath) : 0;
        $transfer->update([
            'transferred_bytes' => $finalSize,
            'total_bytes' => $finalSize > 0 ? $finalSize : $transfer->total_bytes,
        ]);
    }

    /**
     * Transfer directly into Hetzner Storage Box via WebDAV HTTP PUT streaming.
     */
    protected function transferToWebdav(RemoteTransfer $transfer, StorageBox $storageBox, ?callable $progressCallback = null): void
    {
        $host = $storageBox->host;
        $baseHost = str_starts_with($host, 'http://') || str_starts_with($host, 'https://') ? rtrim($host, '/') : "https://{$host}";

        $targetFolder = trim($transfer->target_folder, '/\\');
        $folderSegments = array_filter(explode('/', str_replace('\\', '/', $targetFolder)), fn ($s) => $s !== '');

        // Ensure directories exist on WebDAV via MKCOL
        $currentPath = $baseHost;
        foreach ($folderSegments as $segment) {
            $currentPath .= '/' . rawurlencode($segment);
            $chMk = curl_init($currentPath);
            curl_setopt($chMk, CURLOPT_USERPWD, "{$storageBox->username}:{$storageBox->password}");
            curl_setopt($chMk, CURLOPT_CUSTOMREQUEST, 'MKCOL');
            curl_setopt($chMk, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($chMk, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($chMk, CURLOPT_SSL_VERIFYHOST, false);
            curl_setopt($chMk, CURLOPT_TIMEOUT, 5);
            curl_exec($chMk);
            curl_close($chMk);
        }

        $destUrl = $baseHost . '/' . ($targetFolder ? implode('/', array_map('rawurlencode', $folderSegments)) . '/' : '') . rawurlencode($transfer->file_name);

        // Open HTTP read stream from source
        $context = stream_context_create([
            'http' => [
                'follow_location' => 1,
                'user_agent' => 'Mozilla/5.0',
            ],
            'ssl' => [
                'verify_peer' => false,
                'verify_peer_name' => false,
            ],
        ]);

        $sourceStream = @fopen($transfer->source_url, 'rb', false, $context);
        if (! $sourceStream) {
            throw new Exception("Kaynak URL okunamadı veya açılamadı: {$transfer->source_url}");
        }

        $lastUpdateTime = microtime(true);
        $lastBytes = 0;
        $transferredNow = 0;
        $totalBytes = $transfer->total_bytes;

        $chPut = curl_init();
        curl_setopt($chPut, CURLOPT_URL, $destUrl);
        curl_setopt($chPut, CURLOPT_USERPWD, "{$storageBox->username}:{$storageBox->password}");
        curl_setopt($chPut, CURLOPT_PUT, true);
        curl_setopt($chPut, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($chPut, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($chPut, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($chPut, CURLOPT_HTTPHEADER, ['Transfer-Encoding: chunked']);

        curl_setopt($chPut, CURLOPT_READFUNCTION, function ($ch, $fd, $length) use (&$sourceStream, &$transferredNow, &$lastUpdateTime, &$lastBytes, &$totalBytes, $transfer, $progressCallback) {
            if (feof($sourceStream)) {
                return '';
            }

            $now = microtime(true);
            $timeDiff = $now - $lastUpdateTime;

            if ($timeDiff >= 1.5) {
                // Check if user cancelled or deleted
                $currentStatus = RemoteTransfer::where('id', $transfer->id)->value('status');
                if ($currentStatus === null || $currentStatus === 'cancelled') {
                    return ''; // stop reading chunk, abort WebDAV upload
                }

                $bytesDiff = $transferredNow - $lastBytes;
                $speedBps = $timeDiff > 0 ? (int) round($bytesDiff / $timeDiff) : 0;
                $percent = $totalBytes > 0 ? round(($transferredNow / $totalBytes) * 100, 2) : 0.00;

                $transfer->update([
                    'transferred_bytes' => $transferredNow,
                    'progress_percent' => min($percent, 99.99),
                    'speed_bps' => $speedBps,
                ]);

                if ($progressCallback) {
                    $progressCallback($transferredNow, (int) $totalBytes, $speedBps);
                }

                $lastUpdateTime = $now;
                $lastBytes = $transferredNow;
            }

            $chunk = fread($sourceStream, $length);
            $chunkLen = strlen($chunk);
            $transferredNow += $chunkLen;

            return $chunk;
        });

        $res = curl_exec($chPut);
        $httpCode = curl_getinfo($chPut, CURLINFO_HTTP_CODE);
        $err = curl_error($chPut);
        curl_close($chPut);
        fclose($sourceStream);

        $finalStatus = RemoteTransfer::where('id', $transfer->id)->value('status');
        if ($finalStatus === null || $finalStatus === 'cancelled') {
            $this->cleanupPartialFiles($transfer);
            throw new Exception("WebDAV transferi kullanıcı tarafından iptal edildi.");
        }

        if ($httpCode !== 201 && $httpCode !== 204 && $httpCode !== 200) {
            throw new Exception("Storage Box WebDAV yükleme hatası (HTTP {$httpCode}): " . ($err ?: $res));
        }

        $transfer->update([
            'transferred_bytes' => $transferredNow,
            'total_bytes' => $transferredNow > 0 ? $transferredNow : $transfer->total_bytes,
        ]);
    }

    /**
     * Automatically register newly transferred file to Laravel media database.
     */
    protected function registerMedia(RemoteTransfer $transfer, StorageBox $storageBox): void
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

    /**
     * Parse film title, year, and type from filename.
     */
    public function parseTitleAndType(string $fileName): array
    {
        $clean = pathinfo($fileName, PATHINFO_FILENAME);

        // Detect year (1900 - 2099)
        $year = null;
        if (preg_match('/[\.\s\-\(](19\d{2}|20\d{2})[\.\s\-\)]/i', $clean, $matches)) {
            $year = (int) $matches[1];
        }

        // Detect TV Episode pattern like s01e01, 1x01
        $isEpisode = preg_match('/[sS](\d{1,2})[eE](\d{1,2})|(\d{1,2})x(\d{1,2})/i', $clean);

        // Clean title
        $titleCandidate = $clean;
        if ($year) {
            $pos = strpos($titleCandidate, (string) $year);
            if ($pos !== false) {
                $titleCandidate = substr($titleCandidate, 0, $pos);
            }
        }

        // Remove release tags (720p, 1080p, WEBRip, BluRay, x264, etc.)
        $titleCandidate = preg_replace('/(720p|1080p|2160p|4k|web-?dl|webrip|bluray|x264|x265|hevc|aac|dual)/i', '', $titleCandidate);
        $titleCandidate = str_replace(['.', '_', '-'], ' ', $titleCandidate);
        $titleCandidate = trim(preg_replace('/\s+/', ' ', $titleCandidate));

        return [
            'title' => $titleCandidate ?: pathinfo($fileName, PATHINFO_FILENAME),
            'year' => $year,
            'type' => $isEpisode ? 'episode' : 'movie',
        ];
    }

    /**
     * Format bytes to readable string.
     */
    public function formatBytes(int $bytes): string
    {
        if ($bytes <= 0) return '0 B';
        $units = ['B', 'KB', 'MB', 'GB', 'TB'];
        $i = floor(log($bytes, 1024));
        return round($bytes / pow(1024, $i), 2) . ' ' . $units[$i];
    }

    /**
     * Cancel an active transfer and clean up any partially written files.
     */
    public function cancelTransfer(RemoteTransfer $transfer): void
    {
        $transfer->update([
            'status' => 'cancelled',
            'error_message' => 'Kullanıcı tarafından iptal edildi.',
            'speed_bps' => 0,
        ]);

        $this->cleanupPartialFiles($transfer);
    }

    /**
     * Remove partial file from local mount or WebDAV.
     */
    public function cleanupPartialFiles(RemoteTransfer $transfer): void
    {
        $storageBox = $transfer->storageBox;
        if (! $storageBox) {
            return;
        }

        try {
            $targetFolder = trim($transfer->target_folder, '/\\');

            // 1. Clean from local mount if exists
            if (! empty($storageBox->mount_path) && is_dir($storageBox->mount_path)) {
                $fullDir = rtrim($storageBox->mount_path, '/\\') . ($targetFolder ? DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $targetFolder) : '');
                $filePath = $fullDir . DIRECTORY_SEPARATOR . $transfer->file_name;
                if (file_exists($filePath)) {
                    @unlink($filePath);
                }
            }

            // 2. Clean from WebDAV if host is configured
            if (! empty($storageBox->host) && ! empty($storageBox->username) && ! empty($storageBox->password)) {
                $host = $storageBox->host;
                $baseHost = str_starts_with($host, 'http://') || str_starts_with($host, 'https://') ? rtrim($host, '/') : "https://{$host}";
                $folderSegments = array_filter(explode('/', str_replace('\\', '/', $targetFolder)), fn ($s) => $s !== '');
                $destUrl = $baseHost . '/' . ($targetFolder ? implode('/', array_map('rawurlencode', $folderSegments)) . '/' : '') . rawurlencode($transfer->file_name);

                $chDel = curl_init($destUrl);
                curl_setopt($chDel, CURLOPT_USERPWD, "{$storageBox->username}:{$storageBox->password}");
                curl_setopt($chDel, CURLOPT_CUSTOMREQUEST, 'DELETE');
                curl_setopt($chDel, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($chDel, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($chDel, CURLOPT_SSL_VERIFYHOST, false);
                curl_setopt($chDel, CURLOPT_TIMEOUT, 5);
                curl_exec($chDel);
                curl_close($chDel);
            }
        } catch (\Throwable $e) {
            Log::warning("Could not cleanup partial files for transfer #{$transfer->id}: " . $e->getMessage());
        }
    }
}
