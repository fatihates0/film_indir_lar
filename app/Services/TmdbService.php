<?php

namespace App\Services;

use App\Models\Media;
use Exception;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

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
     * Uses media server (Plex / Jellyfin / Emby) title-boundary extraction.
     */
    public function cleanTitle(string $rawTitle): array
    {
        // 1. Remove extension if present
        $clean = pathinfo($rawTitle, PATHINFO_FILENAME);

        // 2. Extract 4-digit year (1900 - 2099) and Season/Episode tag positions
        $year = null;
        $yearPos = null;
        $seasonPos = null;

        if (preg_match('/\b(19\d{2}|20\d{2})\b/', $clean, $yearMatches, PREG_OFFSET_CAPTURE)) {
            $year = (int) $yearMatches[1][0];
            $yearPos = $yearMatches[1][1];
        }

        if (preg_match('/\b(S\d{1,2}(?:E\d{1,2})?|\d{1,2}x\d{1,2})\b/i', $clean, $seasonMatches, PREG_OFFSET_CAPTURE)) {
            $seasonPos = $seasonMatches[0][1];
        }

        // 3. Media Server Rule: If Year or Season tag exists, everything BEFORE it is the Title
        $cutoffPos = null;
        if ($yearPos !== null && $seasonPos !== null) {
            $cutoffPos = min($yearPos, $seasonPos);
        } elseif ($yearPos !== null) {
            $cutoffPos = $yearPos;
        } elseif ($seasonPos !== null) {
            $cutoffPos = $seasonPos;
        }

        if ($cutoffPos !== null && $cutoffPos > 0) {
            $titlePart = substr($clean, 0, $cutoffPos);
        } else {
            $titlePart = $clean;
        }

        // 4. Replace dots, underscores, pluses, hyphens with spaces
        $titlePart = str_replace(['.', '_', '+', '-'], ' ', $titlePart);

        // 5. Remove domain names or site tags like site.com
        $titlePart = preg_replace('/\b[a-z0-9]+\.(com|net|org|co|tv|me|io|xyz|top)\b/i', ' ', $titlePart);

        // 6. Remove scene release tags, quality prefixes, release groups, and site watermarks
        $removePatterns = [
            '/uHDFilmindir/i',
            '/Filmindir/i',
            '/DivxUp/i',
            '/\b(m1080p|m720p|m2160p|m4k|1080p|720p|2160p|4k|uhd|hd|sd|bluray|blu\s*ray|bdrip|bd\s*rip|brrip|br\s*rip|web\s*dl|webrip|web\s*rip|hdtv|dvdrip|remux)\b/i',
            '/\b(x264|x265|hevc|h264|h265|avc|10bit|remux|hdr|hdr10|dv|dovi)\b/i',
            '/\b(aac|ac3|dts|dts\s*hd|truehd|atmos|dual|duall|tr|eng|subbed|dubbed|turkish|english)\b/i',
            '/\b(repack|proper|unrated|extended|director|cut|edition)\b/i',
            '/\b(rarbg|sparks|evo|flux|yify|yts|ntg|cmrg|viaplay|hmax|dsnp|amzn|nf|hbo|appletv|framestor|geckos|amiable|w4f|lol|eztv|fleet)\b/i',
            '/\[.*?\]/', // [Group]
            '/\(.*?\)/', // (Extra info)
        ];

        foreach ($removePatterns as $pattern) {
            $titlePart = preg_replace($pattern, ' ', $titlePart);
        }

        // 7. Remove single-character noise letters left over
        $titlePart = preg_replace('/\b[a-z]\b/i', ' ', $titlePart);

        $cleanTitleStr = trim(preg_replace('/\s+/', ' ', $titlePart));

        return [
            'title' => $cleanTitleStr ?: $rawTitle,
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
                ->get($this->baseUrl.$endpoint, $params);

            if ($response->failed()) {
                Log::warning('TMDB API Search failed: '.$response->body());

                return [];
            }

            $data = $response->json();
            if (isset($data['success']) && $data['success'] === false) {
                Log::warning('TMDB API Error: '.($data['status_message'] ?? 'Unknown TMDB error'));

                return [];
            }

            return $data['results'] ?? [];
        } catch (Exception $e) {
            Log::error('TMDB Search exception: '.$e->getMessage());

            return [];
        }
    }

    /**
     * Search TMDB by text query, TMDB ID, or IMDb ID.
     */
    public function searchByQueryOrId(string $query, string $type = 'multi', ?int $year = null): array
    {
        $query = trim($query);
        if (empty($query)) {
            return [];
        }

        // 1. IMDb ID Search (e.g. tt1234567)
        if (preg_match('/^tt\d+$/i', $query)) {
            try {
                $response = Http::withOptions(['verify' => false])
                    ->timeout(10)
                    ->get("{$this->baseUrl}/find/{$query}", [
                        'api_key' => $this->apiKey,
                        'external_source' => 'imdb_id',
                        'language' => 'tr-TR',
                    ]);

                if ($response->successful()) {
                    $data = $response->json();
                    $rawResults = array_merge(
                        array_map(fn ($i) => array_merge($i, ['media_type' => 'movie']), $data['movie_results'] ?? []),
                        array_map(fn ($i) => array_merge($i, ['media_type' => 'tv']), $data['tv_results'] ?? [])
                    );

                    if (! empty($rawResults)) {
                        return array_map([$this, 'formatSearchResult'], $rawResults);
                    }
                }
            } catch (Exception $e) {
                Log::error('TMDB find by IMDb ID exception: '.$e->getMessage());
            }
        }

        // 2. Numeric TMDB ID direct lookup
        if (is_numeric($query)) {
            $tmdbId = (int) $query;
            $results = [];

            $movie = $this->getMovieDetails($tmdbId);
            if ($movie && isset($movie['id'])) {
                $movie['media_type'] = 'movie';
                $results[] = $this->formatSearchResult($movie);
            }

            $tv = $this->getTvDetails($tmdbId);
            if ($tv && isset($tv['id'])) {
                $tv['media_type'] = 'tv';
                $results[] = $this->formatSearchResult($tv);
            }

            if (! empty($results)) {
                return $results;
            }
        }

        // 3. Text search
        $raw = $this->search($query, $type, $year);

        return array_map([$this, 'formatSearchResult'], $raw);
    }

    /**
     * Format search result item for uniform frontend consumption.
     */
    public function formatSearchResult(array $item): array
    {
        $mediaType = $item['media_type'] ?? (isset($item['title']) ? 'movie' : 'tv');
        $title = $item['title'] ?? $item['name'] ?? '';
        $originalTitle = $item['original_title'] ?? $item['original_name'] ?? '';
        $releaseDate = $item['release_date'] ?? $item['first_air_date'] ?? null;
        $year = $releaseDate ? (int) substr($releaseDate, 0, 4) : null;
        $posterPath = $item['poster_path'] ?? null;
        $posterUrl = $posterPath ? 'https://image.tmdb.org/t/p/w185/'.ltrim($posterPath, '/') : null;
        $backdropPath = $item['backdrop_path'] ?? null;
        $backdropUrl = $backdropPath ? 'https://image.tmdb.org/t/p/w780/'.ltrim($backdropPath, '/') : null;

        return [
            'id' => $item['id'] ?? null,
            'title' => $title,
            'original_title' => $originalTitle,
            'media_type' => $mediaType,
            'release_date' => $releaseDate,
            'year' => $year,
            'poster_path' => $posterPath,
            'poster_url' => $posterUrl,
            'backdrop_path' => $backdropPath,
            'backdrop_url' => $backdropUrl,
            'overview' => $item['overview'] ?? '',
            'vote_average' => isset($item['vote_average']) ? (float) $item['vote_average'] : null,
            'vote_count' => isset($item['vote_count']) ? (int) $item['vote_count'] : null,
            'imdb_id' => $item['external_ids']['imdb_id'] ?? $item['imdb_id'] ?? null,
        ];
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
                    'append_to_response' => 'credits,external_ids',
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
                    'append_to_response' => 'credits,external_ids',
                ]);

            return $fallback->successful() ? $fallback->json() : null;
        } catch (Exception $e) {
            Log::error('TMDB Movie Details Exception: '.$e->getMessage());

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
                    'append_to_response' => 'aggregate_credits,credits,external_ids',
                ]);

            if ($response->successful()) {
                return $response->json();
            }

            $fallback = Http::withOptions(['verify' => false])
                ->timeout(10)
                ->get("{$this->baseUrl}/tv/{$tmdbId}", [
                    'api_key' => $this->apiKey,
                    'language' => 'en-US',
                    'append_to_response' => 'aggregate_credits,credits,external_ids',
                ]);

            return $fallback->successful() ? $fallback->json() : null;
        } catch (Exception $e) {
            Log::error('TMDB TV Details Exception: '.$e->getMessage());

            return null;
        }
    }

    /**
     * Get details for a Movie Collection.
     */
    public function getCollectionDetails(int|string $collectionId, string $language = 'tr-TR'): ?array
    {
        try {
            $response = Http::withOptions(['verify' => false])
                ->timeout(10)
                ->get("{$this->baseUrl}/collection/{$collectionId}", [
                    'api_key' => $this->apiKey,
                    'language' => $language,
                ]);

            if ($response->successful()) {
                return $response->json();
            }

            if ($language !== 'en-US') {
                $fallback = Http::withOptions(['verify' => false])
                    ->timeout(10)
                    ->get("{$this->baseUrl}/collection/{$collectionId}", [
                        'api_key' => $this->apiKey,
                        'language' => 'en-US',
                    ]);

                if ($fallback->successful()) {
                    return $fallback->json();
                }
            }

            return null;
        } catch (Exception $e) {
            Log::error('TMDB Collection Details Exception: '.$e->getMessage());

            return null;
        }
    }

    /**
     * Automatically search TMDB by title/year using Plex/Jellyfin multi-stage fallback algorithm.
     */
    public function autoMatch(string $title, ?string $type = 'movie', ?int $year = null): ?array
    {
        $cleanInfo = $this->cleanTitle($title);
        $searchTitle = $cleanInfo['title'];
        $searchYear = $year ?: $cleanInfo['year'];
        $targetType = ($type === 'movie') ? 'movie' : 'tv';

        $results = [];

        // Stage 1: Search target type WITH year
        if ($searchYear) {
            $results = $this->search($searchTitle, $targetType, $searchYear);
        }

        // Stage 2: Search target type WITHOUT year restriction (Plex/Emby fallback)
        if (empty($results)) {
            $results = $this->search($searchTitle, $targetType, null);
        }

        // Stage 3: Try multi-search WITH year
        if (empty($results) && $searchYear) {
            $results = $this->search($searchTitle, 'multi', $searchYear);
        }

        // Stage 4: Try multi-search WITHOUT year restriction
        if (empty($results)) {
            $results = $this->search($searchTitle, 'multi', null);
        }

        // Stage 5: Try searching first 3 main words
        if (empty($results)) {
            $words = explode(' ', $searchTitle);
            if (count($words) > 3) {
                $shortTitle = implode(' ', array_slice($words, 0, 3));
                $results = $this->search($shortTitle, $targetType, null);
                if (empty($results)) {
                    $results = $this->search($shortTitle, 'multi', null);
                }
            }
        }

        if (empty($results)) {
            return null;
        }

        // Pick candidate with best title match score
        $bestMatch = $results[0];
        $bestScore = -1;

        foreach ($results as $candidate) {
            $candidateTitle = $candidate['title'] ?? $candidate['name'] ?? $candidate['original_title'] ?? '';
            similar_text(mb_strtolower($searchTitle), mb_strtolower($candidateTitle), $percent);

            $candYear = isset($candidate['release_date']) ? (int) substr($candidate['release_date'], 0, 4) : (isset($candidate['first_air_date']) ? (int) substr($candidate['first_air_date'], 0, 4) : null);
            if ($searchYear && $candYear && $searchYear === $candYear) {
                $percent += 15; // Bonus for exact year match
            }

            if ($percent > $bestScore) {
                $bestScore = $percent;
                $bestMatch = $candidate;
            }
        }

        $mediaType = $bestMatch['media_type'] ?? ($type === 'movie' ? 'movie' : 'tv');

        if ($mediaType === 'movie') {
            return $this->getMovieDetails($bestMatch['id']);
        } else {
            return $this->getTvDetails($bestMatch['id']);
        }
    }

    /**
     * Fetch TMDB info for a Media model record and save it.
     */
    public function fetchAndApply(Media $media, ?int $tmdbId = null): bool
    {
        $targetTmdbId = $tmdbId ?: $media->tmdb_id;
        $details = null;

        if ($targetTmdbId) {
            $details = $media->type->value === 'movie'
                ? $this->getMovieDetails($targetTmdbId)
                : $this->getTvDetails($targetTmdbId);

            if (! $details) {
                $details = $media->type->value === 'movie'
                    ? $this->getTvDetails($targetTmdbId)
                    : $this->getMovieDetails($targetTmdbId);
            }
        }

        if (! $details) {
            $searchString = $media->file_name ?: $media->title;
            $details = $this->autoMatch($searchString, $media->type->value, $media->year);
        }

        if (! $details) {
            return false;
        }

        $isMovie = isset($details['title']);

        $originalTitle = $details['original_title'] ?? $details['original_name'] ?? null;

        $enTitle = null;
        if (! empty($details['id'])) {
            $enDetails = $isMovie
                ? $this->getMovieDetails($details['id'], 'en-US')
                : $this->getTvDetails($details['id'], 'en-US');
            $enTitle = $enDetails['title'] ?? $enDetails['name'] ?? null;
        }

        $title = $enTitle ?: ($originalTitle ?: ($details['title'] ?? $details['name'] ?? $media->title));
        $releaseDate = $details['release_date'] ?? $details['first_air_date'] ?? null;
        $year = $releaseDate ? (int) substr($releaseDate, 0, 4) : $media->year;

        $genres = [];
        if (! empty($details['genres'])) {
            foreach ($details['genres'] as $g) {
                $genres[] = $g['name'];
            }
        }

        $cast = [];
        $rawCast = $details['credits']['cast'] ?? $details['aggregate_credits']['cast'] ?? [];
        if (! empty($rawCast)) {
            foreach (array_slice($rawCast, 0, 15) as $person) {
                $character = $person['character'] ?? null;
                if (! $character && ! empty($person['roles'][0]['character'])) {
                    $character = $person['roles'][0]['character'];
                }
                $profilePath = $person['profile_path'] ?? null;

                $cast[] = [
                    'id' => $person['id'] ?? null,
                    'name' => $person['name'] ?? $person['original_name'] ?? 'Oyuncu',
                    'character' => $character ?: null,
                    'profile_path' => $profilePath,
                    'profile_url' => $profilePath ? 'https://image.tmdb.org/t/p/w185/'.ltrim($profilePath, '/') : null,
                ];
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
            'cast' => ! empty($cast) ? $cast : $media->cast,
            'release_date' => $releaseDate,
            'imdb_id' => $details['external_ids']['imdb_id'] ?? $details['imdb_id'] ?? null,
            'tagline' => $details['tagline'] ?? null,
        ]);

        return true;
    }
}
