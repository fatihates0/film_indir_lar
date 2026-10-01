<?php

namespace App\Services;

use App\Models\StorageBox;
use App\Services\Storage\StorageManager;
use Exception;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use InvalidArgumentException;

class StorageBoxService
{
    protected string $defaultMountPath;

    public function __construct(
        protected StorageManager $storageManager
    ) {
        $this->defaultMountPath = config('storagebox.mount_path', storage_path('app/storagebox'));
    }

    /**
     * Resolve and validate that a requested file path is inside the mount path (Prevents Path Traversal).
     */
    public function resolveRealPath(string $relativePath, ?StorageBox $storageBox = null): string
    {
        $baseMount = ($storageBox && ! empty($storageBox->mount_path)) ? $storageBox->mount_path : $this->defaultMountPath;

        $normalizedRelative = str_replace(['\\', '../', '..\\'], ['/', '', ''], $relativePath);
        $normalizedRelative = ltrim($normalizedRelative, '/');

        $normBaseMount = str_replace('\\', '/', realpath($baseMount) ?: $baseMount);
        $fullPath = rtrim($normBaseMount, '/').'/'.$normalizedRelative;

        $realMount = str_replace('\\', '/', realpath($baseMount) ?: $baseMount);
        $realFull = str_replace('\\', '/', realpath($fullPath) ?: $fullPath);

        if (! Str::startsWith($realFull, $realMount) && ! Str::startsWith(str_replace('\\', '/', $fullPath), $realMount)) {
            throw new InvalidArgumentException('Invalid file path: path traversal detected.');
        }

        return str_replace('/', DIRECTORY_SEPARATOR, $realFull);
    }

    /**
     * Check if mount point or remote storage box is accessible.
     */
    public function isMounted(?StorageBox $storageBox = null): bool
    {
        if (! $storageBox) {
            return $this->safeFileExists($this->defaultMountPath) && $this->safeIsReadable($this->defaultMountPath);
        }

        $path = $storageBox->mount_path;
        if (! empty($path) && $this->safeFileExists($path) && $this->safeIsReadable($path)) {
            return true;
        }

        if (! empty($storageBox->host) && ! empty($storageBox->username)) {
            // Check driver reachability via testConnection
            $driver = $this->storageManager->driverForBox($storageBox);
            $res = $driver->testConnection([
                'host' => $storageBox->host,
                'username' => $storageBox->username,
                'password' => $storageBox->password,
                'port' => $storageBox->port,
                'mount_path' => $storageBox->mount_path,
            ]);

            return $res['success'];
        }

        return false;
    }

    /**
     * Check if a specific media file exists locally or on remote storage box.
     */
    public function fileExists(string $relativePath, ?StorageBox $storageBox = null): bool
    {
        try {
            $fullPath = $this->resolveRealPath($relativePath, $storageBox);
            if (file_exists($fullPath) && is_file($fullPath)) {
                return true;
            }
        } catch (Exception $e) {
            Log::warning('StorageBox local file check error: '.$e->getMessage());
        }

        if ($storageBox && ! empty($storageBox->host) && ! empty($storageBox->username)) {
            $driver = $this->storageManager->driverForBox($storageBox);

            return $driver->fileExists($relativePath);
        }

        return false;
    }

    /**
     * Fetch remote file size via driver.
     */
    public function fetchRemoteFileSize(string $relativePath, ?StorageBox $storageBox = null): int
    {
        if (! $storageBox) {
            return 0;
        }

        $driver = $this->storageManager->driverForBox($storageBox);

        return $driver->getFileSize($relativePath);
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
            Log::info('ffprobe execution skipped or failed: '.$e->getMessage());
        }

        return $metadata;
    }

    protected function isPathAllowedByOpenBasedir(string $path): bool
    {
        $openBasedir = ini_get('open_basedir');
        if (! $openBasedir) {
            return true;
        }

        $allowedPaths = explode(PATH_SEPARATOR, $openBasedir);
        $normalizedPath = str_replace('\\', '/', $path);

        foreach ($allowedPaths as $allowed) {
            $allowed = str_replace('\\', '/', rtrim($allowed, '/'));
            if ($allowed !== '' && (str_starts_with($normalizedPath, $allowed) || $normalizedPath === $allowed)) {
                return true;
            }
        }

        return false;
    }

    protected function safeFileExists(?string $path): bool
    {
        if (! $path || ! $this->isPathAllowedByOpenBasedir($path)) {
            return false;
        }

        try {
            return @file_exists($path);
        } catch (\Throwable $e) {
            return false;
        }
    }

    protected function safeIsReadable(?string $path): bool
    {
        if (! $path || ! $this->isPathAllowedByOpenBasedir($path)) {
            return false;
        }

        try {
            return @is_readable($path);
        } catch (\Throwable $e) {
            return false;
        }
    }
}
