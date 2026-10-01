<?php

use App\Jobs\ProcessRemoteTransferJob;
use App\Models\RemoteTransfer;
use App\Models\StorageBox;
use App\Models\User;
use App\Services\AuditLogService;
use App\Services\RemoteTransferService;
use App\Services\StorageBoxService;
use Illuminate\Support\Facades\Queue;

beforeEach(function () {
    $this->admin = User::factory()->create([
        'role' => 'admin',
    ]);

    $this->box = StorageBox::create([
        'name' => 'Test Box',
        'slug' => 'test-box',
        'mount_path' => storage_path('app/test_box'),
        'disk_type' => 'cifs',
        'host' => 'u12345.your-storagebox.de',
        'username' => 'u12345',
        'is_active' => true,
        'status' => 'online',
    ]);
});

test('admin can probe a remote url', function () {
    $response = $this->actingAs($this->admin)->postJson(route('admin.storage-boxes.probe-url'), [
        'url' => 'https://example.com/test-movie.2025.1080p.mkv',
    ]);

    $response->assertOk();
    $data = $response->json();

    expect($data)->toHaveKey('file_name')
        ->and($data)->toHaveKey('suggested_folder');
});

test('admin can start a remote transfer and dispatch job', function () {
    Queue::fake();

    $response = $this->actingAs($this->admin)->post(route('admin.storage-boxes.remote-transfer'), [
        'source_url' => 'https://example.com/movie.2025.mkv',
        'storage_box_id' => $this->box->id,
        'target_folder' => 'Filmler',
        'file_name' => 'movie.2025.mkv',
        'auto_add_media' => true,
    ]);

    $response->assertRedirect();

    $this->assertDatabaseHas('remote_transfers', [
        'storage_box_id' => $this->box->id,
        'file_name' => 'movie.2025.mkv',
        'status' => 'pending',
    ]);

    Queue::assertPushed(ProcessRemoteTransferJob::class);
});

test('admin can list transfers with live progress info', function () {
    RemoteTransfer::create([
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/test.mkv',
        'target_folder' => 'Filmler',
        'file_name' => 'test.mkv',
        'relative_path' => 'Filmler/test.mkv',
        'total_bytes' => 1000000,
        'transferred_bytes' => 500000,
        'progress_percent' => 50.00,
        'speed_bps' => 1048576,
        'status' => 'transferring',
    ]);

    $response = $this->actingAs($this->admin)->getJson(route('admin.storage-boxes.transfers'));

    $response->assertOk();
    $data = $response->json();

    expect($data['has_active'])->toBeTrue()
        ->and(count($data['transfers']))->toBeGreaterThanOrEqual(1);
});

test('admin can cancel a transfer', function () {
    $transfer = RemoteTransfer::create([
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/cancel.mkv',
        'target_folder' => 'Filmler',
        'file_name' => 'cancel.mkv',
        'relative_path' => 'Filmler/cancel.mkv',
        'status' => 'transferring',
    ]);

    $response = $this->actingAs($this->admin)->deleteJson(route('admin.storage-boxes.cancel-transfer', $transfer->id));

    $response->assertOk();

    expect($transfer->fresh()->status)->toBe('cancelled');
});

test('admin can queue bulk transfers from multiline urls', function () {
    Queue::fake();

    $urls = "https://example.com/movie1.2025.mkv\nhttps://example.com/movie2.2025.mkv\nhttps://example.com/series.s01e01.mkv";

    $response = $this->actingAs($this->admin)->post(route('admin.storage-boxes.bulk-remote-transfer'), [
        'urls' => $urls,
        'storage_box_id' => $this->box->id,
        'target_folder' => 'Filmler',
        'auto_add_media' => true,
    ]);

    $response->assertRedirect();

    $this->assertDatabaseHas('remote_transfers', [
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/movie1.2025.mkv',
    ]);

    $this->assertDatabaseHas('remote_transfers', [
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/movie2.2025.mkv',
    ]);

    Queue::assertPushed(ProcessRemoteTransferJob::class, 3);
});

