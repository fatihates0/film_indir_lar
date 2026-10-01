<?php

namespace App\Models;

use App\Enums\MediaType;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Support\Str;

class Media extends Model
{
    use HasFactory;

    protected $table = 'media';

    protected $fillable = [
        'type',
        'title',
        'original_title',
        'year',
        'slug',
        'tmdb_id',
        'poster_path',
        'backdrop_path',
        'overview',
        'vote_average',
        'vote_count',
        'genres',
        'cast',
        'release_date',
        'imdb_id',
        'tagline',
        'file_path',
        'file_name',
        'file_size',
        'mime_type',
        'extension',
        'duration_seconds',
        'width',
        'height',
        'video_codec',
        'audio_codec',
        'audio_channels',
        'audio_language',
        'subtitle_languages',
        'fps',
        'bitrate',
        'storage_disk',
        'storage_box_id',
        'is_active',
        'is_available',
    ];

    protected $appends = [
        'poster_url',
        'backdrop_url',
        'season_number',
        'episode_number',
        'quality_label',
        'tmdb_match_status',
    ];

    protected function casts(): array
    {
        return [
            'type' => MediaType::class,
            'year' => 'integer',
            'tmdb_id' => 'integer',
            'vote_average' => 'float',
            'vote_count' => 'integer',
            'genres' => 'array',
            'cast' => 'array',
            'file_size' => 'integer',
            'duration_seconds' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
            'audio_channels' => 'integer',
            'fps' => 'float',
            'bitrate' => 'integer',
            'is_active' => 'boolean',
            'is_available' => 'boolean',
        ];
    }

    public function getPosterUrlAttribute(): ?string
    {
        if (! $this->poster_path) {
            return null;
        }
        if (Str::startsWith($this->poster_path, ['http://', 'https://'])) {
            return $this->poster_path;
        }

        return 'https://image.tmdb.org/t/p/w500/'.ltrim($this->poster_path, '/');
    }

    public function getBackdropUrlAttribute(): ?string
    {
        if (! $this->backdrop_path) {
            return null;
        }
        if (Str::startsWith($this->backdrop_path, ['http://', 'https://'])) {
            return $this->backdrop_path;
        }

        return 'https://image.tmdb.org/t/p/w1280/'.ltrim($this->backdrop_path, '/');
    }

    public function getSeasonNumberAttribute(): ?int
    {
        $clean = preg_replace('/uHDFilmindir|Filmindir/i', '', $this->file_name ?? $this->file_path ?? '');
        if (preg_match('/S(\d+)E(\d+)/i', $clean, $matches)) {
            return (int) $matches[1];
        }
        if (preg_match('/(\d+)x(\d+)/i', $clean, $matches)) {
            return (int) $matches[1];
        }

        return null;
    }

    public function getEpisodeNumberAttribute(): ?int
    {
        $clean = preg_replace('/uHDFilmindir|Filmindir/i', '', $this->file_name ?? $this->file_path ?? '');
        if (preg_match('/S(\d+)E(\d+)/i', $clean, $matches)) {
            return (int) $matches[2];
        }
        if (preg_match('/(\d+)x(\d+)/i', $clean, $matches)) {
            return (int) $matches[2];
        }

        return null;
    }

    public function getQualityLabelAttribute(): string
    {
        $cleanName = preg_replace('/uHDFilmindir|Filmindir/i', '', $this->file_name ?? $this->file_path ?? '');
        if (preg_match('/(2160p|\b4k\b|\buhd\b)/i', $cleanName)) {
            return '4K Ultra HD';
        }
        if (preg_match('/remux/i', $cleanName)) {
            return '1080p REMUX';
        }
        if (preg_match('/m1080p/i', $cleanName)) {
            return 'm1080p HD';
        }
        if (preg_match('/1080p/i', $cleanName)) {
            return '1080p Full HD';
        }
        if (preg_match('/m720p/i', $cleanName)) {
            return 'm720p HD';
        }
        if (preg_match('/720p/i', $cleanName)) {
            return '720p HD';
        }

        return 'HD';
    }

