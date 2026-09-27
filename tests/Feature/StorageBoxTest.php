<?php

use App\Models\Media;
use App\Models\StorageBox;
use App\Models\User;

test('admin can create, update, and delete storage box', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $response = $this->actingAs($admin)->post('/admin/storage-boxes', [
        'name' => 'Test Storage Box',
        'mount_path' => storage_path('app/test_box'),
        'disk_type' => 'cifs',
        'host' => 'u12345.your-storagebox.de',
        'username' => 'u12345',
        'password' => 'secret123',
    ]);

    $response->assertRedirect();
    $box = StorageBox::where('name', 'Test Storage Box')->first();
    expect($box)->not->toBeNull();
    expect($box->host)->toBe('u12345.your-storagebox.de');

    // Test Deletion
    $deleteResponse = $this->actingAs($admin)->delete("/admin/storage-boxes/{$box->id}");
    $deleteResponse->assertRedirect();

    expect(StorageBox::find($box->id))->toBeNull();
});

test('unique slug generator handles duplicate file titles during scanner', function () {
    $slug1 = Media::generateUniqueSlug('game.of.thrones.s01e01');
    Media::create([
        'title' => 'game.of.thrones.s01e01',
        'slug' => $slug1,
        'file_path' => 'Diziler/GoT/s01e01.mkv',
        'file_name' => 's01e01.mkv',
        'file_size' => 1000,
        'is_active' => true,
    ]);

    $slug2 = Media::generateUniqueSlug('game.of.thrones.s01e01');
    expect($slug2)->not->toBe($slug1);
    expect($slug2)->toBe('gameofthroness01e01-1');
});
