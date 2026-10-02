<?php

use App\Enums\MediaType;
use App\Models\Media;
use App\Models\User;

test('media show page renders correctly with collection movies prop', function () {
    $user = User::factory()->create();

    $media = Media::create([
        'type' => MediaType::MOVIE,
        'title' => 'F9',
        'slug' => 'f9-2021',
        'file_name' => 'F9.2021.mkv',
        'file_path' => 'F9.2021.mkv',
        'file_size' => 1024,
        'tmdb_id' => 385128,
        'is_active' => true,
        'is_available' => true,
    ]);

    $response = $this->actingAs($user)->get(route('media.show', $media->id));

    $response->assertStatus(200);
    $response->assertInertia(fn ($page) => $page
        ->component('Media/Show')
        ->has('collectionMovies')
    );
});
