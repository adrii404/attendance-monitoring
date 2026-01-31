<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Web\EmployeeEnrollmentController;

Route::get('/', function () {
    return view('welcome');
})->name('capture.index');

Route::get('/employees/enroll', [EmployeeEnrollmentController::class, 'create'])
    ->name('employees.create');

Route::post('/employees/enroll', [EmployeeEnrollmentController::class, 'store'])
    ->name('employees.store');
