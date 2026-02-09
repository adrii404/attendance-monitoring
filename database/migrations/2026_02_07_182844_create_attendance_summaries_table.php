<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('attendance_summaries', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('schedule_id')->constrained()->cascadeOnDelete();

            // ✅ Anchor date for the shift instance (work_date)
            $table->date('work_date');

            // Selected logs for this shift instance
            $table->foreignId('time_in_log_id')->nullable()->constrained('attendance_logs')->nullOnDelete();
            $table->foreignId('time_out_log_id')->nullable()->constrained('attendance_logs')->nullOnDelete();

            $table->dateTime('time_in_at')->nullable();
            $table->dateTime('time_out_at')->nullable();

            // open = still accepting logs, closed = shift ended
            $table->enum('status', ['open', 'closed'])->default('open');

            $table->timestamps();

            // ✅ One summary row per user + schedule + work_date
            $table->unique(['user_id', 'schedule_id', 'work_date'], 'att_sum_unique');

            $table->index(['work_date', 'schedule_id']);
            $table->index(['user_id', 'work_date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_summaries');
    }
};
