<?php

namespace App\Http\Controllers;

use App\Models\Media;
use App\Services\DownloadAuthorizationService;
use App\Services\TmdbService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Str;
use Inertia\Inertia;
use Inertia\Response;

class MediaController extends Controller
{
    public function __construct(
        protected DownloadAuthorizationService $downloadAuthService,
    ) {}

    public function index(Request $request): Response
    {
        $query = Media::where('is_active', true)->where('is_available', true);

        if ($search = $request->input('search')) {
            $query->where(function ($q) use ($search) {
                $q->where('title', 'like', "%{$search}%")
                    ->orWhere('original_title', 'like', "%{$search}%")
                    ->orWhere('overview', 'like', "%{$search}%");
            });
        }

        if ($type = $request->input('type')) {
            if ($type === 'series') {
                $query->whereIn('type', ['series', 'episode']);
            } else {
                $query->where('type', $type);
            }
        }

        if ($genre = $request->input('genre')) {
            $query->whereJsonContains('genres', $genre);
        }

        $allMatching = $query->get();

        // Group media items by TMDB ID or clean title slug
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

            $highestQualityItem = $items->sortByDesc(function ($item) {
                $score = 0;
                $qLabel = strtolower($item->quality_label ?? '');
                $cleanName = strtolower($item->file_name ?? '');

                if (preg_match('/2160p|4k|uhd/i', $qLabel) || Str::contains($cleanName, ['2160p', '4k', 'uhd'])) {
                    $score = 600;
                } elseif (Str::contains($qLabel, 'remux') || Str::contains($cleanName, 'remux')) {
                    $score = 500;
                } elseif (str_contains($qLabel, '1080p') || Str::contains($cleanName, '1080p')) {
                    $score = 400;
                } elseif (str_contains($qLabel, 'm1080p') || Str::contains($cleanName, 'm1080p')) {
                    $score = 300;
                } elseif (str_contains($qLabel, '720p') || Str::contains($cleanName, '720p')) {
                    $score = 200;
                }

                return $score * 10000000000 + ($item->file_size ?? 0);
            })->first();

            $rep->highest_quality_id = $highestQualityItem ? $highestQualityItem->id : $rep->id;

            $qualities = $items->pluck('quality_label')->unique()->values()->toArray();
            $seasons = $items->pluck('season_number')->filter()->unique()->sort()->values()->toArray();
            $episodesCount = $items->pluck('episode_number')->filter()->unique()->count();

            $isSeries = $rep->type->value === 'series'
                || $rep->type->value === 'episode'
                || count($seasons) > 0
                || $episodesCount > 0;

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

        // Sort grouped collection
        $sort = $request->input('sort', 'created_at');
        $direction = $request->input('direction', 'desc');

        if ($sort === 'rating') {
            $grouped = $direction === 'asc' ? $grouped->sortBy('vote_average') : $grouped->sortByDesc('vote_average');
        } elseif ($sort === 'year') {
            $grouped = $direction === 'asc' ? $grouped->sortBy('year') : $grouped->sortByDesc('year');
        } elseif ($sort === 'title') {
            $grouped = $direction === 'asc' ? $grouped->sortBy('title') : $grouped->sortByDesc('title');
        } else {
            $grouped = $direction === 'asc' ? $grouped->sortBy('created_at') : $grouped->sortByDesc('created_at');
        }

        // Manual Pagination for grouped items
        $page = (int) $request->input('page', 1);
        $perPage = 20;
        $media = new LengthAwarePaginator(
            $grouped->forPage($page, $perPage)->values(),
            $grouped->count(),
            $perPage,
            $page,
            ['path' => $request->url(), 'query' => $request->query()]
        );

        // Get unique list of genres available in DB
        $allGenres = Media::whereNotNull('genres')
            ->pluck('genres')
            ->flatten()
            ->unique()
            ->values()
            ->toArray();

        return Inertia::render('Media/Index', [
            'media' => $media,
            'allGenres' => $allGenres,
            'filters' => $request->only(['search', 'type', 'genre', 'sort', 'direction']),
        ]);
    }

