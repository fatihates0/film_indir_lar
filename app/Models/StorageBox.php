<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class StorageBox extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'mount_path',
        'disk_type',
        'host',
        'username',
        'password',
        'port',
        'share_name',
        'is_active',
        'status',
        'metadata',
    ];

    protected $hidden = [
        'password',
    ];

    protected function casts(): array
    {
        return [
            'password' => 'encrypted',
            'port' => 'integer',
            'is_active' => 'boolean',
            'metadata' => 'array',
        ];
    }

    public function media(): HasMany
    {
        return $this->hasMany(Media::class);
    }
}
