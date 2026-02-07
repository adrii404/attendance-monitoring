<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceLog;
use App\Models\FaceProfile;
use App\Models\User;
use App\Services\AttendanceSummaryService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Carbon\Carbon;

class AttendanceController extends Controller
{
    public function clock(Request $request)
    {
        $data = $request->validate([
            'type' => ['required', 'in:in,out'],
            'descriptor' => ['required', 'array', 'size:128'],
            'descriptor.*' => ['numeric'],
            'threshold' => ['nullable', 'numeric', 'min:0.2', 'max:1.0'],
            'device_id' => ['nullable', 'string', 'max:255'],
            'photo_data_url' => ['nullable', 'string'],
        ]);

        $threshold = (float)($data['threshold'] ?? 0.45);
        $queryDesc = array_map(fn ($v) => (float) $v, $data['descriptor']);

        $best = $this->findBestUser($queryDesc, $threshold);
        if (!$best) {
            return response()->json(['success' => false, 'message' => 'Face not recognized'], 422);
        }

        $userId = (int) $best['user_id'];

        // ✅ Pull schedule_id from user (server-truth)
        $user = User::query()->select('id', 'schedule_id', 'name')->find($userId);
        if (!$user) {
            return response()->json(['success' => false, 'message' => 'User not found'], 404);
        }

        // ✅ Require schedule (since you said enrollment must have a schedule)
        if (!$user->schedule_id) {
            return response()->json(['success' => false, 'message' => 'User has no schedule assigned'], 422);
        }

        // Basic sequence rule (keep "No active clock-in found" for OUT)
        $last = AttendanceLog::where('user_id', $userId)
            ->orderByDesc('occurred_at')
            ->first();

        // ✅ Allow multiple IN logs (no "Already clocked in")
        // ✅ Keep OUT rule (must have last IN)
        if ($data['type'] === 'out') {
            if (!$last || $last->type !== 'in') {
                return response()->json(['success' => false, 'message' => 'No active clock-in found'], 409);
            }
        }

        $photoPath = null;
        if (!empty($data['photo_data_url'])) {
            $photoPath = $this->storeDataUrlPhoto($data['photo_data_url'], $userId);
        }

        $log = AttendanceLog::create([
            'user_id'     => $userId,
            'schedule_id' => (int) $user->schedule_id, // ✅ save schedule_id
            'type'        => $data['type'],
            'occurred_at' => now(),
            'device_id'   => $data['device_id'] ?? null,
            'photo_path'  => $photoPath,
            'meta'        => ['distance' => $best['distance']],
        ]);

        app(AttendanceSummaryService::class)->upsertFromLog($log);

        return response()->json([
            'success' => true,
            'log_id'  => $log->id,
            'user'    => ['id' => $userId, 'name' => $best['name']],
        ]);
    }

    private function findBestUser(array $queryDesc, float $threshold): ?array
    {
        $profiles = FaceProfile::query()
            ->where('is_active', true)
            ->with('user:id,name')
            ->get(['user_id', 'descriptor']);

        $best = null;

        foreach ($profiles as $p) {
            $d = $this->euclideanDistance($queryDesc, $p->descriptor);

            if ($d <= $threshold && ($best === null || $d < $best['distance'])) {
                $best = [
                    'user_id'   => $p->user_id,
                    'name'      => $p->user?->name ?? ('User ' . $p->user_id),
                    'distance'  => $d,
                ];
            }
        }

        return $best;
    }

    private function euclideanDistance(array $a, array $b): float
    {
        $sum = 0.0;
        for ($i = 0; $i < 128; $i++) {
            $diff = ((float) $a[$i]) - ((float) $b[$i]);
            $sum += $diff * $diff;
        }
        return sqrt($sum);
    }

    private function storeDataUrlPhoto(string $dataUrl, int $userId): ?string
    {
        if (!str_starts_with($dataUrl, 'data:image/')) return null;

        [$meta, $b64] = explode(',', $dataUrl, 2) + [null, null];
        if (!$b64) return null;

        // Basic size cap
        if (strlen($b64) > 1_500_000) return null;

        $bin = base64_decode($b64, true);
        if ($bin === false) return null;

        $path = 'attendance_photos/' . date('Y/m/d') . '/u' . $userId . '_' . uniqid() . '.jpg';
        Storage::disk('local')->put($path, $bin);

        return $path;
    }

    public function logs(Request $request)
    {
        $data = $request->validate([
            'date' => ['nullable', 'date_format:Y-m-d'],
        ]);

        $date = $data['date'] ?? now()->toDateString();

        $start = Carbon::createFromFormat('Y-m-d', $date)->startOfDay();
        $end   = (clone $start)->endOfDay();

        $logs = AttendanceLog::query()
            ->with([
                'user:id,name,contact_number,schedule_id',
                'schedule:id,description,clock_in,clock_out'
            ])
            ->whereBetween('occurred_at', [$start, $end])
            ->orderBy('occurred_at')
            ->get(['id','user_id','schedule_id','type','occurred_at','photo_path','device_id','meta']);
    

        return response()->json([
            'success' => true,
            'date' => $date,
            'logs' => $logs->map(fn($l) => [
                'id' => $l->id,
                'user_id' => $l->user_id,
                'schedule_id' => $l->schedule_id,
                'schedule' => $l->schedule ? [
                    'id' => $l->schedule->id,
                    'description' => $l->schedule->description,
                    'clock_in' => $l->schedule->clock_in,
                    'clock_out' => $l->schedule->clock_out,
                ] : null,
            
                'name' => $l->user?->name,
                'contact_number' => $l->user?->contact_number,
                'type' => $l->type,
                'occurred_at' => $l->occurred_at?->toISOString(),
                'photo_path' => $l->photo_path,
                'device_id' => $l->device_id,
                'meta' => $l->meta,
            ])->values(),
        ]);
    }
}
