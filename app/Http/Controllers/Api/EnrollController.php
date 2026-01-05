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
        // app/Http/Controllers/Api/EnrollController.php
        $data = $request->validate([
            'name' => ['required','string','max:255'],
            'email' => ['required','email','max:255', Rule::unique('users','email')],
            'password' => ['required','string','min:8','max:255'],
        
            'descriptor' => ['required','array','size:128'],
            'descriptor.*' => ['numeric'],
            'label' => ['nullable','string','max:255'],
        ]);
        
        $descriptor = array_map(fn($v) => (float)$v, $data['descriptor']);
        
        $result = DB::transaction(function () use ($data, $descriptor) {
            $user = User::create([
                'name' => $data['name'],
                'email' => $data['email'],
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
        

        /** @var \App\Models\User $user */
        /** @var \App\Models\FaceProfile $profile */
        [$user, $profile] = $result;

        return response()->json([
            'success' => true,
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'email' => $user->email,
            ],
            'face_profile_id' => $profile->id,

            // If you generated password automatically, you can return it *only if you really want*.
            // For real systems, you'd avoid returning passwords and instead do a proper onboarding.
            // 'generated_password' => $data['password'] ? null : $plainPassword,
        ]);
    }
}
