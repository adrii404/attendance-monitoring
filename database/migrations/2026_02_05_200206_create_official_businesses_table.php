<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
  public function up(): void
  {
    Schema::create('official_businesses', function (Blueprint $table) {
      $table->id();

      $table->foreignId('user_id')->constrained()->cascadeOnDelete();
      $table->foreignId('schedule_id')->constrained()->cascadeOnDelete();

      $table->enum('type', ['in', 'out']); // ✅ no "both"
      $table->dateTime('requested_at')->nullable(); // ✅ as you said

      $table->text('notes')->nullable();

      // approval workflow
      $table->enum('status', ['pending', 'approved', 'rejected'])->default('pending');
      $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
      $table->dateTime('reviewed_at')->nullable();
      $table->text('review_notes')->nullable();

      $table->timestamps();

      $table->index(['user_id', 'requested_at']);
      $table->index(['status']);
    });
  }

  public function down(): void
  {
    Schema::dropIfExists('official_businesses');
  }
};
