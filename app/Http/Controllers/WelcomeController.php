<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\Schedule;

class WelcomeController extends Controller
{
    public function __invoke()
    {
        $roles = Role::query()
            ->select('id', 'title')
            ->orderBy('title')
            ->get();

        $schedules = Schedule::query()
            ->select('id', 'description', 'clock_in', 'clock_out')
            ->orderBy('id')
            ->get();

        return view('welcome', compact('roles', 'schedules'));
    }
}
