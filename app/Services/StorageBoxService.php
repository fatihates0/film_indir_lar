<?php

namespace App\Services;

use App\Models\StorageBox;
use Exception;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use InvalidArgumentException;

class StorageBoxService
{
    protected string $defaultMountPath;

    public function __construct()
    {
        $this->defaultMountPath = config('storagebox.mount_path', storage_path('app/storagebox'));
    }

    /**
     * Resolve and validate that a requested file path is inside the mount path (Prevents Path Traversal).
     */
    public function resolveRealPath(string $relativePath, ?StorageBox $storageBox = null): string
    {
        $baseMount = $storageBox ? $storageBox->mount_path : $this->defaultMountPath;

        $normalizedRelative = str_replace(['\\', '../', '..\\'], ['/', '', ''], $relativePath);
        $normalizedRelative = ltrim($normalizedRelative, '/');

        $normBaseMount = str_replace('\\', '/', realpath($baseMount) ?: $baseMount);
        $fullPath = rtrim($normBaseMount, '/') . '/' . $normalizedRelative;

        $realMount = str_replace('\\', '/', realpath($baseMount) ?: $baseMount);
        $realFull = str_replace('\\', '/', realpath($fullPath) ?: $fullPath);

        if (! Str::startsWith($realFull, $realMount) && ! Str::startsWith(str_replace('\\', '/', $fullPath), $realMount)) {
            throw new InvalidArgumentException('Invalid file path: path traversal detected.');
        }

        return str_replace('/', DIRECTORY_SEPARATOR, $realFull);
    }

    /**
     * Check if mount point is accessible for default or specific StorageBox.
     */
    public function isMounted(?StorageBox $storageBox = null): bool
    {
        if (! $storageBox) {
            return file_exists($this->defaultMountPath) && is_readable($this->defaultMountPath);
        }

        $path = $storageBox->mount_path;
        if (! empty($path) && file_exists($path) && is_readable($path)) {
            return true;
        }

        if (! empty($storageBox->host) && ! empty($storageBox->username)) {
            return true;
        }

        return false;
    }

    /**
     * Check if a specific media file exists.
     */
    public function fileExists(string $relativePath, ?StorageBox $storageBox = null): bool
    {
        try {
            $fullPath = $this->resolveRealPath($relativePath, $storageBox);

            if (file_exists($fullPath) && is_file($fullPath)) {
                return true;
            }
        } catch (Exception $e) {
            Log::warning('StorageBox local file check error: ' . $e->getMessage());
        }

        if ($storageBox && ! empty($storageBox->host) && ! empty($storageBox->username)) {
            return true;
        }

        return false;
    }

    /**
     * Fetch remote file size from Hetzner Storage Box via WebDAV PROPFIND / HTTP Range request.
     */
    public function fetchRemoteFileSize(string $relativePath, ?StorageBox $storageBox = null): int
    {
        if (! $storageBox || empty($storageBox->host) || empty($storageBox->username)) {
            return 0;
        }

        $pathSegments = array_filter(explode('/', trim(str_replace('\\', '/', $relativePath), '/')), fn ($s) => $s !== '');

        $urlCandidates = [];
        $baseHost = str_starts_with($host, 'http://') || str_starts_with($host, 'https://') ? rtrim($host, '/') : "https://{$host}";

        // Candidate 1: spaces encoded as %20, keeping brackets raw
        $urlCandidates[] = $baseHost . '/' . implode('/', array_map(fn ($s) => str_replace(' ', '%20', $s), $pathSegments));

        // Candidate 2: rawurlencode
        $urlCandidates[] = $baseHost . '/' . implode('/', array_map('rawurlencode', $pathSegments));

        // Candidate 3: raw unencoded
        $urlCandidates[] = $baseHost . '/' . implode('/', $pathSegments);

        $userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
        $xmlRequestBody = '<?xml version="1.0" encoding="utf-8" ?><D:propfind xmlns:D="DAV:"><D:prop><D:getcontentlength/></D:prop></D:propfind>';

        foreach ($urlCandidates as $remoteStreamUrl) {
            try {
                // Method 1: WebDAV PROPFIND
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $remoteStreamUrl);
                curl_setopt($ch, CURLOPT_USERPWD, "{$storageBox->username}:{$storageBox->password}");
                curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
                curl_setopt($ch, CURLOPT_USERAGENT, $userAgent);
                curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
                curl_setopt($ch, CURLOPT_POSTFIELDS, $xmlRequestBody);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
                curl_setopt($ch, CURLOPT_HTTPHEADER, [
                    'Depth: 0',
                    'Content-Type: application/xml; charset=utf-8',
                ]);
                curl_setopt($ch, CURLOPT_TIMEOUT, 5);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
                $xmlResponse = curl_exec($ch);
                curl_close($ch);

                if ($xmlResponse && preg_match('/<[^:]*:?getcontentlength[^>]*>(\d+)<\//i', $xmlResponse, $matches)) {
                    $size = (int) $matches[1];
                    if ($size > 0) {
                        return $size;
                    }
                }

                // Method 2: HTTP Range 0-0 request
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $remoteStreamUrl);
                curl_setopt($ch, CURLOPT_USERPWD, "{$storageBox->username}:{$storageBox->password}");
                curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
                curl_setopt($ch, CURLOPT_USERAGENT, $userAgent);
                curl_setopt($ch, CURLOPT_RANGE, "0-0");
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_HEADER, true);
                curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
                curl_setopt($ch, CURLOPT_TIMEOUT, 5);
                $headers = curl_exec($ch);
                curl_close($ch);

