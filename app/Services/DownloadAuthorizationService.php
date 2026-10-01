<?php

namespace App\Services;

use App\Enums\DownloadStatus;
use App\Models\DownloadSession;
use App\Models\Media;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Facades\URL;
use Illuminate\Support\Str;
use InvalidArgumentException;

class DownloadAuthorizationService
{
    public function __construct(
        protected StorageBoxService $storageBoxService,
    ) {}

    /**
     * Authorize user download and generate a signed URL token session.
     */
    public function authorize(User $user, Media $media, ?string $ipAddress = null, ?string $userAgent = null): array
    {
        if (! $user->isActive()) {
            throw new InvalidArgumentException('Hesabınız aktif durumda değil.');
        }

        if (! $user->download_enabled) {
            throw new InvalidArgumentException('İndirme yetkiniz bulunmamaktadır.');
        }

        if (! $media->is_active || ! $media->is_available) {
            throw new InvalidArgumentException('İstediğiniz medya dosyası şu anda erişilebilir değil.');
        }

        if (! $this->storageBoxService->fileExists($media->file_path, $media->storageBox)) {
            throw new InvalidArgumentException('Medya dosyası depolama alanında bulunamadı.');
        }

        // Ensure media file_size is populated before creating download session
        if ($media->file_size <= 0 && $media->storageBox) {
            $remoteSize = $this->storageBoxService->fetchRemoteFileSize($media->file_path, $media->storageBox);
            if ($remoteSize > 0) {
                $media->update(['file_size' => $remoteSize]);
                $media->refresh();
            }
        }

        // Reuse existing active session for the SAME media if still valid (IDM & multi-connection support)
        $existingSession = DownloadSession::where('user_id', $user->id)
            ->where('media_id', $media->id)
            ->where('status', DownloadStatus::ACTIVE)
            ->where('expires_at', '>', Carbon::now())
            ->first();

        if ($existingSession) {
            if ($existingSession->file_size <= 0 && $media->file_size > 0) {
                $existingSession->update(['file_size' => $media->file_size]);
            }

            $downloadUrl = route('download.stream', ['token' => $existingSession->token]);

            return [
                'download_url' => $downloadUrl,
                'session' => $existingSession,
                'expires_at' => $existingSession->expires_at->toIso8601String(),
            ];
        }

        // Generate session token
        $token = Str::random(40);
        $ttlMinutes = config('downloads.url_ttl_minutes', 60);
        $expiresAt = Carbon::now()->addMinutes($ttlMinutes);

        $session = DownloadSession::create([
            'user_id' => $user->id,
            'media_id' => $media->id,
            'token' => $token,
            'file_size' => $media->file_size,
            'bytes_transferred' => 0,
            'last_byte_position' => 0,
            'status' => DownloadStatus::ACTIVE,
            'started_at' => Carbon::now(),
            'last_activity_at' => Carbon::now(),
            'expires_at' => $expiresAt,
            'ip_address' => $ipAddress,
            'user_agent' => $userAgent,
        ]);

        $downloadUrl = route('download.stream', ['token' => $token]);

        return [
            'download_url' => $downloadUrl,
            'session' => $session,
            'expires_at' => $expiresAt->toIso8601String(),
        ];
    }
}
