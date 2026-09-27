<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PlexAccount extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'plex_user_id',
        'plex_username',
        'plex_email',
        'is_active',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function usageSessions(): HasMany
    {
        return $this->hasMany(PlexUsageSession::class);
    }
}
