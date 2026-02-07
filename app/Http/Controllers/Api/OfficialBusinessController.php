<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\OfficialBusiness;
use App\Models\AttendanceLog;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Support\Facades\DB;

class OfficialBusinessController extends Controller
{
    public function index(Request $request)
    {
        $status = $request->query('status'); // e.g. pending

        $q = OfficialBusiness::query()
            ->with(['user:id,name', 'schedule:id,description'])
            ->orderByDesc('requested_at');

        if ($status) {
            $q->where('status', $status);
        }

        $items = $q->limit(200)->get();

        return response()->json([
            'items' => $items->map(function ($ob) {
                return [
                    'id'           => $ob->id,
                    'name'         => $ob->user?->name,
                    'schedule'     => $ob->schedule?->description,
                    'type'         => $ob->type, // in|out
                    'requested_at' => optional($ob->requested_at)->format('Y-m-d H:i:s'),
                    'notes'        => $ob->notes,
                    'status'       => $ob->status,
                ];
            }),
        ]);
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'user_id'      => ['required', 'integer', 'exists:users,id'],
            'schedule_id'  => ['required', 'integer', 'exists:schedules,id'],
            'type'         => ['required', Rule::in(['in', 'out'])],
            'requested_at' => ['required', 'date_format:Y-m-d H:i:s'],
            'notes'        => ['nullable', 'string', 'max:1000'],
        ]);

        // (optional) validate date format more strictly / normalize
        $requestedAt = Carbon::createFromFormat('Y-m-d H:i:s', $data['requested_at']);

        // prevent duplicates: same user/type/time that is still pending/approved
        $exists = OfficialBusiness::query()
            ->where('user_id', $data['user_id'])
            ->where('type', $data['type'])
            ->where('requested_at', $requestedAt->format('Y-m-d H:i:s'))
            ->whereIn('status', ['pending', 'approved'])
            ->exists();

        if ($exists) {
            return response()->json([
                'message' => 'An OB request already exists for this user, type, and time.'
            ], 409);
        }

        $ob = OfficialBusiness::create([
            'user_id'      => $data['user_id'],
            'schedule_id'  => $data['schedule_id'],
            'type'         => $data['type'],
            'requested_at' => $requestedAt,
            'notes'        => $data['notes'] ?? null,
            'status'       => 'pending',
        ]);

        return response()->json([
            'message' => 'OB request submitted.',
            'ob' => [
                'id'           => $ob->id,
                'user_id'      => $ob->user_id,
                'schedule_id'  => $ob->schedule_id,
                'type'         => $ob->type,
                'requested_at' => $ob->requested_at?->format('Y-m-d H:i:s'),
                'notes'        => $ob->notes,
                'status'       => $ob->status,
                'created_at'   => $ob->created_at?->toISOString(),
            ],
        ], 201);
    }

    public function review(Request $request, OfficialBusiness $officialBusiness)
    {
        $data = $request->validate([
            'status'       => ['required', 'in:approved,rejected'],
            'review_notes' => ['nullable', 'string', 'max:5000'],
            'device_id'    => ['nullable', 'string', 'max:64'],
        ]);

        // only pending can be reviewed
        if ($officialBusiness->status !== 'pending') {
            return response()->json([
                'message' => 'This request is already reviewed.',
                'status'  => $officialBusiness->status,
            ], 409);
        }

        $adminId  = auth()->id(); // make sure this route is protected by auth middleware
        $deviceId = $data['device_id'] ?? 'ob-admin';

        return DB::transaction(function () use ($officialBusiness, $data, $adminId, $deviceId) {

            // ✅ update review fields
            $officialBusiness->status      = $data['status'];
            $officialBusiness->reviewed_by = $adminId;
            $officialBusiness->reviewed_at = now();
            $officialBusiness->review_notes = $data['review_notes'] ?? null;

            $attendanceLogId = null;

            if ($data['status'] === 'approved') {

                // ✅ avoid duplicate log creation
                $existing = AttendanceLog::query()
                    ->where('user_id', $officialBusiness->user_id)
                    ->where('type', $officialBusiness->type)
                    ->where('schedule_id', $officialBusiness->schedule_id)
                    ->where('occurred_at', $officialBusiness->requested_at)
                    ->first();

                if ($existing) {
                    $attendanceLogId = $existing->id;
                } else {
                    $log = AttendanceLog::create([
                        'user_id'     => $officialBusiness->user_id,
                        'type'        => $officialBusiness->type,          // in|out
                        'schedule_id' => $officialBusiness->schedule_id,
                        'occurred_at' => $officialBusiness->requested_at,  // timestamp
                        'device_id'   => $deviceId,
                        'photo_path'  => null,
                        'meta'        => null,
                    ]);

                    $attendanceLogId = $log->id;
                }

                $officialBusiness->attendance_log_id = $attendanceLogId;

            } else {
                // ✅ rejected => NO attendance log, and unlink any previous link
                $officialBusiness->attendance_log_id = null;
            }

            $officialBusiness->save();

            return response()->json([
                'success'              => true,
                'official_business_id' => $officialBusiness->id,
                'status'               => $officialBusiness->status,
                'attendance_log_id'    => $attendanceLogId, // null on rejected
            ]);
        });
    }
}
