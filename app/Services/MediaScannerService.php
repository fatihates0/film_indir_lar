<?php

namespace App\Services;

use App\Enums\MediaType;
use App\Models\Media;
use App\Models\StorageBox;
use Exception;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class MediaScannerService
{
    public function __construct(
        protected StorageBoxService $storageBoxService,
        protected TmdbService $tmdbService,
    ) {}

    /**
     * Sunucuda bağlı (mount edilmiş) tüm Storage Box alanlarını otomatik tespit eder ve Veritabanı (StorageBox model) ile senkronize eder.
     */
    public function discoverAndSyncMounts(): array
    {
        $discovered = [];
        $searchPaths = [
            '/mnt/storageboxes',
            '/mnt/storagebox',
            '/mnt',
        ];

        $candidatePaths = [];

        // 1. Dizin taraması ile olası mount klasörlerini bul
        foreach ($searchPaths as $basePath) {
            if ($this->safeFileExists($basePath) && $this->safeIsDir($basePath)) {
                if ($basePath !== '/mnt') {
                    $candidatePaths[] = str_replace('\\', '/', $basePath);
                }

                $items = @scandir($basePath);
                if (is_array($items)) {
                    foreach ($items as $item) {
                        if ($item === '.' || $item === '..') {
                            continue;
                        }
                        $full = str_replace('\\', '/', rtrim($basePath, '/').'/'.$item);
                        if ($this->safeIsDir($full) && (Str::contains($item, ['storage', 'box', 'film', 'dizi'], true) || Str::startsWith($basePath, '/mnt/storageboxes'))) {
                            $candidatePaths[] = $full;
                        }
                    }
                }
            }
        }

        // 2. /etc/fstab dosyasındaki CIFS mount kayıtlarını ayrıştır
        if ($this->safeFileExists('/etc/fstab') && $this->safeIsReadable('/etc/fstab')) {
            $fstabContent = @file_get_contents('/etc/fstab');
            $lines = explode("\n", (string) $fstabContent);
            foreach ($lines as $line) {
                $line = trim($line);
                if (empty($line) || Str::startsWith($line, '#')) {
                    continue;
                }
                if (Str::contains($line, ['cifs', 'storagebox'])) {
                    $parts = preg_split('/\s+/', $line);
                    if (isset($parts[1]) && Str::startsWith($parts[1], '/mnt')) {
                        $candidatePaths[] = str_replace('\\', '/', $parts[1]);
                    }
                }
            }
        }

        $candidatePaths = array_unique($candidatePaths);

        foreach ($candidatePaths as $path) {
            if (! $this->safeFileExists($path) || ! $this->safeIsReadable($path)) {
                continue;
            }

            $folderName = basename($path);
            if ($folderName === 'mnt') {
                continue;
            }

            $box = StorageBox::where('mount_path', $path)
                ->orWhere('mount_path', str_replace('/', '\\', $path))
                ->first();

            $isOnline = $this->safeFileExists($path) && $this->safeIsReadable($path);

            if (! $box) {
                $displayName = 'Storage Box ('.ucfirst($folderName).')';
                $slug = Str::slug($displayName);

                $counter = 1;
                while (StorageBox::where('slug', $slug)->exists()) {
                    $slug = Str::slug($displayName).'-'.$counter++;
                }

                $box = StorageBox::create([
                    'name' => $displayName,
                    'slug' => $slug,
                    'mount_path' => $path,
                    'disk_type' => 'cifs',
                    'is_active' => true,
                    'status' => $isOnline ? 'online' : 'offline',
                    'metadata' => [
                        'auto_discovered' => true,
                        'discovered_at' => now()->toDateTimeString(),
                    ],
                ]);

                Log::info("Otomatik Storage Box keşfedildi ve eklendi: {$displayName} -> {$path}");
            } else {
                $box->update([
                    'status' => $isOnline ? 'online' : 'offline',
                ]);
            }

            $discovered[] = $box;
        }

        return $discovered;
    }

    /**
     * Tüm aktif Storage Box alanlarını ve içerisindeki tüm alt klasörleri otomatik keşfeder ve medyalarını veritabanına ekler.
     */
    public function scanAll(): array
    {
        // 1. Önce sunucudaki tüm bağlı Storage Box'ları keşfet & senkronize et
        $discoveredBoxes = $this->discoverAndSyncMounts();

        // 2. DB'deki aktif tüm Storage Box'ları çek (Hem yerel mount hem Web paneli kayıtları)
        $allBoxes = StorageBox::where('is_active', true)->get();

        $totalAdded = 0;
        $totalUpdated = 0;
        $totalMissing = 0;
        $totalScanned = 0;
        $boxResults = [];

        foreach ($allBoxes as $box) {
            $res = $this->scan($box);
            $totalAdded += $res['added'];
            $totalUpdated += $res['updated'];
            $totalMissing += $res['missing'];
            $totalScanned += $res['total_scanned'];
            $boxResults[$box->name] = $res;
        }

        return [
            'status' => 'success',
            'discovered_boxes_count' => count($discoveredBoxes),
            'total_boxes_scanned' => count($allBoxes),
            'added' => $totalAdded,
            'updated' => $totalUpdated,
            'missing' => $totalMissing,
            'total_scanned' => $totalScanned,
            'boxes' => $boxResults,
        ];
    }

    /**
     * Belirli bir Storage Box alanını ve altındaki TÜM klasörleri derinlemesine tarar.
     */
    public function scan(?StorageBox $storageBox = null, string $subDirectory = ''): array
    {
        $mountPath = $storageBox ? $storageBox->mount_path : config('storagebox.mount_path', storage_path('app/storagebox'));

        // Yerel Mount Klasörü Mevcut Değilse ancak WebDAV/HTTP Bilgisi Varsa Uzaktan Tara
        if (! $this->safeFileExists($mountPath) || ! $this->safeIsReadable($mountPath)) {
            if ($storageBox && ! empty($storageBox->host) && ! empty($storageBox->username) && ! empty($storageBox->password)) {
                $storageBox->update(['status' => 'online']);
                $remoteRes = $this->scanRemoteWebdav($storageBox, $subDirectory);

                // Silinenleri kontrol et
                $missingQuery = Media::where('is_available', true)->where('storage_box_id', $storageBox->id);
                $missingCount = $missingQuery->whereNotIn('file_path', $remoteRes['scanned_paths'])->update(['is_available' => false]);

                return [
                    'status' => 'success',
                    'added' => $remoteRes['added'],
                    'updated' => $remoteRes['updated'],
                    'missing' => $missingCount,
                    'total_scanned' => count($remoteRes['scanned_paths']),
                ];
            }

            if ($storageBox) {
                $storageBox->update(['status' => 'offline']);
            }

            return [
                'status' => 'error',
                'message' => "Storage Box mount path ({$mountPath}) does not exist or is not readable.",
                'processed' => 0,
                'added' => 0,
                'updated' => 0,
                'missing' => 0,
                'total_scanned' => 0,
            ];
        }

        if ($storageBox) {
            $storageBox->update(['status' => 'online']);
        }

        $scanPath = $subDirectory ? $this->storageBoxService->resolveRealPath($subDirectory, $storageBox) : $mountPath;

        $videoExtensions = ['mkv', 'mp4', 'avi', 'm4v', 'ts', 'm2ts', 'mov', 'webm', 'flv', 'wmv', 'vob', 'ogv', 'divx', '3gp', 'rmvb', 'asf', 'mpg', 'mpeg', 'm2v', 'iso'];
        $scannedPaths = [];
        $added = 0;
        $updated = 0;

        $dirIterator = new \RecursiveDirectoryIterator($scanPath, \FilesystemIterator::SKIP_DOTS);

        $filterIterator = new \RecursiveCallbackFilterIterator($dirIterator, function (\SplFileInfo $current) {
            $filename = $current->getFilename();
            if ($current->isDir()) {
                if (Str::startsWith($filename, ['$Recycle', '$RECYCLE', 'System Volume Information', '.Trash', '.git', '.tmp', 'sample', 'Sample'])) {
                    return false;
                }
            }

            return true;
        });

        $iterator = new \RecursiveIteratorIterator(
            $filterIterator,
            \RecursiveIteratorIterator::SELF_FIRST,
            \RecursiveIteratorIterator::CATCH_GET_CHILD
        );

        foreach ($iterator as $file) {
            try {
                if ($file->isFile()) {
                    $ext = strtolower($file->getExtension());
                    if (! in_array($ext, $videoExtensions)) {
                        continue;
                    }

                    $fileName = $file->getFilename();
                    if (Str::contains($fileName, ['sample', 'Sample', 'trailer', 'Trailer']) && $file->getSize() < 100 * 1024 * 1024) {
                        continue;
                    }

                    $fullPath = $file->getRealPath() ?: $file->getPathname();
                    $normFullPath = str_replace('\\', '/', $fullPath);
                    $normMountPath = str_replace('\\', '/', realpath($mountPath) ?: $mountPath);

                    $relativePath = ltrim(Str::after($normFullPath, rtrim($normMountPath, '/')), '/');
                    $scannedPaths[] = $relativePath;

                    $fileSize = $file->getSize();
                    $title = pathinfo($fileName, PATHINFO_FILENAME);

                    // Medya Türü Tespiti (Film veya Dizi Bölümü)
                    $type = MediaType::MOVIE;
                    if (
                        Str::contains($relativePath, ['Diziler', 'Series', 'TV Shows', 'Sezon', 'Season'], true) ||
                        preg_match('/S\d+E\d+/i', $fileName) ||
                        preg_match('/[0-9]+x[0-9]+/i', $fileName)
                    ) {
                        $type = MediaType::EPISODE;
                    }

                    // Yıl tespiti
                    $year = null;
                    if (preg_match('/[\(\.\_\s](\d{4})[\)\.\_\s]/', $fileName, $matches)) {
                        $candidateYear = (int) $matches[1];
                        if ($candidateYear >= 1900 && $candidateYear <= 2099) {
                            $year = $candidateYear;
                        }
                    }

                    $existing = Media::where(function ($q) use ($relativePath, $fullPath, $normFullPath, $fileName) {
                        $q->where('file_path', $relativePath)
                            ->orWhere('file_path', str_replace('/', '\\', $relativePath))
                            ->orWhere('file_path', $fullPath)
                            ->orWhere('file_path', $normFullPath)
                            ->orWhere('file_name', $fileName);
                    })->first();

                    if ($existing && $existing->file_path !== $relativePath) {
                        $existing->update(['file_path' => $relativePath]);
                    }

                    if ($fileSize <= 0 && $existing && $existing->file_size > 0) {
                        $fileSize = $existing->file_size;
                    }

                    if (! $existing) {
                        $cleanInfo = $this->tmdbService->cleanTitle($fileName);
                        $displayTitle = $cleanInfo['title'] ?: $title;
                        $year = $year ?: $cleanInfo['year'];

                        $slug = Media::generateUniqueSlug($displayTitle, $year);

                        $meta = [];
                        try {
                            $meta = $this->storageBoxService->probeMetadata($relativePath, $storageBox);
                        } catch (Exception $e) {
                            Log::info("Metadata probe skipped for {$relativePath}: ".$e->getMessage());
                        }

                        $newMedia = Media::create([
                            'storage_box_id' => $storageBox?->id,
                            'type' => $type,
                            'title' => $displayTitle,
                            'year' => $year,
                            'slug' => $slug,
                            'file_path' => $relativePath,
                            'file_name' => $fileName,
                            'file_size' => $fileSize,
                            'extension' => $ext,
                            'mime_type' => $meta['mime_type'] ?? 'video/x-matroska',
                            'duration_seconds' => $meta['duration_seconds'] ?? null,
                            'width' => $meta['width'] ?? null,
                            'height' => $meta['height'] ?? null,
                            'video_codec' => $meta['video_codec'] ?? null,
                            'audio_codec' => $meta['audio_codec'] ?? null,
                            'bitrate' => $meta['bitrate'] ?? null,
                            'is_active' => true,
                            'is_available' => true,
                        ]);

                        // TMDB metadata otomatik çekme
                        try {
                            $this->tmdbService->fetchAndApply($newMedia);
                        } catch (Exception $e) {
                            Log::info("TMDB auto-fetch failed for {$newMedia->title}: ".$e->getMessage());
                        }

                        $added++;
                    } else {
                        $shouldUpdateSize = ($fileSize > 0 && $existing->file_size !== $fileSize);
                        if ($shouldUpdateSize || ! $existing->is_available) {
                            $existing->update([
                                'file_size' => $fileSize > 0 ? $fileSize : $existing->file_size,
                                'is_available' => true,
                                'storage_box_id' => $storageBox?->id ?? $existing->storage_box_id,
                            ]);
                            $updated++;
                        }
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('Media scan error for file: '.$e->getMessage());

                continue;
            }
        }

        // Silinmiş / yerinde bulunamayan medyaları unavailable işaretle
        $missingQuery = Media::where('is_available', true);
        if ($storageBox) {
            $missingQuery->where('storage_box_id', $storageBox->id);
        }
        $missingCount = $missingQuery->whereNotIn('file_path', $scannedPaths)->update(['is_available' => false]);

        return [
            'status' => 'success',
            'added' => $added,
            'updated' => $updated,
            'missing' => $missingCount,
            'total_scanned' => count($scannedPaths),
        ];
    }

    /**
     * WebDAV üzerinden uzaktaki Storage Box'taki tüm dizinleri özyinelemeli (recursive) tarar.
     */
    protected function scanRemoteWebdav(StorageBox $storageBox, string $relativePath = ''): array
    {
        if (empty($storageBox->host) || empty($storageBox->username) || empty($storageBox->password)) {
            return ['added' => 0, 'updated' => 0, 'scanned_paths' => []];
        }

        $user = $storageBox->username;
        $pass = $storageBox->password;
        $host = $storageBox->host;

        $videoExtensions = ['mkv', 'mp4', 'avi', 'm4v', 'ts', 'm2ts', 'mov', 'webm', 'flv', 'wmv', 'vob', 'ogv', 'divx', '3gp', 'rmvb', 'asf', 'mpg', 'mpeg', 'm2v', 'iso'];
        $scannedPaths = [];
        $added = 0;
        $updated = 0;

        $directoriesToScan = [$relativePath];

        while (! empty($directoriesToScan)) {
            $currentDir = array_shift($directoriesToScan);
            $pathSegments = explode('/', trim(str_replace('\\', '/', $currentDir), '/'));
            $cleanPath = implode('/', array_map('rawurlencode', array_filter($pathSegments, fn ($s) => $s !== '')));

            if (! str_starts_with($host, 'http://') && ! str_starts_with($host, 'https://')) {
                $url = "https://{$host}/".($cleanPath ? $cleanPath.'/' : '');
            } else {
                $url = rtrim($host, '/').'/'.($cleanPath ? $cleanPath.'/' : '');
            }
            $url = rtrim($url, '/').'/';

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
            curl_setopt($ch, CURLOPT_USERPWD, "{$user}:{$pass}");
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Depth: 1',
                'Content-Type: application/xml; charset=utf-8',
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 10);
            curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
            curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, false);

            $response = curl_exec($ch);
            $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
            curl_close($ch);

            if (($httpCode !== 207 && $httpCode !== 200) || ! $response) {
                continue;
            }

            $xmlContent = preg_replace('/(<\/?)(\w+):([^>]*>)/', '$1$3', $response);
            $xml = @simplexml_load_string($xmlContent);

            if (! $xml || ! isset($xml->response)) {
                continue;
            }

            foreach ($xml->response as $resp) {
                $href = rawurldecode((string) $resp->href);
                $hrefPath = trim(parse_url($href, PHP_URL_PATH) ?: $href, '/');
                $name = basename($hrefPath);

                if (empty($name) || $name === '.' || $name === '..' || Str::startsWith($name, ['$Recycle', '$RECYCLE', 'System Volume Information', '.Trash', '.git'])) {
                    continue;
                }

                $currentRelativeClean = trim(str_replace('\\', '/', $currentDir), '/');
                if (strtolower($hrefPath) === strtolower($currentRelativeClean)) {
                    continue;
                }

                $isDir = false;
                $sizeBytes = 0;

                if (isset($resp->propstat->prop)) {
                    $prop = $resp->propstat->prop;
                    if (isset($prop->resourcetype->collection)) {
                        $isDir = true;
                    }
                    if (isset($prop->getcontentlength)) {
                        $sizeBytes = (int) $prop->getcontentlength;
                    }
                }

                $itemRelativePath = $currentDir ? "{$currentDir}/{$name}" : $name;

                if ($isDir) {
                    $directoriesToScan[] = $itemRelativePath;
                } else {
                    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                    if (in_array($ext, $videoExtensions)) {
                        $scannedPaths[] = $itemRelativePath;
                        $title = pathinfo($name, PATHINFO_FILENAME);

                        $type = MediaType::MOVIE;
                        if (
                            Str::contains($itemRelativePath, ['Diziler', 'Series', 'TV Shows', 'Sezon', 'Season'], true) ||
                            preg_match('/S\d+E\d+/i', $name)
                        ) {
                            $type = MediaType::EPISODE;
                        }

                        $year = null;
                        if (preg_match('/[\(\.\_\s](\d{4})[\)\.\_\s]/', $name, $matches)) {
                            $candidateYear = (int) $matches[1];
                            if ($candidateYear >= 1900 && $candidateYear <= 2099) {
                                $year = $candidateYear;
                            }
                        }

                        $existing = Media::where(function ($q) use ($itemRelativePath, $name) {
                            $q->where('file_path', $itemRelativePath)
                                ->orWhere('file_path', str_replace('/', '\\', $itemRelativePath))
                                ->orWhere('file_name', $name);
                        })->first();

                        if (! $existing) {
                            $cleanInfo = $this->tmdbService->cleanTitle($name);
                            $displayTitle = $cleanInfo['title'] ?: $title;
                            $year = $year ?: $cleanInfo['year'];

                            $slug = Media::generateUniqueSlug($displayTitle, $year);

                            $newMedia = Media::create([
                                'storage_box_id' => $storageBox->id,
                                'type' => $type,
                                'title' => $displayTitle,
                                'year' => $year,
                                'slug' => $slug,
                                'file_path' => $itemRelativePath,
                                'file_name' => $name,
                                'file_size' => $sizeBytes,
                                'extension' => $ext,
                                'mime_type' => 'video/x-matroska',
                                'is_active' => true,
                                'is_available' => true,
                            ]);

                            try {
                                $this->tmdbService->fetchAndApply($newMedia);
                            } catch (Exception $e) {
                                // fallback
                            }

                            $added++;
                        } else {
                            if (! $existing->is_available || ($sizeBytes > 0 && $existing->file_size !== $sizeBytes)) {
                                $existing->update([
                                    'file_size' => $sizeBytes > 0 ? $sizeBytes : $existing->file_size,
                                    'is_available' => true,
                                ]);
                                $updated++;
                            }
                        }
                    }
                }
            }
        }

        return [
            'added' => $added,
            'updated' => $updated,
            'scanned_paths' => $scannedPaths,
        ];
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

    protected function safeIsDir(?string $path): bool
    {
        if (! $path || ! $this->isPathAllowedByOpenBasedir($path)) {
            return false;
        }

        try {
            return @is_dir($path);
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
