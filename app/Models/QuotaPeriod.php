<?php

namespace App\Models;

use App\Enums\QuotaPeriodStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QuotaPeriod extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'quota_limit_bytes',
        'used_bytes',
        'started_at',
        'expires_at',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'quota_limit_bytes' => 'integer',
            'used_bytes' => 'integer',
            'started_at' => 'datetime',
            'expires_at' => 'datetime',
            'status' => QuotaPeriodStatus::class,
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function usageRecords(): HasMany
    {
        return $this->hasMany(QuotaUsageRecord::class);
    }
}
