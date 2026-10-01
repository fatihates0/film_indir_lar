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
        Schema::create('media_scans', function (Blueprint $table) {
            $table->id();
            $table->foreignId('storage_box_id')->nullable()->constrained('storage_boxes')->nullOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('sub_directory')->nullable();
            $table->string('scan_type')->default('all'); // all, box, target
            $table->string('status')->default('pending'); // pending, running, completed, failed, cancelled
            $table->float('progress_percent')->default(0);
            $table->string('current_target')->nullable();
            $table->integer('total_scanned')->default(0);
            $table->integer('added_count')->default(0);
            $table->integer('updated_count')->default(0);
            $table->integer('missing_count')->default(0);
            $table->text('error_message')->nullable();
            $table->timestamp('started_at')->nullable();
            $table->timestamp('completed_at')->nullable();
            $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('media_scans');
    }
};
