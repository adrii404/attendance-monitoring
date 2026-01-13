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
                    <!-- Header stays -->
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

                    <!-- Body -->
                    <div class="flex-1 overflow-y-auto p-4 space-y-4">

                        <!-- ✅ Admin: Registered People Status -->
                        <div class="rounded-2xl border border-white/10 bg-slate-950/60 p-3 ring-1 ring-white/10">
                            <div class="flex items-center justify-between gap-3">
                                <div>
                                    <div class="text-sm font-semibold">Registered Employee</div>
                                    <div class="text-xs text-slate-400">
                                        Set daily status per employee (saved locally per selected date).
                                    </div>
                                    <div class="mt-1 text-[11px] text-slate-500">
                                        Date: <span id="rosterDateLabel">—</span>
                                    </div>
                                </div>
                                <div class="text-[11px] text-slate-400">
                                    <span id="rosterCount">0</span> people
                                </div>
                            </div>

                            <div id="adminRosterList" class="mt-3 grid gap-2"></div>
                        </div>

                        <!-- ✅ Threshold -->
                        <div class="rounded-2xl border border-white/10 bg-slate-950/50 p-3 ring-1 ring-white/10">
                            <div class="text-xs text-slate-300">Threshold (lower = stricter) — Admin only</div>

                            <div class="mt-2 flex items-center gap-3">
                                <input id="threshold" type="range" min="0.35" max="0.75" step="0.01"
                                    value="0.55" class="w-full" disabled>
                                <div class="w-14 text-right text-sm font-mono" id="thresholdVal">0.55</div>
                            </div>

                            <div class="mt-1 text-[11px] text-slate-400">
                                Tip: 0.50–0.60 is a common starting range.
                            </div>
                        </div>

                        <!-- ✅ System message -->
                        <div class="rounded-2xl border border-white/10 bg-slate-950/60 p-3 ring-1 ring-white/10">
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
                                class="mt-3 whitespace-pre-wrap break-words text-xs text-slate-200/90
                       max-h-[18.5em] overflow-y-auto pr-2 rounded-xl bg-black/10
                       ring-1 ring-white/10"></pre>
                        </div>

                        <!-- ✅ Admin quick export / clear (no duplicate IDs) -->
                        <div class="flex flex-wrap items-center gap-2">
                            <button id="btnDownloadDayXlsxAdmin" type="button"
                                class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 ring-1 ring-white/10">
                                Download Excel (selected day)
                            </button>

                            <button id="btnDownloadDayJsonAdmin" type="button"
                                class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 ring-1 ring-white/10">
                                Download JSON + Photos
                            </button>

                            <button id="btnClearDayAdmin" type="button"
                                class="rounded-xl bg-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/30 ring-1 ring-rose-500/20">
                                Clear selected day
                            </button>
                        </div>

                        <!-- ✅ Admin Access button inside drawer (optional but matches your snippet) -->
                        <div class="flex justify-end pt-2">
                            <button id="btnAdminAccess" type="button"
                                class="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 ring-1 ring-white/10">
                                Admin Access
                            </button>
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

    <script>
        (function() {
            const backdrop = document.getElementById('adminDrawerBackdrop');
            const openBtn = document.getElementById('btnAdminToggle');
            const closeBtn = document.getElementById('btnAdminClose');

            const pwModal = document.getElementById('pwModal');
            const pwTitle = document.getElementById('pwModalTitle');
            const pwDesc = document.getElementById('pwModalDesc');
            const pwInput = document.getElementById('pwModalInput');
            const pwCancel = document.getElementById('pwModalCancel');
            const pwOk = document.getElementById('pwModalOk');

            const btnAdminAccess = document.getElementById('btnAdminAccess');
            const btnChangePw = document.getElementById('btnChangePw');
            const btnClearAll = document.getElementById('btnClearAll');
            const statusEl = document.getElementById('status');

            const threshold = document.getElementById('threshold');
            const thresholdVal = document.getElementById('thresholdVal');

            // Proxy buttons (no duplicate IDs)
            const btnXlsxAdmin = document.getElementById('btnDownloadDayXlsxAdmin');
            const btnJsonAdmin = document.getElementById('btnDownloadDayJsonAdmin');
            const btnClearDayAdmin = document.getElementById('btnClearDayAdmin');

            // Your existing buttons (already on page)
            const btnXlsx = document.getElementById('btnDownloadDayXlsx');
            const btnJson = document.getElementById('btnDownloadDayJson');
            const btnClearDay = document.getElementById('btnClearDay');

            if (!backdrop || !openBtn || !closeBtn) return;

            const LS_ADMIN_UNLOCK = 'fa_admin_unlocked';
            const LS_ADMIN_PW = 'fa_admin_password';
            const LS_THRESHOLD = 'fa_threshold';

            function logStatus(msg) {
                if (!statusEl) return;
                const ts = new Date().toLocaleString();
                statusEl.textContent = `[${ts}] ${msg}\n` + (statusEl.textContent || '');
            }

            function isAdminUnlocked() {
                return localStorage.getItem(LS_ADMIN_UNLOCK) === '1';
            }

            function setAdminUnlocked(val) {
                localStorage.setItem(LS_ADMIN_UNLOCK, val ? '1' : '0');
                if (threshold) threshold.disabled = !val;
                logStatus(val ? 'Admin unlocked.' : 'Admin locked.');
            }

            function openDrawer() {
                backdrop.classList.remove('hidden');
            }

            function closeDrawer() {
                backdrop.classList.add('hidden');
            }

            function openPwModal(mode = 'login') {
                if (!pwModal) return;
                pwModal.classList.remove('hidden');
                pwModal.classList.add('flex');

                pwInput.value = '';
                pwInput.focus();

                if (mode === 'set') {
                    pwTitle.textContent = 'Set/Change admin password';
                    pwDesc.textContent = 'Enter new password';
                } else {
                    pwTitle.textContent = 'Admin password';
                    pwDesc.textContent = 'Enter password';
                }

                pwModal.dataset.mode = mode;
            }

            function closePwModal() {
                if (!pwModal) return;
                pwModal.classList.add('hidden');
                pwModal.classList.remove('flex');
                pwInput.value = '';
                delete pwModal.dataset.mode;
            }

            function ensureAdminThenOpenDrawer() {
                if (isAdminUnlocked()) {
                    openDrawer();
                    return;
                }
                openPwModal('login');
            }

            // Load threshold default
            if (threshold && thresholdVal) {
                const saved = localStorage.getItem(LS_THRESHOLD);
                const v = saved ? Number(saved) : Number(threshold.value || 0.55);
                threshold.value = String(v);
                thresholdVal.textContent = v.toFixed(2);
            }

            // Threshold change
            threshold?.addEventListener('input', () => {
                const v = Number(threshold.value);
                thresholdVal.textContent = v.toFixed(2);
                localStorage.setItem(LS_THRESHOLD, String(v));
            });

            // Open / Close drawer
            openBtn.addEventListener('click', ensureAdminThenOpenDrawer);
            closeBtn.addEventListener('click', closeDrawer);
            backdrop.addEventListener('click', (e) => {
                if (e.target === backdrop || e.target.classList.contains('bg-black/60')) closeDrawer();
            });

            // Admin access button inside drawer
            btnAdminAccess?.addEventListener('click', () => {
                if (!isAdminUnlocked()) openPwModal('login');
                else logStatus('Admin already unlocked.');
            });

            // Set/Change password
            btnChangePw?.addEventListener('click', () => openPwModal('set'));

            // Password modal buttons
            pwCancel?.addEventListener('click', closePwModal);

            pwOk?.addEventListener('click', async () => {
                const mode = pwModal?.dataset?.mode || 'login';
                const input = (pwInput.value || '').trim();

                if (!input) {
                    logStatus('Password input is empty.');
                    return;
                }

                if (mode === 'set') {
                    localStorage.setItem(LS_ADMIN_PW, input);
                    setAdminUnlocked(true);
                    closePwModal();
                    openDrawer();
                    logStatus('Admin password updated.');
                    return;
                }

                // login mode
                const savedPw = localStorage.getItem(LS_ADMIN_PW);

                // If no password set yet, treat first login as set (simple local setup)
                if (!savedPw) {
                    localStorage.setItem(LS_ADMIN_PW, input);
                    setAdminUnlocked(true);
                    closePwModal();
                    openDrawer();
                    logStatus('Admin password created (first time).');
                    return;
                }

                if (input === savedPw) {
                    setAdminUnlocked(true);
                    closePwModal();
                    openDrawer();
                    logStatus('Admin login success.');
                } else {
                    setAdminUnlocked(false);
                    logStatus('Admin login failed: incorrect password.');

                    if (window.SwalTheme) {
                        window.SwalTheme.fire({
                            icon: 'error',
                            title: 'Wrong password',
                            text: 'Please try again.',
                        });
                    } else {
                        alert('Wrong password. Please try again.');
                    }
                }
            });

            // Reset local data (with confirmation)
            btnClearAll?.addEventListener('click', async () => {
                const doIt = window.SwalTheme ?
                    (await window.SwalTheme.fire({
                        icon: 'warning',
                        title: 'Reset local data?',
                        text: 'This will remove locally saved roster/logs/password/threshold on this browser.',
                        showCancelButton: true,
                        confirmButtonText: 'Yes, reset',
                        cancelButtonText: 'Cancel',
                        reverseButtons: true,
                    })).isConfirmed :
                    confirm(
                        'Reset local data? This removes local roster/logs/password/threshold on this browser.'
                        );

                if (!doIt) return;

                // Remove only known keys (safer than localStorage.clear())
                [
                    LS_ADMIN_UNLOCK,
                    LS_ADMIN_PW,
                    LS_THRESHOLD,
                    'fa_roster',
                    'fa_logs',
                    'fa_photos'
                ].forEach(k => localStorage.removeItem(k));

                setAdminUnlocked(false);

                if (threshold && thresholdVal) {
                    threshold.value = '0.55';
                    thresholdVal.textContent = '0.55';
                    threshold.disabled = true;
                }

                logStatus('Local data reset done.');
            });

            // Proxy admin export/clear to existing buttons
            btnXlsxAdmin?.addEventListener('click', () => btnXlsx?.click());
            btnJsonAdmin?.addEventListener('click', () => btnJson?.click());
            btnClearDayAdmin?.addEventListener('click', () => btnClearDay?.click());

            // Initial state
            setAdminUnlocked(isAdminUnlocked());
            logStatus('System ready.');
        })();
    </script>

</body>

</html>
