<?php

namespace Database\Seeders;

use App\Enums\MediaType;
use App\Enums\UserRole;
use App\Enums\UserStatus;
use App\Models\Media;
use App\Models\StorageBox;
use App\Models\User;
use App\Services\QuotaService;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $quotaService = app(QuotaService::class);
        $password = Hash::make('password');

        // Admin User
        $admin = User::firstOrCreate(
            ['email' => 'admin@platform.com'],
            [
                'name' => 'Sistem Yöneticisi',
                'password' => $password,
                'role' => UserRole::ADMIN,
                'status' => UserStatus::ACTIVE,
                'download_enabled' => true,
                'plex_enabled' => true,
            ]
        );
        $quotaService->ensureCurrentPeriod($admin);

        // Test Users from proje.md spec
        $usersConfig = [
            ['name' => 'Kullanıcı X1', 'email' => 'x_1@platform.com', 'gb' => 1000],
            ['name' => 'Kullanıcı X2', 'email' => 'x_2@platform.com', 'gb' => 2000],
            ['name' => 'Kullanıcı X3', 'email' => 'x_3@platform.com', 'gb' => 500],
        ];

        foreach ($usersConfig as $cfg) {
            $user = User::firstOrCreate(
                ['email' => $cfg['email']],
                [
                    'name' => $cfg['name'],
                    'password' => $password,
                    'role' => UserRole::USER,
                    'status' => UserStatus::ACTIVE,
                    'download_enabled' => true,
                    'plex_enabled' => true,
                ]
            );

            $limitBytes = $cfg['gb'] * 1073741824;
            $quotaService->ensureCurrentPeriod($user);
            $quotaService->updateQuotaLimit($user, $limitBytes);
        }

        // Prepare default Storage Box models
        $mountPath = config('storagebox.mount_path', storage_path('app/storagebox'));
        if (! file_exists($mountPath)) {
            mkdir($mountPath, 0755, true);
        }

        $box1 = StorageBox::firstOrCreate(
            ['slug' => 'storage-box-1-filmler'],
            [
                'name' => 'Storage Box 1 - Filmler',
                'mount_path' => $mountPath,
                'disk_type' => 'cifs',
                'username' => 'u382910',
                'is_active' => true,
                'status' => file_exists($mountPath) ? 'online' : 'offline',
            ]
        );

        $box2 = StorageBox::firstOrCreate(
            ['slug' => 'storage-box-2-diziler'],
            [
                'name' => 'Storage Box 2 - Diziler',
                'mount_path' => $mountPath,
                'disk_type' => 'cifs',
                'username' => 'u382911',
                'is_active' => true,
                'status' => file_exists($mountPath) ? 'online' : 'offline',
            ]
        );

        $sampleMedia = [
            [
                'box_id' => $box1->id,
                'title' => 'Inception',
                'original_title' => 'Inception',
                'year' => 2010,
                'type' => MediaType::MOVIE,
                'file_name' => 'Inception.2010.1080p.BluRay.mkv',
                'relative_path' => 'Filmler/Inception.2010.1080p.BluRay.mkv',
                'size_mb' => 25,
                'duration' => 8880,
                'bitrate' => 12000000,
                'video_codec' => 'h264',
                'audio_codec' => 'aac',
            ],
            [
                'box_id' => $box1->id,
                'title' => 'Interstellar',
                'original_title' => 'Interstellar',
                'year' => 2014,
                'type' => MediaType::MOVIE,
                'file_name' => 'Interstellar.2014.2160p.UHD.mkv',
                'relative_path' => 'Filmler/Interstellar.2014.2160p.UHD.mkv',
                'size_mb' => 50,
                'duration' => 10140,
                'bitrate' => 25000000,
                'video_codec' => 'hevc',
                'audio_codec' => 'truehd',
            ],
            [
                'box_id' => $box2->id,
                'title' => 'The Wire S01E01',
                'original_title' => 'The Wire - The Target',
                'year' => 2002,
                'type' => MediaType::EPISODE,
                'file_name' => 'The.Wire.S01E01.1080p.mkv',
                'relative_path' => 'Diziler/The Wire/The.Wire.S01E01.1080p.mkv',
                'size_mb' => 15,
                'duration' => 3600,
                'bitrate' => 6000000,
                'video_codec' => 'h264',
                'audio_codec' => 'ac3',
            ],
        ];

        foreach ($sampleMedia as $item) {
            $fullFilePath = $mountPath . DIRECTORY_SEPARATOR . str_replace('/', DIRECTORY_SEPARATOR, $item['relative_path']);
            $dir = dirname($fullFilePath);
            if (! file_exists($dir)) {
                mkdir($dir, 0755, true);
            }

            if (! file_exists($fullFilePath)) {
                $bytesCount = $item['size_mb'] * 1048576;
                $handle = fopen($fullFilePath, 'w');
                if ($handle) {
                    fseek($handle, $bytesCount - 1);
                    fwrite($handle, "\0");
                    fclose($handle);
                }
            }

            $actualSizeBytes = file_exists($fullFilePath) ? filesize($fullFilePath) : ($item['size_mb'] * 1048576);

            Media::updateOrCreate(
                ['file_path' => $item['relative_path']],
                [
                    'storage_box_id' => $item['box_id'],
                    'type' => $item['type'],
                    'title' => $item['title'],
                    'original_title' => $item['original_title'],
                    'year' => $item['year'],
                    'slug' => Str::slug($item['title'] . '-' . $item['year']),
                    'file_name' => $item['file_name'],
                    'file_size' => $actualSizeBytes,
                    'extension' => 'mkv',
                    'mime_type' => 'video/x-matroska',
                    'duration_seconds' => $item['duration'],
                    'width' => 1920,
                    'height' => 1080,
                    'video_codec' => $item['video_codec'],
                    'audio_codec' => $item['audio_codec'],
                    'audio_channels' => 6,
                    'audio_language' => 'tr,en',
                    'subtitle_languages' => 'tr,en',
                    'fps' => 23.976,
                    'bitrate' => $item['bitrate'],
                    'is_active' => true,
                    'is_available' => true,
                ]
            );
        }
    }
}
