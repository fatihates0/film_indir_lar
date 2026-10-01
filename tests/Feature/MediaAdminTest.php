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
