<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FaceProfile;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Rule;

class EnrollController extends Controller
{
    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
    
            'role_id' => [
                'required',
                'integer',
                Rule::exists('roles', 'id')->whereNull('deleted_at'), // ignore soft-deleted roles
            ],
    
            'contact_number' => [
                'required',
                'string',
                'max:30',
                Rule::unique('users', 'contact_number'),
            ],
    
            'email' => [
                'nullable',
                'email',
                'max:255',
                Rule::unique('users', 'email'),
            ],
    
            'password' => ['required', 'string', 'min:8', 'max:255'],
    
            'descriptor' => ['required', 'array', 'size:128'],
            'descriptor.*' => ['numeric'],
            'label' => ['nullable', 'string', 'max:255'],
        ]);
    
        $descriptor = array_map(fn ($v) => (float) $v, $data['descriptor']);
    
        [$user, $profile] = DB::transaction(function () use ($data, $descriptor) {
            $user = User::create([
                'name' => $data['name'],
                'role_id' => $data['role_id'], // ✅ save role_id here
                'contact_number' => $data['contact_number'],
                'email' => $data['email'] ?? null,
                'password' => Hash::make($data['password']),
            ]);
    
            $profile = FaceProfile::create([
                'user_id' => $user->id,
                'descriptor' => $descriptor,
                'label' => $data['label'] ?? 'Enrollment',
                'is_active' => true,
            ]);
    
            return [$user, $profile];
        });
    
        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'role_id' => $user->role_id, // ✅ optional to return
                'contact_number' => $user->contact_number,
                'email' => $user->email,
            ],
            'face_profile_id' => $profile->id,
        ]);
    }

}
