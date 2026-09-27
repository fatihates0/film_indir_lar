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
        Schema::create('storage_boxes', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->text('mount_path');
            $table->string('disk_type')->default('cifs'); // cifs, sshfs, local
            $table->string('host')->nullable();
            $table->string('username')->nullable();
            $table->boolean('is_active')->default(true);
            $table->string('status')->default('unknown'); // online, offline, unknown
            $table->json('metadata')->nullable();
            $table->timestamps();
        });

        Schema::table('media', function (Blueprint $table) {
            $table->foreignId('storage_box_id')->nullable()->after('bitrate')->constrained('storage_boxes')->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('media', function (Blueprint $table) {
            $table->dropForeign(['storage_box_id']);
            $table->dropColumn('storage_box_id');
        });

        Schema::dropIfExists('storage_boxes');
    }
};
