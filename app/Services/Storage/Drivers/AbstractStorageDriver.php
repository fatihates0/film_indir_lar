<?php

namespace App\Services\Storage\Drivers;

use App\Services\Storage\Contracts\StorageDriverInterface;

abstract class AbstractStorageDriver implements StorageDriverInterface
{
    protected array $config;

    public function __construct(array $config = [])
    {
        $this->config = $config;
    }

    protected function normalizePath(string $path): string
    {
        $normalized = str_replace('\\', '/', $path);

        return trim($normalized, '/');
    }

    protected function formatBytes(float $bytes, int $precision = 2): string
    {
        if ($bytes <= 0) {
            return '0 B';
        }
        $units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        $pow = floor(log($bytes, 1024));
        $pow = min($pow, count($units) - 1);

        return round($bytes / pow(1024, $pow), $precision).' '.$units[$pow];
    }
}
