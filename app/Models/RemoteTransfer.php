<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class RemoteTransfer extends Model
{
    use HasFactory;

    protected $fillable = [
        'storage_box_id',
        'source_url',
        'target_folder',
        'file_name',
        'relative_path',
        'total_bytes',
        'transferred_bytes',
        'progress_percent',
        'speed_bps',
        'status',
        'error_message',
        'media_id',
        'auto_add_media',
    ];

    protected function casts(): array
    {
        return [
            'total_bytes' => 'integer',
            'transferred_bytes' => 'integer',
            'progress_percent' => 'float',
            'speed_bps' => 'integer',
            'auto_add_media' => 'boolean',
        ];
    }

    public function storageBox(): BelongsTo
    {
        return $this->belongsTo(StorageBox::class);
    }

    public function media(): BelongsTo
    {
        return $this->belongsTo(Media::class);
    }
}
