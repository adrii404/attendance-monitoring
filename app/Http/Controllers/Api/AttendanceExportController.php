<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceSummary;
use App\Models\AttendanceLog;
use App\Models\Schedule;
use App\Models\OfficialBusiness;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;
use PhpOffice\PhpSpreadsheet\Shared\Date as ExcelDate;

class AttendanceExportController extends Controller
{
    public function exportXlsx(Request $request)
    {
        $from     = $request->query('from');
        $to       = $request->query('to');
        $userIds  = $request->query('users');
        $allUsers = filter_var($request->query('all', '1'), FILTER_VALIDATE_BOOLEAN);

        if (!$from || !$to) {
            return response()->json(['message' => 'from and to are required'], 422);
        }

        $fromDate = Carbon::parse($from)->toDateString();
        $toDate   = Carbon::parse($to)->toDateString();

        // Parse selected users
        $ids = [];
        if (!$allUsers) {
            if (is_string($userIds)) {
                $ids = array_filter(array_map('intval', explode(',', $userIds)));
            } elseif (is_array($userIds)) {
                $ids = array_filter(array_map('intval', $userIds));
            }

            if (!count($ids)) {
                return response()->json(['message' => 'Select at least one user or enable All Users'], 422);
            }
        }

        // ---- Queries (same filters) ----
        $summaryQuery = AttendanceSummary::query()
            ->with(['user:id,name', 'schedule:id,description'])
            ->whereBetween('work_date', [$fromDate, $toDate])
            ->orderBy('work_date')
            ->orderBy('user_id');

        // logs: filter by occurred_at datetime spanning the date range
        $fromDt = Carbon::parse($fromDate)->startOfDay();
        $toDt   = Carbon::parse($toDate)->endOfDay();

        $logsQuery = AttendanceLog::query()
            ->with(['user:id,name', 'schedule:id,description'])
            ->whereBetween('occurred_at', [$fromDt, $toDt])
            ->orderBy('occurred_at')
            ->orderBy('user_id');

        // ✅ Official Business: filter by requested_at datetime spanning the date range
        $obQuery = OfficialBusiness::query()
            ->with(['user:id,name', 'schedule:id,description'])
            ->whereBetween('requested_at', [$fromDt, $toDt])
            ->orderBy('requested_at')
            ->orderBy('user_id');

        if (!$allUsers) {
            $summaryQuery->whereIn('user_id', $ids);
            $logsQuery->whereIn('user_id', $ids);
            $obQuery->whereIn('user_id', $ids);
        }

        /**
         * ✅ Records computations will use schedule_id -> schedule start time
         */
        $scheduleIds = AttendanceSummary::query()
            ->whereBetween('work_date', [$fromDate, $toDate])
            ->when(!$allUsers, fn($q) => $q->whereIn('user_id', $ids))
            ->whereNotNull('schedule_id')
            ->distinct()
            ->pluck('schedule_id')
            ->values();

        $startByScheduleId = Schedule::query()
            ->whereIn('id', $scheduleIds)
            ->pluck('clock_in', 'id')
            ->map(fn ($t) => $t ? substr((string)$t, 0, 8) : null)
            ->toArray();

        // ---- Build XLSX (4 sheets) ----
        $spreadsheet = new Spreadsheet();

        // =========================
        // Sheet 1: Summaries
        // =========================
        $sheet1 = $spreadsheet->getActiveSheet();
        $sheet1->setTitle('Summaries');

        $sheet1->fromArray([
            ['user_name', 'schedule', 'work_date', 'time_in_at', 'time_out_at', 'status']
        ], null, 'A1');

        $sheet1->getStyle('C:C')->getNumberFormat()->setFormatCode('m/d/yyyy');
        $sheet1->getStyle('D:E')->getNumberFormat()->setFormatCode('m/d/yyyy h:mm:ss AM/PM');

        $row = 2;
        $summaryQuery->chunk(500, function ($rows) use (&$row, $sheet1) {
            foreach ($rows as $r) {
                $workDate = $r->work_date ? Carbon::parse($r->work_date) : null;
                $timeIn   = $r->time_in_at ? Carbon::parse($r->time_in_at) : null;
                $timeOut  = $r->time_out_at ? Carbon::parse($r->time_out_at) : null;

                $sheet1->setCellValue("A{$row}", $r->user?->name ?? '');
                $sheet1->setCellValue("B{$row}", $r->schedule?->description ?? '');

                $sheet1->setCellValue("C{$row}", $workDate ? ExcelDate::PHPToExcel($workDate) : null);
                $sheet1->setCellValue("D{$row}", $timeIn ? ExcelDate::PHPToExcel($timeIn) : null);
                $sheet1->setCellValue("E{$row}", $timeOut ? ExcelDate::PHPToExcel($timeOut) : null);

                $sheet1->setCellValue("F{$row}", $r->status ?? '');
                $row++;
            }
        });

        // =========================
        // Sheet 2: Logs
        // =========================
        $sheet2 = $spreadsheet->createSheet();
        $sheet2->setTitle('Logs');

        $sheet2->fromArray([
            ['user_name', 'schedule', 'type', 'occurred_at']
        ], null, 'A1');

        $sheet2->getStyle('D:D')->getNumberFormat()->setFormatCode('m/d/yyyy h:mm:ss AM/PM');

        $row2 = 2;
        $logsQuery->chunk(500, function ($rows) use (&$row2, $sheet2) {
            foreach ($rows as $r) {
                $occurred = $r->occurred_at ? Carbon::parse($r->occurred_at) : null;

                $sheet2->setCellValue("A{$row2}", $r->user?->name ?? '');
                $sheet2->setCellValue("B{$row2}", $r->schedule?->description ?? '');
                $sheet2->setCellValue("C{$row2}", $r->type ?? '');
                $sheet2->setCellValue("D{$row2}", $occurred ? ExcelDate::PHPToExcel($occurred) : null);

                $row2++;
            }
        });

        // =========================
        // Sheet 3: Official Business (NEW)
        // =========================
        $sheet3 = $spreadsheet->createSheet();
        $sheet3->setTitle('Official Business');

        $sheet3->fromArray([
            ['user_name', 'schedule', 'type', 'requested_at', 'notes', 'status', 'reviewed_at', 'review_notes']
        ], null, 'A1');

        // formats
        $sheet3->getStyle('D:D')->getNumberFormat()->setFormatCode('m/d/yyyy h:mm:ss AM/PM'); // requested_at
        $sheet3->getStyle('H:H')->getNumberFormat()->setFormatCode('m/d/yyyy h:mm:ss AM/PM'); // reviewed_at

        $row3 = 2;
        $obQuery->chunk(500, function ($rows) use (&$row3, $sheet3) {
            foreach ($rows as $r) {
                $requested = $r->requested_at ? Carbon::parse($r->requested_at) : null;
                $reviewed  = $r->reviewed_at ? Carbon::parse($r->reviewed_at) : null;

                $sheet3->setCellValue("A{$row3}", $r->user?->name ?? '');
                $sheet3->setCellValue("B{$row3}", $r->schedule?->description ?? '');
                $sheet3->setCellValue("C{$row3}", $r->type ?? '');

                $sheet3->setCellValue("D{$row3}", $requested ? ExcelDate::PHPToExcel($requested) : null);

                $sheet3->setCellValue("E{$row3}", $r->notes ?? '');
                $sheet3->setCellValue("F{$row3}", $r->status ?? '');
                $sheet3->setCellValue("G{$row3}", $reviewed ? ExcelDate::PHPToExcel($reviewed) : null);

                $row3++;
            }
        });

        // =========================
        // Sheet 4: Records (was sheet3 before)
        // =========================
        $sheet4 = $spreadsheet->createSheet();
        $sheet4->setTitle('Records');

        $sheet4->fromArray([
            ['Employee', 'Days Present', 'Late Minutes', 'Total Hours']
        ], null, 'A1');

        $sheet4->getStyle('B:B')->getNumberFormat()->setFormatCode('0');
        $sheet4->getStyle('C:C')->getNumberFormat()->setFormatCode('0');
        $sheet4->getStyle('D:D')->getNumberFormat()->setFormatCode('0.00');

        $recordsQuery = AttendanceSummary::query()
            ->with(['user:id,name'])
            ->whereBetween('work_date', [$fromDate, $toDate])
            ->orderBy('user_id')
            ->orderBy('work_date');

        if (!$allUsers) {
            $recordsQuery->whereIn('user_id', $ids);
        }

        $stats = []; // [user_id => ['name'=>..., 'days_present'=>int, 'late_minutes'=>int, 'total_minutes'=>int]]

        $recordsQuery->chunk(500, function ($rows) use (&$stats, $startByScheduleId) {
            foreach ($rows as $r) {
                $uid = (int) ($r->user_id ?? 0);
                if (!$uid) continue;

                if (!isset($stats[$uid])) {
                    $stats[$uid] = [
                        'name' => $r->user?->name ?? ("User {$uid}"),
                        'days_present' => 0,
                        'late_minutes' => 0,
                        'total_minutes' => 0,
                    ];
                }

                // Days Present = has time_in_at
                if (!empty($r->time_in_at)) {
                    $stats[$uid]['days_present']++;
                }

                // Total Hours = time_out_at - time_in_at
                if (!empty($r->time_in_at) && !empty($r->time_out_at)) {
                    try {
                        $in  = Carbon::parse($r->time_in_at);
                        $out = Carbon::parse($r->time_out_at);

                        if ($out->greaterThan($in)) {
                            $stats[$uid]['total_minutes'] += $in->diffInMinutes($out);
                        }
                    } catch (\Throwable $e) {}
                }

                // Late Minutes = compare time_in_at vs scheduled start time for schedule_id
                $startTime = $startByScheduleId[$r->schedule_id] ?? null;

                if ($startTime && !empty($r->work_date) && !empty($r->time_in_at)) {
                    try {
                        $scheduled = Carbon::parse($r->work_date . ' ' . $startTime);
                        $actual    = Carbon::parse($r->time_in_at);

                        if ($actual->greaterThan($scheduled)) {
                            $stats[$uid]['late_minutes'] += $scheduled->diffInMinutes($actual);
                        }
                    } catch (\Throwable $e) {}
                }
            }
        });

        uasort($stats, fn ($a, $b) => strcasecmp($a['name'] ?? '', $b['name'] ?? ''));

        $row4 = 2;
        foreach ($stats as $s) {
            $totalHours = ((int)($s['total_minutes'] ?? 0)) / 60;

            $sheet4->setCellValue("A{$row4}", $s['name'] ?? '');
            $sheet4->setCellValue("B{$row4}", (int)($s['days_present'] ?? 0));
            $sheet4->setCellValue("C{$row4}", (int)($s['late_minutes'] ?? 0));
            $sheet4->setCellValue("D{$row4}", (float)$totalHours);

            $row4++;
        }

        $filename = "attendance_{$fromDate}_to_{$toDate}.xlsx";

        return response()->streamDownload(function () use ($spreadsheet) {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }
}
