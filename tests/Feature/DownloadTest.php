<?php

use App\Models\Media;
use App\Models\User;
use App\Services\DownloadAuthorizationService;

test('authorized user receives valid signed download link', function () {
    $user = User::factory()->create();

    $mountPath = config('storagebox.mount_path', storage_path('app/storagebox'));
    if (! file_exists($mountPath)) {
        mkdir($mountPath, 0755, true);
    }
    $sampleFile = $mountPath.'/test_film.mkv';
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

    // Test HEAD request (used by IDM and download managers for pre-fetch verification)
    $headResponse = $this->call('HEAD', $result['download_url']);
    $headResponse->assertStatus(200);
    $headResponse->assertHeader('Content-Length', '16');
    $headResponse->assertHeader('Accept-Ranges', 'bytes');
    $headResponse->assertHeaderMissing('Content-Range');

    // Test zero-byte probe Range: bytes=0-0 (used by IDM to check byte range support and total file size)
    $probeResponse = $this->get($result['download_url'], [
        'Range' => 'bytes=0-0',
    ]);
    $probeResponse->assertStatus(206);
    $probeResponse->assertHeader('Content-Range', 'bytes 0-0/16');
    $probeResponse->assertHeader('Content-Length', '1');
    expect($probeResponse->streamedContent())->toBe('0');

    // Test streaming endpoint with HTTP Range header
    $response = $this->get($result['download_url'], [
        'Range' => 'bytes=0-7',
    ]);

    $response->assertStatus(206);
    $response->assertHeader('Content-Range', 'bytes 0-7/16');
    $response->assertHeader('Content-Length', '8');
    expect($response->streamedContent())->toBe('01234567');

    // Test normal full GET request (no Range header)
    $fullResponse = $this->get($result['download_url']);
    $fullResponse->assertStatus(200);
    $fullResponse->assertHeader('Content-Length', '16');
    $fullResponse->assertHeader('Accept-Ranges', 'bytes');
    $fullResponse->assertHeaderMissing('Content-Range');
    expect($fullResponse->streamedContent())->toBe('0123456789ABCDEF');
});
