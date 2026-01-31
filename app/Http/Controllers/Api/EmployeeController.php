<?php

namespace App\Http\Controllers\API;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class EmployeeController extends Controller
{
    public function index(Request $request)
    {
        // Optional: allow search (future)
        $q = trim((string) $request->query('q', ''));

        $users = User::query()
            ->with('role') // assumes User has role() relationship
            ->when($q !== '', function ($query) use ($q) {
                $query->where('name', 'like', "%{$q}%")
                      ->orWhere('email', 'like', "%{$q}%")
                      ->orWhere('contact_number', 'like', "%{$q}%");
            })
            ->orderBy('name')
            ->get(['id', 'name', 'email', 'contact_number', 'role_id']);

        return response()->json([
            'employees' => $users,
        ]);
    }
}
