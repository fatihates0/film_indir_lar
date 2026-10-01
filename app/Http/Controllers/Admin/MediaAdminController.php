<?php

namespace App\Http\Controllers\Admin;

use App\Enums\MediaType;
use App\Http\Controllers\Controller;
use App\Jobs\MediaScanJob;
use App\Models\Media;
use App\Models\MediaScan;
use App\Models\StorageBox;
use App\Services\AuditLogService;
use App\Services\DownloadAuthorizationService;
use App\Services\MediaScannerService;
use App\Services\StorageBoxService;
use App\Services\TmdbService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class MediaAdminController extends Controller
{
    public function __construct(
        protected MediaScannerService $scannerService,
        protected StorageBoxService $storageBoxService,
        protected AuditLogService $auditLogService,
        protected TmdbService $tmdbService,
        protected DownloadAuthorizationService $downloadAuthService,
    ) {}

    public function index(Request $request): Response
    {
        $query = Media::with('storageBox')->orderBy('id', 'desc');

        if ($request->filled('search')) {
            $search = trim($request->search);
            $dotSearch = str_replace(' ', '.', $search);
            $underscoreSearch = str_replace(' ', '_', $search);
            $dashSearch = str_replace(' ', '-', $search);

            $query->where(function ($q) use ($search, $dotSearch, $underscoreSearch, $dashSearch) {
                $q->where('title', 'like', '%'.$search.'%')
                    ->orWhere('original_title', 'like', '%'.$search.'%')
                    ->orWhere('imdb_id', 'like', '%'.$search.'%')
                    ->orWhere('file_name', 'like', '%'.$search.'%')
                    ->orWhere('file_name', 'like', '%'.$dotSearch.'%')
                    ->orWhere('file_name', 'like', '%'.$underscoreSearch.'%')
                    ->orWhere('file_name', 'like', '%'.$dashSearch.'%')
                    ->orWhere('file_path', 'like', '%'.$search.'%')
                    ->orWhere('file_path', 'like', '%'.$dotSearch.'%')
                    ->orWhere('file_path', 'like', '%'.$underscoreSearch.'%')
                    ->orWhere('file_path', 'like', '%'.$dashSearch.'%');

                if (is_numeric($search)) {
                    $q->orWhere('tmdb_id', (int) $search);
                }
            });
        }

        if ($request->filled('tmdb_filter')) {
            $tmdbFilter = $request->tmdb_filter;
            if ($tmdbFilter === 'missing') {
                $query->where(function ($q) {
                    $q->whereNull('tmdb_id')->orWhere('tmdb_id', 0);
                });
            } elseif ($tmdbFilter === 'synced') {
                $query->whereNotNull('tmdb_id')->where('tmdb_id', '>', 0);
            }
        }

        $allMatching = $query->get();

        if ($request->filled('search') && $allMatching->isNotEmpty()) {
            $matchedTmdbIds = $allMatching->pluck('tmdb_id')->filter()->unique()->toArray();
            $matchedSlugs = $allMatching->map(fn ($m) => Str::slug($m->title))->filter()->unique()->toArray();

            $siblingMedia = Media::with('storageBox')
                ->where(function ($q) use ($matchedTmdbIds, $matchedSlugs) {
                    if (! empty($matchedTmdbIds)) {
                        $q->whereIn('tmdb_id', $matchedTmdbIds);
                    }
                    if (! empty($matchedSlugs)) {
                        foreach ($matchedSlugs as $slug) {
                            $q->orWhere('title', 'like', '%'.str_replace('-', '%', $slug).'%');
                        }
                    }
                })
                ->get();

            $allMatching = $allMatching->merge($siblingMedia)->unique('id');
        }

        if ($request->filled('tmdb_filter') && $request->tmdb_filter === 'suspicious') {
            $allMatching = $allMatching->filter(function ($item) {
                return $item->tmdb_match_status['status'] === 'suspicious';
            });
        }

        // Group media items by TMDB ID or title slug
        $grouped = $allMatching->groupBy(function ($item) {
            return $item->tmdb_id ? 'tmdb_'.$item->tmdb_id : 'title_'.Str::slug($item->title);
        })->map(function ($items) {
            // Pick representative item (prefer poster available, highest quality)
            $rep = $items->sortByDesc(function ($item) {
                $score = 0;
                if ($item->poster_path) {
                    $score += 10;
                }
                if (preg_match('/2160p|4k/i', $item->quality_label)) {
                    $score += 4;
                } elseif (preg_match('/remux/i', $item->quality_label)) {
                    $score += 3;
                } elseif (preg_match('/1080p/i', $item->quality_label)) {
                    $score += 2;
                }

                return $score;
            })->first();

            $qualityOrder = [
                'm720p HD' => 1,
                '720p HD' => 2,
                'm1080p HD' => 3,
                '1080p Full HD' => 4,
                '1080p REMUX' => 5,
                '4K Ultra HD' => 6,
            ];

            $qualities = $items->pluck('quality_label')->unique()->sortBy(function ($q) use ($qualityOrder) {
                return $qualityOrder[$q] ?? 99;
            })->values()->toArray();

            $seasons = $items->pluck('season_number')->filter()->unique()->sort()->values()->toArray();
            $episodesCount = $items->pluck('episode_number')->filter()->unique()->count();

            $isSeries = $rep->type->value === 'series'
                || $rep->type->value === 'episode'
                || count($seasons) > 0
                || $episodesCount > 0;

            // Sort version items (Season/Episode order for series, Quality/Size order for movies - ascending)
            if ($isSeries) {
                $sortedVersions = $items->sortBy(function ($ver) {
                    $s = $ver->season_number ?? 1;
                    $e = $ver->episode_number ?? 0;
                    $score = 2;
                    $cleanName = strtolower($ver->file_name ?? '');
                    $qLabel = $ver->quality_label;

                    if (preg_match('/2160p|4k|uhd/i', $qLabel) || str_contains($cleanName, '2160p') || str_contains($cleanName, '4k')) {
                        $score = 6;
                    } elseif (str_contains($cleanName, 'remux') || str_contains(strtolower($qLabel), 'remux')) {
                        $score = 5;
                    } elseif (str_contains($cleanName, 'm1080p') || $qLabel === 'm1080p HD') {
                        $score = 3;
                    } elseif (preg_match('/1080p/i', $qLabel) || str_contains($cleanName, '1080p')) {
                        $score = 4;
                    } elseif (str_contains($cleanName, 'm720p') || $qLabel === 'm720p HD') {
                        $score = 1;
                    } elseif (preg_match('/720p/i', $qLabel) || str_contains($cleanName, '720p')) {
                        $score = 2;
                    }

                    return $s * 10000000 + $e * 100 + $score;
                })->values();
            } else {
                $sortedVersions = $items->sortBy(function ($ver) {
                    $score = 2;
                    $cleanName = strtolower($ver->file_name ?? '');
                    $qLabel = $ver->quality_label;

                    if (preg_match('/2160p|4k|uhd/i', $qLabel) || str_contains($cleanName, '2160p') || str_contains($cleanName, '4k')) {
                        $score = 6;
                    } elseif (str_contains($cleanName, 'remux') || str_contains(strtolower($qLabel), 'remux')) {
                        $score = 5;
                    } elseif (str_contains($cleanName, 'm1080p') || $qLabel === 'm1080p HD') {
                        $score = 3;
                    } elseif (preg_match('/1080p/i', $qLabel) || str_contains($cleanName, '1080p')) {
                        $score = 4;
                    } elseif (str_contains($cleanName, 'm720p') || $qLabel === 'm720p HD') {
                        $score = 1;
                    } elseif (preg_match('/720p/i', $qLabel) || str_contains($cleanName, '720p')) {
                        $score = 2;
                    }

                    return $score * 100000000000 + ($ver->file_size ?? 0);
                })->values();
            }

            $rep->versions = $sortedVersions->map(function ($ver) {
                return [
                    'id' => $ver->id,
                    'title' => $ver->title,
                    'file_name' => $ver->file_name,
                    'file_path' => $ver->file_path,
                    'file_size' => $ver->file_size,
                    'quality_label' => $ver->quality_label,
                    'season_number' => $ver->season_number,
                    'episode_number' => $ver->episode_number,
                    'storage_box' => $ver->storageBox ? [
                        'id' => $ver->storageBox->id,
                        'name' => $ver->storageBox->name,
                    ] : null,
                    'is_active' => $ver->is_active,
                    'is_available' => $ver->is_available,
                    'tmdb_id' => $ver->tmdb_id,
                    'vote_average' => $ver->vote_average,
                    'created_at' => $ver->created_at?->format('d.m.Y H:i'),
                ];
            })->toArray();

            $rep->group_info = [
                'versions_count' => $items->count(),
                'qualities' => $qualities,
                'seasons' => $seasons,
                'episodes_count' => $episodesCount,
                'total_size_bytes' => $items->sum('file_size'),
                'is_series' => $isSeries,
            ];

            return $rep;
        })->values();

        // Sort grouped collection by latest ID
        $grouped = $grouped->sortByDesc('id')->values();

        $page = (int) $request->input('page', 1);
        $perPageInput = $request->input('per_page', 10);
        if ($perPageInput === 'all') {
            $perPage = max(1, $grouped->count());
        } else {
            $perPage = max(1, (int) $perPageInput);
        }

        $media = new LengthAwarePaginator(
            $grouped->forPage($page, $perPage)->values(),
            $grouped->count(),
            $perPage,
            $page,
            ['path' => $request->url(), 'query' => $request->query()]
        );

        $storageBoxes = StorageBox::where('is_active', true)
            ->get()
            ->map(function ($box) {
                $isOnline = $this->storageBoxService->isMounted($box);
                $status = $isOnline ? 'online' : 'offline';
                if ($box->status !== $status) {
                    $box->update(['status' => $status]);
                }

                return [
                    'id' => $box->id,
                    'name' => $box->name,
                    'host' => $box->host,
                    'mount_path' => $box->mount_path,
                    'disk_type' => $box->disk_type,
                    'status' => $status,
                ];
            });

        $allMedia = Media::all();
        $unsyncedCount = $allMedia->whereNull('tmdb_id')->count() + $allMedia->where('tmdb_id', 0)->count();
        $suspiciousCount = $allMedia->filter(fn ($m) => $m->tmdb_match_status['status'] === 'suspicious')->count();

        $activeScan = MediaScan::with('storageBox')
            ->whereIn('status', ['pending', 'running'])
            ->latest()
            ->first();

        return Inertia::render('Admin/Media/Index', [
            'media' => $media,
            'storageBoxes' => $storageBoxes,
            'unsyncedCount' => $unsyncedCount,
            'suspiciousCount' => $suspiciousCount,
            'activeScan' => $activeScan,
            'filters' => $request->only(['search', 'per_page', 'tmdb_filter']),
        ]);
    }

    public function probe(Request $request)
    {
        $validated = $request->validate([
            'storage_box_id' => ['required', 'exists:storage_boxes,id'],
            'file_path' => ['required', 'string'],
        ]);

        $storageBox = StorageBox::findOrFail($validated['storage_box_id']);

        try {
            $meta = $this->storageBoxService->probeMetadata($validated['file_path'], $storageBox);
            $fileName = basename($validated['file_path']);
            $title = pathinfo($fileName, PATHINFO_FILENAME);

            $type = 'movie';
            if (Str::contains($validated['file_path'], ['Diziler', 'Series', 'TV Shows'], true) || preg_match('/S\d+E\d+/i', $fileName)) {
                $type = 'episode';
            }

            $year = null;
            if (preg_match('/\(?(\d{4})\)?/', $title, $matches)) {
                $year = (int) $matches[1];
            }

            // Auto lookup on TMDB
            $tmdbMatches = $this->tmdbService->search($title, $type === 'movie' ? 'movie' : 'tv', $year);

            return response()->json([
                'status' => 'success',
                'title' => $title,
                'type' => $type,
                'year' => $year,
                'metadata' => $meta,
                'tmdb_matches' => array_slice($tmdbMatches, 0, 5),
            ]);
        } catch (\Exception $e) {
            return response()->json([
                'status' => 'error',
                'message' => $e->getMessage(),
            ], 400);
        }
    }

    public function store(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'storage_box_id' => ['required', 'exists:storage_boxes,id'],
            'file_path' => ['required', 'string'],
            'title' => ['required', 'string', 'max:255'],
            'type' => ['required', 'string', 'in:movie,series,episode'],
            'year' => ['nullable', 'integer', 'min:1900', 'max:2099'],
            'file_size' => ['nullable', 'integer'],
            'tmdb_id' => ['nullable', 'integer'],
        ]);

        $storageBox = StorageBox::findOrFail($validated['storage_box_id']);
        $fullPath = null;
        try {
            $fullPath = $this->storageBoxService->resolveRealPath($validated['file_path'], $storageBox);
        } catch (\Exception $e) {
            // ignore
        }

        $fileSize = ($fullPath && file_exists($fullPath)) ? filesize($fullPath) : (int) ($validated['file_size'] ?? 0);
        $fileName = basename($validated['file_path']);
        $ext = strtolower(pathinfo($fileName, PATHINFO_EXTENSION));

        $meta = [];
        try {
            $meta = $this->storageBoxService->probeMetadata($validated['file_path'], $storageBox);
            if (! empty($meta['file_size']) && $meta['file_size'] > 0) {
                $fileSize = $meta['file_size'];
            }
        } catch (\Exception $e) {
            // fallback if ffprobe not available
        }

        $mediaType = $validated['type'] === 'movie' ? MediaType::MOVIE : MediaType::EPISODE;

        $existing = Media::where('storage_box_id', $storageBox->id)
            ->where('file_path', $validated['file_path'])
            ->first();

        if ($existing) {
            $existing->update([
                'title' => $validated['title'],
                'type' => $mediaType,
                'year' => $validated['year'],
                'is_available' => true,
                'file_size' => $fileSize,
            ]);
            $media = $existing;
        } else {
            $media = Media::create([
                'storage_box_id' => $storageBox->id,
                'type' => $mediaType,
                'title' => $validated['title'],
                'year' => $validated['year'],
                'tmdb_id' => $validated['tmdb_id'] ?? null,
                'slug' => Media::generateUniqueSlug($validated['title'], $validated['year']),
                'file_path' => $validated['file_path'],
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
        }

        // Fetch TMDB details automatically
        try {
            $this->tmdbService->fetchAndApply($media, $validated['tmdb_id'] ?? null);
        } catch (\Exception $e) {
            // Log fallback
        }

        $this->auditLogService->log(
            action: 'media_manually_added',
            targetType: 'Media',
            targetId: (string) $media->id,
            newValues: $media->toArray()
        );

        return back()->with('message', sprintf('"%s" kütüphaneye ve TMDB sistemine başarıyla eklendi.', $media->title));
    }

    public function searchTmdb(Request $request): JsonResponse
    {
        $request->validate([
            'query' => ['required', 'string', 'min:1'],
            'type' => ['nullable', 'string', 'in:movie,series,episode,multi'],
            'year' => ['nullable', 'integer'],
        ]);

        $type = $request->query('type', 'multi');
        $results = $this->tmdbService->searchByQueryOrId($request->input('query'), $type, $request->input('year'));

        return response()->json([
            'status' => 'success',
            'results' => array_slice($results, 0, 10),
        ]);
    }

    public function syncTmdb(Request $request, Media $media): JsonResponse|RedirectResponse
    {
        $tmdbId = $request->input('tmdb_id');
        $targetTmdbId = $tmdbId ? (int) $tmdbId : null;

        $groupItems = collect([$media]);
        if ($media->tmdb_id) {
            $groupItems = Media::where('tmdb_id', $media->tmdb_id)->get();
        } else {
            $targetSlug = Str::slug($media->title);
            $groupItems = Media::all()->filter(function ($item) use ($targetSlug) {
                return Str::slug($item->title) === $targetSlug;
            });
        }

        if ($groupItems->isEmpty()) {
            $groupItems = collect([$media]);
        }

        $successCount = 0;
        foreach ($groupItems as $item) {
            if ($this->tmdbService->fetchAndApply($item, $targetTmdbId)) {
                $successCount++;
            }
        }

        $success = $successCount > 0;

        if ($request->wantsJson() || $request->expectsJson()) {
            return response()->json([
                'success' => $success,
                'message' => $success
                    ? sprintf('"%s" TMDB bilgileri güncellendi.', $media->title)
                    : sprintf('"%s" için TMDB bilgisi bulunamadı.', $media->title),
            ]);
        }

        if ($success) {
            return back()->with('message', sprintf('"%s" TMDB bilgileri güncellendi.', $media->title));
        }

        return back()->with('error', sprintf('"%s" için TMDB bilgisi bulunamadı.', $media->title));
    }

    public function unsyncedTmdbMedia(): JsonResponse
    {
        $items = Media::whereNull('tmdb_id')
            ->orWhere('tmdb_id', 0)
            ->select(['id', 'title', 'year', 'type'])
            ->orderBy('id', 'desc')
            ->get();

        return response()->json([
            'status' => 'success',
            'total' => $items->count(),
            'items' => $items,
        ]);
    }

    public function allTmdbMedia(): JsonResponse
    {
        $items = Media::select(['id', 'title', 'year', 'type'])
            ->orderBy('id', 'desc')
            ->get();

        return response()->json([
            'status' => 'success',
            'total' => $items->count(),
            'items' => $items,
        ]);
    }

    public function syncAllTmdb(): RedirectResponse
    {
        $unSyncedMedia = Media::whereNull('tmdb_id')->orWhere('tmdb_id', 0)->get();
        $totalAlreadySynced = Media::whereNotNull('tmdb_id')->where('tmdb_id', '>', 0)->count();

        if ($unSyncedMedia->isEmpty()) {
            return back()->with('message', sprintf('Tüm içeriklerin (%d medya) TMDB bilgileri zaten çekilmiş durumda.', $totalAlreadySynced));
        }

        $count = 0;
        $failed = 0;

        foreach ($unSyncedMedia as $media) {
            if ($this->tmdbService->fetchAndApply($media)) {
                $count++;
            } else {
                $failed++;
            }
        }

        if ($count === 0 && $failed > 0) {
            return back()->with('error', 'Eşitlenmeyen medyalar için TMDB bilgileri çekilemedi. Lütfen geçerli bir TMDB API Anahtarı (TMDB_API_KEY) tanımlandığından emin olun.');
        }

        return back()->with('message', sprintf('%d yeni medya için TMDB bilgileri başarıyla çekildi (%d medya zaten eşleşmişti).', $count, $totalAlreadySynced));
    }

    public function destroy(Media $media): RedirectResponse
    {
        $this->auditLogService->log(
            action: 'media_deleted',
            targetType: 'Media',
            targetId: (string) $media->id,
            oldValues: $media->only(['id', 'title', 'file_path'])
        );

        $media->delete();

        return back()->with('message', 'Medya kütüphaneden silindi.');
    }

    public function bulkDelete(Request $request): RedirectResponse
    {
        $validated = $request->validate([
            'ids' => ['nullable', 'array'],
            'ids.*' => ['integer', 'exists:media,id'],
            'delete_all' => ['nullable', 'boolean'],
        ]);

        if (! empty($validated['delete_all'])) {
            $count = Media::count();
            Media::query()->delete();

            $this->auditLogService->log(
                action: 'media_bulk_deleted_all',
                targetType: 'Media',
                newValues: ['count' => $count]
            );

            return back()->with('message', sprintf('Tüm arşiv (%d içerik) kütüphaneden başarıyla silindi.', $count));
        }

        $ids = $validated['ids'] ?? [];
        if (empty($ids)) {
            return back()->with('error', 'Lütfen silinecek en az bir içerik seçin.');
        }

        $count = Media::whereIn('id', $ids)->count();
        Media::whereIn('id', $ids)->delete();

        $this->auditLogService->log(
            action: 'media_bulk_deleted',
            targetType: 'Media',
            newValues: ['count' => $count, 'ids' => $ids]
        );

        return back()->with('message', sprintf('Seçilen %d içerik kütüphaneden silindi.', $count));
    }

    public function destroySeason(Request $request, Media $media): RedirectResponse
    {
        $request->validate([
            'season_number' => ['required', 'integer'],
        ]);

        $seasonNumber = (int) $request->input('season_number');

        if ($media->tmdb_id) {
            $groupItems = Media::where('tmdb_id', $media->tmdb_id)->get();
        } else {
            $targetSlug = Str::slug($media->title);
            $groupItems = Media::all()->filter(function ($item) use ($targetSlug) {
                return Str::slug($item->title) === $targetSlug;
            });
        }

        $seasonItems = $groupItems->filter(function ($item) use ($seasonNumber) {
            return ($item->season_number ?? 1) === $seasonNumber;
        });

        $count = 0;
        foreach ($seasonItems as $item) {
            $this->auditLogService->log(
                action: 'media_season_deleted',
                targetType: 'Media',
                targetId: (string) $item->id,
                oldValues: $item->only(['id', 'title', 'file_path'])
            );
            $item->delete();
            $count++;
        }

        return back()->with('message', sprintf('Sezon %d kütüphaneden silindi (%d bölüm).', $seasonNumber, $count));
    }

    public function triggerScan(Request $request): RedirectResponse|JsonResponse
    {
        $existing = MediaScan::whereIn('status', ['pending', 'running'])->first();
        if ($existing) {
            if ($request->wantsJson()) {
                return response()->json([
                    'status' => 'already_running',
                    'scan' => $existing,
                    'message' => 'Zaten devam eden bir tarama işlemi bulunuyor.',
                ]);
            }

            return back()->with('error', 'Zaten devam eden bir tarama işlemi bulunuyor.');
        }

        $scan = MediaScan::create([
            'user_id' => $request->user()?->id,
            'scan_type' => 'all',
            'status' => 'pending',
            'current_target' => 'Kuyrukta bekliyor...',
        ]);

        MediaScanJob::dispatch($scan->id);

        $this->auditLogService->log(
            action: 'media_scan_queued',
            targetType: 'MediaScan',
            targetId: (string) $scan->id
        );

        if ($request->wantsJson()) {
            return response()->json([
                'status' => 'success',
                'scan' => $scan,
                'message' => 'Otomatik tarama kuyruğa alındı ve arka planda başlatıldı.',
            ]);
        }

        return back()->with('message', 'Otomatik tarama kuyruğa alındı ve arka planda başlatıldı.');
    }

    public function startAsyncScan(Request $request): JsonResponse
    {
        $existing = MediaScan::whereIn('status', ['pending', 'running'])->first();
        if ($existing) {
            return response()->json([
                'status' => 'already_running',
                'scan' => $existing,
                'message' => 'Zaten devam eden bir tarama bulunuyor.',
            ]);
        }

        $boxId = $request->input('storage_box_id');
        $subDir = $request->input('sub_directory');
        $scanType = $request->input('scan_type', $boxId ? 'box' : 'all');

        $scan = MediaScan::create([
            'storage_box_id' => $boxId ?: null,
            'user_id' => $request->user()?->id,
            'sub_directory' => $subDir ?: null,
            'scan_type' => $scanType,
            'status' => 'pending',
            'current_target' => 'Kuyrukta bekliyor...',
        ]);

        MediaScanJob::dispatch($scan->id);

        return response()->json([
            'status' => 'success',
            'scan' => $scan,
            'message' => 'Tarama kuyruğa alındı.',
        ]);
    }

    public function scanStatus(): JsonResponse
    {
        $activeScan = MediaScan::with('storageBox')
            ->whereIn('status', ['pending', 'running'])
            ->latest()
            ->first();

        $latestScan = MediaScan::with('storageBox')
            ->latest()
            ->first();

        return response()->json([
            'status' => 'success',
            'active_scan' => $activeScan,
            'latest_scan' => $latestScan,
        ]);
    }

    public function cancelScan(Request $request, MediaScan $scan): JsonResponse
    {
        if (in_array($scan->status, ['pending', 'running'], true)) {
            $scan->update([
                'status' => 'cancelled',
                'current_target' => 'Kullanıcı tarafından iptal edildi',
                'completed_at' => now(),
            ]);
        }

        return response()->json([
            'status' => 'success',
            'message' => 'Tarama işlemi iptal edildi.',
        ]);
    }

    public function scanTargets(): JsonResponse
    {
        $this->scannerService->discoverAndSyncMounts();
        $boxes = StorageBox::where('is_active', true)->get();

        $targets = [];

        if ($boxes->isEmpty()) {
            $targets[] = [
                'id' => null,
                'name' => 'Varsayılan Yerel Depolama (storage_path)',
                'sub_directory' => '',
            ];
        } else {
            foreach ($boxes as $box) {
                $mountPath = $box->mount_path;
                $subDirsFound = [];

                if ($mountPath && file_exists($mountPath) && is_dir($mountPath)) {
                    $items = @scandir($mountPath);
                    if (is_array($items)) {
                        foreach ($items as $item) {
                            if ($item === '.' || $item === '..') {
                                continue;
                            }
                            $full = str_replace('\\', '/', rtrim($mountPath, '/').'/'.$item);
                            if (is_dir($full) && ! Str::startsWith($item, ['.', '$', 'sample', 'Sample'])) {
                                $subDirsFound[] = $item;
                            }
                        }
                    }
                }

                if (count($subDirsFound) > 1) {
                    foreach ($subDirsFound as $subDir) {
                        $targets[] = [
                            'id' => $box->id,
                            'name' => "{$box->name} ({$subDir})",
                            'sub_directory' => $subDir,
                        ];
                    }
                } else {
                    $targets[] = [
                        'id' => $box->id,
                        'name' => $box->name,
                        'sub_directory' => '',
                    ];
                }
            }
        }

        return response()->json([
            'status' => 'success',
            'targets' => $targets,
        ]);
    }

    public function scanTarget(Request $request): JsonResponse
    {
        $existing = MediaScan::whereIn('status', ['pending', 'running'])->first();
        if ($existing) {
            return response()->json([
                'status' => 'already_running',
                'scan' => $existing,
                'message' => 'Zaten devam eden bir tarama işlemi bulunuyor.',
            ]);
        }

        $boxId = $request->input('id');
        $subDir = (string) $request->input('sub_directory', '');

        $scan = MediaScan::create([
            'storage_box_id' => $boxId ?: null,
            'user_id' => $request->user()?->id,
            'sub_directory' => $subDir ?: null,
            'scan_type' => 'target',
            'status' => 'pending',
            'current_target' => 'Kuyrukta bekliyor...',
        ]);

        MediaScanJob::dispatch($scan->id);

        $this->auditLogService->log(
            action: 'media_scan_target_queued',
            targetType: 'MediaScan',
            targetId: (string) $scan->id
        );

        return response()->json([
            'status' => 'success',
            'scan' => $scan,
            'message' => 'Tarama işlemi kuyruğa alındı ve arka planda başlatıldı.',
        ]);
    }

    public function toggleActive(Media $media): RedirectResponse
    {
        $media->update(['is_active' => ! $media->is_active]);

        return back()->with('message', 'Medya durumu güncellendi.');
    }

    public function bulkDownloadLinks(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'integer|exists:media,id',
        ]);

        $mediaItems = Media::with('storageBox')
            ->whereIn('id', $validated['ids'])
            ->get();

        $links = [];

        foreach ($mediaItems as $media) {
            try {
                $authResult = $this->downloadAuthService->authorize(
                    $request->user(),
                    $media,
                    $request->ip(),
                    $request->userAgent()
                );

                $links[] = [
                    'id' => $media->id,
                    'title' => $media->title,
                    'file_name' => $media->file_name,
                    'quality_label' => $media->quality_label,
                    'season_number' => $media->season_number,
                    'episode_number' => $media->episode_number,
                    'file_size' => $media->file_size,
                    'download_url' => $authResult['download_url'],
                    'expires_at' => $authResult['expires_at'],
                    'success' => true,
                ];
            } catch (\Throwable $e) {
                $links[] = [
                    'id' => $media->id,
                    'title' => $media->title,
                    'file_name' => $media->file_name,
                    'quality_label' => $media->quality_label,
                    'file_size' => $media->file_size,
                    'success' => false,
                    'error' => $e->getMessage(),
                ];
            }
        }

        return response()->json([
            'success' => true,
            'count' => count($links),
            'links' => $links,
        ]);
    }
}
