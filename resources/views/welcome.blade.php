<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="utf-8">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>Attendance Capture</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

    <!-- SheetJS -->
    <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>

    <!-- JSZip (for ZIP export with images) -->
    <script src="https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js"></script>
    <script src="https://cdn.jsdelivr.net/npm/file-saver@2.0.5/dist/FileSaver.min.js"></script>

    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>

<body class="min-h-screen bg-slate-950 text-slate-100">

    <header class="border-b border-white/10 px-4 py-3 text-lg font-semibold">
        📸 Attendance Capture System
    </header>

    <main class="p-4 max-w-7xl mx-auto grid grid-cols-1 xl:grid-cols-[2fr_3fr] gap-6">

        <!-- LEFT: CAMERA + ACTIONS -->
        <section class="rounded-3xl border border-white/10 bg-white/5 p-4 space-y-4">

            <!-- CAMERA -->
            <div>
                <div class="aspect-video rounded-xl overflow-hidden border border-white/10 bg-black">
                    <video id="video" autoplay muted playsinline class="w-full h-full object-cover"></video>
                </div>

                <div class="mt-3 flex gap-2">
                    <button id="btnStart"
                        class="px-4 py-2 rounded-xl bg-emerald-500 text-black font-semibold">Start</button>
                    <button id="btnStop" class="px-4 py-2 rounded-xl bg-white/10">Stop</button>
                </div>
            </div>

            <!-- DATE -->
            <div>
                <label class="text-xs text-slate-300">Attendance Date</label>
                <input id="datePicker" type="date" class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2 text-sm">
            </div>

            <!-- EMPLOYEE SEARCH -->
            <div>
                <label class="text-xs text-slate-300">Select Employee</label>
                <input id="employeeSearch" type="text" placeholder="Search employee..."
                    class="mt-1 w-full rounded-xl bg-white/10 px-3 py-2 text-sm">

                <div id="employeeResults"
                    class="mt-2 max-h-48 overflow-y-auto rounded-xl border border-white/10 bg-slate-950"></div>
            </div>

            <!-- ACTION TOGGLE -->
            <div>
                <label class="text-xs text-slate-300">Action</label>
                <div class="mt-2 flex gap-2">
                    <button id="btnModeIn" class="flex-1 rounded-xl bg-sky-400 text-black py-2 font-semibold">
                        Check-In
                    </button>
                    <button id="btnModeOut" class="flex-1 rounded-xl bg-white/10 py-2 font-semibold">
                        Check-Out
                    </button>
                </div>
            </div>

            <!-- CAPTURE -->
            <button id="btnCapture" class="w-full rounded-2xl bg-emerald-500 py-3 text-black font-semibold">
                Capture Attendance
            </button>

        </section>

        <!-- RIGHT: LOGS -->
        <section class="rounded-3xl border border-white/10 bg-white/5 p-4 space-y-4">

            <div class="flex flex-wrap justify-between items-center gap-3">
                <div class="text-sm font-semibold">Attendance Logs</div>
                <div class="flex gap-2">
                    <button id="btnExportXlsx" class="px-3 py-2 rounded-xl bg-white/10 text-sm">Export Excel</button>
                    <button id="btnExportJson" class="px-3 py-2 rounded-xl bg-white/10 text-sm">Export JSON</button>
                    <button id="btnExportZip" class="px-3 py-2 rounded-xl bg-white/10 text-sm">Export ZIP
                        (Images)</button>
                </div>
            </div>

            <div class="overflow-auto rounded-xl border border-white/10">
                <table class="w-full text-xs">
                    <thead class="bg-white/10">
                        <tr>
                            <th class="px-3 py-2">Photo</th>
                            <th class="px-3 py-2">Name</th>
                            <th class="px-3 py-2">Department</th>
                            <th class="px-3 py-2">Time In</th>
                            <th class="px-3 py-2">Time Out</th>
                            <th class="px-3 py-2">Hours</th>
                        </tr>
                    </thead>

                    </thead>
                    <tbody id="logsTbody" class="divide-y divide-white/10"></tbody>
                </table>
            </div>

        </section>

    </main>

</body>

</html>
