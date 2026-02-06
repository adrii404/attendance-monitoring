<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\Request;

class UserController extends Controller
{
    public function active(Request $request)
    {
        $q = User::query()
            ->whereNull('deleted_at') // ✅ active = not soft-deleted
            ->with([
                'role:id,title',
                'schedule:id,description',
            ])
            ->orderBy('name');

        // optional: limit for kiosk/table performance
        $limit = (int) $request->query('limit', 200);
        $q->limit(min(max($limit, 1), 500));

        $users = $q->get(['id', 'name', 'role_id', 'schedule_id']);

        return response()->json([
            'count' => $users->count(),
            'items' => $users->map(fn ($u) => [
                'id' => $u->id,
                'name' => $u->name,
                'role' => $u->role?->title,
                'schedule' => $u->schedule?->description,
            ]),
        ]);
    }
}
