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
        Schema::create('attendance_logs', function (Blueprint $table) {
            $table->id();

            // who clocked in/out
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            // in/out event
            $table->enum('type', ['in', 'out']);

            // use server time (recommended)
            $table->dateTime('occurred_at');

            // optional: snapshot photo path (store privately)
            $table->string('photo_path')->nullable();

            // optional: device info / browser info / etc.
            $table->string('device_id')->nullable();
            $table->json('meta')->nullable();

            $table->timestamps();

            $table->index(['user_id', 'occurred_at']);
            $table->index(['occurred_at']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('attendance_logs');
    }
};
