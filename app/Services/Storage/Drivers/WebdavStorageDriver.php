<?php

namespace App\Services\Storage\Drivers;

class WebdavStorageDriver extends HetznerWebdavDriver
{
    /**
     * Custom WebDAV driver extending Hetzner WebDAV with configurable paths and ports.
     */
    public function testConnection(array $config): array
    {
        $res = parent::testConnection($config);
        if ($res['success']) {
            $res['message'] = 'Genel WebDAV Bağlantısı Başarılı! Sunucuya bağlandı.';
        }

        return $res;
    }
}
