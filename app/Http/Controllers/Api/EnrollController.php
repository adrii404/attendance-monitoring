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

        // ✅ required contact number + unique
        'contact_number' => [
            'required',
            'string',
            'max:30',
            Rule::unique('users', 'contact_number'),
        ],

        // ✅ email optional (but if provided, must be unique)
        'email' => [
            'nullable',
            'email',
            'max:255',
            Rule::unique('users', 'email'),
        ],

        'password' => ['required', 'string', 'min:8', 'max:255'],
            // ✅ NEW: role_id must exist in roles table
        'role_id' => ['required', 'integer', 'exists:roles,id'],


        'descriptor' => ['required', 'array', 'size:128'],
        'descriptor.*' => ['numeric'],
        'label' => ['nullable', 'string', 'max:255'],
    ]);

    $descriptor = array_map(fn ($v) => (float) $v, $data['descriptor']);

    [$user, $profile] = DB::transaction(function () use ($data, $descriptor) {
        $user = User::create([
            'name' => $data['name'],
            'contact_number' => $data['contact_number'],
            'email' => $data['email'] ?? null,
            'password' => Hash::make($data['password']),
             'role_id' => (int) $data['role_id'], // ✅ SAVE role_id
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
            'contact_number' => $user->contact_number,
            'email' => $user->email,
            'role_id' => $user->role_id, // ✅ include in response (optional but helpful)
        ],
        'face_profile_id' => $profile->id,
    ]);
}

}
