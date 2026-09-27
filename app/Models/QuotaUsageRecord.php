<?php

namespace App\Models;

use App\Enums\UsageSource;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class QuotaUsageRecord extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'quota_period_id',
        'source',
        'media_id',
        'download_session_id',
        'bytes',
        'event_id',
        'started_at',
        'completed_at',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'bytes' => 'integer',
            'source' => UsageSource::class,
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
            'metadata' => 'array',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function quotaPeriod(): BelongsTo
    {
        return $this->belongsTo(QuotaPeriod::class);
    }

    public function media(): BelongsTo
    {
        return $this->belongsTo(Media::class);
    }

    public function downloadSession(): BelongsTo
    {
        return $this->belongsTo(DownloadSession::class);
    }
}
