<?php

use App\Jobs\MediaScanJob;
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
