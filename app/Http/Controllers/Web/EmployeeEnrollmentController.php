<?php

namespace App\Http\Controllers\Web;

use App\Http\Controllers\Controller;
use App\Models\Role;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class EmployeeEnrollmentController extends Controller
{
    public function create()
    {
        $roles = Role::orderBy('name')->get();

        return view('employees.create', compact('roles'));
    }

    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:255'],
            'email' => ['nullable', 'email', 'max:255', 'unique:users,email'],
            'role_id' => ['required', 'exists:roles,id'],
            'password' => ['required', 'string', 'min:6'],
        ]);

        $user = new User();
        $user->name = $validated['name'];
        $user->contact_number = $validated['contact_number'] ?? null;
        $user->email = $validated['email'] ?? null;
        $user->role_id = (int) $validated['role_id'];
        $user->password = Hash::make($validated['password']);
        $user->save();

        return redirect()
            ->route('employees.create')
            ->with('swal_success', 'Employee account created successfully!');
    }
}
