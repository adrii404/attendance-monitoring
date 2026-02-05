<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceLog extends Model
{
    protected $fillable = [
        'user_id',
        'type',
        'schedule_id',
        'occurred_at',
        'photo_path',
        'device_id',
        'meta',
    ];

    protected $casts = [
        'occurred_at' => 'datetime',
        'meta' => 'array',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    // ✅ log belongs to a schedule (copied from user's schedule at time of logging)
    public function schedule()
    {
        return $this->belongsTo(Schedule::class);
    }
}
