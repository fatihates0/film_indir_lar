<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class UserQuota extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'quota_limit_bytes',
        'used_bytes',
        'period_started_at',
        'period_expires_at',
    ];

    protected function casts(): array
    {
        return [
            'quota_limit_bytes' => 'integer',
            'used_bytes' => 'integer',
            'period_started_at' => 'datetime',
            'period_expires_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function getRemainingBytesAttribute(): int
    {
        return max(0, $this->quota_limit_bytes - $this->used_bytes);
    }
}
