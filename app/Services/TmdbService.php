<?php

namespace App\Services;

use App\Models\Media;
use Exception;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class TmdbService
{
    protected string $baseUrl = 'https://api.themoviedb.org/3';
    protected ?string $apiKey;
    protected ?string $bearerToken;

    public function __construct()
    {
        $this->apiKey = config('services.tmdb.api_key', env('TMDB_API_KEY', 'b079058b29ec0b6f932bfdf69a656627')); // default public v3 fallback key
        $this->bearerToken = config('services.tmdb.bearer_token', env('TMDB_BEARER_TOKEN'));
    }

    /**
     * Clean raw file name or media title to extract clean search title and year.
     */
    public function cleanTitle(string $rawTitle): array
    {
        // Remove extension if present
        $clean = pathinfo($rawTitle, PATHINFO_FILENAME);

        // Replace dots and underscores with spaces
        $clean = str_replace(['.', '_', '+'], ' ', $clean);

        // Extract year
        $year = null;
        if (preg_match('/\b(19\d{2}|20\d{2})\b/', $clean, $matches)) {
            $year = (int) $matches[1];
        }

        // Remove typical scene release tags
        $removePatterns = [
            '/\b(1080p|720p|2160p|4k|uhd|hd|sd|bluray|bdrip|brrip|web-dl|webrip|hdtv|dvdrip)\b/i',
            '/\b(x264|x265|hevc|h264|h265|avc|10bit|remux)\b/i',
            '/\b(aac|ac3|dts|truehd|atmos|dual|tr|eng|subbed|dubbed|turkish|english)\b/i',
            '/\b(repack|proper|unrated|extended|director|cut|edition)\b/i',
            '/\bS\d{1,2}E\d{1,2}\b/i', // S01E01 pattern
            '/\b\d{4}\b/', // remove 4 digit year from clean title string
            '/\[.*?\]/', // [Group]
            '/\(.*?\)/', // (Extra info)
        ];

        foreach ($removePatterns as $pattern) {
            $clean = preg_replace($pattern, ' ', $clean);
        }

        $clean = trim(preg_replace('/\s+/', ' ', $clean));

        return [
            'title' => $clean ?: $rawTitle,
            'year' => $year,
        ];
    }

    /**
     * Search movies or TV shows on TMDB.
     */
    public function search(string $query, string $type = 'multi', ?int $year = null, string $language = 'tr-TR'): array
    {
        try {
            $endpoint = match ($type) {
                'movie' => '/search/movie',
                'series', 'tv', 'episode' => '/search/tv',
                default => '/search/multi',
            };

            $params = [
                'api_key' => $this->apiKey,
                'query' => $query,
                'language' => $language,
                'include_adult' => false,
            ];

            if ($year && $endpoint === '/search/movie') {
                $params['year'] = $year;
            } elseif ($year && $endpoint === '/search/tv') {
                $params['first_air_date_year'] = $year;
            }

            $response = Http::withOptions(['verify' => false])
                ->timeout(10)
                ->get($this->baseUrl . $endpoint, $params);

            if ($response->failed()) {
                Log::warning('TMDB API Search failed: ' . $response->body());
                return [];
            }

            $data = $response->json();
            return $data['results'] ?? [];
        } catch (Exception $e) {
            Log::error('TMDB Search exception: ' . $e->getMessage());
            return [];
        }
    }

    /**
     * Get details for a Movie.
     */
    public function getMovieDetails(int|string $tmdbId, string $language = 'tr-TR'): ?array
    {
        try {
            $response = Http::withOptions(['verify' => false])
                ->timeout(10)
                ->get("{$this->baseUrl}/movie/{$tmdbId}", [
                    'api_key' => $this->apiKey,
                    'language' => $language,
                    'append_to_response' => 'external_ids',
                ]);

            if ($response->successful()) {
                return $response->json();
            }

            // Fallback to English if Turkish details missing overview
            $fallback = Http::withOptions(['verify' => false])
                ->timeout(10)
                ->get("{$this->baseUrl}/movie/{$tmdbId}", [
                    'api_key' => $this->apiKey,
                    'language' => 'en-US',
                    'append_to_response' => 'external_ids',
                ]);

            return $fallback->successful() ? $fallback->json() : null;
        } catch (Exception $e) {
            Log::error('TMDB Movie Details Exception: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Get details for a TV Show.
     */
    public function getTvDetails(int|string $tmdbId, string $language = 'tr-TR'): ?array
    {
        try {
            $response = Http::withOptions(['verify' => false])
                ->timeout(10)
                ->get("{$this->baseUrl}/tv/{$tmdbId}", [
                    'api_key' => $this->apiKey,
                    'language' => $language,
                    'append_to_response' => 'external_ids',
                ]);

            if ($response->successful()) {
                return $response->json();
            }

            $fallback = Http::withOptions(['verify' => false])
                ->timeout(10)
                ->get("{$this->baseUrl}/tv/{$tmdbId}", [
                    'api_key' => $this->apiKey,
                    'language' => 'en-US',
                    'append_to_response' => 'external_ids',
                ]);

            return $fallback->successful() ? $fallback->json() : null;
        } catch (Exception $e) {
            Log::error('TMDB TV Details Exception: ' . $e->getMessage());
            return null;
        }
    }

    /**
     * Automatically search TMDB by title/year and fetch details.
     */
    public function autoMatch(string $title, ?string $type = 'movie', ?int $year = null): ?array
    {
        $cleanInfo = $this->cleanTitle($title);
        $searchTitle = $cleanInfo['title'];
        $searchYear = $year ?: $cleanInfo['year'];

        $results = $this->search($searchTitle, $type === 'movie' ? 'movie' : 'tv', $searchYear);

        if (empty($results)) {
            // Try multi search if specific type gave no results
            $results = $this->search($searchTitle, 'multi', $searchYear);
        }

        if (empty($results)) {
            return null;
        }

        $top = $results[0];
        $mediaType = $top['media_type'] ?? ($type === 'movie' ? 'movie' : 'tv');

        if ($mediaType === 'movie') {
            return $this->getMovieDetails($top['id']);
        } else {
            return $this->getTvDetails($top['id']);
        }
    }

    /**
     * Fetch TMDB info for a Media model record and save it.
     */
    public function fetchAndApply(Media $media, ?int $tmdbId = null): bool
    {
        $details = null;

        if ($tmdbId) {
            $details = $media->type->value === 'movie' 
                ? $this->getMovieDetails($tmdbId)
                : $this->getTvDetails($tmdbId);
        }

        if (!$details) {
            $details = $this->autoMatch($media->title, $media->type->value, $media->year);
        }

        if (!$details) {
            return false;
        }

        $isMovie = isset($details['title']);

        $title = $details['title'] ?? $details['name'] ?? $media->title;
        $originalTitle = $details['original_title'] ?? $details['original_name'] ?? null;
        $releaseDate = $details['release_date'] ?? $details['first_air_date'] ?? null;
        $year = $releaseDate ? (int) substr($releaseDate, 0, 4) : $media->year;

        $genres = [];
        if (!empty($details['genres'])) {
            foreach ($details['genres'] as $g) {
                $genres[] = $g['name'];
            }
        }

        $media->update([
            'tmdb_id' => $details['id'] ?? null,
            'title' => $title,
            'original_title' => $originalTitle,
            'year' => $year,
            'poster_path' => $details['poster_path'] ?? $media->poster_path,
            'backdrop_path' => $details['backdrop_path'] ?? $media->backdrop_path,
            'overview' => $details['overview'] ?? $media->overview,
            'vote_average' => $details['vote_average'] ?? $media->vote_average,
            'vote_count' => $details['vote_count'] ?? $media->vote_count,
            'genres' => $genres ?: $media->genres,
            'release_date' => $releaseDate,
            'imdb_id' => $details['external_ids']['imdb_id'] ?? $details['imdb_id'] ?? null,
            'tagline' => $details['tagline'] ?? null,
        ]);

        return true;
    }
}