    public function getTmdbMatchStatusAttribute(): array
    {
        if (! $this->tmdb_id) {
            return [
                'status' => 'missing',
                'label' => 'TMDB Eksik',
                'color' => 'amber',
                'issues' => ['TMDB bilgisi çekilmemiş'],
            ];
        }

        $issues = [];

        // 1. Afiş (Poster) Eksikliği Kontrolü
        if (empty($this->poster_path)) {
            $issues[] = 'Afiş Yok';
        }

        // 2. Başlık Uyuşmazlığı Kontrolü (Türkçe karakter ve temizlik normalizasyonu)
        $trMap = ['ç' => 'c', 'Ç' => 'c', 'ğ' => 'g', 'Ğ' => 'g', 'ı' => 'i', 'I' => 'i', 'İ' => 'i', 'ö' => 'o', 'Ö' => 'o', 'ş' => 's', 'Ş' => 's', 'ü' => 'u', 'Ü' => 'u'];

        $normFile = strtr($this->file_name ?? '', $trMap);
        $normFile = strtolower(pathinfo($normFile, PATHINFO_FILENAME));
        $normFile = preg_replace('/(m1080p|1080p|m720p|720p|2160p|4k|bluray|web-dl|webrip|dual|x264|x265|ac3|rarbg|divxup|uhdfilmindir|film|dizi|sansursuz|yerli|german|korean|yts|mx|vxt|s\d+e\d+|\d+x\d+)/i', '', $normFile);
        $normFile = trim(preg_replace('/[^a-z0-9]+/', ' ', $normFile));
        $normFileNoYear = trim(preg_replace('/\b(19\d{2}|20\d{2})\b/', '', $normFile));

        $normTitle = trim(preg_replace('/[^a-z0-9]+/', ' ', strtolower(strtr($this->title ?? '', $trMap))));
        $normOriginal = trim(preg_replace('/[^a-z0-9]+/', ' ', strtolower(strtr($this->original_title ?? '', $trMap))));
        $normTitleNoYear = trim(preg_replace('/\b(19\d{2}|20\d{2})\b/', '', $normTitle));
        $normOriginalNoYear = trim(preg_replace('/\b(19\d{2}|20\d{2})\b/', '', $normOriginal));

        similar_text($normFileNoYear, $normTitleNoYear, $sim1);
        similar_text($normFileNoYear, $normOriginalNoYear, $sim2);
        $bestSim = max($sim1, $sim2);

        $fileWords = array_filter(explode(' ', $normFileNoYear), fn ($w) => strlen($w) >= 3);
        $matchedWordsCount = 0;
        foreach ($fileWords as $word) {
            if (str_contains($normTitleNoYear, $word) || str_contains($normOriginalNoYear, $word)) {
                $matchedWordsCount++;
            }
        }

        $hasWordOverlap = count($fileWords) === 0 || ($matchedWordsCount / count($fileWords)) >= 0.4;

        if ($bestSim < 40 && ! $hasWordOverlap) {
            $issues[] = 'Başlık Uyuşmazlığı';
        }

        // 3. Yıl Uyuşmazlığı Kontrolü
        if ($this->year && preg_match('/\b(19\d{2}|20\d{2})\b/', $this->file_name ?? '', $ym)) {
            $fileYear = (int) $ym[1];
            if (abs($fileYear - $this->year) > 2) {
                $issues[] = "Yıl Uyuşmazlığı ({$fileYear} vs {$this->year})";
            }
        }

        if (! empty($issues)) {
            return [
                'status' => 'suspicious',
                'label' => 'Hatalı / Şüpheli Eşleşme',
                'color' => 'rose',
                'issues' => $issues,
            ];
        }

        return [
            'status' => 'ok',
            'label' => 'Eşleşti',
            'color' => 'emerald',
            'issues' => [],
        ];
    }

    public static function generateUniqueSlug(string $title, ?int $year = null, ?int $ignoreId = null): string
    {
        $base = Str::slug($title.($year ? "-{$year}" : ''));
        if (empty($base)) {
            $base = 'media-'.Str::random(6);
        }

        $slug = $base;
        $count = 1;

        while (static::where('slug', $slug)->when($ignoreId, fn ($q) => $q->where('id', '!=', $ignoreId))->exists()) {
            $slug = "{$base}-{$count}";
            $count++;
        }

        return $slug;
    }

    public function storageBox()
    {
        return $this->belongsTo(StorageBox::class);
    }

    public function downloadSessions(): HasMany
    {
        return $this->hasMany(DownloadSession::class);
    }

    public function usageRecords(): HasMany
    {
        return $this->hasMany(QuotaUsageRecord::class);
    }
}
