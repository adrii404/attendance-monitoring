<?php

namespace App\Http\Controllers;

use App\Models\Role;
use App\Models\Schedule;
use App\Models\User;

class WelcomeController extends Controller
{
    public function __invoke()
    {
        $roles = Role::query()
            ->select('id','title')
            ->orderBy('title')
            ->get();

        $schedules = Schedule::query()
            ->select('id','description','clock_in','clock_out')
            ->orderBy('clock_in')
            ->get();

        $users = User::query()
            ->select('id','name','schedule_id')
            ->orderBy('name')
            ->get();

        return view('welcome', compact('roles','schedules','users'));
    }
}
