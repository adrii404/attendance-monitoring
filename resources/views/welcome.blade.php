<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">

    <title>{{ config('app.name', 'Laravel') }}</title>

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.bunny.net">
    <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600" rel="stylesheet" />
    <script defer src="https://unpkg.com/face-api.js@0.22.2/dist/face-api.min.js"></script>

    @vite(['resources/css/app.css', 'resources/js/app.js'])

    <style>
      #videoWrap { position: relative; }
      #video { display: block; width: 100%; height: auto; }
      #overlay { position: absolute; inset: 0; width: 100%; height: 100%; }

      .scrollbar-att {
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.20) transparent;
      }

      /* Chrome/Edge/Safari */
      .scrollbar-att::-webkit-scrollbar { width: 10px; }
      .scrollbar-att::-webkit-scrollbar-track { background: transparent; }
      .scrollbar-att::-webkit-scrollbar-thumb {
        background: rgba(255, 255, 255, 0.16);
        border-radius: 9999px;
        border: 2px solid rgba(0, 0, 0, 0.15);
      }
      .scrollbar-att::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.26); }
      .scrollbar-att::-webkit-scrollbar-thumb:active { background: rgba(255, 255, 255, 0.34); }
    </style>
  </head>

  <body class="min-h-screen bg-slate-950 text-slate-100">
    <header class="border-b border-white/10 bg-slate-950/70 backdrop-blur">
      <div class="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between gap-3">
        <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-2xl bg-white/10 grid place-items-center shadow">
            <span class="text-lg">🕒</span>
          </div>

          <div>
            <div class="text-lg font-semibold leading-tight">Face Attendance</div>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <span class="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs">
            <span class="h-2 w-2 rounded-full bg-amber-400" id="statusDot"></span>
            <span id="modelStatusText">Loading models…</span>
          </span>
        </div>
      </div>
    </header>

    <main class="px-4 py-6">
      <div class="grid gap-6 lg:grid-cols-[1fr_2fr_1fr]">
        <!-- Left -->
        <section>
          <div class="rounded-3xl border border-white/10 bg-white/5 p-4 shadow">
            <div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <div class="flex items-center justify-between">
                <div class="text-xs font-semibold text-slate-200">Logs (selected day)</div>
                <div class="text-[11px] text-slate-400"><span id="logsCount">0</span> people</div>
              </div>

              <div class="rounded-2xl border border-white/10 bg-slate-950/50 p-3">
                <div class="text-xs text-slate-300">Selected date</div>

                <div class="mt-2 flex items-center gap-2">
                  <input id="datePicker" type="date"
                    class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60">
                  <button id="btnToday" type="button"
                    class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">
                    Today
                  </button>
                </div>

                <div class="mt-2 flex items-center justify-between text-[11px] text-slate-400">
                  <span id="tzLabel">Timezone: local</span>
                  <span id="nowLabel">—</span>
                </div>
              </div>
              <div class="mt-2 space-y-3" id="scheduleTables">
                <!-- JS will render one table per schedule here -->
              </div>
              <div id="pendingObWrap" class="overflow-hidden rounded-2xl border border-white/10 bg-slate-950/30">
                <div class="flex items-center justify-between bg-white/10 px-3 py-2">
                    <div class="text-xs font-semibold text-slate-200">Pending Official Business</div>
                    <div class="text-[11px] text-slate-400"><span id="pendingObCount">0</span> pending</div>
                </div>

                <div class="scrollbar-att max-h-[14em] overflow-y-auto rounded-b-2xl bg-slate-950/20">
                  <table class="w-full text-left text-xs">
                    <thead class="sticky top-0 bg-slate-950/60 text-slate-200 backdrop-blur">
                      <tr>
                        <th class="px-3 py-2 hidden" data-admin-only>Action</th>
                        <th class="px-3 py-2">Requested At</th>
                        <th class="px-3 py-2">Name</th>
                        <th class="px-3 py-2">Schedule</th>
                        <th class="px-3 py-2">Type</th>

                        <!-- ✅ Admin-only -->
                        <th class="px-3 py-2 hidden" data-admin-only>Notes</th>

                        <th class="px-3 py-2">Status</th>
                      </tr>
                    </thead>

                    <tbody id="pendingObBody" class="divide-y divide-white/10">
                      <tr>
                        <!-- default assumes admin-only hidden (5 cols visible) -->
                        <td class="px-3 py-3 text-slate-400" colspan="5">Loading…</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                </div>
              </div>
              
            <div class="mt-4 flex justify-end gap-2">
              <button id="btnRequestOb" type="button"
                class="rounded-xl bg-green-700 px-3 py-2 text-xs font-semibold hover:bg-green-600 cursor-pointer">
                Request OB
              </button>
              <button id="btnAdminToggle" type="button"
                class="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15 cursor-pointer">
                Admin Access
              </button>
            </div>
          </div>
        </section>

        <!-- Center -->
        <section>
          <div class="rounded-3xl border border-white/10 bg-white/5 p-4 shadow">
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div class="text-sm font-semibold">Camera</div>
                <div class="text-xs text-slate-300">Allow camera access. Keep face centered and well-lit.</div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
                <button id="btnStart" type="button"
                  class="rounded-xl bg-emerald-500/90 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
                  Start
                </button>
                <button id="btnStop" type="button"
                  class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">
                  Stop
                </button>
                <button id="btnFlip" type="button"
                  class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">
                  Flip
                </button>
              </div>
            </div>

            <div class="mt-4">
              <div id="videoWrap" class="relative">
                <video id="video" class="w-full rounded-2xl border border-white/10 bg-black" autoplay muted playsinline></video>
                <canvas id="overlay" class="pointer-events-none absolute inset-0"></canvas>
              </div>

              <div class="mt-2 rounded-xl border border-white/10 bg-slate-950/50 px-3 py-2 text-sm">
                <span class="text-slate-400">Detected:</span>
                <span id="liveDetectedName" class="font-semibold text-emerald-300">—</span>
              </div>

              <div class="mt-4">
                <div>
                  <div class="text-sm font-semibold">Attendance actions</div>
                  <div class="text-xs text-slate-300">Face-match an enrolled person, then log check-in/out.</div>
                </div>

                <div class="mt-3 grid gap-2 lg:grid-cols-2">
                  <button id="btnCheckIn" type="button"
                    class="rounded-2xl bg-sky-400/90 px-3 py-3 text-sm font-semibold text-slate-950 hover:bg-sky-300">
                    Check In
                  </button>
                  <button id="btnCheckOut" type="button"
                    class="rounded-2xl bg-amber-400/90 px-3 py-3 text-sm font-semibold text-slate-950 hover:bg-amber-300">
                    Check Out
                  </button>
                </div>
              </div>
            </div>

          </div>
        </section>

        <!-- Right -->
        <section>
          <div id="toastList" class="space-y-3"></div>

          <div id="adminPanel" class="rounded-3xl border border-white/10 bg-white/5 p-4 shadow">

            <!-- Active Users -->
            <div class="mb-4 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/30">
              <div class="flex items-center justify-between bg-white/10 px-3 py-2">
                <div class="text-xs font-semibold text-slate-200">Active Users</div>
                <div class="text-[11px] text-slate-400">
                  <span id="activeUsersCount">0</span> active
                </div>
              </div>

              <div class="scrollbar-att max-h-[16em] overflow-y-auto rounded-b-2xl bg-slate-950/20">
                <table class="w-full text-left text-xs">
                  <thead class="sticky top-0 bg-slate-950/60 text-slate-200 backdrop-blur">
                    <tr>
                      <th class="px-3 py-2">Name</th>
                      <th class="px-3 py-2">Role</th>
                      <th class="px-3 py-2">Schedule</th>
                      <th class="px-3 py-2">Action</th>
                    </tr>
                  </thead>

                  <tbody id="activeUsersBody" class="divide-y divide-white/10">
                    <tr>
                      <td class="px-3 py-3 text-slate-400" colspan="4">Loading…</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <div class="rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              <div>
                <div class="text-sm font-semibold">Enroll person</div>
                <div class="text-xs text-slate-300">Add a face profile locally (name + face descriptor).</div>
              </div>

              <div class="mt-3 grid gap-2">
                <label class="text-xs text-slate-300">Full name</label>
                <input id="enrollName" type="text" placeholder="e.g., Juan Dela Cruz"
                  class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60" />

                <input id="enrollContact" type="tel" placeholder="Contact Number"
                  class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60" />

                <input id="enrollPassword" type="password" placeholder="Password"
                  class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60" />

                <label class="text-xs text-slate-300">Role</label>
                <select
                  id="enrollRole"
                  class="w-full rounded-xl bg-slate-900 text-slate-100 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60 border border-white/10">
                  <option value="" selected disabled class="bg-slate-900 text-slate-400">Select Role</option>
                  @foreach ($roles as $role)
                    <option value="{{ $role->id }}" class="bg-slate-900 text-slate-100">{{ $role->title }}</option>
                  @endforeach
                </select>

                <label class="text-xs text-slate-300">Schedule</label>
                <select
                  id="enrollSchedule"
                  class="w-full rounded-xl bg-slate-900 text-slate-100 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60 border border-white/10">
                  <option value="" selected disabled class="bg-slate-900 text-slate-400">Select Schedule</option>
                  @foreach ($schedules as $s)
                    <option value="{{ $s->id }}" class="bg-slate-900 text-slate-100">{{ $s->description }}</option>
                  @endforeach
                </select>

                <div class="flex flex-wrap items-center gap-2 pt-1">
                  <button id="btnEnroll" type="button"
                    class="rounded-xl bg-emerald-500/90 px-3 py-2 text-sm font-semibold text-slate-950 hover:bg-emerald-400">
                    Capture & Save
                  </button>

                  <button id="btnExportProfiles" type="button"
                    class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">
                    E
                  </button>

                  <label class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15 cursor-pointer">
                    Import
                    <input id="importProfiles" type="file" accept="application/json" class="hidden" />
                  </label>
                </div>
              </div>
            </div>

            <div class="mt-4 rounded-2xl border border-white/10 bg-slate-950/50 p-3">
              <div class="text-xs text-slate-300">Threshold (lower = stricter) — Admin only</div>

              <div class="mt-2 flex items-center gap-3">
                <input id="threshold" type="range" min="0.35" max="0.75" step="0.01" value="0.35" class="w-full">
                <div class="w-14 text-right text-sm font-mono" id="thresholdVal">0.35</div>
              </div>

              <div class="mt-1 text-[11px] text-slate-400">Tip: 0.50–0.60 is a common starting range.</div>
            </div>

            <div class="mt-4 rounded-2xl border border-white/10 bg-slate-950/60 p-3">
              <div class="flex items-start justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold">System message</div>
                  <div class="text-xs text-slate-300">Local demo only. Photos are saved per log (can hit browser storage limits).</div>
                </div>

                <div class="flex items-center gap-2">
                  <button id="btnChangePw" type="button"
                    class="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">
                    Set/Change password
                  </button>
                  <button id="btnClearAll" type="button"
                    class="rounded-xl bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/30">
                    Reset local data
                  </button>
                </div>
              </div>

              <pre
                id="status"
                class="scrollbar-att mt-3 whitespace-pre-wrap break-words text-xs text-slate-200/90
                  max-h-[18.5em] overflow-y-auto pr-2 rounded-xl bg-black/10 ring-1 ring-white/10"
              ></pre>
            </div>

            <div class="mt-3 flex flex-wrap items-center gap-2">
              <button id="btnDownloadDay" type="button" class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">
                Download CSV (selected day)
              </button>
              <button id="btnDownloadDayJson" type="button" class="rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/15">
                Download JSON + Photos
              </button>
              <button id="btnClearDay" type="button" class="rounded-xl bg-rose-500/20 px-3 py-2 text-sm font-semibold text-rose-200 hover:bg-rose-500/30">
                Clear selected day
              </button>
            </div>
          </div>
        </section>
      </div>

      <!-- Admin Password Modal -->
      <div id="pwModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-4">
        <div class="w-full max-w-sm rounded-2xl border border-white/10 bg-slate-950 p-4 shadow-xl">
          <div class="text-sm font-semibold text-slate-100" id="pwModalTitle">Admin password</div>
          <div class="mt-1 text-xs text-slate-300" id="pwModalDesc">Enter password</div>

          <input
            id="pwModalInput"
            type="password"
            autocomplete="current-password"
            class="mt-3 w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60"
            placeholder="Password"
          />

          <div class="mt-3 flex justify-end gap-2">
            <button id="pwModalCancel" class="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">
              Cancel
            </button>
            <button id="pwModalOk" class="rounded-xl bg-emerald-500/90 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400">
              OK
            </button>
          </div>
        </div>
      </div>

      <!-- Official Business Modal (IDs match app.js from earlier) -->
      <div id="obModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-4">
        <div class="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-xl">
          <div class="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3">
            <div>
              <div class="text-sm font-semibold text-slate-100">Request Official Business (OB)</div>
              <div class="text-xs text-slate-300">Request a manual check-in/out with admin approval.</div>
            </div>
          </div>

          <div class="scrollbar-att max-h-[70vh] overflow-y-auto p-4 space-y-3">
            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-1">
                <label class="text-xs text-slate-300">User</label>
                <select id="obUser"
                  class="w-full rounded-xl bg-slate-900 text-slate-100 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60 border border-white/10">
                  <option value="" selected disabled class="bg-slate-900 text-slate-400">Select User</option>
                  @foreach($users as $u)
                    <option value="{{ $u->id }}" class="bg-slate-900 text-slate-100">{{ $u->name }}</option>
                  @endforeach
                </select>
                <div class="text-[11px] text-slate-500">Tip: user list is server-rendered; app.js may also refresh it.</div>
              </div>

              <div class="space-y-1">
                <label class="text-xs text-slate-300">Schedule</label>
                <select id="obSchedule"
                  class="w-full rounded-xl bg-slate-900 text-slate-100 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60 border border-white/10">
                  <option value="" selected disabled class="bg-slate-900 text-slate-400">Select Schedule</option>
                  @foreach($schedules as $s)
                    <option value="{{ $s->id }}" class="bg-slate-900 text-slate-100">{{ $s->description }}</option>
                  @endforeach
                </select>
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-3">
              <div class="space-y-1">
                <label class="text-xs text-slate-300">Request type</label>
                <select id="obType"
                  class="w-full rounded-xl bg-slate-900 text-slate-100 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60 border border-white/10">
                  <option value="in">Check-in</option>
                  <option value="out">Check-out</option>
                </select>
              </div>

              <div class="space-y-1">
                <label class="text-xs text-slate-300">Date</label>
                <input id="obDate" type="date"
                  class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60" />
              </div>

              <div class="space-y-1">
                <label class="text-xs text-slate-300">Time</label>
                <input id="obTime" type="time"
                  class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60" />
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-xs text-slate-300">Notes (optional)</label>
              <textarea id="obNotes" rows="3"
                class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60"
                placeholder="Reason / justification..."></textarea>
            </div>

            <div id="obStatus" class="hidden rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300"></div>
          </div>

          <div class="flex justify-end gap-2 border-t border-white/10 bg-white/5 px-4 py-3">
            <button id="obCancel" class="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">Cancel</button>
            <button id="obSubmit" class="rounded-xl bg-green-700 px-3 py-2 text-xs font-semibold text-white hover:bg-green-600">Submit Request</button>
          </div>
        </div>
      </div>

      <!-- Edit User Modal -->
      <div id="userModal" class="fixed inset-0 z-50 hidden items-center justify-center bg-black/60 p-4">
        <div class="w-full max-w-lg overflow-hidden rounded-3xl border border-white/10 bg-slate-950 shadow-xl">
          <div class="flex items-center justify-between border-b border-white/10 bg-white/5 px-4 py-3">
            <div>
              <div class="text-sm font-semibold text-slate-100">Edit User</div>
              <div class="text-xs text-slate-300" id="userModalSub">—</div>
            </div>
            <button id="userModalX" class="rounded-lg bg-white/10 px-3 py-1 text-xs font-semibold hover:bg-white/15">X</button>
          </div>

          <div class="scrollbar-att max-h-[70vh] overflow-y-auto p-4 space-y-3">
            <input type="hidden" id="userEditId" />

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-1">
                <label class="text-xs text-slate-300">Full name</label>
                <input id="userEditName" type="text"
                  class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60" />
              </div>

              <div class="space-y-1">
                <label class="text-xs text-slate-300">Contact number</label>
                <input id="userEditContact" type="text"
                  class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60" />
              </div>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <div class="space-y-1">
                <label class="text-xs text-slate-300">Role</label>
                <select id="userEditRole"
                  class="w-full rounded-xl bg-slate-900 text-slate-100 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60 border border-white/10">
                  <option value="" disabled selected>Select Role</option>
                </select>
              </div>

              <div class="space-y-1">
                <label class="text-xs text-slate-300">Schedule</label>
                <select id="userEditSchedule"
                  class="w-full rounded-xl bg-slate-900 text-slate-100 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60 border border-white/10">
                  <option value="" disabled selected>Select Schedule</option>
                </select>
              </div>
            </div>

            <div class="space-y-1">
              <label class="text-xs text-slate-300">New password (optional)</label>
              <input id="userEditPassword" type="password" placeholder="Leave blank to keep current password"
                class="w-full rounded-xl bg-white/10 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-emerald-400/60" />
            </div>

            <div id="userModalStatus" class="hidden rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-xs text-slate-300"></div>
          </div>

          <div class="flex flex-wrap justify-between gap-2 border-t border-white/10 bg-white/5 px-4 py-3">
            <button id="userRemoveBtn"
              class="rounded-xl bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/30">
              Remove (soft delete)
            </button>

            <div class="flex gap-2">
              <button id="userModalCancel"
                class="rounded-xl bg-white/10 px-3 py-2 text-xs font-semibold hover:bg-white/15">
                Cancel
              </button>
              <button id="userSaveBtn"
                class="rounded-xl bg-emerald-500/90 px-3 py-2 text-xs font-semibold text-slate-950 hover:bg-emerald-400">
                Save Changes
              </button>
            </div>
          </div>
        </div>
      </div>


      <footer class="mt-8 text-center text-[11px] text-slate-500"></footer>
    </main>

    <script>
      window.__SCHEDULES__ = @json($schedules);
      window.__USERS__ = @json($users);
      window.__ROLES__ = @json($roles);
    </script>
  </body>
</html>
