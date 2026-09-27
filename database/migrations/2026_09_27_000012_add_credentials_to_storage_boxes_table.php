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
        Schema::table('storage_boxes', function (Blueprint $table) {
            $table->text('password')->nullable()->after('username');
            $table->unsignedInteger('port')->default(445)->after('host');
            $table->string('share_name')->nullable()->after('port');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('storage_boxes', function (Blueprint $table) {
            $table->dropColumn(['password', 'port', 'share_name']);
        });
    }
};
