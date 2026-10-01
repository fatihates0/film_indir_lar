<?php

namespace App\Models;

use App\Enums\UserRole;
use App\Enums\UserStatus;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

class User extends Authenticatable
{
    use HasFactory, Notifiable;

    protected $fillable = [
        'name',
        'email',
        'password',
        'role',
        'status',
        'download_enabled',
        'plex_enabled',
        'jellyfin_enabled',
        'max_concurrent_downloads',
        'quota_plan_id',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'role' => UserRole::class,
            'status' => UserStatus::class,
            'download_enabled' => 'boolean',
            'plex_enabled' => 'boolean',
            'jellyfin_enabled' => 'boolean',
            'max_concurrent_downloads' => 'integer',
        ];
    }

    public function isAdmin(): bool
    {
        return $this->role === UserRole::ADMIN;
    }

    public function isActive(): bool
    {
        return $this->status === UserStatus::ACTIVE;
    }

    public function downloadSessions(): HasMany
    {
        return $this->hasMany(DownloadSession::class);
    }

    public function plexAccounts(): HasMany
    {
        return $this->hasMany(PlexAccount::class);
    }

    public function jellyfinAccounts(): HasMany
    {
        return $this->hasMany(JellyfinAccount::class);
    }

    public function jellyfinAccount(): HasOne
    {
        return $this->hasOne(JellyfinAccount::class);
    }

    public function plexUsageSessions(): HasMany
    {
        return $this->hasMany(PlexUsageSession::class);
    }

    public function auditLogs(): HasMany
    {
        return $this->hasMany(AuditLog::class, 'actor_id');
    }
}
