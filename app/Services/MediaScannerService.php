<?php

namespace App\Services;

use App\Enums\MediaType;
use App\Models\Media;
use App\Models\MediaScan;
use App\Models\StorageBox;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class MediaScannerService
{
    protected array $videoExtensions = [
        'mkv', 'mp4', 'avi', 'm4v', 'ts', 'm2ts', 'mov', 'webm',
        'flv', 'wmv', 'vob', 'ogv', 'divx', '3gp', 'rmvb', 'asf',
        'mpg', 'mpeg', 'm2v', 'iso',
    ];

    public function __construct(
        protected StorageBoxService $storageBoxService,
        protected TmdbService $tmdbService,
    ) {}

    /**
     * Dizin yolunu normalize eder (Tüm ters slaşları slaşa çevirir, baş/son boşlukları temizler).
     */
    public function normalizePath(?string $path): string
    {
        if ($path === null) {
            return '';
        }

        $normalized = str_replace('\\', '/', trim($path));

        return rtrim($normalized, '/');
    }

    /**
     * İki yol arasındaki göreli (relative) yolu harf duyarsız (case-insensitive) güvenli bir şekilde hesaplar.
     */
    public function getRelativePath(string $fullPath, string $basePath): string
    {
        $normFull = str_replace('\\', '/', $fullPath);
        $normBase = str_replace('\\', '/', $basePath);

        $normBase = rtrim($normBase, '/');
        $normFull = rtrim($normFull, '/');

        if ($normBase !== '' && strncasecmp($normFull, $normBase, strlen($normBase)) === 0) {
            return ltrim(substr($normFull, strlen($normBase)), '/');
        }

        return ltrim($normFull, '/');
    }

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

        foreach ($searchPaths as $basePath) {
            if ($this->safeFileExists($basePath) && $this->safeIsDir($basePath)) {
                if ($basePath !== '/mnt') {
                    $candidatePaths[] = $this->normalizePath($basePath);
                }

                $items = @scandir($basePath);
                if (is_array($items)) {
                    foreach ($items as $item) {
                        if ($item === '.' || $item === '..') {
                            continue;
                        }
                        $full = $this->normalizePath($basePath.'/'.$item);
                        if ($this->safeIsDir($full) && (Str::contains($item, ['storage', 'box', 'film', 'dizi'], true) || Str::startsWith($basePath, '/mnt/storageboxes'))) {
                            $candidatePaths[] = $full;
                        }
                    }
                }
            }
        }

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
                        $candidatePaths[] = $this->normalizePath($parts[1]);
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
     * Tüm aktif Storage Box alanlarını otomatik keşfeder ve tarar.
     */
    public function scanAll(?MediaScan $mediaScan = null): array
    {
        $discoveredBoxes = $this->discoverAndSyncMounts();
        $allBoxes = StorageBox::where('is_active', true)->get();
        $totalBoxes = count($allBoxes);

        $totalAdded = 0;
        $totalUpdated = 0;
        $totalMissing = 0;
        $totalScanned = 0;
        $boxResults = [];

        foreach ($allBoxes as $index => $box) {
            if ($mediaScan) {
                $mediaScan->refresh();
                if ($mediaScan->status === 'cancelled') {
                    throw new \RuntimeException('Tarama kullanıcı tarafından iptal edildi.');
                }
                $percent = $totalBoxes > 0 ? round(($index / $totalBoxes) * 100, 1) : 0;
                $mediaScan->update([
                    'progress_percent' => $percent,
                    'current_target' => "{$box->name} taranıyor...",
                ]);
            }

            $res = $this->scan($box, '', $mediaScan);
            $totalAdded += $res['added'];
            $totalUpdated += $res['updated'];
            $totalMissing += $res['missing'];
            $totalScanned += $res['total_scanned'];
            $boxResults[$box->name] = $res;
        }

        if ($mediaScan) {
            $mediaScan->update([
                'progress_percent' => 100,
                'current_target' => 'Tamamlandı',
                'total_scanned' => $totalScanned,
                'added_count' => $totalAdded,
                'updated_count' => $totalUpdated,
                'missing_count' => $totalMissing,
            ]);
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
     * Belirli bir Storage Box alanını (yerel veya uzaktan) tarar.
     */
    public function scan(?StorageBox $storageBox = null, string $subDirectory = '', ?MediaScan $mediaScan = null): array
    {
        $mountPath = $storageBox ? $storageBox->mount_path : config('storagebox.mount_path', storage_path('app/storagebox'));
        $subDirectory = $this->normalizePath($subDirectory);

        // Yerel Mount Klasörü Mevcut Değilse uzaktan (WebDAV/FTP) taramayı dene
        if (! $this->safeFileExists($mountPath) || ! $this->safeIsReadable($mountPath)) {
            if ($storageBox && ! empty($storageBox->host) && ! empty($storageBox->username) && ! empty($storageBox->password)) {
                $storageBox->update(['status' => 'online']);

                if (in_array($storageBox->disk_type, ['ftp', 'sftp', 'pulsedmedia'], true)) {
                    $remoteRes = $this->scanRemoteFtp($storageBox, $subDirectory, $mediaScan);
                } else {
                    $remoteRes = $this->scanRemoteWebdav($storageBox, $subDirectory, $mediaScan);
                    if (empty($remoteRes['scanned_paths'])) {
                        $ftpRes = $this->scanRemoteFtp($storageBox, $subDirectory, $mediaScan);
                        if (! empty($ftpRes['scanned_paths'])) {
                            $remoteRes = $ftpRes;
                        }
                    }
                }

                $missingCount = $this->markMissingMedia($storageBox, $subDirectory, $remoteRes['scanned_paths']);

                if ($mediaScan && $mediaScan->scan_type !== 'all') {
                    $mediaScan->update([
                        'total_scanned' => count($remoteRes['scanned_paths']),
                        'added_count' => $remoteRes['added'],
                        'updated_count' => $remoteRes['updated'],
                        'missing_count' => $missingCount,
                    ]);
                }

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

        return $this->scanLocal($storageBox, $mountPath, $subDirectory, $mediaScan);
    }

    /**
     * Yerel dosya sistemi üzerinde tarama gerçekleştirir.
     */
    protected function scanLocal(?StorageBox $storageBox, string $mountPath, string $subDirectory, ?MediaScan $mediaScan): array
    {
        $scanPath = $subDirectory ? $this->storageBoxService->resolveRealPath($subDirectory, $storageBox) : $mountPath;

        if (! $this->safeFileExists($scanPath) || ! $this->safeIsReadable($scanPath)) {
            return [
                'status' => 'error',
                'message' => "Target scan path ({$scanPath}) does not exist or is not readable.",
                'added' => 0,
                'updated' => 0,
                'missing' => 0,
                'total_scanned' => 0,
            ];
        }

        $scannedPaths = [];
        $added = 0;
        $updated = 0;
        $processedCount = 0;

        try {
            $dirIterator = new \RecursiveDirectoryIterator(
                $scanPath,
                \FilesystemIterator::SKIP_DOTS | \FilesystemIterator::UNIX_PATHS
            );

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
                    if (! $file->isFile()) {
                        continue;
                    }

                    $ext = strtolower($file->getExtension());
                    if (! in_array($ext, $this->videoExtensions, true)) {
                        continue;
                    }

                    $fileName = $file->getFilename();
                    if (Str::contains($fileName, ['sample', 'Sample', 'trailer', 'Trailer']) && $file->getSize() < 100 * 1024 * 1024) {
                        continue;
                    }

                    $processedCount++;

                    if ($mediaScan && $processedCount % 5 === 0) {
                        $mediaScan->refresh();
                        if ($mediaScan->status === 'cancelled') {
                            throw new \RuntimeException('Tarama kullanıcı tarafından iptal edildi.');
                        }
                        if ($mediaScan->scan_type !== 'all') {
                            $mediaScan->update([
                                'total_scanned' => count($scannedPaths),
                                'added_count' => $added,
                                'updated_count' => $updated,
                                'current_target' => "{$fileName} taranıyor...",
                            ]);
                        }
                    }

                    $fullPath = $file->getRealPath() ?: $file->getPathname();
                    $relativePath = $this->getRelativePath($fullPath, $mountPath);

                    $scannedPaths[] = $relativePath;
                    $fileSize = $file->getSize();

                    $res = $this->processMediaFile($storageBox, $relativePath, $fileName, $fileSize, $ext);
                    if ($res === 'added') {
                        $added++;
                    } elseif ($res === 'updated') {
                        $updated++;
                    }
                } catch (\Throwable $e) {
                    if ($e->getMessage() === 'Tarama kullanıcı tarafından iptal edildi.') {
                        throw $e;
                    }
                    Log::warning('Media scan warning for file: '.$e->getMessage());
                }
            }
        } catch (\UnexpectedValueException $e) {
            Log::warning('Media scan directory access error: '.$e->getMessage());
        }

        $missingCount = $this->markMissingMedia($storageBox, $subDirectory, $scannedPaths);

        if ($mediaScan && $mediaScan->scan_type !== 'all') {
            $mediaScan->update([
                'total_scanned' => count($scannedPaths),
                'added_count' => $added,
                'updated_count' => $updated,
                'missing_count' => $missingCount,
                'progress_percent' => 100,
            ]);
        }

        return [
            'status' => 'success',
            'added' => $added,
            'updated' => $updated,
            'missing' => $missingCount,
            'total_scanned' => count($scannedPaths),
        ];
    }

    protected array $mimeTypeMap = [
        'mkv' => 'video/x-matroska',
        'mp4' => 'video/mp4',
        'avi' => 'video/x-msvideo',
        'm4v' => 'video/x-m4v',
        'ts' => 'video/mp2t',
        'm2ts' => 'video/mp2t',
        'mov' => 'video/quicktime',
        'webm' => 'video/webm',
        'flv' => 'video/x-flv',
        'wmv' => 'video/x-ms-wmv',
        'vob' => 'video/x-ms-vob',
        'ogv' => 'video/ogg',
        'divx' => 'video/x-msvideo',
        '3gp' => 'video/3gpp',
        'rmvb' => 'application/vnd.rn-realmedia-vbr',
        'asf' => 'video/x-ms-asf',
        'mpg' => 'video/mpeg',
        'mpeg' => 'video/mpeg',
        'm2v' => 'video/mpeg',
        'iso' => 'application/x-iso9660-image',
    ];

    /**
     * Medya dosyasını veritabanında bulur veya oluşturur.
     */
    protected function processMediaFile(?StorageBox $storageBox, string $relativePath, string $fileName, int $fileSize, string $ext): string
    {
        $existing = $this->findExistingMedia($storageBox, $relativePath, $fileName, $fileSize);

        $title = pathinfo($fileName, PATHINFO_FILENAME);

        $type = MediaType::MOVIE;
        if (
            Str::contains($relativePath, ['Diziler', 'Series', 'TV Shows', 'Sezon', 'Season'], true) ||
            preg_match('/S\d+E\d+/i', $fileName) ||
            preg_match('/[0-9]+x[0-9]+/i', $fileName)
        ) {
            $type = MediaType::EPISODE;
        }

        $year = null;
        if (preg_match('/[\(\.\_\s](\d{4})[\)\.\_\s]/', $fileName, $matches)) {
            $candidateYear = (int) $matches[1];
            if ($candidateYear >= 1900 && $candidateYear <= 2099) {
                $year = $candidateYear;
            }
        }

        if ($fileSize <= 0 && $existing && $existing->file_size > 0) {
            $fileSize = $existing->file_size;
        }

        if (! $existing) {
            $cleanInfo = $this->tmdbService->cleanTitle($fileName);
            $displayTitle = $cleanInfo['title'] ?: $title;
            $year = $year ?: $cleanInfo['year'];

            $slug = Media::generateUniqueSlug($displayTitle, $year);

            $mimeType = $this->mimeTypeMap[strtolower($ext)] ?? 'video/x-matroska';

            Media::create([
                'storage_box_id' => $storageBox?->id,
                'type' => $type,
                'title' => $displayTitle,
                'year' => $year,
                'slug' => $slug,
                'file_path' => $relativePath,
                'file_name' => $fileName,
                'file_size' => $fileSize,
                'extension' => $ext,
                'mime_type' => $mimeType,
                'duration_seconds' => null,
                'width' => null,
                'height' => null,
                'video_codec' => null,
                'audio_codec' => null,
                'bitrate' => null,
                'is_active' => true,
                'is_available' => true,
            ]);

            return 'added';
        } else {
            $shouldUpdateSize = ($fileSize > 0 && $existing->file_size !== $fileSize);
            if ($shouldUpdateSize || ! $existing->is_available || $existing->file_path !== $relativePath) {
                $existing->update([
                    'file_path' => $relativePath,
                    'file_name' => $fileName,
                    'file_size' => $fileSize > 0 ? $fileSize : $existing->file_size,
                    'is_available' => true,
                    'storage_box_id' => $storageBox?->id ?? $existing->storage_box_id,
                ]);

                return 'updated';
            }

            return 'unchanged';
        }
    }

    /**
     * Veritabanında belirtilen Storage Box ve bağıl yoldaki medyayı güvenli bir şekilde arar.
     * Mükerrer kaydı önlemek için hem yol hem de dosya adı/boyut eşleştirmesi yapar.
     */
    protected function findExistingMedia(?StorageBox $storageBox, string $relativePath, string $fileName = '', int $fileSize = 0): ?Media
    {
        $normPath = str_replace('\\', '/', $relativePath);
        $altPath = str_replace('/', '\\', $relativePath);
        $trimmedPath = ltrim($normPath, '/');
        $trimmedAlt = str_replace('/', '\\', $trimmedPath);

        // 1. Doğrudan yol eşleşmesi
        $existing = Media::where(function ($q) use ($normPath, $altPath, $trimmedPath, $trimmedAlt) {
            $q->where('file_path', $normPath)
                ->orWhere('file_path', $altPath)
                ->orWhere('file_path', $trimmedPath)
                ->orWhere('file_path', $trimmedAlt)
                ->orWhere('file_path', '/'.$trimmedPath);
        })->where(function ($q) use ($storageBox) {
            if ($storageBox) {
                $q->where('storage_box_id', $storageBox->id);
            } else {
                $q->whereNull('storage_box_id');
            }
        })->first();

        if ($existing) {
            return $existing;
        }

        // 2. Taşınmış veya dizini değişmiş dosyalar için dosya adı ve boyut eşleşmesi (Mükerrer kaydı önler)
        if ($storageBox && ! empty($fileName)) {
            $byName = Media::where('storage_box_id', $storageBox->id)
                ->where('file_name', $fileName)
                ->when($fileSize > 0, function ($q) use ($fileSize) {
                    $q->where('file_size', $fileSize);
                })
                ->first();

            if ($byName) {
                return $byName;
            }
        }

        return null;
    }

    /**
     * Taranan hedef dizinde yer almayan medyaları pasife (is_available = false) çeker.
     * Dizin kapsamı dışındaki medyalar KESİNLİKLE etkilenmez.
     */
    protected function markMissingMedia(?StorageBox $storageBox, string $subDirectory, array $scannedPaths): int
    {
        $query = Media::where('is_available', true);

        if ($storageBox) {
            $query->where('storage_box_id', $storageBox->id);
        } else {
            $query->whereNull('storage_box_id');
        }

        if (! empty($subDirectory)) {
            $cleanSubDir = $this->normalizePath($subDirectory);
            $query->where(function ($q) use ($cleanSubDir) {
                $q->where('file_path', $cleanSubDir)
                    ->orWhere('file_path', 'like', $cleanSubDir.'/%')
                    ->orWhere('file_path', 'like', str_replace('/', '\\', $cleanSubDir).'\\%');
            });
        }

        $normalizedScannedPaths = [];
        foreach ($scannedPaths as $p) {
            $norm = str_replace('\\', '/', $p);
            $normalizedScannedPaths[] = $norm;
            $normalizedScannedPaths[] = ltrim($norm, '/');
            $normalizedScannedPaths[] = str_replace('/', '\\', $norm);
            $normalizedScannedPaths[] = '\\'.str_replace('/', '\\', ltrim($norm, '/'));
        }
        $normalizedScannedPaths = array_values(array_unique($normalizedScannedPaths));

        return $query->whereNotIn('file_path', $normalizedScannedPaths)->update(['is_available' => false]);
    }

    /**
     * WebDAV üzerinden uzaktaki Storage Box'taki tüm dizinleri özyinelemeli (recursive) tarar.
     */
    protected function scanRemoteWebdav(StorageBox $storageBox, string $relativePath = '', ?MediaScan $mediaScan = null): array
    {
        if (empty($storageBox->host) || empty($storageBox->username) || empty($storageBox->password)) {
            return ['added' => 0, 'updated' => 0, 'scanned_paths' => []];
        }

        $user = $storageBox->username;
        $pass = $storageBox->password;
        $host = $storageBox->host;

        $scannedPaths = [];
        $added = 0;
        $updated = 0;

        $directoriesToScan = [$relativePath];

        while (! empty($directoriesToScan)) {
            if ($mediaScan) {
                $mediaScan->refresh();
                if ($mediaScan->status === 'cancelled') {
                    throw new \RuntimeException('Tarama kullanıcı tarafından iptal edildi.');
                }
            }

            $currentDir = array_shift($directoriesToScan);
            $pathSegments = explode('/', trim(str_replace('\\', '/', $currentDir), '/'));
            $cleanPath = implode('/', array_map('rawurlencode', array_filter($pathSegments, fn ($s) => $s !== '')));

            if (! str_starts_with($host, 'http://') && ! str_starts_with($host, 'https://')) {
                $url = "https://{$host}/".($cleanPath ? $cleanPath.'/' : '');
            } else {
                $url = rtrim($host, '/').'/'.($cleanPath ? $cleanPath.'/' : '');
            }
            $url = rtrim($url, '/').'/';
            $targetUrlPath = trim(parse_url($url, PHP_URL_PATH) ?: '', '/');

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $url);
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PROPFIND');
            curl_setopt($ch, CURLOPT_USERPWD, "{$user}:{$pass}");
            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Depth: 1',
                'Content-Type: application/xml; charset=utf-8',
            ]);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
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
                $hrefPath = trim(parse_url($href, PHP_URL_PATH) ?: '', '/');
                $name = basename($hrefPath);

                if (empty($name) || $name === '.' || $name === '..' || Str::startsWith($name, ['.', '$Recycle', '$RECYCLE', 'System Volume Information', '.Trash', '.git'])) {
                    continue;
                }

                if (strtolower($hrefPath) === strtolower($targetUrlPath)) {
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
                    if (! in_array($itemRelativePath, $directoriesToScan, true)) {
                        $directoriesToScan[] = $itemRelativePath;
                    }
                } else {
                    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                    if (in_array($ext, $this->videoExtensions, true)) {
                        $scannedPaths[] = $itemRelativePath;
                        $res = $this->processMediaFile($storageBox, $itemRelativePath, $name, $sizeBytes, $ext);

                        if ($res === 'added') {
                            $added++;
                        } elseif ($res === 'updated') {
                            $updated++;
                        }

                        if ($mediaScan && count($scannedPaths) % 5 === 0) {
                            $mediaScan->refresh();
                            if ($mediaScan->scan_type !== 'all') {
                                $mediaScan->update([
                                    'total_scanned' => count($scannedPaths),
                                    'added_count' => $added,
                                    'updated_count' => $updated,
                                    'current_target' => "{$name} taranıyor...",
                                ]);
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

    /**
     * FTP üzerinden uzaktaki Storage Box dizinlerini özyinelemeli tarar.
     */
    protected function scanRemoteFtp(StorageBox $storageBox, string $relativePath = '', ?MediaScan $mediaScan = null): array
    {
        if (empty($storageBox->host) || empty($storageBox->username) || empty($storageBox->password)) {
            return ['added' => 0, 'updated' => 0, 'scanned_paths' => []];
        }

        $user = $storageBox->username;
        $pass = $storageBox->password;
        $host = parse_url('https://'.$storageBox->host, PHP_URL_HOST) ?: $storageBox->host;

        $scannedPaths = [];
        $added = 0;
        $updated = 0;

        $directoriesToScan = [$relativePath];

        while (! empty($directoriesToScan)) {
            if ($mediaScan) {
                $mediaScan->refresh();
                if ($mediaScan->status === 'cancelled') {
                    throw new \RuntimeException('Tarama kullanıcı tarafından iptal edildi.');
                }
            }

            $currentDir = array_shift($directoriesToScan);
            $cleanDir = trim(str_replace('\\', '/', $currentDir), '/');
            $ftpUrl = "ftp://{$host}/".($cleanDir ? $cleanDir.'/' : '');

            $ch = curl_init();
            curl_setopt($ch, CURLOPT_URL, $ftpUrl);
            curl_setopt($ch, CURLOPT_USERPWD, "{$user}:{$pass}");
            curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
            curl_setopt($ch, CURLOPT_TIMEOUT, 15);
            curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'MLSD');

            $response = curl_exec($ch);
            $code = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
            curl_close($ch);

            $lines = [];
            if ($code == 226 && $response) {
                $rawLines = explode("\n", str_replace("\r", '', $response));
                foreach ($rawLines as $line) {
                    $line = trim($line);
                    if (! $line) {
                        continue;
                    }
                    $parts = explode('; ', $line, 2);
                    if (count($parts) === 2) {
                        $factsStr = $parts[0];
                        $name = $parts[1];
                        $facts = [];
                        foreach (explode(';', $factsStr) as $fact) {
                            $kv = explode('=', $fact, 2);
                            if (count($kv) === 2) {
                                $facts[strtolower($kv[0])] = $kv[1];
                            }
                        }
                        $type = $facts['type'] ?? 'file';
                        $size = (int) ($facts['size'] ?? 0);
                        $lines[] = ['name' => $name, 'is_dir' => in_array($type, ['dir', 'cdir', 'pdir'], true), 'size' => $size];
                    }
                }
            } else {
                $ch = curl_init();
                curl_setopt($ch, CURLOPT_URL, $ftpUrl);
                curl_setopt($ch, CURLOPT_USERPWD, "{$user}:{$pass}");
                curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
                curl_setopt($ch, CURLOPT_TIMEOUT, 15);
                curl_setopt($ch, CURLOPT_FTPLISTONLY, true);
                $response = curl_exec($ch);
                curl_close($ch);

                if ($response) {
                    $names = explode("\n", str_replace("\r", '', $response));
                    foreach ($names as $name) {
                        $name = trim($name);
                        if ($name) {
                            $isDir = ! pathinfo($name, PATHINFO_EXTENSION);
                            $lines[] = ['name' => $name, 'is_dir' => $isDir, 'size' => 0];
                        }
                    }
                }
            }

            foreach ($lines as $item) {
                $name = $item['name'];
                if (empty($name) || $name === '.' || $name === '..' || Str::startsWith($name, ['.', '$Recycle', '$RECYCLE', 'System Volume Information', '.Trash', '.git'])) {
                    continue;
                }

                $itemRelativePath = $cleanDir ? "{$cleanDir}/{$name}" : $name;

                if ($item['is_dir']) {
                    if (! in_array($itemRelativePath, $directoriesToScan, true)) {
                        $directoriesToScan[] = $itemRelativePath;
                    }
                } else {
                    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                    if (in_array($ext, $this->videoExtensions, true)) {
                        $scannedPaths[] = $itemRelativePath;
                        $sizeBytes = $item['size'];

                        $res = $this->processMediaFile($storageBox, $itemRelativePath, $name, $sizeBytes, $ext);
                        if ($res === 'added') {
                            $added++;
                        } elseif ($res === 'updated') {
                            $updated++;
                        }

                        if ($mediaScan && count($scannedPaths) % 5 === 0) {
                            $mediaScan->refresh();
                            if ($mediaScan->scan_type !== 'all') {
                                $mediaScan->update([
                                    'total_scanned' => count($scannedPaths),
                                    'added_count' => $added,
                                    'updated_count' => $updated,
                                    'current_target' => "{$name} taranıyor...",
                                ]);
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
