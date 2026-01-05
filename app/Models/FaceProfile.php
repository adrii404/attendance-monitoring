<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class FaceProfile extends Model
{
    protected $fillable = ['user_id', 'descriptor', 'label', 'is_active'];
    protected $casts = ['descriptor' => 'array', 'is_active' => 'boolean'];

    public function user() {
        return $this->belongsTo(User::class);
    }
}
