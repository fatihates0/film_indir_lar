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
        Schema::create('media', function (Blueprint $table) {
            $table->id();
            $table->string('type')->default('movie'); // movie, series, episode
            $table->string('title');
            $table->string('original_title')->nullable();
            $table->unsignedSmallInteger('year')->nullable();
            $table->string('slug')->unique();
            $table->text('file_path');
            $table->string('file_name');
            $table->unsignedBigInteger('file_size');
            $table->string('mime_type')->nullable();
            $table->string('extension')->nullable();
            $table->unsignedInteger('duration_seconds')->nullable();
            $table->unsignedInteger('width')->nullable();
            $table->unsignedInteger('height')->nullable();
            $table->string('video_codec')->nullable();
            $table->string('audio_codec')->nullable();
            $table->unsignedTinyInteger('audio_channels')->nullable();
            $table->string('audio_language')->nullable();
            $table->string('subtitle_languages')->nullable();
            $table->float('fps')->nullable();
            $table->unsignedBigInteger('bitrate')->nullable();
            $table->string('storage_disk')->default('storagebox');
            $table->boolean('is_active')->default(true);
            $table->boolean('is_available')->default(true);
            $table->timestamps();

            $table->index(['type', 'is_active', 'is_available']);
            $table->index('title');
            $table->index('year');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('media');
    }
};
