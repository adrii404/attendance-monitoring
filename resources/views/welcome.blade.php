<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">

<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>{{ config('app.name', 'Laravel') }}</title>

    <script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script>

    <!-- ✅ SweetAlert2 -->
    <script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.bunny.net">
    <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600" rel="stylesheet" />
    <script defer src="https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js"></script>
    <script>
        // Create a themed Swal instance (do NOT overwrite window.Swal)
        window.SwalTheme = (function() {
            if (!window.Swal) return null;

            return window.Swal.mixin({
                background: "#0b1220",
                color: "#e2e8f0",
                confirmButtonColor: "#34d399", // emerald
                cancelButtonColor: "#334155", // slate
            });
        })();

        /**
         * Use this from app.js:
         *   const ok = await window.confirmTimeInSwal(name)
         */
        window.confirmTimeInSwal = async function(name) {
            if (!window.SwalTheme) {
                return window.confirm(`Confirm TIME-IN?\n\nName: ${name || "—"}`);
            }

            const result = await window.SwalTheme.fire({
                title: "Confirm Check-In?",
                html: `
                    <div style="font-size:14px;line-height:1.4">
                        <div style="opacity:.85">Detected employee:</div>
                        <div style="margin-top:6px;font-weight:700;color:#34d399">
                            ${String(name || "—")}
                        </div>
                    </div>
                `,
                icon: "question",
                showCancelButton: true,
                confirmButtonText: "Yes, Check-In",
                cancelButtonText: "Cancel",
                reverseButtons: true,
                focusCancel: true,
            });

            return !!result.isConfirmed;
        };

        /**
         * Optional toast helper:
         *   window.toastSwal("Saved!", "success")
         */
        window.toastSwal = function(title, icon = "success") {
            if (!window.SwalTheme) return;

            return window.SwalTheme.fire({
                toast: true,
                position: "top-end",
                icon,
                title,
                showConfirmButton: false,
                timer: 1800,
                timerProgressBar: true,
            });
        };
    </script>

    @vite(['resources/css/app.css', 'resources/js/app.js'])
</head>

