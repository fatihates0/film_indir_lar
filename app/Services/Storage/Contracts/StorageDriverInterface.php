<?php

namespace App\Services\Storage\Contracts;

interface StorageDriverInterface
{
    /**
     * Test connection credentials and server reachability.
     *
     * @return array ['success' => bool, 'message' => string, 'details' => ?array]
     */
    public function testConnection(array $config): array;

    /**
     * Stream upload a file directly from a source URL to target path.
     *
     * @param  callable|null  $progressCallback  fn(int $transferred, int $total, int $speedBps)
     * @param  callable|null  $cancellationCheck  fn(): bool
     * @return int Total transferred bytes
     */
    public function uploadStream(
        string $sourceUrl,
        string $targetRelativePath,
        ?callable $progressCallback = null,
        ?callable $cancellationCheck = null
    ): int;

    /**
     * Check if a remote/local file exists.
     */
    public function fileExists(string $relativePath): bool;

    /**
     * Get remote/local file size in bytes.
     */
    public function getFileSize(string $relativePath): int;

    /**
     * List files inside a target folder.
     *
     * @return array Array of ['name' => string, 'path' => string, 'is_dir' => bool, 'size' => int]
     */
    public function listFiles(string $relativePath = ''): array;

    /**
     * Get total, used, and free capacity bytes.
     *
     * @return array ['total' => ?float, 'used' => ?float, 'free' => ?float]
     */
    public function getStorageStats(): array;
}
