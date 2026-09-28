<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class JellyfinAccount extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'jellyfin_user_id',
        'username',
        'is_administrator',
        'is_disabled',
        'last_activity_date',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'is_administrator' => 'boolean',
            'is_disabled' => 'boolean',
            'last_activity_date' => 'datetime',
            'metadata' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
