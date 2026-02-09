<?php

namespace App\Services;

use App\Models\AttendanceLog;
use App\Models\AttendanceSummary;
use App\Models\Schedule;
use Carbon\Carbon;
use Illuminate\Support\Facades\DB;

class AttendanceSummaryService
{
    /**
     * Single-row summary rule:
     * - Unique row per (user_id, schedule_id, work_date)
     * - Earliest IN wins
     * - Latest OUT wins
     * - status = closed if both IN and OUT exist
     */
    public function upsertFromLog(AttendanceLog $log): AttendanceSummary
    {
        return DB::transaction(function () use ($log) {

            // Load schedule times (clock_in, clock_out)
            $schedule = Schedule::query()
                ->select('id', 'clock_in', 'clock_out')
                ->findOrFail($log->schedule_id);

            $occurredAt = Carbon::parse($log->occurred_at)->timezone(config('app.timezone'));

            // Compute work_date (handles graveyard)
            $workDate = $this->computeWorkDate($occurredAt, $schedule->clock_in, $schedule->clock_out);

            // Lock the row to avoid race-condition duplicate insert
            $summary = AttendanceSummary::query()
                ->where('user_id', $log->user_id)
                ->where('schedule_id', $log->schedule_id)
                ->whereDate('work_date', $workDate->toDateString())
                ->lockForUpdate()
                ->first();

            if (!$summary) {
                $summary = AttendanceSummary::updateOrCreate([
                    'user_id'     => $log->user_id,
                    'schedule_id' => $log->schedule_id,
                    'work_date'   => $workDate->toDateString(),
                    'status'      => 'open',
                ]);
            }

            // Apply update rules
            if ($log->type === 'in') {
                // Earliest IN wins
                if (!$summary->time_in_at || $occurredAt->lt(Carbon::parse($summary->time_in_at))) {
                    $summary->time_in_at = $occurredAt;
                    $summary->time_in_log_id = $log->id;
                }
            } else { // out
                // Latest OUT wins
                if (!$summary->time_out_at || $occurredAt->gt(Carbon::parse($summary->time_out_at))) {
                    $summary->time_out_at = $occurredAt;
                    $summary->time_out_log_id = $log->id;
                }
            }

            // Close when both exist
            if ($summary->time_in_at && $summary->time_out_at) {
                $summary->status = 'closed';
            } else {
                $summary->status = 'open';
            }

            $summary->save();

            return $summary;
        });
    }

    /**
     * Compute work_date for a schedule.
     * - Normal shift (clock_in < clock_out): work_date = date(occurredAt)
     * - Graveyard (clock_in > clock_out): treat early-morning OUT (after midnight)
     *   as part of the previous day shift.
     */
    private function computeWorkDate(Carbon $occurredAt, string $clockIn, string $clockOut): Carbon
    {
        // Parse schedule times into "minutes from midnight"
        $inMin  = $this->timeToMinutes($clockIn);   // e.g. 18:00 -> 1080
        $outMin = $this->timeToMinutes($clockOut);  // e.g. 03:00 -> 180

        $isGraveyard = $inMin > $outMin;

        if (!$isGraveyard) {
            // Normal shift: same-day
            return $occurredAt->copy()->startOfDay();
        }

        // Graveyard shift: if log time is between 00:00 and clockOut (+ some allowance),
        // treat it as previous day shift.
        $logMin = ($occurredAt->hour * 60) + $occurredAt->minute;

        // Allow a small grace (e.g. 6 hours after out) to still belong to previous day,
        // but simplest is: if time is before noon and before/near clockOut, subtract a day.
        // We'll use: if log time <= (clockOut + 360 minutes grace)
        $grace = 360; // 6 hours grace
        $cutoff = $outMin + $grace;

        if ($logMin <= $cutoff) {
            return $occurredAt->copy()->subDay()->startOfDay();
        }

        return $occurredAt->copy()->startOfDay();
    }

    private function timeToMinutes(string $hhmmss): int
    {
        // supports "H:i:s" or "H:i"
        [$h, $m] = array_map('intval', explode(':', substr($hhmmss, 0, 5)));
        return ($h * 60) + $m;
    }
}
