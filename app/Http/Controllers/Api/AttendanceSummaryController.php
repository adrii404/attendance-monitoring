<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\AttendanceLog;
use Carbon\Carbon;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AttendanceSummaryController extends Controller
{
    public function index(Request $request)
    {
        $date = Carbon::parse($request->query('date', now()))->toDateString();

        $logs = AttendanceLog::with('user.role')
            ->whereDate('occurred_at', $date)
            ->orderBy('occurred_at')
            ->get()
            ->groupBy('user_id');

        $rows = [];

        foreach ($logs as $userId => $items) {
            $timeIn = $items->firstWhere('type', 'in');
            $timeOut = $items
                ->where('type', 'out')
                ->sortByDesc('occurred_at')
                ->first();
                $hoursRendered = null;

            if ($timeIn && $timeOut) {
                $hoursRendered = round(
                    $timeOut->occurred_at->diffInMinutes($timeIn->occurred_at) / 60,
                    2
                );
            }

            $rows[] = [
                'user_id' => $userId,
                'name' => $timeIn?->user?->name ?? $timeOut?->user?->name,
                'department' => $timeIn?->user?->role?->name,
                'time_in' => $timeIn?->occurred_at?->format('H:i:s'),
                'time_out' => $timeOut?->occurred_at?->format('H:i:s'),
                'hours_rendered' => $hoursRendered,
                'photo_path' => $timeIn?->photo_path ?? $timeOut?->photo_path,
            ];
        }

        return response()->json([
            'date' => $date,
            'rows' => $rows,
        ]);
    }
}
