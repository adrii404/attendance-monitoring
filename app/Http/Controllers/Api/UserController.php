<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\FaceProfile;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;


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

    public function show(User $user)
    {
        // include soft-deleted? usually no. if you want include, use withTrashed in route binding.
        return response()->json([
            'user' => [
                'id' => $user->id,
                'name' => $user->name,
                'contact_number' => $user->contact_number,
                'role_id' => $user->role_id,
                'schedule_id' => $user->schedule_id,
                'deleted_at' => $user->deleted_at,
            ],
        ]);
    }

    public function update(Request $request, User $user)
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:255'],
            'contact_number' => ['nullable', 'string', 'max:50'],
            'role_id' => ['required', 'integer', Rule::exists('roles', 'id')],
            'schedule_id' => ['required', 'integer', Rule::exists('schedules', 'id')],
            'password' => ['nullable', 'string', 'min:8'],
        ]);

        $user->name = $data['name'];
        $user->contact_number = $data['contact_number'] ?? null;
        $user->role_id = $data['role_id'];
        $user->schedule_id = $data['schedule_id'];

        if (!empty($data['password'])) {
            $user->password = bcrypt($data['password']);
        }

        $user->save();

        return response()->json(['success' => true]);
    }

    public function destroy(User $user)
    {
        FaceProfile::where('user_id', $user->id)->update(['is_active' => false]);
        // soft delete -> sets deleted_at
        $user->delete();

        return response()->json(['success' => true]);
    }
}

