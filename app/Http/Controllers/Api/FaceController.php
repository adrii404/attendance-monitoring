<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FaceProfile;
use Illuminate\Http\Request;

class FaceController extends Controller
{
    public function enroll(Request $request)
    {
        $data = $request->validate([
            'user_id' => ['required','integer','exists:users,id'],
            'descriptor' => ['required','array','size:128'],
            'descriptor.*' => ['numeric'],
            'label' => ['nullable','string','max:255'],
        ]);

        $profile = FaceProfile::create([
            'user_id' => $data['user_id'],
            'descriptor' => array_map(fn($v) => (float)$v, $data['descriptor']),
            'label' => $data['label'] ?? 'Enrollment',
            'is_active' => true,
        ]);

        return response()->json([
            'success' => true,
            'face_profile_id' => $profile->id,
        ]);
    }

    public function match(Request $request)
    {
        $data = $request->validate([
            'descriptor' => ['required','array','size:128'],
            'descriptor.*' => ['numeric'],
            'threshold' => ['nullable','numeric','min:0.2','max:1.0'],
        ]);

        $threshold = (float)($data['threshold'] ?? 0.45);
        $queryDesc = array_map(fn($v) => (float)$v, $data['descriptor']);

        $profiles = FaceProfile::query()
            ->where('is_active', true)
            ->with('user:id,name')
            ->get(['user_id', 'descriptor']);

        $best = null;

        foreach ($profiles as $p) {
            $d = $this->euclideanDistance($queryDesc, $p->descriptor);
            if ($d <= $threshold && ($best === null || $d < $best['distance'])) {
                $best = [
                    'user_id' => $p->user_id,
                    'name' => $p->user?->name ?? ('User '.$p->user_id),
                    'distance' => $d,
                ];
            }
        }

        return response()->json([
            'matched' => (bool)$best,
            'user' => $best ? ['id' => $best['user_id'], 'name' => $best['name']] : null,
            'distance' => $best['distance'] ?? null,
        ]);
    }

    private function euclideanDistance(array $a, array $b): float
    {
        $sum = 0.0;
        for ($i = 0; $i < 128; $i++) {
            $diff = ((float)$a[$i]) - ((float)$b[$i]);
            $sum += $diff * $diff;
        }
        return sqrt($sum);
    }

    public function profiles()
    {
        $rows = FaceProfile::query()
            ->where('is_active', true)
            ->with('user:id,name,email')
            ->latest()
            ->get(['id', 'user_id', 'label', 'created_at']);

        return response()->json([
            'success' => true,
            'profiles' => $rows->map(fn ($p) => [
                'face_profile_id' => $p->id,
                'user_id' => $p->user_id,
                'name' => $p->user?->name,
                'email' => $p->user?->email,
                'label' => $p->label,
                'created_at' => $p->created_at?->toISOString(),
            ])->values(),
        ]);
    }
}
