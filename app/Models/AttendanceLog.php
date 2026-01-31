<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use App\Models\User;

class AttendanceLog extends Model
{
    protected $table = 'attendance_logs'; // ✅ explicit (good practice)

    protected $fillable = [
        'user_id',
        'type',
        'occurred_at',
        'photo_path',
        'device_id',
        'meta',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
        'meta' => 'array',
    ];

    /* ---------------- Relationships ---------------- */

    public function user()
    {
        return $this->belongsTo(User::class, 'user_id');
    }

    /* ---------------- Scopes (VERY USEFUL) ---------------- */

    // Get logs for a specific date
    public function scopeForDate($query, string $date)
    {
        return $query->whereDate('occurred_at', $date);
    }

    // Only time-ins
    public function scopeIn($query)
    {
        return $query->where('type', 'in');
    }

    // Only time-outs
    public function scopeOut($query)
    {
        return $query->where('type', 'out');
    }
}
