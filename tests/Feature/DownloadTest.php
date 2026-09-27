<?php

use App\Models\Media;
use App\Models\User;
use App\Services\DownloadAuthorizationService;
use App\Services\StorageBoxService;

test('authorized user receives valid signed download link', function () {
    $user = User::factory()->create();
    $quotaService = app(\App\Services\QuotaService::class);
    $quotaService->ensureCurrentPeriod($user);

    $mountPath = config('storagebox.mount_path', storage_path('app/storagebox'));
    if (! file_exists($mountPath)) {
        mkdir($mountPath, 0755, true);
    }
    $sampleFile = $mountPath . '/test_film.mkv';
    file_put_contents($sampleFile, '0123456789ABCDEF'); // 16 bytes test file

    $media = Media::create([
        'title' => 'Test Film',
        'file_path' => 'test_film.mkv',
        'file_name' => 'test_film.mkv',
        'file_size' => 16,
        'slug' => 'test-film',
        'is_active' => true,
        'is_available' => true,
    ]);

    $authService = app(DownloadAuthorizationService::class);
    $result = $authService->authorize($user, $media);

    expect($result['download_url'])->toContain('/download/stream/');

    // Test streaming endpoint with HTTP Range header
    $response = $this->get($result['download_url'], [
        'Range' => 'bytes=0-7',
    ]);

    $response->assertStatus(206);
    $response->assertHeader('Content-Range', 'bytes 0-7/16');
    $response->assertHeader('Content-Length', '8');
    expect($response->streamedContent())->toBe('01234567');
});
