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
        if (! Schema::hasColumn('users', 'jellyfin_enabled')) {
            Schema::table('users', function (Blueprint $table) {
                $table->boolean('jellyfin_enabled')->default(true)->after('plex_enabled');
            });
        }

        Schema::create('jellyfin_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('jellyfin_user_id')->unique();
            $table->string('username');
            $table->boolean('is_administrator')->default(false);
            $table->boolean('is_disabled')->default(false);
            $table->timestamp('last_activity_date')->nullable();
            $table->json('metadata')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'is_disabled']);
            $table->index('username');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('jellyfin_accounts');

        if (Schema::hasColumn('users', 'jellyfin_enabled')) {
            Schema::table('users', function (Blueprint $table) {
                $table->dropColumn('jellyfin_enabled');
            });
        }
    }
};
