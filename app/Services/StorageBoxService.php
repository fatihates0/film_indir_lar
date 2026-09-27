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
        $path = $storageBox ? $storageBox->mount_path : $this->defaultMountPath;

        return file_exists($path) && is_readable($path);
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
     * Extract metadata using ffprobe if installed, or fallback to native PHP file info.
     */
    public function probeMetadata(string $relativePath, ?StorageBox $storageBox = null): array
    {
        $fullPath = $this->resolveRealPath($relativePath, $storageBox);

        if (! file_exists($fullPath)) {
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
