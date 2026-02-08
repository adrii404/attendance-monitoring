<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\AttendanceSummary;
use App\Models\AttendanceLog;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use PhpOffice\PhpSpreadsheet\Spreadsheet;
use PhpOffice\PhpSpreadsheet\Writer\Xlsx;

class AttendanceExportController extends Controller
{
    public function exportXlsx(Request $request)
    {
        $from = $request->query('from');
        $to   = $request->query('to');
        $userIds = $request->query('users');
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

        if (!$allUsers) {
            $summaryQuery->whereIn('user_id', $ids);
            $logsQuery->whereIn('user_id', $ids);
        }

        // ---- Build XLSX (2 sheets) ----
        $spreadsheet = new Spreadsheet();

        // Sheet 1: Summaries
        $sheet1 = $spreadsheet->getActiveSheet();
        $sheet1->setTitle('Summaries');

        $sheet1->fromArray([
            ['user_name', 'schedule', 'work_date', 'time_in_at', 'time_out_at', 'status']
        ], null, 'A1');

        $row = 2;
        $summaryQuery->chunk(500, function ($rows) use (&$row, $sheet1) {
            foreach ($rows as $r) {
                $sheet1->fromArray([[
                    $r->user?->name ?? '',
                    $r->schedule?->description ?? '',
                    $r->work_date ?? '',
                    $r->time_in_at ?? '',
                    $r->time_out_at ?? '',
                    $r->status ?? '',
                ]], null, "A{$row}");
                $row++;
            }
        });

        // Sheet 2: Logs
        $sheet2 = $spreadsheet->createSheet();
        $sheet2->setTitle('Logs');

        $sheet2->fromArray([
            ['user_name', 'schedule', 'type', 'occurred_at', 'device_id', 'photo_path', 'meta']
        ], null, 'A1');

        $row2 = 2;
        $logsQuery->chunk(500, function ($rows) use (&$row2, $sheet2) {
            foreach ($rows as $r) {
                $sheet2->fromArray([[
                    $r->user?->name ?? '',
                    $r->schedule?->description ?? '',
                    $r->type ?? '',
                    $r->occurred_at ?? '',
                    $r->device_id ?? '',
                    $r->photo_path ?? '',
                    is_array($r->meta) ? json_encode($r->meta) : ($r->meta ?? ''),
                ]], null, "A{$row2}");
                $row2++;
            }
        });

        $filename = "attendance_{$fromDate}_to_{$toDate}.xlsx";

        return response()->streamDownload(function () use ($spreadsheet) {
            $writer = new Xlsx($spreadsheet);
            $writer->save('php://output');
        }, $filename, [
            'Content-Type' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        ]);
    }
}
