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
        Schema::create('remote_transfers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('storage_box_id')->constrained('storage_boxes')->cascadeOnDelete();
            $table->text('source_url');
            $table->string('target_folder')->default('Filmler');
            $table->string('file_name');
            $table->string('relative_path');
            $table->unsignedBigInteger('total_bytes')->default(0);
            $table->unsignedBigInteger('transferred_bytes')->default(0);
            $table->decimal('progress_percent', 5, 2)->default(0.00);
            $table->unsignedBigInteger('speed_bps')->default(0);
            $table->string('status')->default('pending'); // pending, transferring, completed, failed, cancelled
            $table->text('error_message')->nullable();
            $table->foreignId('media_id')->nullable()->constrained('media')->nullOnDelete();
            $table->boolean('auto_add_media')->default(true);
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('remote_transfers');
    }
};