                if ($headers) {
                    $headerBlocks = explode("\r\n\r\n", $headers);
                    $lastHeaderBlock = '';
                    foreach (array_reverse($headerBlocks) as $block) {
                        if (preg_match('/HTTP\/\d/i', $block)) {
                            $lastHeaderBlock = $block;
                            break;
                        }
                    }

                    if (preg_match('/Content-Range:\s*bytes\s+\d+-\d+\/(\d+)/i', $lastHeaderBlock, $matches)) {
                        $size = (int) $matches[1];
                        if ($size > 0) {
                            return $size;
                        }
                    }

                    if (preg_match('/Content-Length:\s*(\d+)/i', $lastHeaderBlock, $matches)) {
                        $len = (int) $matches[1];
                        if ($len > 1) {
                            return $len;
                        }
                    }
                }

                // Method 3: HTTP HEAD request
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $remoteStreamUrl);
                curl_setopt($ch, CURLOPT_USERPWD, "{$storageBox->username}:{$storageBox->password}");
                curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
                curl_setopt($ch, CURLOPT_USERAGENT, $userAgent);
                curl_setopt($ch, CURLOPT_NOBODY, true);
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_HEADER, true);
                curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
                curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
                curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);
                curl_setopt($ch, CURLOPT_TIMEOUT, 5);
                $headResponse = curl_exec($ch);
                curl_close($ch);

                if ($headResponse && preg_match('/Content-Length:\s*(\d+)/i', $headResponse, $matches)) {
                    $len = (int) $matches[1];
                    if ($len > 0) {
                        return $len;
                    }
                }
            } catch (Exception $e) {
                Log::warning("Failed to fetch remote file size for candidate {$remoteStreamUrl}: " . $e->getMessage());
            }
        }

        return 0;
    }

    /**
     * Extract metadata using ffprobe if installed, or fallback to native PHP file info or remote info.
     */
    public function probeMetadata(string $relativePath, ?StorageBox $storageBox = null): array
    {
        $fullPath = null;
        try {
            $fullPath = $this->resolveRealPath($relativePath, $storageBox);
        } catch (Exception $e) {
            // Path traversal or invalid path
        }

        if (! $fullPath || ! file_exists($fullPath)) {
            if ($storageBox && ! empty($storageBox->host) && ! empty($storageBox->username)) {
                $remoteSize = $this->fetchRemoteFileSize($relativePath, $storageBox);
                $fileName = basename($relativePath);
                $extension = pathinfo($relativePath, PATHINFO_EXTENSION);

                return [
                    'file_name' => $fileName,
                    'file_size' => $remoteSize,
                    'extension' => strtolower($extension),
                    'mime_type' => 'video/x-matroska',
                    'duration_seconds' => null,
                    'width' => null,
                    'height' => null,
                    'video_codec' => null,
                    'audio_codec' => null,
                    'bitrate' => null,
                ];
            }

            throw new InvalidArgumentException('File does not exist on Storage Box.');
        }

        $fileSize = filesize($fullPath);
        $fileName = basename($fullPath);
        $extension = pathinfo($fullPath, PATHINFO_EXTENSION);
        $mimeType = mime_content_type($fullPath) ?: 'video/x-matroska';

        $metadata = [
            'file_name' => $fileName,
            'file_size' => $fileSize,
            'extension' => strtolower($extension),
            'mime_type' => $mimeType,
            'duration_seconds' => null,
            'width' => null,
            'height' => null,
            'video_codec' => null,
            'audio_codec' => null,
            'bitrate' => null,
        ];

        // Attempt ffprobe execution if command exists
        try {
            $cmd = sprintf(
                'ffprobe -v quiet -print_format json -show_format -show_streams %s',
                escapeshellarg($fullPath)
            );
            $output = @shell_exec($cmd);

            if ($output) {
                $json = json_decode($output, true);
                if (is_array($json)) {
                    if (isset($json['format']['duration'])) {
                        $metadata['duration_seconds'] = (int) round((float) $json['format']['duration']);
                    }
                    if (isset($json['format']['bit_rate'])) {
                        $metadata['bitrate'] = (int) $json['format']['bit_rate'];
                    }

                    foreach ($json['streams'] ?? [] as $stream) {
                        if (($stream['codec_type'] ?? '') === 'video' && ! $metadata['video_codec']) {
                            $metadata['video_codec'] = $stream['codec_name'] ?? null;
                            $metadata['width'] = $stream['width'] ?? null;
                            $metadata['height'] = $stream['height'] ?? null;
                        }
                        if (($stream['codec_type'] ?? '') === 'audio' && ! $metadata['audio_codec']) {
                            $metadata['audio_codec'] = $stream['codec_name'] ?? null;
                        }
                    }
                }
            }
        } catch (Exception $e) {
            Log::info('ffprobe execution skipped or failed: ' . $e->getMessage());
        }

        return $metadata;
    }
}