    public function show(Media $media, Request $request): Response
    {
        if (empty($media->cast) && $media->tmdb_id) {
            try {
                app(TmdbService::class)->fetchAndApply($media);
                $media->refresh();
            } catch (\Throwable $e) {
                // ignore
            }
        }

        // Fetch ALL items in the same group
        $groupQuery = Media::where('is_active', true)->where('is_available', true);
        if ($media->tmdb_id) {
            $groupQuery->where('tmdb_id', $media->tmdb_id);
        } else {
            $groupQuery->where('title', $media->title);
        }
        $allGroupItems = $groupQuery->get();

        $isSeries = $media->type->value === 'series'
            || $media->type->value === 'episode'
            || $allGroupItems->contains(fn ($i) => $i->season_number !== null || $i->episode_number !== null);

        // Group by seasons if TV Series
        $seasonsData = [];
        $versionsData = [];

        if ($isSeries) {
            $seasonsData = $allGroupItems->groupBy(function ($item) {
                return $item->season_number ?? 1;
            })->sortKeys()->map(function ($episodes, $seasonNum) {
                return [
                    'season_number' => (int) $seasonNum,
                    'title' => "Sezon {$seasonNum}",
                    'episodes' => $episodes->sortBy(function ($ep) {
                        return $ep->episode_number ?? $ep->id;
                    })->values()->map(function ($ep) {
                        return [
                            'id' => $ep->id,
                            'title' => $ep->title,
                            'file_name' => $ep->file_name,
                            'file_path' => $ep->file_path,
                            'season_number' => $ep->season_number,
                            'episode_number' => $ep->episode_number,
                            'quality_label' => $ep->quality_label,
                            'file_size' => $ep->file_size,
                            'size_gb' => $ep->file_size ? number_format($ep->file_size / 1073741824, 2) : '0.00',
                            'width' => $ep->width,
                            'height' => $ep->height,
                            'video_codec' => $ep->video_codec,
                            'audio_codec' => $ep->audio_codec,
                            'audio_channels' => $ep->audio_channels,
                            'audio_language' => $ep->audio_language,
                            'subtitle_languages' => $ep->subtitle_languages,
                            'fps' => $ep->fps,
                            'bitrate' => $ep->bitrate,
                            'duration_seconds' => $ep->duration_seconds,
                            'created_at' => $ep->created_at?->format('d.m.Y'),
                        ];
                    }),
                ];
            })->values();
        } else {
            // Group by quality versions for movies (Sorted lowest quality at top -> highest quality at bottom)
            $versionsData = $allGroupItems->map(function ($ver) {
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

                return [
                    'id' => $ver->id,
                    'title' => $ver->title,
                    'file_name' => $ver->file_name,
                    'file_path' => $ver->file_path,
                    'quality_label' => $ver->quality_label,
                    'quality_score' => $score,
                    'width' => $ver->width,
                    'height' => $ver->height,
                    'video_codec' => $ver->video_codec,
                    'audio_codec' => $ver->audio_codec,
                    'audio_channels' => $ver->audio_channels,
                    'audio_language' => $ver->audio_language,
                    'subtitle_languages' => $ver->subtitle_languages,
                    'fps' => $ver->fps,
                    'bitrate' => $ver->bitrate,
                    'duration_seconds' => $ver->duration_seconds,
                    'file_size' => $ver->file_size,
                    'size_gb' => $ver->file_size ? number_format($ver->file_size / 1073741824, 2) : '0.00',
                ];
            })->sortBy([
                ['quality_score', 'asc'],
                ['file_size', 'asc'],
            ])->values();
        }

        // Related media (excluding items from the same group)
        $related = Media::where('is_active', true)
            ->where('is_available', true)
            ->where(function ($q) use ($media) {
                if ($media->tmdb_id) {
                    $q->where('tmdb_id', '!=', $media->tmdb_id);
                } else {
                    $q->where('title', '!=', $media->title);
                }
            })
            ->orderBy('id', 'desc')
            ->get()
            ->groupBy(function ($item) {
                return $item->tmdb_id ? 'tmdb_'.$item->tmdb_id : 'title_'.Str::slug($item->title);
            })
            ->map(fn ($items) => $items->first())
            ->take(6)
            ->values();

        return Inertia::render('Media/Show', [
            'item' => $media,
            'isSeries' => $isSeries,
            'seasonsData' => $seasonsData,
            'versionsData' => $versionsData,
            'totalVersionsCount' => $allGroupItems->count(),
            'related' => $related,
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

    public function actorMedia(string $name): JsonResponse
    {
        $decodedName = trim(urldecode($name));

        if (empty($decodedName)) {
            return response()->json(['media' => [], 'count' => 0]);
        }

        $items = Media::where('is_active', true)
            ->where('is_available', true)
            ->where(function ($q) use ($decodedName) {
                $q->whereJsonContains('cast', [['name' => $decodedName]])
                    ->orWhere('cast', 'like', '%'.str_replace(['%', '_'], ['\%', '\_'], $decodedName).'%');
            })
            ->get()
            ->groupBy(function ($item) {
                return $item->tmdb_id ? 'tmdb_'.$item->tmdb_id : 'title_'.Str::slug($item->title);
            })
            ->map(function ($group) {
                $rep = $group->sortByDesc(function ($i) {
                    $score = 0;
                    if ($i->poster_path) {
                        $score += 10;
                    }
                    if (preg_match('/2160p|4k/i', $i->quality_label)) {
                        $score += 4;
                    }

                    return $score;
                })->first();

                return [
                    'id' => $rep->id,
                    'title' => $rep->title,
                    'original_title' => $rep->original_title,
                    'year' => $rep->year,
                    'type' => $rep->type->value,
                    'poster_url' => $rep->poster_url,
                    'backdrop_url' => $rep->backdrop_url,
                    'vote_average' => $rep->vote_average,
                    'quality_label' => $rep->quality_label,
                    'versions_count' => $group->count(),
                ];
            })
            ->values();

        return response()->json([
            'actor' => $decodedName,
            'media' => $items,
            'count' => $items->count(),
        ]);
    }
}
