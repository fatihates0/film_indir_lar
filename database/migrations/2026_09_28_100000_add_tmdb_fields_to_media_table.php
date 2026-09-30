<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->unsignedBigInteger('tmdb_id')->nullable()->after('year')->index();
            $table->text('poster_path')->nullable()->after('slug');
            $table->text('backdrop_path')->nullable()->after('poster_path');
            $table->text('overview')->nullable()->after('backdrop_path');
            $table->float('vote_average')->nullable()->after('overview');
            $table->unsignedInteger('vote_count')->nullable()->after('vote_average');
            $table->json('genres')->nullable()->after('vote_count');
            $table->string('release_date')->nullable()->after('genres');
            $table->string('imdb_id')->nullable()->after('release_date');
            $table->text('tagline')->nullable()->after('imdb_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->dropColumn([
                'tmdb_id',
                'poster_path',
                'backdrop_path',
                'overview',
                'vote_average',
                'vote_count',
                'genres',
                'release_date',
                'imdb_id',
                'tagline',
            ]);
        });
    }
};
