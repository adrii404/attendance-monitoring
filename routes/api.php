<?php

use Illuminate\Http\Request;
use Illuminate\Support\Facades\Route;

use App\Http\Controllers\Api\EnrollController;
use App\Http\Controllers\Api\FaceController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\OfficialBusinessController;
use App\Http\Controllers\Api\UserController;


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

Route::get('/official-businesses', [OfficialBusinessController::class, 'index']);
Route::post('/official-businesses', [OfficialBusinessController::class, 'store']);

Route::get('/users/active', [UserController::class, 'active']);