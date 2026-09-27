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
        Schema::create('plex_usage_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('plex_account_id')->nullable()->constrained('plex_accounts')->nullOnDelete();
            $table->foreignId('media_id')->nullable()->constrained('media')->nullOnDelete();
            $table->string('plex_session_id');
            $table->timestamp('started_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('stopped_at')->nullable();
            $table->unsignedBigInteger('last_position_ms')->default(0);
            $table->unsignedBigInteger('usage_bytes')->default(0);
            $table->string('usage_mode')->default('estimated'); // estimated, actual, file_size
            $table->string('status')->default('active'); // active, stopped, completed
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index('plex_session_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('plex_usage_sessions');
    }
};
