<?php

namespace App\Http\Controllers;

use App\Models\Media;
use App\Services\DownloadAuthorizationService;
use App\Services\QuotaService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class MediaController extends Controller
{
    public function __construct(
        protected DownloadAuthorizationService $downloadAuthService,
        protected QuotaService $quotaService,
    ) {}

    public function index(Request $request): Response
    {
        $query = Media::where('is_active', true)->where('is_available', true);

        if ($search = $request->input('search')) {
            $query->where('title', 'like', "%{$search}%");
        }

        if ($type = $request->input('type')) {
            $query->where('type', $type);
        }

        $sort = $request->input('sort', 'created_at');
        $direction = $request->input('direction', 'desc');
        $query->orderBy($sort, $direction);

        $media = $query->paginate(16)->withQueryString();

        $user = $request->user();
        $quota = $this->quotaService->ensureCurrentPeriod($user);

        return Inertia::render('Media/Index', [
            'media' => $media,
            'filters' => $request->only(['search', 'type', 'sort', 'direction']),
            'quota' => [
                'limit_bytes' => $quota->quota_limit_bytes,
                'used_bytes' => $quota->used_bytes,
                'remaining_bytes' => $quota->remaining_bytes,
                'limit_gb' => round($quota->quota_limit_bytes / 1073741824, 1),
                'used_gb' => round($quota->used_bytes / 1073741824, 1),
                'remaining_gb' => round($quota->remaining_bytes / 1073741824, 1),
            ],
        ]);
    }

    public function show(Media $media, Request $request): Response
    {
        $user = $request->user();
        $quota = $this->quotaService->ensureCurrentPeriod($user);

        return Inertia::render('Media/Show', [
            'item' => $media,
            'quota' => [
                'limit_bytes' => $quota->quota_limit_bytes,
                'used_bytes' => $quota->used_bytes,
                'remaining_bytes' => $quota->remaining_bytes,
                'remaining_gb' => round($quota->remaining_bytes / 1073741824, 1),
            ],
        ]);
    }

    public function authorizeDownload(Media $media, Request $request)
    {
        try {
            $result = $this->downloadAuthService->authorize(
                $request->user(),
                $media,
                $request->ip(),
                $request->userAgent()
            );

            return response()->json([
                'success' => true,
                'download_url' => $result['download_url'],
                'expires_at' => $result['expires_at'],
            ]);
        } catch (\InvalidArgumentException $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }
}
