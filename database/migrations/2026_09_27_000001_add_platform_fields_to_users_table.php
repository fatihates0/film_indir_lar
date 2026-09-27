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
        Schema::table('users', function (Blueprint $table) {
            $table->string('role')->default('user')->after('email');
            $table->string('status')->default('active')->after('role');
            $table->boolean('download_enabled')->default(true)->after('status');
            $table->boolean('plex_enabled')->default(true)->after('download_enabled');
            $table->unsignedBigInteger('quota_plan_id')->nullable()->after('plex_enabled');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'role',
                'status',
                'download_enabled',
                'plex_enabled',
                'quota_plan_id',
            ]);
        });
    }
};
