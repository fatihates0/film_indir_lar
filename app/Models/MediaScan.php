<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MediaScan extends Model
{
    use HasFactory;

    protected $fillable = [
        'storage_box_id',
        'user_id',
        'sub_directory',
        'scan_type',
        'status',
        'progress_percent',
        'current_target',
        'total_scanned',
        'added_count',
        'updated_count',
        'missing_count',
        'error_message',
        'started_at',
        'completed_at',
    ];

    protected function casts(): array
    {
        return [
            'progress_percent' => 'float',
            'total_scanned' => 'integer',
            'added_count' => 'integer',
            'updated_count' => 'integer',
            'missing_count' => 'integer',
            'started_at' => 'datetime',
            'completed_at' => 'datetime',
        ];
    }

    public function storageBox(): BelongsTo
    {
        return $this->belongsTo(StorageBox::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function isRunning(): bool
    {
        return in_array($this->status, ['pending', 'running'], true);
    }

    public function isCompleted(): bool
    {
        return in_array($this->status, ['completed', 'failed', 'cancelled'], true);
    }
}
