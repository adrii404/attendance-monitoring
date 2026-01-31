<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ $title ?? 'Attendance Monitoring' }}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">

    {{-- SweetAlert2 (global) --}}
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

    {{-- SheetJS + Zip exports (only needed on capture page, but safe to keep global) --}}
    <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js"></script>

    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>

<body class="min-h-screen bg-slate-950 text-slate-100">
    <div class="min-h-screen flex">

        {{-- SIDEBAR --}}
        <aside class="w-64 shrink-0 border-r border-white/10 bg-slate-950/60 hidden md:flex flex-col">
            <div class="px-4 py-4 border-b border-white/10">
                <div class="text-lg font-bold">📸 Attendance</div>
                <div class="text-xs text-slate-400">Monitoring System</div>
            </div>

            <nav class="p-3 space-y-2">
                <a href="{{ route('capture.index') }}"
                   class="block rounded-xl px-3 py-2 text-sm font-semibold
                   {{ request()->routeIs('capture.index') ? 'bg-white/10' : 'hover:bg-white/5' }}">
                    ✅ Attendance Capture
                </a>

                <a href="{{ route('employees.create') }}"
                   class="block rounded-xl px-3 py-2 text-sm font-semibold
                   {{ request()->routeIs('employees.create') ? 'bg-white/10' : 'hover:bg-white/5' }}">
                    👤 Employee Enrollment
                </a>
            </nav>

            <div class="mt-auto p-3 text-xs text-slate-500">
                v1.0 • Local
            </div>
        </aside>

        {{-- MAIN --}}
        <div class="flex-1 min-w-0">
            <header class="border-b border-white/10 px-4 py-3 text-lg font-semibold flex items-center justify-between">
                <div>{{ $header ?? '📸 Attendance Capture System' }}</div>

                {{-- Mobile nav (2 links only) --}}
                <div class="md:hidden flex gap-2">
                    <a href="{{ route('capture.index') }}"
                       class="px-3 py-2 rounded-xl bg-white/10 text-xs">Capture</a>
                    <a href="{{ route('employees.create') }}"
                       class="px-3 py-2 rounded-xl bg-white/10 text-xs">Enroll</a>
                </div>
            </header>

            <main class="p-4">
                @yield('content')
            </main>
        </div>

    </div>

    {{-- SweetAlert flash messages (works for enrollment success/errors) --}}
    <script>
        @if(session('swal_success'))
            Swal.fire({
                icon: 'success',
                title: 'Success',
                text: @json(session('swal_success')),
                confirmButtonColor: '#10b981',
            });
        @endif

        @if(session('swal_error'))
            Swal.fire({
                icon: 'error',
                title: 'Error',
                text: @json(session('swal_error')),
                confirmButtonColor: '#ef4444',
            });
        @endif
    </script>
</body>
</html>
