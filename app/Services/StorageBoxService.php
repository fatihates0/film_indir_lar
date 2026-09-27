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

        $host = $storageBox->host;
        $pathSegments = explode('/', trim(str_replace('\\', '/', $relativePath), '/'));
        $cleanPath = implode('/', array_map('rawurlencode', array_filter($pathSegments, fn ($s) => $s !== '')));

        if (! str_starts_with($host, 'http://') && ! str_starts_with($host, 'https://')) {
            $remoteStreamUrl = "https://{$host}/" . $cleanPath;
        } else {
            $remoteStreamUrl = rtrim($host, '/') . '/' . $cleanPath;
        }

        try {
            // Method 1: WebDAV PROPFIND (100% reliable for Hetzner Storage Box)
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $remoteStreamUrl);
            curl_setopt($ch, CURLOPT_USERPWD, "{$storageBox->username}:{$storageBox->password}");
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
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
                return (int) $matches[1];
            }

            // Method 2: HTTP Range 0-0 request
            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $remoteStreamUrl);
            curl_setopt($ch, CURLOPT_USERPWD, "{$storageBox->username}:{$storageBox->password}");
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
                    return (int) $matches[1];
                }

                if (preg_match('/Content-Length:\s*(\d+)/i', $lastHeaderBlock, $matches)) {
                    $len = (int) $matches[1];
                    if ($len > 1) {
                        return $len;
                    }
                }
            }
        } catch (Exception $e) {
            Log::warning('Failed to fetch remote file size: ' . $e->getMessage());
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

