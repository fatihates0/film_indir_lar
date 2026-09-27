<?php

namespace App\Models;

use App\Enums\PlexUsageMode;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PlexUsageSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'plex_account_id',
        'media_id',
        'plex_session_id',
        'started_at',
        'last_seen_at',
        'stopped_at',
        'last_position_ms',
        'usage_bytes',
        'usage_mode',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'started_at' => 'datetime',
            'last_seen_at' => 'datetime',
            'stopped_at' => 'datetime',
            'last_position_ms' => 'integer',
            'usage_bytes' => 'integer',
            'usage_mode' => PlexUsageMode::class,
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function plexAccount(): BelongsTo
    {
        return $this->belongsTo(PlexAccount::class);
    }

    public function media(): BelongsTo
    {
        return $this->belongsTo(Media::class);
    }
}
