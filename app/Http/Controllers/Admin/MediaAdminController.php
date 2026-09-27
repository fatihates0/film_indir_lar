<?php

namespace App\Http\Controllers\Admin;

use App\Enums\MediaType;
use App\Http\Controllers\Controller;
use App\Models\Media;
use App\Models\StorageBox;
use App\Services\AuditLogService;
use App\Services\MediaScannerService;
use App\Services\StorageBoxService;
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
    ) {}

    public function index(Request $request): Response
    {
        $media = Media::with('storageBox')
            ->orderBy('id', 'desc')
            ->paginate(15);

        $storageBoxes = StorageBox::where('is_active', true)
            ->get()
            ->map(fn ($box) => [
                'id' => $box->id,
                'name' => $box->name,
                'host' => $box->host,
                'mount_path' => $box->mount_path,
                'disk_type' => $box->disk_type,
                'status' => $box->status,
            ]);

        return Inertia::render('Admin/Media/Index', [
            'media' => $media,
            'storageBoxes' => $storageBoxes,
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

            return response()->json([
                'status' => 'success',
                'title' => $title,
                'type' => $type,
                'year' => $year,
                'metadata' => $meta,
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

        $this->auditLogService->log(
            action: 'media_manually_added',
            targetType: 'Media',
            targetId: (string) $media->id,
            newValues: $media->toArray()
        );

        return back()->with('message', sprintf('"%s" kütüphaneye başarıyla eklendi.', $media->title));
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
        $result = $this->scannerService->scan();

        $this->auditLogService->log(
            action: 'media_scan_triggered',
            targetType: 'Media',
            newValues: $result
        );

        return back()->with('message', sprintf(
            'Tarama tamamlandı: %d yeni eklendi, %d güncellendi, %d erişilemez olarak işaretlendi.',
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
