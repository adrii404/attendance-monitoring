<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\OfficialBusiness;
use App\Models\User;
use App\Models\Schedule;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class OfficialBusinessController extends Controller
{

    public function index(Request $request)
    {
        $status = $request->query('status'); // e.g. pending

        $q = \App\Models\OfficialBusiness::query()
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
                    'status'       => $ob->status,
                ];
            }),
        ]);
    }

    public function store(Request $request)
    {
        // ✅ Validate payload coming from your app.js
        $data = $request->validate([
            'user_id'       => ['required', 'integer', 'exists:users,id'],
            'schedule_id'   => ['required', 'integer', 'exists:schedules,id'],
            'type'          => ['required', Rule::in(['in', 'out'])], // ✅ no both
            'requested_at'  => ['required', 'date_format:Y-m-d H:i:s'],
            'notes'         => ['nullable', 'string', 'max:1000'],
        ]);

        // (Optional) sanity checks
        // Make sure requested_at is not crazy (ex: too far past/future)
        $requestedAt = Carbon::createFromFormat('Y-m-d H:i:s', $data['requested_at']);

        // Example rule: disallow > 30 days in the future
        // if ($requestedAt->gt(now()->addDays(30))) {
        //     return response()->json([
        //         'message' => 'Requested date/time is too far in the future.'
        //     ], 422);
        // }

        // (Optional) verify schedule exists and belongs/valid (if you have rules)
        // $schedule = Schedule::findOrFail($data['schedule_id']);

        // (Optional) prevent duplicates (same user/type/requested_at)
        $exists = OfficialBusiness::query()
            ->where('user_id', $data['user_id'])
            ->where('type', $data['type'])
            ->where('requested_at', $data['requested_at'])
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
            'requested_at' => $data['requested_at'],
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
}
