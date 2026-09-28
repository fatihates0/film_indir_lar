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
        $boxes = StorageBox::withCount('media')
            ->withSum('media', 'file_size')
            ->orderBy('id', 'desc')
            ->get()
            ->map(function ($box) {
                $isMounted = $this->storageBoxService->isMounted($box);
                $box->status = $isMounted ? 'online' : 'offline';
                $box->save();

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
                    'total_gb' => round(($box->media_sum_file_size ?? 0) / 1073741824, 2),
                ];
            });

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
        ]);

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
        ]);

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
            'storage_box_id' => ['required', 'exists:storage_boxes,id'],
            'target_folder' => ['nullable', 'string', 'max:255'],
            'file_name' => ['required', 'string', 'max:255'],
            'auto_add_media' => ['nullable', 'boolean'],
        ]);

        $storageBox = StorageBox::findOrFail($validated['storage_box_id']);
        $folder = trim($validated['target_folder'] ?? 'Filmler', '/\\');
        $fileName = trim($validated['file_name']);

        // Probe size
        $probe = $this->remoteTransferService->probeUrl($validated['source_url']);
        $totalBytes = $probe['file_size'] ?? 0;

        $relativePath = ($folder ? $folder . '/' : '') . $fileName;

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

        // Dispatch background worker job
        ProcessRemoteTransferJob::dispatch($transfer);

        $this->auditLogService->log(
            action: 'remote_transfer_started',
            targetType: 'RemoteTransfer',
            targetId: (string) $transfer->id,
            newValues: $transfer->toArray()
        );

        return back()->with('message', sprintf(
            '"%s" dosyasının %s içerisine aktarımı arka planda başlatıldı.',
            $fileName,
            $storageBox->name
        ));
    }

    /**
     * Start bulk remote file transfer jobs into chosen Storage Box.
     */
    public function startBulkRemoteTransfer(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'urls' => ['required', 'string'],
            'storage_box_id' => ['required', 'exists:storage_boxes,id'],
            'target_folder' => ['nullable', 'string', 'max:255'],
            'auto_add_media' => ['nullable', 'boolean'],
        ]);

        $storageBox = StorageBox::findOrFail($validated['storage_box_id']);
        $folder = trim($validated['target_folder'] ?? 'Filmler', '/\\');

        $result = $this->remoteTransferService->createBulkTransfers(
            rawUrls: $validated['urls'],
            storageBox: $storageBox,
            targetFolder: $folder,
            autoAddMedia: $request->boolean('auto_add_media', true)
        );

        if ($result['queued'] === 0) {
            return back()->with('message', 'Geçerli bir URL bulunamadı veya aktarıma uygun link tespit edilemedi.');
        }

        return back()->with('message', sprintf(
            'Toplam %d adet indirme linki %s için başarıyla kuyruğa eklendi. Sırayla aktarılacaktır.',
            $result['queued'],
            $storageBox->name
        ));
    }

    /**
     * Get real-time progress for active and recent transfers with pagination.
     */
    public function getTransfers(Request $request): JsonResponse
    {
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
     * Bulk delete remote transfers.
     */
    public function bulkDeleteTransfers(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => ['required', 'array'],
            'ids.*' => ['integer', 'exists:remote_transfers,id'],
        ]);

        $transfers = RemoteTransfer::whereIn('id', $validated['ids'])->get();

        foreach ($transfers as $transfer) {
            if (in_array($transfer->status, ['pending', 'transferring'])) {
                $transfer->update(['status' => 'cancelled']);
            }
            $transfer->delete();
        }

        return response()->json([
            'status' => 'success',
            'deleted_count' => count($validated['ids']),
        ]);
    }

    /**
     * Cancel or delete a transfer.
     */
    public function cancelTransfer(RemoteTransfer $transfer): JsonResponse
    {
        if (in_array($transfer->status, ['pending', 'transferring'])) {
            $transfer->update([
                'status' => 'cancelled',
                'error_message' => 'Kullanıcı tarafından iptal edildi.',
            ]);
        } else {
            $transfer->delete();
        }

        return response()->json(['status' => 'success']);
    }
}

