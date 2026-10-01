<?php

namespace App\Services\Storage\Drivers;

use Exception;
use Illuminate\Support\Facades\Log;

class FtpStorageDriver extends AbstractStorageDriver
{
    public function testConnection(array $config): array
    {
        $host = $config['host'] ?? '';
        $username = $config['username'] ?? '';
        $password = $config['password'] ?? '';
        $port = (int) ($config['port'] ?? 21);

        if (empty($host) || empty($username)) {
            return [
                'success' => false,
                'message' => 'FTP bağlantısı için Sunucu Adresi ve Kullanıcı Adı zorunludur.',
            ];
        }

        try {
            $ftp = @ftp_connect($host, $port, 10);
            if (! $ftp) {
                return [
                    'success' => false,
                    'message' => "FTP Sunucusuna bağlanılamadı ({$host}:{$port}). Port ve adresi kontrol edin.",
                ];
            }

            $login = @ftp_login($ftp, $username, $password);
            if (! $login) {
                @ftp_close($ftp);

                return [
                    'success' => false,
                    'message' => 'FTP Kimlik Doğrulaması Başarısız: Kullanıcı adı veya şifre yanlış.',
                ];
            }

            @ftp_pasv($ftp, true);
            $rawList = @ftp_nlist($ftp, '.');
            @ftp_close($ftp);

            return [
                'success' => true,
                'message' => "FTP Bağlantısı Başarılı! Sunucuya bağlandı ({$host}:{$port}).",
                'details' => [
                    'item_count' => is_array($rawList) ? count($rawList) : 0,
                ],
            ];
        } catch (Exception $e) {
            return [
                'success' => false,
                'message' => 'FTP Bağlantı Hatası: '.$e->getMessage(),
            ];
        }
    }

    public function uploadStream(
        string $sourceUrl,
        string $targetRelativePath,
        ?callable $progressCallback = null,
        ?callable $cancellationCheck = null
    ): int {
        $ftp = $this->getConnection();

        $normalizedTarget = $this->normalizePath($targetRelativePath);
        $pathParts = explode('/', $normalizedTarget);
        $fileName = array_pop($pathParts);
        $folderPath = implode('/', $pathParts);

        if (! empty($folderPath)) {
            $dirs = explode('/', $folderPath);
            $current = '';
            foreach ($dirs as $dir) {
                $current .= ($current ? '/' : '').$dir;
                @ftp_mkdir($ftp, $current);
            }
            $remoteFullPath = $folderPath.'/'.$fileName;
        } else {
            $remoteFullPath = $fileName;
        }

        $context = stream_context_create([
            'http' => ['follow_location' => 1, 'user_agent' => 'Mozilla/5.0'],
            'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
        ]);

        $sourceStream = @fopen($sourceUrl, 'rb', false, $context);
        if (! $sourceStream) {
            @ftp_close($ftp);
            throw new Exception("Kaynak URL okunamadı: {$sourceUrl}");
        }

        // Temp file strategy for reliable FTP upload streaming
        $tempFile = tempnam(sys_get_temp_dir(), 'ftp_up_');
        $tempHandle = fopen($tempFile, 'wb+');

        $transferredNow = 0;
        $lastUpdateTime = microtime(true);
        $lastBytes = 0;

        while (! feof($sourceStream)) {
            if ($cancellationCheck && $cancellationCheck()) {
                fclose($sourceStream);
                fclose($tempHandle);
                @unlink($tempFile);
                @ftp_close($ftp);
                throw new Exception('FTP transferi kullanıcı tarafından iptal edildi.');
            }

            $chunk = fread($sourceStream, 65536);
            if ($chunk !== false && strlen($chunk) > 0) {
                fwrite($tempHandle, $chunk);
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
        fclose($tempHandle);

        $uploadSuccess = @ftp_put($ftp, $remoteFullPath, $tempFile, FTP_BINARY);
        @unlink($tempFile);
        @ftp_close($ftp);

        if (! $uploadSuccess) {
            throw new Exception("FTP Yükleme Hatası: {$remoteFullPath} dosyası sunucuya yazılamadı.");
        }

        return $transferredNow;
    }

    public function fileExists(string $relativePath): bool
    {
        return $this->getFileSize($relativePath) > 0;
    }

    public function getFileSize(string $relativePath): int
    {
        try {
            $ftp = $this->getConnection();
            $size = @ftp_size($ftp, $this->normalizePath($relativePath));
            @ftp_close($ftp);

            return $size !== -1 ? (int) $size : 0;
        } catch (Exception $e) {
            return 0;
        }
    }

    public function listFiles(string $relativePath = ''): array
    {
        try {
            $ftp = $this->getConnection();
            $targetDir = $this->normalizePath($relativePath) ?: '.';
            $files = @ftp_nlist($ftp, $targetDir);
            @ftp_close($ftp);

            if (! is_array($files)) {
                return [];
            }

            $result = [];
            foreach ($files as $file) {
                $name = basename($file);
                if ($name === '.' || $name === '..') {
                    continue;
                }
                $result[] = [
                    'name' => $name,
                    'path' => ($relativePath ? rtrim($relativePath, '/').'/' : '').$name,
                    'is_dir' => false,
                    'size' => 0,
                ];
            }

            return $result;
        } catch (Exception $e) {
            Log::warning('FTP listFiles error: '.$e->getMessage());

            return [];
        }
    }

    public function getStorageStats(): array
    {
        return ['total' => null, 'used' => null, 'free' => null];
    }

    protected function getConnection()
    {
        $host = $this->config['host'] ?? '';
        $username = $this->config['username'] ?? '';
        $password = $this->config['password'] ?? '';
        $port = (int) ($this->config['port'] ?? 21);

        $ftp = @ftp_connect($host, $port, 15);
        if (! $ftp || ! @ftp_login($ftp, $username, $password)) {
            throw new Exception("FTP Giriş Hatası ({$host}:{$port})");
        }
        @ftp_pasv($ftp, true);

        return $ftp;
    }
}
