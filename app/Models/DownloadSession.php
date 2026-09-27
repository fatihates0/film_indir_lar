<?php

namespace App\Models;

use App\Enums\DownloadStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class DownloadSession extends Model
{
    use HasFactory;

    protected $fillable = [
        'user_id',
        'media_id',
        'token',
        'file_size',
        'bytes_transferred',
        'last_byte_position',
        'status',
        'started_at',
        'last_activity_at',
        'completed_at',
        'expires_at',
        'ip_address',
        'user_agent',
    ];

    protected function casts(): array
    {
        return [
            'file_size' => 'integer',
            'bytes_transferred' => 'integer',
            'last_byte_position' => 'integer',
            'status' => DownloadStatus::class,
            'started_at' => 'datetime',
            'last_activity_at' => 'datetime',
            'completed_at' => 'datetime',
            'expires_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function media(): BelongsTo
    {
        return $this->belongsTo(Media::class);
    }

    public function usageRecords(): HasMany
    {
        return $this->hasMany(QuotaUsageRecord::class);
    }
}
