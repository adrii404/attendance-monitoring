<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // add after name
            $table->foreignId('schedule_id')
                ->nullable()
                ->after('name')
                ->constrained('schedules')
                ->nullOnDelete(); // if schedule deleted, set user.schedule_id = null
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            // drop FK first, then column
            $table->dropConstrainedForeignId('schedule_id');
        });
    }
};
