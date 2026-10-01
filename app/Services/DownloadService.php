<?php

namespace App\Services;

use App\Enums\DownloadStatus;
use App\Models\DownloadSession;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DownloadService
{
    public function __construct(
        protected StorageBoxService $storageBoxService,
    ) {}

    /**
     * Handle download streaming request for signed session.
     */
    public function stream(DownloadSession $session, Request $request): Response
    {
        $user = $session->user;
        $media = $session->media;

        if ($session->status === DownloadStatus::EXPIRED || Carbon::now()->greaterThan($session->expires_at)) {
            $session->update(['status' => DownloadStatus::EXPIRED]);

            abort(403, 'İndirme bağlantısının süresi dolmuş.');
        }

        $storageBox = $media->storageBox;
        $fullPath = null;
        try {
            $fullPath = $this->storageBoxService->resolveRealPath($media->file_path, $storageBox);
        } catch (\Exception $e) {
            // Local path resolution error fallback
        }

        $isLocalAvailable = $fullPath && file_exists($fullPath) && is_file($fullPath) && filesize($fullPath) > 0;
        $remoteStreamUrl = null;

        if (! $isLocalAvailable && $storageBox && ! empty($storageBox->host) && ! empty($storageBox->username)) {
            $host = $storageBox->host;
            $baseHost = str_starts_with($host, 'http://') || str_starts_with($host, 'https://') ? rtrim($host, '/') : "https://{$host}";
            $pathSegments = array_filter(explode('/', trim(str_replace('\\', '/', $media->file_path), '/')), fn ($s) => $s !== '');

            $remoteStreamUrl = $baseHost.'/'.implode('/', array_map(fn ($s) => str_replace(' ', '%20', $s), $pathSegments));
        }

        if (! $isLocalAvailable && ! $remoteStreamUrl) {
            abort(404, 'İstenen medya dosyası depolama alanında bulunamadı.');
        }

        $fileSize = 0;
        if ($isLocalAvailable) {
            $fileSize = filesize($fullPath);
        } elseif ($media->file_size > 0) {
            $fileSize = (int) $media->file_size;
        } elseif ($session->file_size > 0) {
            $fileSize = (int) $session->file_size;
        }

        if ($fileSize <= 0 && $storageBox) {
            $remoteSize = $this->storageBoxService->fetchRemoteFileSize($media->file_path, $storageBox);

            if ($remoteSize > 0) {
                $fileSize = $remoteSize;
            }
        }

        if ($fileSize > 0) {
            if ($media->file_size != $fileSize) {
                $media->update(['file_size' => $fileSize]);
            }
            if ($session->file_size != $fileSize) {
                $session->update(['file_size' => $fileSize]);
            }
        }

        $rangeHeader = $request->header('Range');

        $start = 0;
        $end = $fileSize > 0 ? $fileSize - 1 : 0;
        $isRangeRequest = false;

        if ($rangeHeader && preg_match('/bytes=(\d+)-(\d*)/', $rangeHeader, $matches)) {
            $isRangeRequest = true;
            $start = (int) $matches[1];
            if (isset($matches[2]) && $matches[2] !== '') {
                $end = (int) $matches[2];
            }
        }

        if ($fileSize > 0 && ($start > $end || $start >= $fileSize)) {
            return response('', 416, [
                'Content-Range' => "bytes */{$fileSize}",
            ]);
        }

        $length = $fileSize > 0 ? max(0, ($end - $start) + 1) : 0;
        $statusCode = $isRangeRequest ? 206 : 200;

        $safeFilename = str_replace(['"', "\r", "\n"], '', $media->file_name);
        $encodedFilename = rawurlencode($media->file_name);

        $headers = [
            'Content-Type' => $media->mime_type ?: 'application/octet-stream',
            'Content-Disposition' => "attachment; filename=\"{$safeFilename}\"; filename*=UTF-8''{$encodedFilename}",
            'Accept-Ranges' => 'bytes',
            'Cache-Control' => 'private, no-cache, must-revalidate',
            'Pragma' => 'no-cache',
            'Expires' => '0',
        ];

        if ($fileSize > 0) {
            $headers['Content-Length'] = (string) $length;

            if ($isRangeRequest) {
                $headers['Content-Range'] = "bytes {$start}-{$end}/{$fileSize}";
            }
        }

        // Fast, clean handling for HTTP HEAD requests (IDM link probing, clipboard scanner)
        if ($request->isMethod('HEAD')) {
            return response('', $statusCode, $headers);
        }

        // If Nginx X-Accel-Redirect is enabled in production config and file is local:
        if ($isLocalAvailable && config('downloads.use_x_accel', false)) {
            $protectedUrl = config('downloads.x_accel_prefix', '/protected-download/').ltrim($media->file_path, '/');

            return response('', 200, array_merge($headers, [
                'X-Accel-Redirect' => $protectedUrl,
            ]));
        }

        return new StreamedResponse(function () use ($isLocalAvailable, $fullPath, $remoteStreamUrl, $storageBox, $start, $length) {
            if (! app()->environment('testing')) {
                while (ob_get_level() > 0) {
                    @ob_end_flush();
                }
            }

            if ($isLocalAvailable && $fullPath && file_exists($fullPath)) {
                $stream = fopen($fullPath, 'rb');
                if ($stream !== false) {
                    fseek($stream, $start);

                    $bufferSize = 256 * 1024; // 256 KB buffer
                    $remaining = $length;

                    while (! feof($stream) && $remaining > 0 && connection_status() === 0) {
                        $readLength = min($bufferSize, $remaining);
                        $data = fread($stream, $readLength);
                        echo $data;
                        flush();
                        $remaining -= strlen($data);
                    }

                    fclose($stream);
                }
            } elseif ($remoteStreamUrl && $storageBox) {
                $user = $storageBox->username;
                $pass = $storageBox->password;
                $endPos = $start + $length - 1;

                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $remoteStreamUrl);
                curl_setopt($ch, CURLOPT_USERPWD, "{$user}:{$pass}");
                curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
                curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
                curl_setopt($ch, CURLOPT_RANGE, "{$start}-{$endPos}");
                curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, false);
                curl_setopt($ch, CURLOPT_WRITEFUNCTION, function ($ch, $chunk) {
                    echo $chunk;
                    flush();

                    return strlen($chunk);
                });
                curl_setopt($ch, CURLOPT_TIMEOUT, 0);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
                curl_exec($ch);
                curl_close($ch);
            }
        }, $statusCode, $headers);
    }
}