test('admin can paginate transfers and bulk delete them', function () {
    $t1 = RemoteTransfer::create([
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/item1.mkv',
        'target_folder' => 'Filmler',
        'file_name' => 'item1.mkv',
        'relative_path' => 'Filmler/item1.mkv',
        'status' => 'completed',
    ]);

    $t2 = RemoteTransfer::create([
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/item2.mkv',
        'target_folder' => 'Filmler',
        'file_name' => 'item2.mkv',
        'relative_path' => 'Filmler/item2.mkv',
        'status' => 'pending',
    ]);

    // Check pagination metadata
    $response = $this->actingAs($this->admin)->getJson(route('admin.storage-boxes.transfers', ['page' => 1, 'per_page' => 1]));
    $response->assertOk();
    $data = $response->json();

    expect($data)->toHaveKey('pagination')
        ->and($data['pagination']['total'])->toBeGreaterThanOrEqual(2)
        ->and(count($data['transfers']))->toBe(1);

    // Bulk delete both
    $delResponse = $this->actingAs($this->admin)->postJson(route('admin.storage-boxes.transfers.bulk-delete'), [
        'ids' => [$t1->id, $t2->id],
    ]);

    $delResponse->assertOk();
    $this->assertDatabaseMissing('remote_transfers', ['id' => $t1->id]);
    $this->assertDatabaseMissing('remote_transfers', ['id' => $t2->id]);
});

test('admin can bulk cancel active transfers', function () {
    $t1 = RemoteTransfer::create([
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/item1.mkv',
        'target_folder' => 'Filmler',
        'file_name' => 'item1.mkv',
        'relative_path' => 'Filmler/item1.mkv',
        'status' => 'transferring',
    ]);

    $response = $this->actingAs($this->admin)->postJson(route('admin.storage-boxes.transfers.bulk-cancel'), [
        'ids' => [$t1->id],
    ]);

    $response->assertOk();
    expect($t1->fresh()->status)->toBe('cancelled');
});

test('admin can upload to random storage box with space check and fallback', function () {
    Queue::fake();

    $box2 = StorageBox::create([
        'name' => 'Full Box',
        'slug' => 'full-box',
        'mount_path' => storage_path('app/full_box'),
        'disk_type' => 'cifs',
        'is_active' => true,
        'metadata' => ['quota_bytes' => 100], // only 100 bytes limit
    ]);

    // Single remote transfer with random storage box
    $response = $this->actingAs($this->admin)->post(route('admin.storage-boxes.remote-transfer'), [
        'source_url' => 'https://example.com/random-movie.mkv',
        'storage_box_id' => 'random',
        'target_folder' => 'Filmler',
        'file_name' => 'random-movie.mkv',
        'auto_add_media' => true,
    ]);

    $response->assertRedirect();
    $this->assertDatabaseHas('remote_transfers', [
        'file_name' => 'random-movie.mkv',
        'status' => 'pending',
    ]);

    // Bulk transfer with random storage box
    $bulkResponse = $this->actingAs($this->admin)->post(route('admin.storage-boxes.bulk-remote-transfer'), [
        'urls' => "https://example.com/film1.mkv\nhttps://example.com/film2.mkv",
        'storage_box_id' => 'random',
        'target_folder' => 'Filmler',
        'auto_add_media' => true,
    ]);

    $bulkResponse->assertRedirect();
    $this->assertDatabaseHas('remote_transfers', [
        'source_url' => 'https://example.com/film1.mkv',
    ]);
});

test('duplicate file with same name and matching size is marked as completed without transferring', function () {
    // Create an existing completed transfer
    RemoteTransfer::create([
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/existing.mkv',
        'target_folder' => 'Filmler',
        'file_name' => 'existing.mkv',
        'relative_path' => 'Filmler/existing.mkv',
        'total_bytes' => 5000000,
        'transferred_bytes' => 5000000,
        'progress_percent' => 100.00,
        'status' => 'completed',
    ]);

    // Mock probeUrl on RemoteTransferService to return the same size
    $mockService = Mockery::mock(
        RemoteTransferService::class,
        [app(StorageBoxService::class), app(AuditLogService::class)]
    )->makePartial();
    $mockService->shouldReceive('probeUrl')->andReturn([
        'success' => true,
        'file_name' => 'existing.mkv',
        'file_size' => 5000000,
        'suggested_type' => 'movie',
        'suggested_title' => 'Existing',
        'suggested_year' => null,
        'suggested_folder' => 'Filmler',
    ]);
    app()->instance(RemoteTransferService::class, $mockService);

    Queue::fake();

    $response = $this->actingAs($this->admin)->post(route('admin.storage-boxes.remote-transfer'), [
        'source_url' => 'https://example.com/existing.mkv',
        'storage_box_id' => $this->box->id,
        'target_folder' => 'Filmler',
        'file_name' => 'existing.mkv',
        'auto_add_media' => false,
    ]);

    $response->assertRedirect();

    // The new transfer should be created directly with completed status
    $latest = RemoteTransfer::latest('id')->first();
    expect($latest->status)->toBe('completed')
        ->and($latest->progress_percent)->toBe(100.00)
        ->and($latest->transferred_bytes)->toBe(5000000);

    // No job should have been dispatched to perform transfer
    Queue::assertNothingPushed();
});

