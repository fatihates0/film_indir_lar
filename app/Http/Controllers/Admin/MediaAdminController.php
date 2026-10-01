<?php

namespace App\Http\Controllers\Admin;

use App\Enums\MediaType;
use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Models\StorageBox;
use App\Services\AuditLogService;
use App\Services\MediaScannerService;
use App\Services\StorageBoxService;
use App\Services\TmdbService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
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
    ) {}

    public function index(Request $request): Response
    {
        $query = Media::with('storageBox')->orderBy('id', 'desc');

        if ($request->filled('search')) {
            $search = $request->search;
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', '%'.$search.'%')
                    ->orWhere('original_title', 'like', '%'.$search.'%')
                    ->orWhere('file_name', 'like', '%'.$search.'%');
            });
        }

        $perPage = $request->input('per_page', 15);
        if ($perPage === 'all') {
            $count = (clone $query)->count();
            $perPage = $count > 0 ? $count : 15;
        } else {
            $perPage = max(1, (int) $perPage);
        }

        $media = $query->paginate($perPage)->withQueryString();

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

        return Inertia::render('Admin/Media/Index', [
            'media' => $media,
            'storageBoxes' => $storageBoxes,
            'filters' => $request->only(['search', 'per_page']),
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
            'query' => ['required', 'string', 'min:2'],
            'type' => ['nullable', 'string', 'in:movie,series,episode,multi'],
            'year' => ['nullable', 'integer'],
        ]);

        $type = $request->query('type', 'multi');
        $results = $this->tmdbService->search($request->input('query'), $type, $request->input('year'));

        return response()->json([
            'status' => 'success',
            'results' => array_slice($results, 0, 10),
        ]);
    }

    public function syncTmdb(Request $request, Media $media): RedirectResponse
    {
        $tmdbId = $request->input('tmdb_id');
        $success = $this->tmdbService->fetchAndApply($media, $tmdbId ? (int) $tmdbId : null);

        if ($success) {
            return back()->with('message', sprintf('"%s" TMDB bilgileri güncellendi.', $media->title));
        }

        return back()->with('error', sprintf('"%s" için TMDB bilgisi bulunamadı.', $media->title));
    }

    public function syncAllTmdb(): RedirectResponse
    {
        $allMedia = Media::all();
        $count = 0;
        $failed = 0;

        foreach ($allMedia as $media) {
            if ($this->tmdbService->fetchAndApply($media)) {
                $count++;
            } else {
                $failed++;
            }
        }

        if ($count === 0 && $failed > 0) {
            return back()->with('error', 'TMDB bilgileri çekilemedi. Lütfen geçerli bir TMDB API Anahtarı (TMDB_API_KEY) tanımlandığından emin olun.');
        }

        return back()->with('message', sprintf('%d medya için TMDB bilgileri başarıyla çekildi (%d medya eşleşmedi).', $count, $failed));
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

    public function triggerScan(): RedirectResponse
    {
        $result = $this->scannerService->scanAll();

        $this->auditLogService->log(
            action: 'media_scan_triggered',
            targetType: 'Media',
            newValues: $result
        );

        return back()->with('message', sprintf(
            'Tüm Storage Box alanları ve klasörleri tarandı: %d yeni eklendi, %d güncellendi, %d erişilemez olarak işaretlendi.',
            $result['added'],
            $result['updated'],
            $result['missing']
        ));
    }

    public function toggleActive(Media $media): RedirectResponse
    {
        $media->update(['is_active' => ! $media->is_active]);

        return back()->with('message', 'Medya durumu güncellendi.');
    }
}
