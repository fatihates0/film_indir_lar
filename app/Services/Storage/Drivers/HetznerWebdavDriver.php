<?php

namespace App\Services\Storage\Drivers;

use Exception;
use Illuminate\Support\Facades\Log;

class HetznerWebdavDriver extends AbstractStorageDriver
{
    /**
     * Test connection credentials and reachability for Hetzner WebDAV.
     */
    public function testConnection(array $config): array
    {
        $host = $config['host'] ?? '';
        $username = $config['username'] ?? '';
        $password = $config['password'] ?? '';

        if (empty($host) || empty($username)) {
            return [
                'success' => false,
                'message' => 'Hetzner WebDAV için Sunucu Adresi ve Kullanıcı Adı zorunludur.',
            ];
        }

        $baseHost = str_starts_with($host, 'http://') || str_starts_with($host, 'https://')
            ? rtrim($host, '/')
            : "https://{$host}";

        $xmlRequestBody = '<?xml version="1.0" encoding="utf-8" ?>
            <D:propfind xmlns:D="DAV:">
                <D:prop>
                    <D:quota-available-bytes/>
                    <D:quota-used-bytes/>
                    <D:resourcetype/>
                </D:prop>
            </D:propfind>';

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $baseHost.'/');
        curl_setopt($ch, CURLOPT_USERPWD, "{$username}:{$password}");
        curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $xmlRequestBody);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'Depth: 0',
            'Content-Type: application/xml; charset=utf-8',
        ]);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);

        if ($httpCode === 401 || $httpCode === 403) {
            return [
                'success' => false,
                'message' => 'Hetzner WebDAV Kimlik Doğrulaması Başarısız (HTTP '.$httpCode.'): Kullanıcı adı veya şifre hatalı.',
            ];
        }

        if ($httpCode >= 400 || ! $response) {
            return [
                'success' => false,
                'message' => 'Hetzner WebDAV Sunucu Hatası (HTTP '.$httpCode.'): '.($err ?: 'WebDAV servisine ulaşılamadı. Sunucu adresini kontrol edin.'),
            ];
        }

        $stats = null;
        $totalBytes = null;
        $freeBytes = null;
        $usedBytes = null;

        if (preg_match('/<[^:]*:?quota-available-bytes[^>]*>(\d+)<\//i', $response, $mFree)) {
            $freeBytes = (float) $mFree[1];
        }
        if (preg_match('/<[^:]*:?quota-used-bytes[^>]*>(\d+)<\//i', $response, $mUsed)) {
            $usedBytes = (float) $mUsed[1];
        }

        if ($freeBytes !== null && $usedBytes !== null) {
            $totalBytes = $freeBytes + $usedBytes;
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
            'message' => 'Hetzner WebDAV Bağlantısı Başarılı! Sunucuya bağlandı.',
            'details' => $stats ?: ['http_code' => $httpCode],
        ];
    }

    /**
     * Stream upload source URL to Hetzner WebDAV directly.
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

        $baseHost = str_starts_with($host, 'http://') || str_starts_with($host, 'https://')
            ? rtrim($host, '/')
            : "https://{$host}";

        $targetFolder = dirname($targetRelativePath);
        if ($targetFolder && $targetFolder !== '.') {
            $folderSegments = array_filter(explode('/', str_replace('\\', '/', $targetFolder)), fn ($s) => $s !== '');
            $currentPath = $baseHost;
            foreach ($folderSegments as $segment) {
                $currentPath .= '/'.rawurlencode($segment);
                $chMk = curl_init($currentPath);
                curl_setopt($chMk, CURLOPT_USERPWD, "{$username}:{$password}");
                curl_setopt($chMk, CURLOPT_CUSTOMREQUEST, 'MKCOL');
                curl_setopt($chMk, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($chMk, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($chMk, CURLOPT_SSL_VERIFYHOST, false);
                curl_setopt($chMk, CURLOPT_TIMEOUT, 5);
                curl_exec($chMk);
                curl_close($chMk);
            }
        }

        $pathSegments = array_filter(explode('/', str_replace('\\', '/', $targetRelativePath)), fn ($s) => $s !== '');
        $destUrl = $baseHost.'/'.implode('/', array_map('rawurlencode', $pathSegments));

        $context = stream_context_create([
            'http' => ['follow_location' => 1, 'user_agent' => 'Mozilla/5.0'],
            'ssl' => ['verify_peer' => false, 'verify_peer_name' => false],
        ]);

        $sourceStream = @fopen($sourceUrl, 'rb', false, $context);
        if (! $sourceStream) {
            throw new Exception("Kaynak URL okunamadı: {$sourceUrl}");
        }

        $transferredNow = 0;
        $lastUpdateTime = microtime(true);
        $lastBytes = 0;

        $chPut = curl_init();
        curl_setopt($chPut, CURLOPT_URL, $destUrl);
        curl_setopt($chPut, CURLOPT_USERPWD, "{$username}:{$password}");
        curl_setopt($chPut, CURLOPT_PUT, true);
        curl_setopt($chPut, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($chPut, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($chPut, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($chPut, CURLOPT_HTTPHEADER, ['Transfer-Encoding: chunked']);

        curl_setopt($chPut, CURLOPT_READFUNCTION, function ($ch, $fd, $length) use (&$sourceStream, &$transferredNow, &$lastUpdateTime, &$lastBytes, $progressCallback, $cancellationCheck) {
            if ($cancellationCheck && $cancellationCheck()) {
                return ''; // cancel
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
        });

        $res = curl_exec($chPut);
        $httpCode = curl_getinfo($chPut, CURLINFO_HTTP_CODE);
        $err = curl_error($chPut);
        curl_close($chPut);
        fclose($sourceStream);

        if ($httpCode !== 201 && $httpCode !== 204 && $httpCode !== 200) {
            throw new Exception("Hetzner WebDAV Yükleme Hatası (HTTP {$httpCode}): ".($err ?: $res));
        }

        return $transferredNow;
    }

    public function fileExists(string $relativePath): bool
    {
        return $this->getFileSize($relativePath) > 0;
    }

    public function getFileSize(string $relativePath): int
    {
        $host = $this->config['host'] ?? '';
        $username = $this->config['username'] ?? '';
        $password = $this->config['password'] ?? '';

        $baseHost = str_starts_with($host, 'http://') || str_starts_with($host, 'https://')
            ? rtrim($host, '/')
            : "https://{$host}";

        $pathSegments = array_filter(explode('/', str_replace('\\', '/', $relativePath)), fn ($s) => $s !== '');
        $remoteStreamUrl = $baseHost.'/'.implode('/', array_map('rawurlencode', $pathSegments));

        $xmlRequestBody = '<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:"><D:prop><D:getcontentlength/></D:prop></D:propfind>';

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $remoteStreamUrl);
        curl_setopt($ch, CURLOPT_USERPWD, "{$username}:{$password}");
        curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $xmlRequestBody);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 5);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Depth: 0', 'Content-Type: application/xml; charset=utf-8']);
        $xmlResponse = curl_exec($ch);
        curl_close($ch);

        if ($xmlResponse && preg_match('/<[^:]*:?getcontentlength[^>]*>(\d+)<\//i', $xmlResponse, $m)) {
            return (int) $m[1];
        }

        return 0;
    }

    public function listFiles(string $relativePath = ''): array
    {
        $host = $this->config['host'] ?? '';
        $username = $this->config['username'] ?? '';
        $password = $this->config['password'] ?? '';

        $baseHost = str_starts_with($host, 'http://') || str_starts_with($host, 'https://')
            ? rtrim($host, '/')
            : "https://{$host}";

        $pathSegments = array_filter(explode('/', str_replace('\\', '/', $relativePath)), fn ($s) => $s !== '');
        $targetUrl = $baseHost.'/'.($pathSegments ? implode('/', array_map('rawurlencode', $pathSegments)).'/' : '');

        $xmlRequestBody = '<?xml version="1.0" encoding="utf-8" ?>
            <D:propfind xmlns:D="DAV:">
                <D:prop>
                    <D:displayname/>
                    <D:getcontentlength/>
                    <D:resourcetype/>
                </D:prop>
            </D:propfind>';

        $ch = curl_init();
        curl_setopt($ch, CURLOPT_URL, $targetUrl);
        curl_setopt($ch, CURLOPT_USERPWD, "{$username}:{$password}");
        curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
        curl_setopt($ch, CURLOPT_POSTFIELDS, $xmlRequestBody);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 10);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
        curl_setopt($ch, CURLOPT_HTTPHEADER, ['Depth: 1', 'Content-Type: application/xml; charset=utf-8']);
        $response = curl_exec($ch);
        curl_close($ch);

        if (! $response) {
            return [];
        }

        $result = [];
        try {
            $xml = @simplexml_load_string($response);
            if ($xml) {
                $xml->registerXPathNamespace('D', 'DAV:');
                $responses = $xml->xpath('//D:response');

                foreach ($responses as $res) {
                    $href = (string) $res->children('DAV:')->href;
                    $decodedHref = rawurldecode($href);
                    $name = basename($decodedHref);
                    if (empty($name) || $name === basename($targetUrl)) {
                        continue;
                    }

                    $isDir = isset($res->children('DAV:')->propstat->prop->resourcetype->collection);
                    $size = (int) ($res->children('DAV:')->propstat->prop->getcontentlength ?? 0);

                    $result[] = [
                        'name' => $name,
                        'path' => ($relativePath ? rtrim($relativePath, '/').'/' : '').$name,
                        'is_dir' => $isDir,
                        'size' => $size,
                    ];
                }
            }
        } catch (Exception $e) {
            Log::warning('Hetzner listFiles XML parse error: '.$e->getMessage());
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