test('remote transfer respects concurrency limit from config and env', function () {
    config(['storagebox.max_concurrent_transfers' => 2]);

    $service = app(RemoteTransferService::class);
    expect($service->getMaxConcurrency())->toBe(2);

    // Create 2 active transferring items
    RemoteTransfer::create([
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/active1.mkv',
        'target_folder' => 'Filmler',
        'file_name' => 'active1.mkv',
        'relative_path' => 'Filmler/active1.mkv',
        'status' => 'transferring',
    ]);
    RemoteTransfer::create([
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/active2.mkv',
        'target_folder' => 'Filmler',
        'file_name' => 'active2.mkv',
        'relative_path' => 'Filmler/active2.mkv',
        'status' => 'transferring',
    ]);

    // Active count should be 2
    expect($service->getActiveTransfersCount())->toBe(2);

    // ProcessQueue should not start any new pending transfers when slots are full
    $pending = RemoteTransfer::create([
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/pending.mkv',
        'target_folder' => 'Filmler',
        'file_name' => 'pending.mkv',
        'relative_path' => 'Filmler/pending.mkv',
        'status' => 'pending',
    ]);

    $started = $service->processQueue();
    expect($started)->toBe(0)
        ->and($pending->fresh()->status)->toBe('pending');
});

test('duplicate file on ANY storage box is recognized across all boxes and marked completed', function () {
    // Create box 2
    $box2 = StorageBox::create([
        'name' => 'Secondary Box',
        'slug' => 'secondary-box',
        'mount_path' => storage_path('app/secondary_box'),
        'disk_type' => 'cifs',
        'is_active' => true,
        'status' => 'online',
    ]);

    // Create completed transfer on box 2
    RemoteTransfer::create([
        'storage_box_id' => $box2->id,
        'source_url' => 'https://example.com/unique-movie.mkv',
        'target_folder' => 'Filmler',
        'file_name' => 'unique-movie.mkv',
        'relative_path' => 'Filmler/unique-movie.mkv',
        'total_bytes' => 12345678,
        'transferred_bytes' => 12345678,
        'progress_percent' => 100.00,
        'status' => 'completed',
    ]);

    $service = app(RemoteTransferService::class);

    // Call findExistingFileAcrossAllBoxes searching for unique-movie.mkv with 12345678 bytes
    $match = $service->findExistingFileAcrossAllBoxes('unique-movie.mkv', 12345678, 'Filmler');

    expect($match)->not->toBeNull()
        ->and($match['box']->id)->toBe($box2->id)
        ->and($match['size'])->toBe(12345678);
});

test('cleanupStuckTransfers auto-completes transfers whose full size matches remote file or transferred bytes', function () {
    $transfer = RemoteTransfer::create([
        'storage_box_id' => $this->box->id,
        'source_url' => 'https://example.com/stuck.mkv',
        'target_folder' => 'Filmler',
        'file_name' => 'stuck.mkv',
        'relative_path' => 'Filmler/stuck.mkv',
        'total_bytes' => 1000000,
        'transferred_bytes' => 1000000,
        'progress_percent' => 99.99,
        'status' => 'transferring',
        'auto_add_media' => false,
    ]);

    $service = app(RemoteTransferService::class);
    $cleaned = $service->cleanupStuckTransfers();

    expect($cleaned)->toBe(1)
        ->and($transfer->fresh()->status)->toBe('completed')
        ->and($transfer->fresh()->progress_percent)->toBe(100.0);
});
