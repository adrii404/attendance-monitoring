<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::table('official_businesses', function (Blueprint $table) {
            $table->foreignId('attendance_log_id')
                ->nullable()
                ->after('schedule_id')
                ->constrained('attendance_logs')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('official_businesses', function (Blueprint $table) {
            $table->dropConstrainedForeignId('attendance_log_id');
        });
    }
};
