<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Api\EnrollController;
use App\Http\Controllers\Api\FaceController;
use App\Http\Controllers\API\AttendanceCaptureController;
use App\Http\Controllers\API\AttendanceSummaryController;

Route::post('/attendance/capture', [AttendanceCaptureController::class, 'store']);
Route::get('/attendance/summary', [AttendanceSummaryController::class, 'index']);


Route::get('/user', function (Request $request) {
    return $request->user();
})->middleware('auth:sanctum');

// Create user + face profile (enrollment)
Route::post('/enroll', [EnrollController::class, 'store']);

// Add face profile for an existing user (optional)
Route::post('/face/enroll', [FaceController::class, 'enroll']);

// Test matching only (optional)
Route::post('/face/match', [FaceController::class, 'match']);

// Match + save clock-in/out to DB
Route::post('/attendance/clock', [AttendanceController::class, 'clock']);

Route::get('/face/profiles', [FaceController::class, 'profiles']);   // optional: show enrolled list
Route::get('/attendance/logs', [AttendanceController::class, 'logs']); // optional: load logs by date


Route::post('/attendance/capture', [AttendanceCaptureController::class, 'store']);


Route::get('/attendance/summary', [
    \App\Http\Controllers\API\AttendanceSummaryController::class,
    'index'
]);

Route::get('/attendance/status/{user}', function ($userId) {
    $lastLog = \App\Models\AttendanceLog::where('user_id', $userId)
        ->orderByDesc('occurred_at')
        ->first();

    return response()->json([
        'status' => $lastLog?->type ?? 'none', // in | out | none
        'last_at' => $lastLog?->occurred_at,
    ]);
});


