<?php

namespace App\Services\Storage;

use App\Models\StorageBox;
use App\Services\Storage\Contracts\StorageDriverInterface;
use App\Services\Storage\Drivers\FtpStorageDriver;
use App\Services\Storage\Drivers\HetznerWebdavDriver;
use App\Services\Storage\Drivers\LocalMountDriver;
use App\Services\Storage\Drivers\SftpStorageDriver;
use App\Services\Storage\Drivers\WebdavStorageDriver;

class StorageManager
{
    /**
     * Create a StorageDriver instance for a StorageBox model.
     */
    public function driverForBox(StorageBox $box): StorageDriverInterface
    {
        return $this->createDriver($box->disk_type ?? 'hetzner_webdav', [
            'host' => $box->host,
            'username' => $box->username,
            'password' => $box->password,
            'port' => $box->port,
            'share_name' => $box->share_name,
            'mount_path' => $box->mount_path,
        ]);
    }

    /**
     * Create a StorageDriver instance from arbitrary configuration array.
     */
    public function createDriver(string $diskType, array $config): StorageDriverInterface
    {
        $normalizedType = strtolower(trim($diskType));

        return match ($normalizedType) {
            'sftp', 'pulsedmedia', 'ssh' => new SftpStorageDriver($config),
            'hetzner_webdav', 'hetzner' => new HetznerWebdavDriver($config),
            'webdav' => new WebdavStorageDriver($config),
            'ftp', 'ftps' => new FtpStorageDriver($config),
            'cifs', 'local', 'cifs_local' => new LocalMountDriver($config),
            default => new HetznerWebdavDriver($config),
        };
    }
}