<body class="min-h-screen bg-slate-950 text-slate-100">
    <!-- Top Bar -->
    <header class="sticky top-0 z-40 border-b border-white/10 bg-slate-950/75 backdrop-blur">
        <div class="mx-auto max-w-7xl px-4 py-3 flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
                <div class="h-10 w-10 rounded-2xl bg-white/10 grid place-items-center shadow ring-1 ring-white/10">
                    <span class="text-lg">🕒</span>
                </div>
                <div class="leading-tight">
                    <div class="text-base sm:text-lg font-semibold">Face Attendance</div>
                    <div class="text-[11px] text-slate-400 hidden sm:block">
                        <span id="tzLabel">Timezone: local</span>
                        <span class="mx-2 text-white/20">•</span>
                        <span id="nowLabel">—</span>
                    </div>
                </div>
            </div>

            <div class="flex items-center gap-2">
                <!-- Status chips -->
                <span
                    class="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs ring-1 ring-white/10">
                    <span class="h-2 w-2 rounded-full bg-amber-400" id="statusDot"></span>
                    <span id="modelStatusText">Loading models…</span>
                </span>

                <!-- Admin toggle (drawer) -->
                <button id="btnAdminToggle" type="button"
                    class="inline-flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 ring-1 ring-white/10">
                    <span class="hidden sm:inline">Admin</span>
                    <span class="sm:hidden">⚙️</span>
                </button>
            </div>
        </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-6">
        <!-- MAIN GRID: Camera (primary) + Today/Recent (sidebar) -->
        <div class="grid gap-6 lg:grid-cols-12">
            <!-- Primary: Camera + Actions -->
            <section class="lg:col-span-8">
                <div class="rounded-3xl border border-white/10 bg-white/5 shadow ring-1 ring-white/10">
                    <!-- Camera header -->
                    <div
                        class="p-4 sm:p-5 border-b border-white/10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div class="text-sm font-semibold">Camera</div>
                            <div class="text-xs text-slate-300">Keep face centered and well-lit. Make sure camera
                                permission is allowed.</div>
                        </div>

                        <div class="flex flex-wrap items-center gap-2">
                            <button id="btnStart" type="button"
                                class="rounded-xl bg-emerald-500/90 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 ring-1 ring-emerald-400/30">
                                Start
                            </button>
                            <button id="btnStop" type="button"
                                class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 ring-1 ring-white/10">
                                Stop
                            </button>
                            <button id="btnFlip" type="button"
                                class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 ring-1 ring-white/10">
                                Flip
                            </button>
                        </div>
                    </div>

                    <!-- Camera body -->
                    <div class="p-4 sm:p-5">
                        <div id="videoWrap"
                            class="relative overflow-hidden rounded-2xl border border-white/10 bg-black ring-1 ring-white/10">
                            <video id="video" class="block w-full h-auto" autoplay muted playsinline></video>
                            <canvas id="overlay" class="pointer-events-none absolute inset-0 h-full w-full"></canvas>

                            <div
                                class="pointer-events-none absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-[11px] text-slate-200 ring-1 ring-white/10">
                                <span class="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                                Live preview
                            </div>
                        </div>

                        <!-- Detected bar -->
                        <div class="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div
                                class="rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm ring-1 ring-white/10 w-full">
                                <span class="text-slate-400">Detected:</span>
                                <span id="liveDetectedName" class="ml-1 font-semibold text-emerald-300">—</span>
                            </div>

                            <div class="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
                                <span
                                    class="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-2 ring-1 ring-white/10">
                                    Tip: good lighting improves match
                                </span>
                            </div>
                        </div>

                        <!-- Attendance actions -->
                        <div class="mt-5">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <div class="text-sm font-semibold">Attendance actions</div>
                                    <div class="text-xs text-slate-300">Face-match an enrolled person, then log
                                        check-in/out.</div>
                                </div>
                            </div>

                            <div class="mt-3 grid gap-3 sm:grid-cols-2">
                                <button id="btnCheckIn" type="button"
                                    class="rounded-2xl bg-sky-400/90 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-300 ring-1 ring-sky-300/30">
                                    Check In
                                </button>
                                <button id="btnCheckOut" type="button"
                                    class="rounded-2xl bg-amber-400/90 px-4 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300 ring-1 ring-amber-300/30">
                                    Check Out
                                </button>
                            </div>

                            <div
                                class="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-slate-300 ring-1 ring-white/10">
                                <span class="text-slate-400">Last action:</span>
                                <span id="lastActionLabel" class="ml-1 font-semibold text-slate-100">—</span>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <!-- Sidebar: Today + Recent -->
            <aside class="lg:col-span-4 space-y-6">
                <div class="rounded-3xl border border-white/10 bg-white/5 shadow ring-1 ring-white/10">
                    <div class="p-4 sm:p-5 border-b border-white/10">
                        <div class="flex items-center justify-between gap-3">
                            <div>
                                <div class="text-sm font-semibold">Today</div>
                                <div class="text-xs text-slate-300">Browse and export logs by date.</div>
                            </div>
                            <div class="text-[11px] text-slate-400">
                                <span id="logsCount">0</span> people
                            </div>
                        </div>

                        <div class="mt-3 flex items-center gap-2">
                            <input id="datePicker" type="date"
                                class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60">
                            <button id="btnToday" type="button"
                                class="shrink-0 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 ring-1 ring-white/10">
                                Today
                            </button>
                        </div>

                        <div class="mt-2 flex items-center justify-between text-[11px] text-slate-400 sm:hidden">
                            <span id="tzLabelMobile">Timezone: local</span>
                            <span id="nowLabelMobile">—</span>
                        </div>
                    </div>

                    <div class="p-4 sm:p-5">
                        <div class="grid grid-cols-3 gap-3">
                            <div class="rounded-2xl border border-white/10 bg-slate-950/40 p-3 ring-1 ring-white/10">
                                <div class="text-[11px] text-slate-400">Present</div>
                                <div class="mt-1 text-lg font-semibold" id="statPresent">0</div>
                            </div>
                            <div class="rounded-2xl border border-white/10 bg-slate-950/40 p-3 ring-1 ring-white/10">
                                <div class="text-[11px] text-slate-400">Checked in</div>
                                <div class="mt-1 text-lg font-semibold" id="statIn">0</div>
                            </div>
                            <div class="rounded-2xl border border-white/10 bg-slate-950/40 p-3 ring-1 ring-white/10">
                                <div class="text-[11px] text-slate-400">Checked out</div>
                                <div class="mt-1 text-lg font-semibold" id="statOut">0</div>
                            </div>
                        </div>

                        <div class="mt-4">
                            <div class="flex items-center justify-between">
                                <div class="text-sm font-semibold">Recent activity</div>
                                <div class="text-[11px] text-slate-400">Auto-updates</div>
                            </div>
                            <div id="recentList"
                                class="mt-2 max-h-[260px] overflow-auto rounded-2xl border border-white/10 bg-slate-950/40 ring-1 ring-white/10">
                                <div class="p-3 text-xs text-slate-400">
                                    No recent activity.
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div id="toastList" class="space-y-3"></div>
            </aside>

            <!-- FULL-WIDTH Logs Table -->
            <section class="lg:col-span-12">
                <div class="rounded-3xl border border-white/10 bg-white/5 shadow ring-1 ring-white/10 overflow-hidden">
                    <div
                        class="p-4 sm:p-5 border-b border-white/10 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div class="text-sm font-semibold">Logs (selected day)</div>
                            <div class="text-xs text-slate-300">Name, time in/out, and photo per entry.</div>
                        </div>

                        <div class="flex flex-wrap items-center gap-2">
                            <button id="btnDownloadDayXlsx" type="button"
                                class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 ring-1 ring-white/10">
                                Download Excel
                            </button>
                            <button id="btnDownloadDayJson" type="button"
                                class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 ring-1 ring-white/10">
                                Download JSON + Photos
                            </button>
                            <button id="btnClearDay" type="button"
                                class="rounded-xl bg-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/30 ring-1 ring-rose-500/20">
                                Clear day
                            </button>
                        </div>
                    </div>

                    <div class="overflow-auto">
                        <table class="min-w-full text-left text-xs">
                            <thead class="bg-white/10 text-slate-200 sticky top-0">
                                <tr>
                                    <th class="px-4 py-3 font-semibold">Name</th>
                                    <th class="px-4 py-3 font-semibold">Time In</th>
                                    <th class="px-4 py-3 font-semibold">Time Out</th>
                                    <th class="px-4 py-3 font-semibold">Photo</th>
                                </tr>
                            </thead>
                            <tbody id="logsTbody" class="divide-y divide-white/10 bg-slate-950/40"></tbody>
                        </table>
                    </div>
                </div>
            </section>
        </div>

        <!-- ADMIN DRAWER -->
        <div id="adminDrawerBackdrop" class="fixed inset-0 z-50 hidden">
            <div class="absolute inset-0 bg-black/60"></div>

            <div id="adminDrawer"
                class="absolute right-0 top-0 h-full w-full max-w-md bg-slate-950 border-l border-white/10 shadow-2xl">
                <div class="h-full flex flex-col">
                    <div class="p-4 border-b border-white/10 flex items-center justify-between">
                        <div>
                            <div class="text-sm font-semibold">Admin Panel</div>
                            <div class="text-xs text-slate-400">Enrollment, threshold, and local controls.</div>
                        </div>
                        <button id="btnAdminClose" type="button"
                            class="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 ring-1 ring-white/10">
                            Close
                        </button>
                    </div>

                    <div class="flex-1 overflow-auto p-4 space-y-4" id="adminPanel">
                        <div class="rounded-2xl border border-white/10 bg-white/5 p-3 ring-1 ring-white/10">
                            <div>
                                <div class="text-sm font-semibold">Enroll person</div>
                                <div class="text-xs text-slate-300">Add a face profile locally (name + descriptor).
                                </div>
                            </div>

                            <div class="mt-3 grid gap-2">
                                <label class="text-xs text-slate-300">Full name</label>
                                <input id="enrollName" type="text" placeholder="e.g., Juan Dela Cruz"
                                    class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60" />

                                <input id="enrollContact" type="tel" placeholder="Contact Number"
                                    class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60" />

                                <input id="enrollPassword" type="password" placeholder="Password"
                                    class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60" />

                                <select id="enrollRole"
                                    class="w-full rounded-xl bg-black border border-white/10 p-3 text-slate-100">
                                    <option value="">Select role</option>
                                    <option value="1">ADMIN</option>
                                    <option value="2">IT</option>
                                    <option value="3">CSR</option>
                                    <option value="4">TECHNICAL</option>
                                </select>

                                <div class="flex flex-wrap items-center gap-2 pt-1">
                                    <button id="btnEnroll" type="button"
                                        class="rounded-xl bg-emerald-500/90 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400 ring-1 ring-emerald-400/30">
                                        Capture & Save
                                    </button>

                                    <button id="btnExportProfiles" type="button"
                                        class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 ring-1 ring-white/10">
                                        Export
                                    </button>

                                    <label
                                        class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 cursor-pointer ring-1 ring-white/10">
                                        Import
                                        <input id="importProfiles" type="file" accept="application/json"
                                            class="hidden" />
                                    </label>
                                </div>
                            </div>
                        </div>

                        <div class="rounded-2xl border border-white/10 bg-white/5 p-3 ring-1 ring-white/10">
                            <div class="flex items-center justify-between gap-3">
                                <div>
                                    <div class="text-sm font-semibold">Registered Employee</div>
                                </div>
                                <div class="text-[11px] text-slate-400"><span id="rosterCount">0</span> people</div>
                            </div>
                            <div id="adminRosterList" class="mt-3 grid gap-2"></div>
                        </div>

                        <div class="rounded-2xl border border-white/10 bg-white/5 p-3 ring-1 ring-white/10">
                            <div class="text-xs text-slate-300">Threshold (lower = stricter)</div>

                            <div class="mt-2 flex items-center gap-3">
                                <input id="threshold" type="range" min="0.35" max="0.35" step="0.01"
                                    value="0.35" class="w-full" disabled>
                                <div class="w-14 text-right text-sm font-mono" id="thresholdVal">0.55</div>
                            </div>
                            <div class="mt-1 text-[11px] text-slate-400">Tip: 0.50–0.60 is a common starting range.
                            </div>
                        </div>

                        <div class="rounded-2xl border border-white/10 bg-white/5 p-3 ring-1 ring-white/10">
                            <div class="flex items-start justify-between gap-3">
                                <div>
                                    <div class="text-sm font-semibold">System message</div>
                                </div>

                                <div class="flex items-center gap-2">
                                    <button id="btnChangePw" type="button"
                                        class="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 ring-1 ring-white/10">
                                        Set/Change password
                                    </button>
                                    <button id="btnClearAll" type="button"
                                        class="rounded-xl bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 ring-1 ring-rose-500/20">
                                        Reset local data
                                    </button>
                                </div>
                            </div>

                            <pre id="status"
                                class="mt-3 whitespace-pre-wrap break-words text-xs text-slate-200/90 max-h-[18.5em] overflow-y-auto pr-2 rounded-xl bg-black/10 ring-1 ring-white/10"></pre>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Admin Password Modal -->
        <div id="pwModal" class="fixed inset-0 z-[60] hidden items-center justify-center bg-black/60 p-4">
            <div
                class="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-xl ring-1 ring-white/10">
                <div class="text-sm font-semibold text-slate-100" id="pwModalTitle">Admin password</div>
                <div class="mt-1 text-xs text-slate-300" id="pwModalDesc">Enter password</div>

                <input id="pwModalInput" type="password" autocomplete="current-password"
                    class="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60"
                    placeholder="Password" />

                <div class="mt-3 flex justify-end gap-2">
                    <button id="pwModalCancel"
                        class="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 ring-1 ring-white/10">
                        Cancel
                    </button>
                    <button id="pwModalOk"
                        class="rounded-xl bg-emerald-500/90 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400 ring-1 ring-emerald-400/30">
                        OK
                    </button>
                </div>
            </div>
        </div>

        <footer class="mt-8 text-center text-[11px] text-slate-500"></footer>
    </main>

    <!-- Drawer open/close -->
    <script>
        (function() {
            const openBtn = document.getElementById('btnAdminToggle');
            const closeBtn = document.getElementById('btnAdminClose');
            const backdrop = document.getElementById('adminDrawerBackdrop');

            if (!openBtn || !closeBtn || !backdrop) return;

            const open = () => backdrop.classList.remove('hidden');
            const close = () => backdrop.classList.add('hidden');

            openBtn.addEventListener('click', open);
            closeBtn.addEventListener('click', close);

            backdrop.addEventListener('click', (e) => {
                // close when clicking the dimmed overlay only
                if (e.target === backdrop || e.target.classList.contains('bg-black/60')) close();
            });
        })();
    </script>
</body>

</html>
