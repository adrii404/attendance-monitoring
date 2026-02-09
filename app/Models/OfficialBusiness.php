<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class OfficialBusiness extends Model
{
    protected $fillable = [
        'user_id',
        'schedule_id',
        'type',
        'requested_at',
        'notes',
        'status',
        'reviewed_by',
        'reviewed_at',
        'review_notes',
    ];

    protected $casts = [
        'requested_at' => 'datetime',
        'reviewed_at'  => 'datetime',
    ];

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function schedule()
    {
        return $this->belongsTo(Schedule::class);
    }

    public function reviewer()
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
