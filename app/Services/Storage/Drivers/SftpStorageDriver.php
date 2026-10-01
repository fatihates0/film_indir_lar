<?php

namespace App\Services\Storage\Drivers;

use Exception;
use Illuminate\Support\Facades\Log;
use phpseclib3\Net\SFTP;

class SftpStorageDriver extends AbstractStorageDriver
{
    /**
     * Test connection credentials and server reachability for SFTP.
     */
    public function testConnection(array $config): array
    {
        $host = $config['host'] ?? '';
        $username = $config['username'] ?? '';
        $password = $config['password'] ?? '';
        $port = (int) ($config['port'] ?? 22);

        if (empty($host) || empty($username)) {
            return [
                'success' => false,
                'message' => 'SFTP bağlantısı için Sunucu Adresi (Host) ve Kullanıcı Adı zorunludur.',
            ];
        }

        try {
            $sftp = new SFTP($host, $port, 10);
            if (! $sftp->login($username, $password)) {
                return [
                    'success' => false,
                    'message' => 'SFTP Kimlik Doğrulaması Başarısız: Kullanıcı adı veya şifre hatalı.',
                ];
            }

            $currentDir = $sftp->pwd();
            $fileList = $sftp->nlist($currentDir);

            $statRes = $sftp->exec('df -P .');
            $stats = null;
            if ($statRes && preg_match('/(?:Filesystem|\/dev\/)[^\n]+\n[^\s]+\s+(\d+)\s+(\d+)\s+(\d+)/s', $statRes, $m)) {
                $totalBytes = (float) $m[1] * 1024;
                $usedBytes = (float) $m[2] * 1024;
                $freeBytes = (float) $m[3] * 1024;
                $stats = [
                    'total_space' => $this->formatBytes($totalBytes),
                    'free_space' => $this->formatBytes($freeBytes),
                    'used_space' => $this->formatBytes($usedBytes),
                    'raw_total' => $totalBytes,
                    'raw_free' => $freeBytes,
                    'raw_used' => $usedBytes,
                ];
            }

            return [
                'success' => true,
                'message' => "SFTP Bağlantısı Başarılı! Sunucuya bağlandı ({$host}:{$port}).",
                'details' => $stats ?: [
                    'current_dir' => $currentDir,
                    'file_count' => is_array($fileList) ? count($fileList) : 0,
                ],
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => 'SFTP Bağlantı Hatası: '.$e->getMessage(),
            ];
        }
    }

    /**
     * Stream upload a source URL directly to remote SFTP target path.
     */
    public function uploadStream(
        string $sourceUrl,
        string $targetRelativePath,
        ?callable $progressCallback = null,
        ?callable $cancellationCheck = null
    ): int {
        $host = $this->config['host'] ?? '';
        $username = $this->config['username'] ?? '';
        $password = $this->config['password'] ?? '';
        $port = (int) ($this->config['port'] ?? 22);

        $sftp = new SFTP($host, $port, 30);
        if (! $sftp->login($username, $password)) {
            throw new Exception("SFTP Giriş Hatası: Sunucu {$host}:{$port} kullanıcı {$username} doğrulanamadı.");
        }

        $normalizedTarget = $this->normalizePath($targetRelativePath);
        $pathParts = explode('/', $normalizedTarget);
        $fileName = array_pop($pathParts);
        $folderPath = implode('/', $pathParts);

        // Ensure remote directories exist
        if (! empty($folderPath)) {
            $dirs = explode('/', $folderPath);
            $current = '';
            foreach ($dirs as $dir) {
                $current .= ($current ? '/' : '').$dir;
                if (! $sftp->is_dir($current)) {
                    $sftp->mkdir($current);
                }
            }
            $remoteFullPath = $folderPath.'/'.$fileName;
        } else {
            $remoteFullPath = $fileName;
        }

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

        $sourceStream = @fopen($sourceUrl, 'rb', false, $context);
        if (! $sourceStream) {
            throw new Exception("Kaynak URL okunamadı: {$sourceUrl}");
        }

        $transferredNow = 0;
        $lastUpdateTime = microtime(true);
        $lastBytes = 0;

        // Custom upload callback with phpseclib SFTP put stream or chunk upload
        $success = $sftp->put($remoteFullPath, function ($length) use (&$sourceStream, &$transferredNow, &$lastUpdateTime, &$lastBytes, $progressCallback, $cancellationCheck) {
            if ($cancellationCheck && $cancellationCheck()) {
                return false; // cancel put
            }

            if (feof($sourceStream)) {
                return '';
            }

            $chunk = fread($sourceStream, $length > 0 ? $length : 32768);
            $chunkLen = strlen($chunk);
            $transferredNow += $chunkLen;

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

            return $chunk;
        }, SFTP::SOURCE_CALLBACK);

        fclose($sourceStream);

        if (! $success) {
            throw new Exception("SFTP Dosya yükleme başarısız oldu: {$remoteFullPath}");
        }

        return $transferredNow;
    }

    public function fileExists(string $relativePath): bool
    {
        try {
            $sftp = $this->getConnection();

            return $sftp->file_exists($this->normalizePath($relativePath));
        } catch (Exception $e) {
            return false;
        }
    }

    public function getFileSize(string $relativePath): int
    {
        try {
            $sftp = $this->getConnection();
            $size = $sftp->filesize($this->normalizePath($relativePath));

            return $size !== false ? (int) $size : 0;
        } catch (Exception $e) {
            return 0;
        }
    }

    public function listFiles(string $relativePath = ''): array
    {
        try {
            $sftp = $this->getConnection();
            $targetDir = $this->normalizePath($relativePath) ?: '.';
            $items = $sftp->rawlist($targetDir);
            if (! is_array($items)) {
                return [];
            }

            $result = [];
            foreach ($items as $name => $info) {
                if ($name === '.' || $name === '..') {
                    continue;
                }
                $isDir = ($info['type'] ?? 0) === NET_SFTP_TYPE_DIRECTORY;
                $result[] = [
                    'name' => $name,
                    'path' => ($relativePath ? rtrim($relativePath, '/').'/' : '').$name,
                    'is_dir' => $isDir,
                    'size' => (int) ($info['size'] ?? 0),
                ];
            }

            return $result;
        } catch (Exception $e) {
            Log::warning('SFTP listFiles error: '.$e->getMessage());

            return [];
        }
    }

    public function getStorageStats(): array
    {
        try {
            $sftp = $this->getConnection();
            $statRes = $sftp->exec('df -P .');
            if ($statRes && preg_match('/(?:Filesystem|\/dev\/)[^\n]+\n[^\s]+\s+(\d+)\s+(\d+)\s+(\d+)/s', $statRes, $m)) {
                return [
                    'total' => (float) $m[1] * 1024,
                    'used' => (float) $m[2] * 1024,
                    'free' => (float) $m[3] * 1024,
                ];
            }
        } catch (Exception $e) {
            Log::warning('SFTP getStorageStats error: '.$e->getMessage());
        }

        return ['total' => null, 'used' => null, 'free' => null];
    }

    protected function getConnection(): SFTP
    {
        $host = $this->config['host'] ?? '';
        $username = $this->config['username'] ?? '';
        $password = $this->config['password'] ?? '';
        $port = (int) ($this->config['port'] ?? 22);

        $sftp = new SFTP($host, $port, 15);
        if (! $sftp->login($username, $password)) {
            throw new Exception("SFTP Sunucusuna erişilemiyor ({$host}:{$port})");
        }

        return $sftp;
    }
}
