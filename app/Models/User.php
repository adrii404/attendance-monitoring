<?php

namespace App\Models;

use App\Models\Role;
use App\Models\Schedule;
use App\Models\AttendanceLog;
use App\Models\OfficialBusinesses;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Illuminate\Database\Eloquent\SoftDeletes;

class User extends Authenticatable
{
    use HasFactory, SoftDeletes, Notifiable;

    protected $fillable = [
        'name',
        'role_id',
        'schedule_id',
        'contact_number',
        'email',
        'password',
    ];

    protected $hidden = [
        'password',
        'remember_token',
    ];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
        ];
    }

    public function role()
    {
        return $this->belongsTo(Role::class);
    }

    // ✅ user belongs to a schedule
    public function schedule()
    {
        return $this->belongsTo(Schedule::class);
    }

    // ✅ user has many attendance logs
    public function attendanceLogs()
    {
        return $this->hasMany(AttendanceLog::class);
    }

    public function officialBusinesses()
    {
        return $this->hasMany(OfficialBusiness::class);
    }

}
