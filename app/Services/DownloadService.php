<?php

namespace App\Services;

use App\DTOs\UsageContext;
use App\Enums\DownloadStatus;
use App\Enums\UsageSource;
use App\Models\DownloadSession;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\HttpFoundation\StreamedResponse;

class DownloadService
{
    public function __construct(
        protected QuotaService $quotaService,
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

        $isLocalAvailable = $fullPath && file_exists($fullPath);
        $remoteStreamUrl = null;

        if (! $isLocalAvailable && $storageBox && ! empty($storageBox->host) && ! empty($storageBox->username)) {
            $host = $storageBox->host;
            if (! str_starts_with($host, 'http://') && ! str_starts_with($host, 'https://')) {
                $remoteStreamUrl = "https://{$host}/" . ltrim(str_replace('\\', '/', $media->file_path), '/');
            } else {
                $remoteStreamUrl = rtrim($host, '/') . '/' . ltrim(str_replace('\\', '/', $media->file_path), '/');
            }
        }

        if (! $isLocalAvailable && ! $remoteStreamUrl) {
            abort(404, 'İstenen medya dosyası depolama alanında bulunamadı.');
        }

        $fileSize = $isLocalAvailable ? filesize($fullPath) : ($media->file_size ?: 0);

        if ($fileSize <= 0 && $storageBox) {
            $remoteSize = $this->storageBoxService->fetchRemoteFileSize($media->file_path, $storageBox);

            if ($remoteSize > 0) {
                $fileSize = $remoteSize;
                $media->update(['file_size' => $fileSize]);
            }
        }

        $rangeHeader = $request->header('Range');

        $start = 0;
        $end = $fileSize > 0 ? $fileSize - 1 : 0;

        if ($rangeHeader && preg_match('/bytes=(\d+)-(\d*)?/', $rangeHeader, $matches)) {
            $start = (int) $matches[1];
            if (! empty($matches[2])) {
                $end = (int) $matches[2];
            }
        }

        if ($fileSize > 0 && ($start > $end || $start >= $fileSize)) {
            return response('', 416, [
                'Content-Range' => "bytes */{$fileSize}",
            ]);
        }

        $length = $fileSize > 0 ? max(0, ($end - $start) + 1) : 0;

        // Verify quota can handle this chunk
        if (! $this->quotaService->canConsume($user, $length)) {
            abort(402, 'İndirmeyi devam ettirmek için kotanız yetersizdir.');
        }

        // Record consumption
        try {
            $context = new UsageContext(
                source: UsageSource::DOWNLOAD,
                bytes: $length,
                mediaId: $media->id,
                downloadSessionId: $session->id,
                metadata: [
                    'range_start' => $start,
                    'range_end' => $end,
                    'file_name' => $media->file_name,
                ]
            );

            $this->quotaService->consume($user, $context);

            $session->update([
                'bytes_transferred' => $session->bytes_transferred + $length,
                'last_byte_position' => $end,
                'last_activity_at' => Carbon::now(),
            ]);

            if ($fileSize > 0 && ($session->bytes_transferred + $length) >= $fileSize) {
                $session->update([
                    'status' => DownloadStatus::COMPLETED,
                    'completed_at' => Carbon::now(),
                ]);
            }
        } catch (\Exception $e) {
            Log::error('Download quota recording failed: ' . $e->getMessage());
            abort(402, $e->getMessage());
        }

        // Close session lock before streaming to prevent blocking other HTTP requests/navigations from the same user
        if (session()->isStarted()) {
            session()->save();
        }

        // If Nginx X-Accel-Redirect is enabled in production config and file is local:
        if ($isLocalAvailable && config('downloads.use_x_accel', false)) {
            $protectedUrl = config('downloads.x_accel_prefix', '/protected-download/') . ltrim($media->file_path, '/');

            return response('', 200, [
                'X-Accel-Redirect' => $protectedUrl,
                'Content-Type' => $media->mime_type ?: 'application/octet-stream',
                'Content-Disposition' => 'attachment; filename="' . rawurlencode($media->file_name) . '"; filename*=UTF-8\'\'' . rawurlencode($media->file_name),
                'Accept-Ranges' => 'bytes',
                'X-Accel-Buffering' => 'no',
            ]);
        }

        // Fallback to PHP StreamedResponse supporting 206 Partial Content / HTTP Range for IDM
        $response = new StreamedResponse(function () use ($fullPath, $remoteStreamUrl, $storageBox, $start, $length) {
            if ($fullPath && file_exists($fullPath)) {
                $stream = fopen($fullPath, 'rb');
                if ($stream === false) {
                    return;
                }

                fseek($stream, $start);

                $bufferSize = 1024 * 1024; // 1 MB buffer
                $remaining = $length;

                while (! feof($stream) && $remaining > 0 && connection_status() === 0) {
                    $readLength = min($bufferSize, $remaining);
                    $data = fread($stream, $readLength);
                    echo $data;
                    flush();
                    $remaining -= strlen($data);
                }

                fclose($stream);
            } elseif ($remoteStreamUrl) {
                $user = $storageBox->username;
                $pass = $storageBox->password;
                $endPos = $start + $length - 1;

                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $remoteStreamUrl);
                curl_setopt($ch, CURLOPT_USERPWD, "{$user}:{$pass}");
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
        }, $rangeHeader ? 206 : 200);

        $response->headers->set('Content-Type', $media->mime_type ?: 'application/octet-stream');
        $response->headers->set('Content-Disposition', 'attachment; filename="' . rawurlencode($media->file_name) . '"; filename*=UTF-8\'\'' . rawurlencode($media->file_name));
        $response->headers->set('Accept-Ranges', 'bytes');
        $response->headers->set('X-Accel-Buffering', 'no');

        if ($fileSize > 0) {
            $response->headers->set('Content-Length', (string) $length);
        }

        if ($rangeHeader && $fileSize > 0) {
            $response->headers->set('Content-Range', "bytes {$start}-{$end}/{$fileSize}");
        }

        return $response;
    }
}
