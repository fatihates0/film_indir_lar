<?php

namespace App\Services\Storage\Drivers;

use Exception;

class LocalMountDriver extends AbstractStorageDriver
{
    public function testConnection(array $config): array
    {
        $mountPath = $config['mount_path'] ?? '';
        if (empty($mountPath)) {
            return [
                'success' => false,
                'message' => 'Yerel Mount için Sunucu Yolu (Mount Dizi) zorunludur.',
            ];
        }

        if (! file_exists($mountPath)) {
            return [
                'success' => false,
                'message' => "Mount dizini bulunamadı: {$mountPath}. Lütfen dizinin varlığını kontrol edin.",
            ];
        }

        if (! is_readable($mountPath)) {
            return [
                'success' => false,
                'message' => "Mount dizini okunamıyor (Erişim engellendi): {$mountPath}",
            ];
        }

        $totalSpace = @disk_total_space($mountPath);
        $freeSpace = @disk_free_space($mountPath);
        $usedSpace = ($totalSpace !== false && $freeSpace !== false) ? max(0, $totalSpace - $freeSpace) : null;

        $stats = null;
        if ($totalSpace !== false && $totalSpace > 0) {
            $stats = [
                'total_space' => $this->formatBytes((float) $totalSpace),
                'free_space' => $this->formatBytes((float) $freeSpace),
                'used_space' => $this->formatBytes((float) $usedSpace),
                'raw_total' => (float) $totalSpace,
                'raw_free' => (float) $freeSpace,
                'raw_used' => (float) $usedSpace,
            ];
        }

        return [
            'success' => true,
            'message' => "Yerel Mount Bağlantısı Başarılı! Dizin erişilebilir ({$mountPath}).",
            'details' => $stats ?: ['path' => $mountPath],
        ];
    }

    public function uploadStream(
        string $sourceUrl,
        string $targetRelativePath,
        ?callable $progressCallback = null,
        ?callable $cancellationCheck = null
    ): int {
        $baseMount = $this->config['mount_path'] ?? storage_path('app/storagebox');
        $fullDestPath = rtrim($baseMount, '/\\').DIRECTORY_SEPARATOR.ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $targetRelativePath), DIRECTORY_SEPARATOR);

        $dir = dirname($fullDestPath);
        if (! file_exists($dir)) {
            @mkdir($dir, 0755, true);
        }

        $context = stream_context_create([
            'http' => ['follow_location' => 1, 'user_agent' => 'Mozilla/5.0'],
            'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
        ]);

        $sourceStream = @fopen($sourceUrl, 'rb', false, $context);
        if (! $sourceStream) {
            throw new Exception("Kaynak URL okunamadı: {$sourceUrl}");
        }

        $destStream = @fopen($fullDestPath, 'wb');
        if (! $destStream) {
            fclose($sourceStream);
            throw new Exception("Yerel hedef dosya oluşturulamadı: {$fullDestPath}");
        }

        $transferredNow = 0;
        $lastUpdateTime = microtime(true);
        $lastBytes = 0;

        while (! feof($sourceStream)) {
            if ($cancellationCheck && $cancellationCheck()) {
                fclose($sourceStream);
                fclose($destStream);
                @unlink($fullDestPath);
                throw new Exception('İşlem kullanıcı tarafından iptal edildi.');
            }

            $chunk = fread($sourceStream, 65536);
            if ($chunk !== false && strlen($chunk) > 0) {
                fwrite($destStream, $chunk);
                $transferredNow += strlen($chunk);

                $now = microtime(true);
                $timeDiff = $now - $lastUpdateTime;
                if ($timeDiff >= 1.5) {
                    $bytesDiff = $transferredNow - $lastBytes;
                    $speedBps = $timeDiff > 0 ? (int) round($bytesDiff / $timeDiff) : 0;

                    if ($progressCallback) {
                        $progressCallback($transferredNow, 0, $speedBps);
                    }
                    $lastUpdateTime = $now;
                    $lastBytes = $transferredNow;
                }
            }
        }

        fclose($sourceStream);
        fclose($destStream);

        return $transferredNow;
    }

    public function fileExists(string $relativePath): bool
    {
        $baseMount = $this->config['mount_path'] ?? storage_path('app/storagebox');
        $fullPath = rtrim($baseMount, '/\\').DIRECTORY_SEPARATOR.ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativePath), DIRECTORY_SEPARATOR);

        return file_exists($fullPath) && is_file($fullPath);
    }

    public function getFileSize(string $relativePath): int
    {
        $baseMount = $this->config['mount_path'] ?? storage_path('app/storagebox');
        $fullPath = rtrim($baseMount, '/\\').DIRECTORY_SEPARATOR.ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativePath), DIRECTORY_SEPARATOR);

        return file_exists($fullPath) ? (int) @filesize($fullPath) : 0;
    }

    public function listFiles(string $relativePath = ''): array
    {
        $baseMount = $this->config['mount_path'] ?? storage_path('app/storagebox');
        $fullPath = rtrim($baseMount, '/\\').DIRECTORY_SEPARATOR.ltrim(str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $relativePath), DIRECTORY_SEPARATOR);

        if (! file_exists($fullPath) || ! is_dir($fullPath)) {
            return [];
        }

        $items = @scandir($fullPath);
        if (! is_array($items)) {
            return [];
        }

        $result = [];
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            $itemFullPath = $fullPath.DIRECTORY_SEPARATOR.$item;
            $isDir = is_dir($itemFullPath);
            $size = $isDir ? 0 : (int) @filesize($itemFullPath);

            $result[] = [
                'name' => $item,
                'path' => ($relativePath ? rtrim($relativePath, '/').'/' : '').$item,
                'is_dir' => $isDir,
                'size' => $size,
            ];
        }

        return $result;
    }

    public function getStorageStats(): array
    {
        $res = $this->testConnection($this->config);
        if ($res['success'] && isset($res['details']['raw_total'])) {
            return [
                'total' => $res['details']['raw_total'],
                'used' => $res['details']['raw_used'],
                'free' => $res['details']['raw_free'],
            ];
        }

        return ['total' => null, 'used' => null, 'free' => null];
    }
}
