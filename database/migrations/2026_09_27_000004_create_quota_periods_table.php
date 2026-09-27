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
        Schema::create('quota_periods', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedBigInteger('quota_limit_bytes');
            $table->unsignedBigInteger('used_bytes')->default(0);
            $table->timestamp('started_at');
            $table->timestamp('expires_at');
            $table->string('status')->default('active'); // active, expired, cancelled
            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index(['user_id', 'started_at', 'expires_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('quota_periods');
    }
};
