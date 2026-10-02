<?php

use App\Enums\MediaType;
use App\Jobs\MediaScanJob;
use App\Models\Media;
use App\Models\MediaScan;
use App\Models\StorageBox;
use App\Models\User;
use App\Services\MediaScannerService;
use Illuminate\Support\Facades\Queue;

beforeEach(function () {
    $this->admin = User::factory()->create(['role' => 'admin']);
});

test('admin can queue automatic media scan from media page', function () {
    Queue::fake();

    $response = $this->actingAs($this->admin)->postJson(route('admin.media.scan'));

    $response->assertStatus(200)
        ->assertJson([
            'status' => 'success',
            'message' => 'Otomatik tarama kuyruğa alındı ve arka planda başlatıldı.',
        ]);

    $this->assertDatabaseHas('media_scans', [
        'scan_type' => 'all',
        'status' => 'pending',
    ]);

    Queue::assertPushed(MediaScanJob::class);
});

test('admin can queue storage box scan from storage box page', function () {
    Queue::fake();

    $box = StorageBox::create([
        'name' => 'Test Box',
        'slug' => 'test-box',
        'mount_path' => storage_path('app/test_box'),
        'disk_type' => 'local',
        'is_active' => true,
    ]);

    $response = $this->actingAs($this->admin)->postJson(route('admin.storage-boxes.scan', $box->id));

    $response->assertStatus(200)
        ->assertJson([
            'status' => 'success',
        ]);

    $this->assertDatabaseHas('media_scans', [
        'storage_box_id' => $box->id,
        'scan_type' => 'box',
        'status' => 'pending',
    ]);

    Queue::assertPushed(MediaScanJob::class);
});

test('admin can poll scan status', function () {
    $scan = MediaScan::create([
        'scan_type' => 'all',
        'status' => 'running',
        'progress_percent' => 45.0,
        'current_target' => 'Test Box taranıyor...',
        'added_count' => 5,
        'updated_count' => 2,
    ]);

    $response = $this->actingAs($this->admin)->getJson(route('admin.media.scan-status'));

    $response->assertStatus(200)
        ->assertJson([
            'status' => 'success',
            'active_scan' => [
                'id' => $scan->id,
                'status' => 'running',
                'progress_percent' => 45.0,
                'added_count' => 5,
            ],
        ]);
});

test('admin can cancel active scan', function () {
    $scan = MediaScan::create([
        'scan_type' => 'all',
        'status' => 'running',
    ]);

    $response = $this->actingAs($this->admin)->postJson(route('admin.media.scan-cancel', $scan->id));

    $response->assertStatus(200)
        ->assertJson([
            'status' => 'success',
            'message' => 'Tarama işlemi iptal edildi.',
        ]);

    $this->assertDatabaseHas('media_scans', [
        'id' => $scan->id,
        'status' => 'cancelled',
    ]);
});

test('media scan job executes successfully and marks scan completed', function () {
    $scan = MediaScan::create([
        'scan_type' => 'all',
        'status' => 'pending',
    ]);

    $job = new MediaScanJob($scan->id);
    $job->handle(app(MediaScannerService::class));

    $this->assertDatabaseHas('media_scans', [
        'id' => $scan->id,
        'status' => 'completed',
        'progress_percent' => 100,
    ]);
});

test('scheduled scan job skips when another scan is currently running', function () {
    MediaScan::create([
        'scan_type' => 'all',
        'status' => 'running',
    ]);

    $job = new MediaScanJob;
    $job->handle(app(MediaScannerService::class));

    // No new pending/running scan should be created beyond the initial 1
    expect(MediaScan::whereIn('status', ['pending', 'running'])->count())->toBe(1);
});

test('stale scan job older than 2 hours is marked as failed', function () {
    $stale = MediaScan::create([
        'scan_type' => 'all',
        'status' => 'running',
    ]);
    $stale->timestamps = false;
    $stale->updated_at = now()->subHours(3);
    $stale->save();

    $job = new MediaScanJob;
    $job->handle(app(MediaScannerService::class));

    $stale->refresh();
    expect($stale->status)->toBe('failed');
    expect($stale->error_message)->toContain('zaman aşımına uğradı');
});

test('media scanner service relative path calculation is case insensitive', function () {
    $service = app(MediaScannerService::class);
    $rel = $service->getRelativePath('C:/mnt/storagebox/Movies/film.mkv', 'c:/mnt/storagebox');
    expect($rel)->toBe('Movies/film.mkv');
});

test('media scanner prevents duplicate records when file path or folder changes', function () {
    $box = StorageBox::create([
        'name' => 'Box Dup Test',
        'slug' => 'box-dup-test',
        'mount_path' => storage_path('app/box_dup_test'),
        'disk_type' => 'local',
        'is_active' => true,
    ]);

    $existingMedia = Media::create([
        'storage_box_id' => $box->id,
        'type' => MediaType::MOVIE,
        'title' => 'Sample Movie',
        'slug' => 'sample-movie-2024',
        'file_path' => 'OldFolder/SampleMovie.mkv',
        'file_name' => 'SampleMovie.mkv',
        'file_size' => 1048576,
        'extension' => 'mkv',
        'is_active' => true,
        'is_available' => true,
    ]);

    $service = app(MediaScannerService::class);

    // Simulate processMediaFile with new path for the same file name and size
    $refMethod = new ReflectionMethod(MediaScannerService::class, 'processMediaFile');
    $refMethod->setAccessible(true);
    $res = $refMethod->invoke($service, $box, 'NewFolder/SampleMovie.mkv', 'SampleMovie.mkv', 1048576, 'mkv');

    expect($res)->toBe('updated');
    expect(Media::where('storage_box_id', $box->id)->count())->toBe(1);

    $existingMedia->refresh();
    expect($existingMedia->file_path)->toBe('NewFolder/SampleMovie.mkv');
});

test('media scanner deactivates old record and creates new when size mismatches', function () {
    $box = StorageBox::create([
        'name' => 'Box Size Mismatch Test',
        'slug' => 'box-size-mismatch',
        'mount_path' => storage_path('app/box_size_mismatch'),
        'disk_type' => 'local',
        'is_active' => true,
    ]);

    $oldMedia = Media::create([
        'storage_box_id' => $box->id,
        'type' => MediaType::MOVIE,
        'title' => 'Sample Movie',
        'slug' => 'sample-movie-2024',
        'file_path' => 'Filmler3/SampleMovie.mkv',
        'file_name' => 'SampleMovie.mkv',
        'file_size' => 3000000,
        'extension' => 'mkv',
        'is_active' => true,
        'is_available' => true,
    ]);

    $service = app(MediaScannerService::class);

    $refMethod = new ReflectionMethod(MediaScannerService::class, 'processMediaFile');
    $refMethod->setAccessible(true);
    // Different file size (2000000 vs 3000000)
    $res = $refMethod->invoke($service, $box, 'Filmler2/SampleMovie.mkv', 'SampleMovie.mkv', 2000000, 'mkv');

    expect($res)->toBe('added');

    $oldMedia->refresh();
    expect($oldMedia->is_available)->toBeFalse();

    $newMedia = Media::where('file_path', 'Filmler2/SampleMovie.mkv')->first();
    expect($newMedia)->not->toBeNull();
    expect($newMedia->is_available)->toBeTrue();
    expect($newMedia->file_size)->toBe(2000000);
});
