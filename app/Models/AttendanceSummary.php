<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class AttendanceSummary extends Model
{
    protected $fillable = [
        'user_id',
        'schedule_id',
        'work_date',
        'time_in_log_id',
        'time_out_log_id',
        'time_in_at',
        'time_out_at',
        'status',
    ];

    protected $casts = [
        'work_date'   => 'date:Y-m-d',
        'time_in_at' => 'datetime',
        'time_out_at' => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function schedule()
    {
        return $this->belongsTo(Schedule::class);
    }

    public function timeInLog()
    {
        return $this->belongsTo(AttendanceLog::class, 'time_in_log_id');
    }

    public function timeOutLog()
    {
        return $this->belongsTo(AttendanceLog::class, 'time_out_log_id');
    }
}
