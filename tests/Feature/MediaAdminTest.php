<?php

use App\Models\Media;
use App\Models\User;

test('admin can delete an entire season for a TV series', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $ep1 = Media::create([
        'title' => 'LEGO Ninjago',
        'type' => 'series',
        'tmdb_id' => 99999,
        'slug' => 'lego-ninjago-s02e01',
        'file_name' => 'LEGO.Ninjago.S02E01.1080p.mkv',
        'file_path' => 'LEGO.Ninjago.S02E01.1080p.mkv',
        'file_size' => 1000,
        'is_active' => true,
    ]);

    $ep2 = Media::create([
        'title' => 'LEGO Ninjago',
        'type' => 'series',
        'tmdb_id' => 99999,
        'slug' => 'lego-ninjago-s02e02',
        'file_name' => 'LEGO.Ninjago.S02E02.1080p.mkv',
        'file_path' => 'LEGO.Ninjago.S02E02.1080p.mkv',
        'file_size' => 1000,
        'is_active' => true,
    ]);

    $epSeason3 = Media::create([
        'title' => 'LEGO Ninjago',
        'type' => 'series',
        'tmdb_id' => 99999,
        'slug' => 'lego-ninjago-s03e01',
        'file_name' => 'LEGO.Ninjago.S03E01.1080p.mkv',
        'file_path' => 'LEGO.Ninjago.S03E01.1080p.mkv',
        'file_size' => 1000,
        'is_active' => true,
    ]);

    $response = $this->actingAs($admin)->delete("/admin/media/{$ep1->id}/season", [
        'season_number' => 2,
    ]);

    $response->assertRedirect();

    expect(Media::find($ep1->id))->toBeNull();
    expect(Media::find($ep2->id))->toBeNull();
    expect(Media::find($epSeason3->id))->not->toBeNull();
});

test('media correctly distinguishes m1080p from 1080p Full HD', function () {
    $m1080 = new Media(['file_name' => 'Movie.2024.m1080p.WEB-DL.mkv']);
    $full1080 = new Media(['file_name' => 'Movie.2024.1080p.WEB-DL.mkv']);
    $m720 = new Media(['file_name' => 'Movie.2024.m720p.WEB-DL.mkv']);

    expect($m1080->quality_label)->toBe('m1080p HD');
    expect($full1080->quality_label)->toBe('1080p Full HD');
    expect($m720->quality_label)->toBe('m720p HD');
});

test('syncAllTmdb skips media that already have tmdb_id', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $synced = Media::create([
        'title' => 'Synced Movie',
        'tmdb_id' => 12345,
        'slug' => 'synced-movie',
        'file_name' => 'Synced.Movie.2024.mkv',
        'file_path' => 'Synced.Movie.2024.mkv',
        'file_size' => 1000,
        'is_active' => true,
    ]);

    $response = $this->actingAs($admin)->post('/admin/media/tmdb-sync-all');
    $response->assertRedirect();
    $response->assertSessionHas('message', function ($msg) {
        return str_contains($msg, 'zaten çekilmiş durumda');
    });
});

test('admin can trigger automatic media scan without errors', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $response = $this->actingAs($admin)->post('/admin/media/scan');
    $response->assertRedirect();
    $response->assertSessionHas('message');
});

test('admin can bulk delete selected media items', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    $m1 = Media::create([
        'title' => 'Bulk Movie 1',
        'slug' => 'bulk-movie-1',
        'file_name' => 'bulk1.mkv',
        'file_path' => 'bulk1.mkv',
        'file_size' => 1000,
        'is_active' => true,
    ]);

    $m2 = Media::create([
        'title' => 'Bulk Movie 2',
        'slug' => 'bulk-movie-2',
        'file_name' => 'bulk2.mkv',
        'file_path' => 'bulk2.mkv',
        'file_size' => 1000,
        'is_active' => true,
    ]);

    $response = $this->actingAs($admin)->post('/admin/media/bulk-delete', [
        'ids' => [$m1->id, $m2->id],
    ]);

    $response->assertRedirect();
    expect(Media::find($m1->id))->toBeNull();
    expect(Media::find($m2->id))->toBeNull();
});

test('admin can clear entire archive in bulk', function () {
    $admin = User::factory()->create(['role' => 'admin']);

    Media::create([
        'title' => 'Test Media',
        'slug' => 'test-media',
        'file_name' => 'test.mkv',
        'file_path' => 'test.mkv',
        'file_size' => 1000,
        'is_active' => true,
    ]);

    $response = $this->actingAs($admin)->post('/admin/media/bulk-delete', [
        'delete_all' => true,
    ]);

    $response->assertRedirect();
    expect(Media::count())->toBe(0);
});
