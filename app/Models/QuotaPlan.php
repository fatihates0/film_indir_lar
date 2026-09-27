<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class QuotaPlan extends Model
{
    use HasFactory;

    protected $fillable = [
        'name',
        'slug',
        'quota_limit_bytes',
        'period_days',
        'is_active',
    ];

    protected function casts(): array
    {
        return [
            'quota_limit_bytes' => 'integer',
            'period_days' => 'integer',
            'is_active' => 'boolean',
        ];
    }

    public function users(): HasMany
    {
        return $this->hasMany(User::class);
    }
}
