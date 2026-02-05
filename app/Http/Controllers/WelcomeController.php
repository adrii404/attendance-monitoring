<?php

namespace App\Http\Controllers;

use App\Models\Role;

class WelcomeController extends Controller
{
    public function __invoke()
    {
        $roles = Role::query()
            ->select('id', 'title')
            ->orderBy('title')
            ->get();

        return view('welcome', compact('roles'));
    }
}
