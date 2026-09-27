<?php

use App\Jobs\ProcessRemoteTransferJob;
use App\Models\RemoteTransfer;
use App\Models\StorageBox;
use App\Models\User;
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
