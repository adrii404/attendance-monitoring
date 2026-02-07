<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Models\AttendanceLog;
use App\Services\AttendanceSummaryService;
use Carbon\Carbon;

class RebuildAttendanceSummaries extends Command
{
    protected $signature = 'attendance:rebuild-summaries {from} {to}';
    protected $description = 'Rebuild attendance summaries from logs for a date range (YYYY-MM-DD to YYYY-MM-DD)';

    public function handle(): int
    {
        $from = Carbon::createFromFormat('Y-m-d', $this->argument('from'))->startOfDay();
        $to   = Carbon::createFromFormat('Y-m-d', $this->argument('to'))->endOfDay();

        $svc = app(AttendanceSummaryService::class);

        $this->info("Rebuilding summaries from {$from} to {$to}");

        AttendanceLog::query()
            ->whereBetween('occurred_at', [$from, $to])
            ->orderBy('occurred_at')
            ->chunkById(500, function ($logs) use ($svc) {
                foreach ($logs as $log) {
                    try {
                        $svc->upsertFromLog($log);
                    } catch (\Throwable $e) {
                        $this->warn("Skipped log {$log->id}: {$e->getMessage()}");
                    }
                }
            });

        $this->info("Done.");
        return self::SUCCESS;
    }
}
