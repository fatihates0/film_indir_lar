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
