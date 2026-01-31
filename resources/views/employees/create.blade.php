@extends('layouts.app')

@php
  $title = 'Employee Enrollment';
  $header = '👤 Employee Enrollment';
@endphp

@section('content')
<div class="max-w-3xl mx-auto space-y-4">

    <section class="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div class="flex items-center justify-between gap-4">
            <div>
                <div class="text-base font-semibold">Create Employee Account</div>
                <div class="text-xs text-slate-400">
                    This creates a record in <code>users</code> and assigns a <code>role_id</code>.
                </div>
            </div>
            <a href="{{ route('capture.index') }}" class="px-3 py-2 rounded-xl bg-white/10 text-xs hover:bg-white/15">
                ← Back to Capture
            </a>
        </div>

        <form method="POST" action="{{ route('employees.store') }}" class="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            @csrf

            <div class="md:col-span-2">
                <label class="text-xs text-slate-300">Full Name</label>
                <input name="name" value="{{ old('name') }}"
                       class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2 text-sm border border-white/10"
                       placeholder="Juan Dela Cruz" required>
                @error('name') <div class="text-xs text-red-300 mt-1">{{ $message }}</div> @enderror
            </div>

            <div>
                <label class="text-xs text-slate-300">Contact Number (optional)</label>
                <input name="contact_number" value="{{ old('contact_number') }}"
                       class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2 text-sm border border-white/10"
                       placeholder="09XXXXXXXXX">
                @error('contact_number') <div class="text-xs text-red-300 mt-1">{{ $message }}</div> @enderror
            </div>

            <div>
                <label class="text-xs text-slate-300">Email (optional)</label>
                <input name="email" type="email" value="{{ old('email') }}"
                       class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2 text-sm border border-white/10"
                       placeholder="name@email.com">
                @error('email') <div class="text-xs text-red-300 mt-1">{{ $message }}</div> @enderror
            </div>

            <div>
                <label class="text-xs text-slate-300">Role</label>
                <select name="role_id"
                        class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2 text-sm border border-white/10" required>
                    <option value="" disabled {{ old('role_id') ? '' : 'selected' }}>Select role...</option>
                    @foreach($roles as $role)
                        <option value="{{ $role->id }}" {{ (string)old('role_id') === (string)$role->id ? 'selected' : '' }}>
                            {{ $role->name }}
                        </option>
                    @endforeach
                </select>
                @error('role_id') <div class="text-xs text-red-300 mt-1">{{ $message }}</div> @enderror
            </div>

            <div>
                <label class="text-xs text-slate-300">Password</label>
                <input name="password" type="password"
                       class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2 text-sm border border-white/10"
                       placeholder="••••••••" required>
                @error('password') <div class="text-xs text-red-300 mt-1">{{ $message }}</div> @enderror
            </div>

            <div class="md:col-span-2 flex items-center justify-end gap-2 pt-2">
                <button type="reset" class="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 text-sm">
                    Clear
                </button>
                <button type="submit" class="px-5 py-2 rounded-xl bg-emerald-500 text-black font-semibold text-sm">
                    Create Employee
                </button>
            </div>
        </form>
    </section>

    <section class="rounded-3xl border border-white/10 bg-white/5 p-5">
        <div class="text-sm font-semibold">Next step (optional)</div>
        <div class="text-xs text-slate-400 mt-1">
            After creating an account, you can enroll the employee’s face using your existing API flow
            (<code>/api/face/enroll</code> / <code>/api/enroll</code>) if needed.
        </div>
    </section>

</div>
@endsection
    