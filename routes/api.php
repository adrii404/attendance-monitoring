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

Route::post('/enroll', [EnrollController::class, 'store']);

Route::post('/face/enroll', [FaceController::class, 'enroll']);

Route::post('/face/match', [FaceController::class, 'match']);

Route::post('/attendance/clock', [AttendanceController::class, 'clock']);

Route::get('/face/profiles', [FaceController::class, 'profiles']); 
Route::get('/attendance/logs', [AttendanceController::class, 'logs']);

Route::get('/official-businesses', [OfficialBusinessController::class, 'index']);
Route::post('/official-businesses', [OfficialBusinessController::class, 'store']);
Route::post('/official-businesses/{officialBusiness}/review', [OfficialBusinessController::class, 'review']);


Route::get('/users/active', [UserController::class, 'active']);
Route::get('/users/{user}', [UserController::class, 'show']);
Route::put('/users/{user}', [UserController::class, 'update']);
Route::delete('/users/{user}', [UserController::class, 'destroy']);