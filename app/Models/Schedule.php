<?php

namespace App\Models;

use App\Models\User;
use App\Models\AttendanceLog;
use App\Models\OfficialBusiness;
use App\Models\AttendanceSummary;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class Schedule extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'description',
        'clock_in',
        'clock_out',
    ];

    // ✅ recommended: store as "time" strings, not datetime
    protected $casts = [
        'clock_in' => 'string',
        'clock_out' => 'string',
    ];

    // ✅ schedule has many users
    public function users()
    {
        return $this->hasMany(User::class);
    }

    // ✅ schedule has many attendance logs
    public function attendanceLogs()
    {
        return $this->hasMany(AttendanceLog::class);
    }

    public function officialBusinesses()
    {
        return $this->hasMany(OfficialBusiness::class);
    }

    public function attendanceSummaries()
    {
        return $this->hasMany(AttendanceSummary::class);
    }

}
