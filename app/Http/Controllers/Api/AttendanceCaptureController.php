<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\AttendanceLog;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Carbon\Carbon;

class AttendanceCaptureController extends Controller
{
    public function store(Request $request)
    {
        Log::info('ATTENDANCE CAPTURE START', $request->all());

        try {
            $data = $request->validate([
                'employee_id'    => 'required|exists:users,id',
                'type'           => 'required|in:in,out',
                'photo_data_url' => 'required|string',
                'device_id'      => 'nullable|string',
                'date'           => 'nullable|date',
            ]);

            /** -----------------------------------------
             * Resolve datetime
             * ----------------------------------------*/
            $occurredAt = isset($data['date'])
                ? Carbon::parse($data['date'])->setTimeFrom(Carbon::now())
                : now();

            /** -----------------------------------------
             * Decode & store image
             * ----------------------------------------*/
            $photoPath = null;

            if (Str::startsWith($data['photo_data_url'], 'data:image')) {
                [$meta, $content] = explode(',', $data['photo_data_url'], 2);

                $ext = Str::contains($meta, 'png') ? 'png' : 'jpg';

                $filename = 'attendance/'
                    . now()->format('Y/m/d')
                    . '/'
                    . Str::uuid()
                    . '.'
                    . $ext;

                Log::info('Saving attendance image', [
                    'path' => $filename,
                ]);

                Storage::disk('public')->put(
                    $filename,
                    base64_decode($content)
                );

                $photoPath = $filename;
            }

            /** -----------------------------------------
             * Save attendance log
             * ----------------------------------------*/
            $userId = $data['employee_id'];
            $type   = $data['type'];

            /** -----------------------------------------
             * GLOBAL IN / OUT MATCHING (CROSS-DATE)
             * ----------------------------------------*/
            $lastLog = AttendanceLog::where('user_id', $userId)
                ->orderByDesc('occurred_at')
                ->first();

            /*
|--------------------------------------------------------------------------
| TIME-IN RULES
|--------------------------------------------------------------------------
*/

            // ❌ Cannot TIME-IN if last action was TIME-IN (unmatched IN)
            if ($type === 'in' && $lastLog && $lastLog->type === 'in') {
                return response()->json([
                    'error' => true,
                    'code' => 'UNMATCHED_TIME_IN',
                    'message' => 'You already have an open Time-In. Please Time-Out first before timing in again.',
                ], 422);
            }

            /*
|--------------------------------------------------------------------------
| TIME-OUT RULES
|--------------------------------------------------------------------------
*/

            // ❌ Cannot TIME-OUT if no prior log exists
            if ($type === 'out' && !$lastLog) {
                return response()->json([
                    'error' => true,
                    'code' => 'NO_TIME_IN_FOUND',
                    'message' => 'Time-Out is not allowed because there is no Time-In to close.',
                ], 422);
            }

            // ❌ Cannot TIME-OUT if last action was TIME-OUT (unmatched OUT)
            if ($type === 'out' && $lastLog->type === 'out') {
                return response()->json([
                    'error' => true,
                    'code' => 'UNMATCHED_TIME_OUT',
                    'message' => 'You already timed out. Please Time-In first before timing out again.',
                ], 422);
            }



            /** -----------------------------------------
             * Save attendance log
             * ----------------------------------------*/
            $log = AttendanceLog::create([
                'user_id'     => $userId,
                'type'        => $type,
                'occurred_at' => $occurredAt,
                'photo_path'  => $photoPath,
                'device_id'   => $data['device_id'] ?? null,
                'meta'        => [
                    'source' => 'kiosk',
                ],
            ]);

            Log::info('ATTENDANCE SAVED', [
                'id' => $log->id,
            ]);

            return response()->json([
                'status' => 'ok',
                'id'     => $log->id,
                'date'   => $occurredAt->toDateString(),
                'time'   => $occurredAt->format('H:i:s'),
            ], 201);
        } catch (\Throwable $e) {
            Log::error('ATTENDANCE CAPTURE FAILED', [
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);

            return response()->json([
                'error'   => true,
                'message' => $e->getMessage(),
            ], 500);
        }
    }
}
