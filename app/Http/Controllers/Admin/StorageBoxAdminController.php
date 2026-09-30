<?php

namespace App\Http\Controllers\Admin;

use App\Enums\MediaType;
use App\Http\Controllers\Controller;
use App\Jobs\ProcessRemoteTransferJob;
use App\Models\Media;
use App\Models\RemoteTransfer;
use App\Models\StorageBox;
use App\Services\AuditLogService;
use App\Services\MediaScannerService;
use App\Services\RemoteTransferService;
use App\Services\StorageBoxService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class StorageBoxAdminController extends Controller
{
    public function __construct(
        protected StorageBoxService $storageBoxService,
        protected MediaScannerService $scannerService,
        protected AuditLogService $auditLogService,
        protected RemoteTransferService $remoteTransferService,
    ) {}

    public function index(): Response
    {
        $rawBoxes = StorageBox::withCount('media')
            ->withSum('media', 'file_size')
            ->orderBy('id', 'desc')
            ->get();

        $totalUsedBytes = 0;
        $totalCapacityBytes = 0;
        $totalFreeBytes = 0;
        $hasKnownCapacity = false;
        $onlineCount = 0;

        $boxes = $rawBoxes->map(function ($box) use (&$totalUsedBytes, &$totalCapacityBytes, &$totalFreeBytes, &$hasKnownCapacity, &$onlineCount) {
            $isMounted = $this->storageBoxService->isMounted($box);
            $box->status = $isMounted ? 'online' : 'offline';
            $box->save();

            if ($box->status === 'online') {
                $onlineCount++;
            }

            $mediaUsedBytes = (float) ($box->media_sum_file_size ?? 0);
            $totalUsedBytes += $mediaUsedBytes;

            $manualCapGb = isset($box->metadata['capacity_gb']) && is_numeric($box->metadata['capacity_gb'])
                ? (float) $box->metadata['capacity_gb']
                : null;

            $capacityBytes = null;
            $freeBytes = null;
            $capacitySource = 'none';

            if (! empty($manualCapGb) && $manualCapGb > 0) {
                $capacityBytes = (float) $manualCapGb * 1073741824;
                $capacitySource = 'manual';
                $freeBytes = max(0, $capacityBytes - $mediaUsedBytes);
            } elseif (! empty($box->mount_path) && file_exists($box->mount_path)) {
                $diskTotal = @disk_total_space($box->mount_path);
                $diskFree = @disk_free_space($box->mount_path);
                if ($diskTotal !== false && $diskTotal > 0) {
                    $capacityBytes = (float) $diskTotal;
                    $capacitySource = 'auto';
                    $freeBytes = $diskFree !== false ? (float) $diskFree : null;
                }
            }

            if ($capacityBytes !== null) {
                $hasKnownCapacity = true;
                $totalCapacityBytes += $capacityBytes;
                if ($freeBytes !== null) {
                    $totalFreeBytes += $freeBytes;
                }
            }

            $mediaUsagePercent = ($capacityBytes && $capacityBytes > 0)
                ? round(($mediaUsedBytes / $capacityBytes) * 100, 1)
                : null;

            $diskUsedBytes = ($capacityBytes !== null && $freeBytes !== null)
                ? max(0, $capacityBytes - $freeBytes)
                : null;

            $diskUsagePercent = ($capacityBytes && $capacityBytes > 0 && $diskUsedBytes !== null)
                ? round(($diskUsedBytes / $capacityBytes) * 100, 1)
                : null;

            return [
                'id' => $box->id,
                'name' => $box->name,
                'slug' => $box->slug,
                'mount_path' => $box->mount_path,
                'disk_type' => $box->disk_type,
                'host' => $box->host,
                'username' => $box->username,
                'port' => $box->port ?: 445,
                'share_name' => $box->share_name ?: 'backup',
                'has_password' => ! empty($box->password),
                'is_active' => $box->is_active,
                'status' => $box->status,
                'media_count' => $box->media_count,
                'total_gb' => round($mediaUsedBytes / 1073741824, 2),
                'used_bytes' => $mediaUsedBytes,
                'used_formatted' => $this->formatBytes($mediaUsedBytes),
                'capacity_gb' => $manualCapGb ?: ($capacityBytes ? round($capacityBytes / 1073741824, 2) : null),
                'capacity_bytes' => $capacityBytes,
                'capacity_formatted' => $capacityBytes ? $this->formatBytes($capacityBytes) : 'Bilinmiyor',
                'capacity_source' => $capacitySource,
                'free_bytes' => $freeBytes,
                'free_formatted' => $freeBytes !== null ? $this->formatBytes($freeBytes) : 'Bilinmiyor',
                'free_gb' => $freeBytes !== null ? round($freeBytes / 1073741824, 2) : null,
                'media_usage_percent' => $mediaUsagePercent,
                'disk_usage_percent' => $diskUsagePercent,
                'usage_percent' => $capacitySource === 'auto' ? $diskUsagePercent : $mediaUsagePercent,
            ];
        });

        $totalMediaCount = $rawBoxes->sum('media_count');
        $totalUsagePercent = ($hasKnownCapacity && $totalCapacityBytes > 0)
            ? round(($totalUsedBytes / $totalCapacityBytes) * 100, 1)
            : null;

        $storageSummary = [
            'total_media_count' => $totalMediaCount,
            'total_used_bytes' => $totalUsedBytes,
            'total_used_gb' => round($totalUsedBytes / 1073741824, 2),
            'total_used_formatted' => $this->formatBytes($totalUsedBytes),
            'total_capacity_bytes' => $hasKnownCapacity ? $totalCapacityBytes : null,
            'total_capacity_formatted' => $hasKnownCapacity ? $this->formatBytes($totalCapacityBytes) : 'Bilinmiyor',
            'total_free_bytes' => $hasKnownCapacity ? $totalFreeBytes : null,
            'total_free_formatted' => $hasKnownCapacity ? $this->formatBytes($totalFreeBytes) : 'Bilinmiyor',
            'total_free_gb' => $hasKnownCapacity ? round($totalFreeBytes / 1073741824, 2) : null,
            'total_usage_percent' => $totalUsagePercent,
            'has_known_capacity' => $hasKnownCapacity,
            'online_boxes_count' => $onlineCount,
            'total_boxes_count' => $rawBoxes->count(),
        ];

        $paginatedTransfers = RemoteTransfer::with('storageBox')
            ->latest()
            ->paginate(10);

        $transfersData = [
            'data' => $paginatedTransfers->getCollection()->map(fn ($t) => [
                'id' => $t->id,
                'storage_box_id' => $t->storage_box_id,
                'storage_box_name' => $t->storageBox?->name ?? 'Bilinmiyor',
                'source_url' => $t->source_url,
                'target_folder' => $t->target_folder,
                'file_name' => $t->file_name,
                'relative_path' => $t->relative_path,
                'total_bytes' => $t->total_bytes,
                'total_formatted' => $this->remoteTransferService->formatBytes($t->total_bytes),
                'transferred_bytes' => $t->transferred_bytes,
                'transferred_formatted' => $this->remoteTransferService->formatBytes($t->transferred_bytes),
                'progress_percent' => $t->progress_percent,
                'speed_bps' => $t->speed_bps,
                'speed_formatted' => $this->remoteTransferService->formatBytes($t->speed_bps) . '/s',
                'status' => $t->status,
                'error_message' => $t->error_message,
                'media_id' => $t->media_id,
                'created_at' => $t->created_at?->diffForHumans(),
            ]),
            'pagination' => [
                'current_page' => $paginatedTransfers->currentPage(),
                'last_page' => $paginatedTransfers->lastPage(),
                'per_page' => $paginatedTransfers->perPage(),
                'total' => $paginatedTransfers->total(),
            ],
        ];

        return Inertia::render('Admin/StorageBoxes/Index', [
            'boxes' => $boxes,
            'storage_summary' => $storageSummary,
            'recent_transfers' => $transfersData,
        ]);
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'mount_path' => ['required', 'string', 'max:500'],
            'disk_type' => ['required', 'string', 'in:cifs,sshfs,local'],
            'host' => ['nullable', 'string', 'max:255'],
            'username' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:500'],
            'port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'share_name' => ['nullable', 'string', 'max:255'],
            'capacity_gb' => ['nullable', 'numeric', 'min:0'],
        ]);

        $metadata = [];
        if (! empty($validated['capacity_gb'])) {
            $metadata['capacity_gb'] = (float) $validated['capacity_gb'];
        }
        unset($validated['capacity_gb']);
        $validated['metadata'] = $metadata;

        $validated['slug'] = Str::slug($validated['name']);
        $validated['is_active'] = true;
        $validated['status'] = file_exists($validated['mount_path']) ? 'online' : 'offline';

        $box = StorageBox::create($validated);

        $this->auditLogService->log(
            action: 'storage_box_created',
            targetType: 'StorageBox',
            targetId: (string) $box->id,
            newValues: $box->only(['id', 'name', 'host', 'username', 'mount_path', 'disk_type'])
        );

        return back()->with('message', 'Storage Box ve kimlik bilgileri başarıyla eklendi.');
    }

    public function update(StorageBox $storageBox, Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'mount_path' => ['required', 'string', 'max:500'],
            'disk_type' => ['required', 'string', 'in:cifs,sshfs,local'],
            'host' => ['nullable', 'string', 'max:255'],
            'username' => ['nullable', 'string', 'max:255'],
            'password' => ['nullable', 'string', 'max:500'],
            'port' => ['nullable', 'integer', 'min:1', 'max:65535'],
            'share_name' => ['nullable', 'string', 'max:255'],
            'is_active' => ['required', 'boolean'],
            'capacity_gb' => ['nullable', 'numeric', 'min:0'],
        ]);

        $metadata = $storageBox->metadata ?? [];
        if (array_key_exists('capacity_gb', $validated)) {
            if (! empty($validated['capacity_gb'])) {
                $metadata['capacity_gb'] = (float) $validated['capacity_gb'];
            } else {
                unset($metadata['capacity_gb']);
            }
            unset($validated['capacity_gb']);
            $validated['metadata'] = $metadata;
        }

        // If password field is left empty during edit, retain existing encrypted password
        if (empty($validated['password'])) {
            unset($validated['password']);
        }

        $old = $storageBox->only(['name', 'host', 'username', 'mount_path', 'disk_type']);
        $storageBox->update($validated);

        $this->auditLogService->log(
            action: 'storage_box_updated',
            targetType: 'StorageBox',
            targetId: (string) $storageBox->id,
            oldValues: $old,
            newValues: $storageBox->only(['name', 'host', 'username', 'mount_path', 'disk_type'])
        );

        return back()->with('message', 'Storage Box bilgileri ve şifresi güncellendi.');
    }

    protected function formatBytes(int|float|null $bytes): string
    {
        if ($bytes === null) {
            return 'Bilinmiyor';
        }
        $bytes = (float) $bytes;
        if ($bytes <= 0) {
            return '0 B';
        }
        $units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
        $i = (int) floor(log($bytes, 1024));
        $i = min(max(0, $i), count($units) - 1);

        return round($bytes / pow(1024, $i), 2) . ' ' . $units[$i];
    }

    public function destroy(StorageBox $storageBox): RedirectResponse
    {
        $this->auditLogService->log(
            action: 'storage_box_deleted',
            targetType: 'StorageBox',
            targetId: (string) $storageBox->id,
            oldValues: $storageBox->only(['id', 'name', 'host'])
        );

        $storageBox->delete();

        return back()->with('message', 'Storage Box silindi.');
    }

    public function scan(StorageBox $storageBox): RedirectResponse
    {
        $result = $this->scannerService->scan($storageBox);

        $this->auditLogService->log(
            action: 'storage_box_scan',
            targetType: 'StorageBox',
            targetId: (string) $storageBox->id,
            newValues: $result
        );

        return back()->with('message', sprintf(
            '%s taraması tamamlandı: %d yeni eklendi, %d güncellendi, %d eksik.',
            $storageBox->name,
            $result['added'],
            $result['updated'],
            $result['missing']
        ));
    }

    public function scanAll(): RedirectResponse
    {
        $result = $this->scannerService->scanAll();

        $this->auditLogService->log(
            action: 'storage_box_scan_all',
            targetType: 'StorageBox',
            targetId: 'all',
            newValues: $result
        );

        return back()->with('message', sprintf(
            'Tüm Storage Box alanları tarandı: %d yeni eklendi, %d güncellendi, %d otomatik keşfedildi.',
            $result['added'],
            $result['updated'],
            $result['discovered_boxes_count']
        ));
    }

    public function addMedia(StorageBox $storageBox, Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'in:movie,series,episode'],
            'year' => ['nullable', 'integer', 'min:1900', 'max:2099'],
            'file_name' => ['required', 'string', 'max:255'],
            'sub_folder' => ['nullable', 'string', 'max:255'],
            'size_mb' => ['required', 'numeric', 'min:1'],
        ]);

        $subFolder = trim($validated['sub_folder'] ?? '', '/\\');
        $relativePath = $subFolder ? "{$subFolder}/{$validated['file_name']}" : $validated['file_name'];
        if ($validated['type'] === 'movie' && ! $subFolder) {
            $relativePath = "Filmler/{$validated['file_name']}";
        } elseif ($validated['type'] !== 'movie' && ! $subFolder) {
            $relativePath = "Diziler/{$validated['file_name']}";
        }

        // Physical directory & file creation on the Storage Box mount path
        $fullPath = rtrim($storageBox->mount_path, '/\\') . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $relativePath);
        $dir = dirname($fullPath);
        if (! file_exists($dir)) {
            mkdir($dir, 0755, true);
        }

        $sizeBytes = (int) round($validated['size_mb'] * 1048576);

        if (! file_exists($fullPath)) {
            $handle = fopen($fullPath, 'w');
            if ($handle) {
                fseek($handle, $sizeBytes - 1);
                fwrite($handle, "\0");
                fclose($handle);
            }
        }

        $localSize = (file_exists($fullPath) && is_file($fullPath)) ? filesize($fullPath) : 0;
        $actualSize = $localSize > 0 ? $localSize : $sizeBytes;

        if ($actualSize <= 0 && $storageBox) {
            $remoteSize = $this->storageBoxService->fetchRemoteFileSize($relativePath, $storageBox);
            if ($remoteSize > 0) {
                $actualSize = $remoteSize;
            }
        }

        $media = Media::create([
            'storage_box_id' => $storageBox->id,
            'type' => $validated['type'] === 'movie' ? MediaType::MOVIE : MediaType::EPISODE,
            'title' => $validated['title'],
            'year' => $validated['year'] ?? null,
            'slug' => Media::generateUniqueSlug($validated['title'], $validated['year'] ?? null),
            'file_path' => $relativePath,
            'file_name' => $validated['file_name'],
            'file_size' => $actualSize,
            'mime_type' => 'video/x-matroska',
            'extension' => pathinfo($validated['file_name'], PATHINFO_EXTENSION) ?: 'mkv',
            'is_active' => true,
            'is_available' => true,
        ]);

        $this->auditLogService->log(
            action: 'media_added_to_storage_box',
            targetType: 'Media',
            targetId: (string) $media->id,
            newValues: $media->toArray()
        );

        return back()->with('message', sprintf(
            '"%s" başarıyla %s Storage Box içerisine eklendi (%s MB).',
            $validated['title'],
            $storageBox->name,
            $validated['size_mb']
        ));
    }

    public function browse(StorageBox $storageBox, Request $request)
    {
        $relativePath = trim($request->query('path', ''), '/\\');
        $cacheKey = "storage_box_browse_{$storageBox->id}_" . md5($relativePath);

        if ($request->boolean('refresh')) {
            Cache::forget($cacheKey);
        }

        $data = Cache::remember($cacheKey, 30, function () use ($storageBox, $relativePath) {
            $directories = [];
            $files = [];

            try {
                $fullPath = $this->storageBoxService->resolveRealPath($relativePath, $storageBox);
                if (file_exists($fullPath) && is_dir($fullPath)) {
                    $videoExtensions = ['mkv', 'mp4', 'avi', 'm4v', 'ts', 'mov'];

                    $existingMediaPaths = Media::where('storage_box_id', $storageBox->id)
                        ->pluck('id', 'file_path')
                        ->toArray();

                    $items = scandir($fullPath);
                    foreach ($items as $item) {
                        if ($item === '.' || $item === '..' || Str::startsWith($item, ['$Recycle', '$RECYCLE', 'System Volume Information', '.Trash', '.git'])) {
                            continue;
                        }

                        $itemFullPath = $fullPath . DIRECTORY_SEPARATOR . $item;
                        $itemRelativePath = $relativePath ? "{$relativePath}/{$item}" : $item;

                        if (is_dir($itemFullPath)) {
                            $directories[] = [
                                'name' => $item,
                                'relative_path' => $itemRelativePath,
                            ];
                        } elseif (is_file($itemFullPath)) {
                            $ext = strtolower(pathinfo($item, PATHINFO_EXTENSION));
                            if (in_array($ext, $videoExtensions)) {
                                $sizeBytes = filesize($itemFullPath);
                                $files[] = [
                                    'name' => $item,
                                    'relative_path' => $itemRelativePath,
                                    'extension' => $ext,
                                    'size_bytes' => $sizeBytes,
                                    'size_formatted' => round($sizeBytes / (1024 * 1024 * 1024), 2) . ' GB',
                                    'is_added' => isset($existingMediaPaths[$itemRelativePath]),
                                    'media_id' => $existingMediaPaths[$itemRelativePath] ?? null,
                                ];
                            }
                        }
                    }
                }
            } catch (\Exception $e) {
                // Local path error fallback to WebDAV/FTP
            }

            // Fallback: Connect directly to Hetzner Storage Box via WebDAV first (fastest HTTPS), then FTP
            if (count($directories) === 0 && count($files) === 0 && ! empty($storageBox->host) && ! empty($storageBox->username)) {
                $remoteResult = $this->browseRemoteWebdav($storageBox, $relativePath);
                if (! $remoteResult) {
                    $remoteResult = $this->browseRemoteFtp($storageBox, $relativePath);
                }
                if ($remoteResult) {
                    return $remoteResult;
                }
            }

            $parentPath = '';
            if ($relativePath !== '') {
                $parts = explode('/', $relativePath);
                array_pop($parts);
                $parentPath = implode('/', $parts);
            }

            return [
                'status' => 'success',
                'storage_box' => [
                    'id' => $storageBox->id,
                    'name' => $storageBox->name,
                    'mount_path' => $storageBox->mount_path,
                ],
                'current_path' => $relativePath,
                'parent_path' => $parentPath,
                'directories' => $directories,
                'files' => $files,
            ];
        });

        return response()->json($data);
    }

    protected function browseRemoteFtp(StorageBox $storageBox, string $relativePath = ''): ?array
    {
        if (! \function_exists('ftp_connect')) {
            return null;
        }

        if (empty($storageBox->host) || empty($storageBox->username) || empty($storageBox->password)) {
            return null;
        }

        $host = $storageBox->host;
        $port = $storageBox->port ?: 21;
        $user = $storageBox->username;
        $pass = $storageBox->password;

        $conn = @\ftp_connect($host, $port, 2);
        if (! $conn && \function_exists('ftp_ssl_connect')) {
            $conn = @\ftp_ssl_connect($host, $port, 2);
        }

        if (! $conn) {
            return null;
        }

        if (! @\ftp_login($conn, $user, $pass)) {
            @\ftp_close($conn);
            return null;
        }

        @\ftp_pasv($conn, true);

        $targetPath = '/' . trim(str_replace('\\', '/', $relativePath), '/');

        $rawItems = @\ftp_rawlist($conn, $targetPath ?: '.');

        if ($rawItems === false) {
            @\ftp_close($conn);
            return null;
        }

        $directories = [];
        $files = [];
        $videoExtensions = ['mkv', 'mp4', 'avi', 'm4v', 'ts', 'mov'];

        $existingMediaPaths = Media::where('storage_box_id', $storageBox->id)
            ->pluck('id', 'file_path')
            ->toArray();

        foreach ($rawItems as $line) {
            if (preg_match('/^([drw-]{10})\s+\d+\s+\S+\s+\S+\s+(\d+)\s+\S+\s+\d+\s+[\d:]+\s+(.+)$/', $line, $matches)) {
                $isDir = str_starts_with($matches[1], 'd');
                $sizeBytes = (int) $matches[2];
                $name = trim($matches[3]);
            } elseif (preg_match('/^([drw-]{10}).*\s+(.+)$/', $line, $matches)) {
                $isDir = str_starts_with($matches[1], 'd');
                $sizeBytes = 0;
                $name = trim($matches[2]);
            } else {
                continue;
            }

            if ($name === '.' || $name === '..' || Str::startsWith($name, ['$Recycle', '$RECYCLE', 'System Volume Information', '.Trash', '.git'])) {
                continue;
            }

            $itemRelativePath = $relativePath ? "{$relativePath}/{$name}" : $name;

            if ($isDir) {
                $directories[] = [
                    'name' => $name,
                    'relative_path' => $itemRelativePath,
                ];
            } else {
                $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                if (in_array($ext, $videoExtensions)) {
                    $files[] = [
                        'name' => $name,
                        'relative_path' => $itemRelativePath,
                        'extension' => $ext,
                        'size_bytes' => $sizeBytes,
                        'size_formatted' => round($sizeBytes / (1024 * 1024 * 1024), 2) . ' GB',
                        'is_added' => isset($existingMediaPaths[$itemRelativePath]),
                        'media_id' => $existingMediaPaths[$itemRelativePath] ?? null,
                    ];
                }
            }
        }

        @\ftp_close($conn);

        $parentPath = '';
        if ($relativePath !== '') {
            $parts = explode('/', $relativePath);
            array_pop($parts);
            $parentPath = implode('/', $parts);
        }

        return [
            'status' => 'success',
            'storage_box' => [
                'id' => $storageBox->id,
                'name' => $storageBox->name,
                'mount_path' => $storageBox->mount_path,
            ],
            'current_path' => $relativePath,
            'parent_path' => $parentPath,
            'directories' => $directories,
            'files' => $files,
        ];
    }

    protected function browseRemoteWebdav(StorageBox $storageBox, string $relativePath = ''): ?array
    {
        if (empty($storageBox->host) || empty($storageBox->username) || empty($storageBox->password)) {
            return null;
        }

        $user = $storageBox->username;
        $pass = $storageBox->password;

        $host = $storageBox->host;
        $pathSegments = explode('/', trim(str_replace('\\', '/', $relativePath), '/'));
        $cleanPath = implode('/', array_map('rawurlencode', array_filter($pathSegments, fn ($s) => $s !== '')));

        if (! str_starts_with($host, 'http://') && ! str_starts_with($host, 'https://')) {
            $url = "https://{$host}/" . ($cleanPath ? $cleanPath . '/' : '');
        } else {
            $url = rtrim($host, '/') . '/' . ($cleanPath ? $cleanPath . '/' : '');
        }

        $url = rtrim($url, '/') . '/';

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
            return null;
        }

        $xmlContent = preg_replace('/(<\/?)(\w+):([^>]*>)/', '$1$3', $response);
        $xml = @simplexml_load_string($xmlContent);

        if (! $xml || ! isset($xml->response)) {
            return null;
        }

        $directories = [];
        $files = [];
        $videoExtensions = ['mkv', 'mp4', 'avi', 'm4v', 'ts', 'mov'];

        $existingMediaPaths = Media::where('storage_box_id', $storageBox->id)
            ->pluck('id', 'file_path')
            ->toArray();

        foreach ($xml->response as $resp) {
            $href = rawurldecode((string) $resp->href);
            $hrefPath = trim(parse_url($href, PHP_URL_PATH) ?: $href, '/');
            $name = basename($hrefPath);

            if (empty($name) || $name === '.' || $name === '..' || Str::startsWith($name, ['$Recycle', '$RECYCLE', 'System Volume Information', '.Trash', '.git'])) {
                continue;
            }

            $currentRelativeClean = trim(str_replace('\\', '/', $relativePath), '/');
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

            $itemRelativePath = $relativePath ? "{$relativePath}/{$name}" : $name;

            if ($isDir) {
                if (! collect($directories)->contains('name', $name)) {
                    $directories[] = [
                        'name' => $name,
                        'relative_path' => $itemRelativePath,
                    ];
                }
            } else {
                $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
                if (in_array($ext, $videoExtensions)) {
                    if (! collect($files)->contains('name', $name)) {
                        $files[] = [
                            'name' => $name,
                            'relative_path' => $itemRelativePath,
                            'extension' => $ext,
                            'size_bytes' => $sizeBytes,
                            'size_formatted' => round($sizeBytes / (1024 * 1024 * 1024), 2) . ' GB',
                            'is_added' => isset($existingMediaPaths[$itemRelativePath]),
                            'media_id' => $existingMediaPaths[$itemRelativePath] ?? null,
                        ];
                    }
                }
            }
        }

        $parentPath = '';
        if ($relativePath !== '') {
            $parts = explode('/', $relativePath);
            array_pop($parts);
            $parentPath = implode('/', $parts);
        }

        return [
            'status' => 'success',
            'storage_box' => [
                'id' => $storageBox->id,
                'name' => $storageBox->name,
                'mount_path' => $storageBox->mount_path,
            ],
            'current_path' => $relativePath,
            'parent_path' => $parentPath,
            'directories' => $directories,
            'files' => $files,
        ];
    }

    /**
     * Inspect remote URL and return detected filename and size.
     */
    public function probeUrl(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'url' => ['required', 'url', 'max:2000'],
        ]);

        $probe = $this->remoteTransferService->probeUrl($validated['url']);

        return response()->json($probe);
    }

    /**
     * Start a remote file transfer job into chosen Storage Box and folder.
     */
    public function startRemoteTransfer(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'source_url' => ['required', 'url', 'max:2000'],
            'storage_box_id' => ['required'],
            'target_folder' => ['nullable', 'string', 'max:255'],
            'file_name' => ['required', 'string', 'max:255'],
            'auto_add_media' => ['nullable', 'boolean'],
        ]);

        $folder = trim($validated['target_folder'] ?? 'Filmler', '/\\');
        $fileName = trim($validated['file_name']);

        // Probe size
        $probe = $this->remoteTransferService->probeUrl($validated['source_url']);
        $totalBytes = $probe['file_size'] ?? 0;

        try {
            $storageBox = $this->remoteTransferService->selectStorageBox($validated['storage_box_id'], $totalBytes);
        } catch (Exception $e) {
            return back()->withErrors(['storage_box_id' => $e->getMessage()]);
        }

        $relativePath = ($folder ? $folder . '/' : '') . $fileName;

        // Check if identical file with same name and same size already exists
        $existingSize = ($totalBytes > 0)
            ? $this->remoteTransferService->getExistingFileMatchingSize($storageBox, $folder, $fileName, $totalBytes)
            : null;

        if ($existingSize !== null) {
            $autoAdd = $request->boolean('auto_add_media', true);
            $transfer = RemoteTransfer::create([
                'storage_box_id' => $storageBox->id,
                'source_url' => $validated['source_url'],
                'target_folder' => $folder ?: 'Filmler',
                'file_name' => $fileName,
                'relative_path' => $relativePath,
                'total_bytes' => $totalBytes,
                'transferred_bytes' => $totalBytes,
                'progress_percent' => 100.00,
                'speed_bps' => 0,
                'status' => 'completed',
                'auto_add_media' => $autoAdd,
                'error_message' => 'Dosya hedef Storage Box üzerinde aynı isim ve boyutta zaten mevcut. Yeniden aktarılmadı.',
            ]);

            if ($autoAdd) {
                $this->remoteTransferService->registerMedia($transfer, $storageBox);
            }

            $this->auditLogService->log(
                action: 'remote_transfer_skipped_duplicate',
                targetType: 'RemoteTransfer',
                targetId: (string) $transfer->id,
                newValues: $transfer->toArray()
            );

            return back()->with('message', sprintf(
                '"%s" adlı dosya (%s) hedef depolama alanında aynı boyutta zaten mevcut olduğu için doğrudan yüklendi olarak işaretlendi.',
                $fileName,
                $this->remoteTransferService->formatBytes($totalBytes)
            ));
        }

        $transfer = RemoteTransfer::create([
            'storage_box_id' => $storageBox->id,
            'source_url' => $validated['source_url'],
            'target_folder' => $folder ?: 'Filmler',
            'file_name' => $fileName,
            'relative_path' => $relativePath,
            'total_bytes' => $totalBytes,
            'transferred_bytes' => 0,
            'progress_percent' => 0.00,
            'speed_bps' => 0,
            'status' => 'pending',
            'auto_add_media' => $request->boolean('auto_add_media', true),
        ]);

        // Dispatch background worker job and spawn runner if queue slots available
        ProcessRemoteTransferJob::dispatch($transfer);
        $this->remoteTransferService->processQueue();

        $this->auditLogService->log(
            action: 'remote_transfer_started',
            targetType: 'RemoteTransfer',
            targetId: (string) $transfer->id,
            newValues: $transfer->toArray()
        );

        $isRandom = in_array($validated['storage_box_id'], ['random', 'auto']);
        $boxMsg = $isRandom ? "{$storageBox->name} (Rastgele / Boş Alana Sahip)" : $storageBox->name;

        return back()->with('message', sprintf(
            '"%s" dosyasının %s içerisine aktarımı arka planda başlatıldı.',
            $fileName,
            $boxMsg
        ));
    }

    /**
     * Start bulk remote file transfer jobs into chosen Storage Box.
     */
    public function startBulkRemoteTransfer(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'urls' => ['required', 'string'],
            'storage_box_id' => ['required'],
            'target_folder' => ['nullable', 'string', 'max:255'],
            'auto_add_media' => ['nullable', 'boolean'],
        ]);

        $boxMode = $validated['storage_box_id'];
        $folder = trim($validated['target_folder'] ?? 'Filmler', '/\\');

        $result = $this->remoteTransferService->createBulkTransfers(
            rawUrls: $validated['urls'],
            storageBox: in_array($boxMode, ['random', 'auto']) ? 'random' : StorageBox::findOrFail($boxMode),
            targetFolder: $folder,
            autoAddMedia: $request->boolean('auto_add_media', true)
        );

        // Advance queue processes
        $this->remoteTransferService->processQueue();

        if ($result['queued'] === 0) {
            return back()->with('message', 'Geçerli bir URL bulunamadı veya aktarıma uygun link tespit edilemedi.');
        }

        $boxLabel = in_array($boxMode, ['random', 'auto']) ? 'Rastgele / Boş Alanlı Storage Boxlar' : 'Storage Box';

        return back()->with('message', sprintf(
            'Toplam %d adet indirme linki %s için başarıyla kuyruğa eklendi. Sırayla aktarılacaktır.',
            $result['queued'],
            $boxLabel
        ));
    }

    /**
     * Get real-time progress for active and recent transfers with pagination.
     */
    public function getTransfers(Request $request): JsonResponse
    {
        // Advance queue if there are pending transfers
        if (RemoteTransfer::where('status', 'pending')->exists()) {
            $this->remoteTransferService->processQueue();
        }

        $perPage = (int) $request->input('per_page', 10);
        $paginated = RemoteTransfer::with('storageBox')
            ->latest()
            ->paginate($perPage);

        $transfers = $paginated->getCollection()->map(fn ($t) => [
            'id' => $t->id,
            'storage_box_id' => $t->storage_box_id,
            'storage_box_name' => $t->storageBox?->name ?? 'Bilinmiyor',
            'source_url' => $t->source_url,
            'target_folder' => $t->target_folder,
            'file_name' => $t->file_name,
            'relative_path' => $t->relative_path,
            'total_bytes' => $t->total_bytes,
            'total_formatted' => $this->remoteTransferService->formatBytes($t->total_bytes),
            'transferred_bytes' => $t->transferred_bytes,
            'transferred_formatted' => $this->remoteTransferService->formatBytes($t->transferred_bytes),
            'progress_percent' => $t->progress_percent,
            'speed_bps' => $t->speed_bps,
            'speed_formatted' => $this->remoteTransferService->formatBytes($t->speed_bps) . '/s',
            'status' => $t->status,
            'error_message' => $t->error_message,
            'media_id' => $t->media_id,
            'created_at' => $t->created_at?->diffForHumans(),
        ]);

        return response()->json([
            'transfers' => $transfers,
            'pagination' => [
                'current_page' => $paginated->currentPage(),
                'last_page' => $paginated->lastPage(),
                'per_page' => $paginated->perPage(),
                'total' => $paginated->total(),
            ],
            'has_active' => RemoteTransfer::whereIn('status', ['pending', 'transferring'])->exists(),
        ]);
    }

    /**
     * Bulk delete remote transfers. If active transfers are present, cancels them first and then deletes.
     */
    public function bulkDeleteTransfers(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer', 'exists:remote_transfers,id'],
        ]);

        $transfers = RemoteTransfer::with('storageBox')->whereIn('id', $validated['ids'])->get();

        // 1. Önce aktif çalışan veya kuyrukta bekleyen transferleri tespit edip iptal et
        $activeTransfers = $transfers->filter(fn ($t) => in_array($t->status, ['pending', 'transferring']));

        foreach ($activeTransfers as $transfer) {
            $this->remoteTransferService->cancelTransfer($transfer);
        }

        // 2. Ardından tüm seçilen kayıtları veritabanı kuyruğundan sil (tamamlanmış dosyalar ASLA silinmez)
        foreach ($transfers as $transfer) {
            $transfer->delete();
        }

        return response()->json([
            'status' => 'success',
            'cancelled_count' => $activeTransfers->count(),
            'deleted_count' => count($validated['ids']),
        ]);
    }

    /**
     * Bulk cancel active remote transfers without deleting.
     */
    public function bulkCancelTransfers(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer', 'exists:remote_transfers,id'],
        ]);

        $transfers = RemoteTransfer::with('storageBox')->whereIn('id', $validated['ids'])->get();
        $cancelledCount = 0;

        foreach ($transfers as $transfer) {
            if (in_array($transfer->status, ['pending', 'transferring'])) {
                $this->remoteTransferService->cancelTransfer($transfer);
                $cancelledCount++;
            }
        }

        return response()->json([
            'status' => 'success',
            'cancelled_count' => $cancelledCount,
        ]);
    }

    /**
     * Cancel or delete a transfer.
     */
    public function cancelTransfer(RemoteTransfer $transfer): JsonResponse
    {
        if (in_array($transfer->status, ['pending', 'transferring'])) {
            $this->remoteTransferService->cancelTransfer($transfer);
        } else {
            // Tamamlanmış veya eski transfer kaydı: SADECE kuyruk logunu sil, yüklenen dosyaya KESİNLİKLE dokunma!
            $transfer->delete();
        }

        return response()->json(['status' => 'success']);
    }
}

