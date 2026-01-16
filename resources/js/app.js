import "./bootstrap";

// ✅ Try local first (best), then CDN fallbacks
const MODEL_BASES = [
    "/faceapi/weights", // ✅ put weights here: public/faceapi/weights/*
    "https://unpkg.com/face-api.js@0.22.2/weights",
    "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights",
];

// ✅ IMPORTANT: app.js is a Vite module, so global window.faceapi is NOT in scope.
let faceapi = null;

const STORAGE_PROFILES = "fb_attendance_profiles_v1"; // legacy fallback
const STORAGE_LOGS = "fb_attendance_logs_v1"; // UI-only quick view (DB is the truth)
const STORAGE_ADMIN_HASH = "fb_attendance_admin_pw_hash_v1";
const STORAGE_ADMIN_SESSION = "fb_attendance_admin_session_v1";

// ✅ Admin roster statuses (per date)
const STORAGE_ADMIN_ROSTER_STATUS = "fb_attendance_roster_status_v1";

const el = (id) => document.getElementById(id);

// ✅ FIXED MATCH THRESHOLD (no slider)
const FIXED_MATCH_THRESHOLD = 0.35;

// ✅ Overnight cutoff hour (USED ONLY AS A FALLBACK now)
// If you still want a fallback window: 7 means 00:00 up to 07:59 can be treated as "previous date".
const OVERNIGHT_CUTOFF_HOUR = 7;

// ✅ How far back we allow selecting a date for Time-Out (to cover night shifts)
const CHECKOUT_MAX_PAST_DAYS = 2;

function escapeHtml(str) {
    return String(str ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function pickRoleName(p) {
    return (
        p?.role_name ||
        p?.role?.name ||
        p?.user?.role_name ||
        p?.user?.role?.name ||
        p?.user_role ||
        p?.role_text ||
        ""
    );
}

const ui = {
    video: el("video"),
    overlay: el("overlay"),
    status: el("status"),

    btnStart: el("btnStart"),
    btnStop: el("btnStop"),
    btnFlip: el("btnFlip"),

    threshold: el("threshold"),
    thresholdVal: el("thresholdVal"),

    datePicker: el("datePicker"),
    btnToday: el("btnToday"),
    tzLabel: el("tzLabel"),
    nowLabel: el("nowLabel"),

    enrollName: el("enrollName"),
    enrollContact: el("enrollContact"),
    enrollPassword: el("enrollPassword"),
    enrollRole: el("enrollRole"),
    btnEnroll: el("btnEnroll"),
    profilesList: el("profilesList"),
    enrolledCount: el("enrolledCount"),

    btnCheckIn: el("btnCheckIn"),
    btnCheckOut: el("btnCheckOut"),

    btnDownloadDay: el("btnDownloadDay"),
    btnDownloadDayXlsx: el("btnDownloadDayXlsx"),
    btnDownloadDayJson: el("btnDownloadDayJson"),
    btnClearDay: el("btnClearDay"),

    logsTbody: el("logsTbody"),
    logsCount: el("logsCount"),

    btnClearAll: el("btnClearAll"),
    btnChangePw: el("btnChangePw"),

    modelStatusText: el("modelStatusText"),
    statusDot: el("statusDot"),

    btnExportProfiles: el("btnExportProfiles"),
    importProfiles: el("importProfiles"),

    // ✅ Live detected name label
    liveDetectedName: el("liveDetectedName"),

    // ✅ Admin toggle + admin panel wrapper
    btnAdminToggle: el("btnAdminToggle"),
    adminPanel: el("adminPanel"),

    // ✅ Password modal (masked input)
    pwModal: el("pwModal"),
    pwModalTitle: el("pwModalTitle"),
    pwModalDesc: el("pwModalDesc"),
    pwModalInput: el("pwModalInput"),
    pwModalCancel: el("pwModalCancel"),
    pwModalOk: el("pwModalOk"),

    toastList: el("toastList"),

    // ✅ Admin roster UI (must exist in HTML)
    adminRosterList: el("adminRosterList"),
    rosterCount: el("rosterCount"),
    rosterDateLabel: el("rosterDateLabel"),
};

// ---------------- Lite/Performance knobs ----------------
const PERF = {
    LIVE_INPUT_SIZE: 160,
    LIVE_SCORE_THRESHOLD: 0.5,
    LIVE_SCAN_INTERVAL_MS: 650,

    ACTION_INPUT_SIZE: 224,
    ACTION_SCORE_THRESHOLD: 0.5,

    AUTO_CHECKIN_INTERVAL_MS: 2000,
    AUTO_CHECKIN_SAME_USER_COOLDOWN_MS: 80000,

    DRAW_LANDMARKS: false,

    CAMERA_IDEAL_WIDTH: 640,
    CAMERA_IDEAL_HEIGHT: 480,

    PHOTO_LOG_MAX_WIDTH: 420,
    PHOTO_LOG_QUALITY: 0.65,

    PAUSE_WHEN_HIDDEN: true,
};

// ---------------- Voice (Text-to-Speech) ----------------
let voiceEnabled = true;
let speechUnlocked = false;

function unlockSpeech() {
    if (speechUnlocked) return;
    if (!("speechSynthesis" in window)) return;

    const u = new SpeechSynthesisUtterance(" ");
    u.volume = 0;
    window.speechSynthesis.speak(u);
    window.speechSynthesis.cancel();

    speechUnlocked = true;
}

function speak(text) {
    if (!voiceEnabled) return;
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    u.volume = 1;

    const voices = window.speechSynthesis.getVoices?.() || [];
    const en = voices.find((v) => /en/i.test(v.lang)) || voices[0];
    if (en) u.voice = en;

    window.speechSynthesis.speak(u);
}

window.speechSynthesis?.addEventListener?.("voiceschanged", () => {
    window.speechSynthesis.getVoices();
});

// ---------------- Server matching (DB-driven) ----------------
let serverMatchInFlight = false;
let lastServerMatchAt = 0;
let lastServerMatchResult = { matched: false, user: null, distance: null };

// ✅ Live single-face matched user (used by AUTO CHECK-IN)
let liveSingle = { matched: false, userId: null, name: null, updatedAt: 0 };

// ✅ Auto check-in control
let autoCheckInTimer = null;
let autoCheckInInFlight = false;
let lastAutoCheckInUserId = null;
let lastAutoCheckInAt = 0;

let scanProgressUserId = null;
let scanProgressStartAt = 0;
let scanProgressPct = 0;
let scanSuccessFlashUntil = 0;

function resetScanProgress() {
    scanProgressUserId = null;
    scanProgressStartAt = 0;
    scanProgressPct = 0;
}

function showRightToast({ name, date, time, action, photoDataUrl }) {
    if (!ui.toastList) return;

    const actionClass =
        action === "Time-In"
            ? "text-emerald-300"
            : action === "Time-Out"
            ? "text-amber-300"
            : "text-slate-200";

    const wrap = document.createElement("div");
    wrap.className =
        "w-full rounded-3xl border border-white/10 bg-white/5 p-4 shadow " +
        "flex flex-row gap-4 opacity-0 transition-opacity duration-500";

    wrap.innerHTML = `
    <img
      src="${photoDataUrl || ""}"
      alt="Captured"
      class="w-[9rem] h-[6rem] rounded-md shadow object-cover bg-black/20"
      onerror="this.src='';"
    />
    <div class="flex flex-col justify-center gap-0.5">
      <p><span class="font-bold">Name: </span>${escapeHtml(name || "—")}</p>
      <p><span class="font-bold">Date: </span>${escapeHtml(date || "—")}</p>
      <p><span class="font-bold">Time: </span>${escapeHtml(time || "—")}</p>
      <p>
        <span class="font-bold">Action:</span>
        <span class="${actionClass} font-semibold">${escapeHtml(
        action || "—"
    )}</span>
      </p>
    </div>
  `;

    ui.toastList.prepend(wrap);

    requestAnimationFrame(() => {
        wrap.classList.remove("opacity-0");
        wrap.classList.add("opacity-100");
    });

    setTimeout(() => {
        wrap.classList.remove("opacity-100");
        wrap.classList.add("opacity-0");

        setTimeout(() => wrap.remove(), 520);
    }, 3000);
}

// Throttle server matching so live scanning doesn't spam your API
const SERVER_MATCH_MIN_INTERVAL_MS = 800;

async function safeFetchJson(url, options = {}) {
    try {
        const res = await fetch(url, {
            headers: {
                Accept: "application/json",
                ...(options.headers || {}),
            },
            ...options,
        });

        let data = null;
        try {
            data = await res.json();
        } catch (_) {}

        return { ok: res.ok, status: res.status, data };
    } catch (e) {
        return { ok: false, status: 0, data: null, error: e };
    }
}

async function serverMatchDescriptor(descriptor, threshold) {
    const nowMs = Date.now();

    if (serverMatchInFlight) return lastServerMatchResult;
    if (nowMs - lastServerMatchAt < SERVER_MATCH_MIN_INTERVAL_MS)
        return lastServerMatchResult;

    serverMatchInFlight = true;
    lastServerMatchAt = nowMs;

    try {
        const r = await safeFetchJson("/api/face/match", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                descriptor: Array.from(descriptor),
                threshold: Number(threshold),
            }),
        });

        if (!r.ok || !r.data) {
            lastServerMatchResult = {
                matched: false,
                user: null,
                distance: null,
            };
            return lastServerMatchResult;
        }

        lastServerMatchResult = {
            matched: !!r.data.matched,
            user: r.data.user || null,
            distance: r.data.distance ?? null,
        };
        return lastServerMatchResult;
    } finally {
        serverMatchInFlight = false;
    }
}

let stream = null;
let facingMode = "user";
let modelsReady = false;

let scanInProgress = false;
let liveTimer = null;

// ✅ threshold UI no longer admin-gated (fixed)
let lastThresholdValue = FIXED_MATCH_THRESHOLD;

// ✅ prevent overlapping attendance calls
let attendanceInProgress = false;

// ---------------- Time-In confirmation ----------------
// ✅ Confirm popup for TIME-IN only (registered users)
let timeInConfirmOpen = false;

// avoid spamming confirmation (especially for AUTO)
let lastTimeInPromptUserId = null;
let lastTimeInPromptAt = 0;

// if user CANCELS time-in, don't ask again for a while
const TIMEIN_PROMPT_COOLDOWN_MS = 12000;

function canPromptTimeIn(userId) {
    const uid = userId != null ? String(userId) : "";
    const nowMs = Date.now();
    if (!uid) return true;

    if (
        lastTimeInPromptUserId === uid &&
        nowMs - lastTimeInPromptAt < TIMEIN_PROMPT_COOLDOWN_MS
    ) {
        return false;
    }
    return true;
}

function markTimeInPrompted(userId) {
    const uid = userId != null ? String(userId) : "";
    lastTimeInPromptUserId = uid || null;
    lastTimeInPromptAt = Date.now();
}

async function confirmTimeInPopup(name) {
    if (timeInConfirmOpen) return false;
    timeInConfirmOpen = true;

    try {
        // ✅ Use SweetAlert if available (from your Blade <head>)
        if (typeof window.confirmTimeInSwal === "function") {
            return await window.confirmTimeInSwal(name);
        }

        // fallback
        const msg = `Confirm TIME-IN?\n\nName: ${name}\n\nPress OK to Time-In.\nPress Cancel to skip.`;
        return window.confirm(msg);
    } finally {
        timeInConfirmOpen = false;
    }
}

// ---------------- Utilities ----------------
function now() {
    return new Date();
}

function isoDateLocal(d = now()) {
    const yy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}-${mm}-${dd}`;
}

function timeLocal(d = now()) {
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
}

function dateStrToLocalDate(dateStr) {
    // safe local date at noon to avoid DST edge cases
    const [y, m, d] = String(dateStr || "").split("-").map((x) => Number(x));
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function addDaysToDateStr(dateStr, deltaDays) {
    const base = dateStrToLocalDate(dateStr);
    if (!base) return isoDateLocal();
    base.setDate(base.getDate() + Number(deltaDays || 0));
    return isoDateLocal(base);
}

function daysDiffFromToday(dateStr) {
    const d = dateStrToLocalDate(dateStr);
    const t = dateStrToLocalDate(isoDateLocal(now()));
    if (!d || !t) return 9999;
    const ms = d.getTime() - t.getTime();
    return Math.round(ms / (1000 * 60 * 60 * 24));
}

function getTodayStr() {
    return isoDateLocal(now());
}
function getYesterdayStr() {
    const d = now();
    d.setDate(d.getDate() - 1);
    return isoDateLocal(d);
}

// ✅ inclusive fallback window: cutoff=7 means 00:00–07:59
function isOvernightWindow(d = now()) {
    return d.getHours() < OVERNIGHT_CUTOFF_HOUR + 1;
}

/**
 * Fallback effective date rule (ONLY used if we can't resolve last Time-In date):
 * - check-in -> always "today"
 * - check-out -> if after midnight and within overnight window, assign to yesterday
 */
function getEffectiveDateFallback(actionType, d = now()) {
    const t = String(actionType || "").toLowerCase();
    const isOut =
        t === "check-out" || t === "checkout" || t === "out" || t === "time-out";
    if (!isOut) return isoDateLocal(d);

    if (isOvernightWindow(d)) {
        const yd = new Date(d);
        yd.setDate(yd.getDate() - 1);
        return isoDateLocal(yd);
    }
    return isoDateLocal(d);
}

function setStatus(msg) {
    if (ui.status) ui.status.textContent = msg || "";
}

function appendStatus(msg) {
    if (!ui.status) return;
    const line = document.createElement("div");
    line.className = "text-[11px] text-slate-300";
    line.textContent = `[${timeLocal()}] ${msg}`;
    ui.status.appendChild(line);
    ui.status.scrollTop = ui.status.scrollHeight;
}

function setModelPill(state, label) {
    if (!ui.modelStatusText || !ui.statusDot) return;

    ui.modelStatusText.textContent = label || "";

    ui.statusDot.className =
        "inline-block h-2 w-2 rounded-full " +
        (state === "ready"
            ? "bg-emerald-400"
            : state === "error"
            ? "bg-rose-400"
            : "bg-amber-300");
}

// ✅ always fixed at 0.35 + disable slider
function updateThresholdUI() {
    if (ui.threshold) {
        ui.threshold.value = String(FIXED_MATCH_THRESHOLD);
    }
    if (ui.thresholdVal) {
        ui.thresholdVal.textContent = Number(FIXED_MATCH_THRESHOLD).toFixed(2);
    }
}

function safeJsonParse(text, fallback) {
    try {
        return JSON.parse(text);
    } catch {
        return fallback;
    }
}

function safeSetLocalStorage(key, value) {
    try {
        localStorage.setItem(key, value);
        return { ok: true };
    } catch (e) {
        return { ok: false, error: e };
    }
}

// ✅ Overnight-aware enablement:
// - Check-in allowed ONLY if selected date == today
// - Check-out allowed if selected date is within last CHECKOUT_MAX_PAST_DAYS (today/yesterday by default)
function isCheckInAllowedNow() {
    const selected = ui.datePicker?.value || getTodayStr();
    return selected === getTodayStr();
}

function isCheckOutAllowedNow() {
    const selected = ui.datePicker?.value || getTodayStr();
    const diff = daysDiffFromToday(selected); // 0=today, -1=yesterday, -2=2 days ago
    return diff <= 0 && diff >= -CHECKOUT_MAX_PAST_DAYS;
}

function updateCheckButtonsState() {
    if (!ui.btnCheckIn || !ui.btnCheckOut) return;

    const okIn = isCheckInAllowedNow();
    const okOut = isCheckOutAllowedNow();

    ui.btnCheckIn.disabled = !okIn;
    ui.btnCheckOut.disabled = !okOut;

    const baseOn = "rounded-2xl px-3 py-3 text-sm font-semibold text-slate-950";
    const baseOff =
        "rounded-2xl px-3 py-3 text-sm font-semibold text-slate-400 cursor-not-allowed opacity-60";

    ui.btnCheckIn.className = okIn
        ? `${baseOn} bg-sky-400/90 hover:bg-sky-300`
        : `${baseOff} bg-white/10`;

    ui.btnCheckOut.className = okOut
        ? `${baseOn} bg-amber-400/90 hover:bg-amber-300`
        : `${baseOff} bg-white/10`;
}

// ---------------- Masked password modal ----------------
function promptPasswordModal({
    title = "Admin password",
    desc = "Enter password",
    placeholder = "Password",
} = {}) {
    return new Promise((resolve) => {
        if (
            !ui.pwModal ||
            !ui.pwModalInput ||
            !ui.pwModalOk ||
            !ui.pwModalCancel
        ) {
            const pw = prompt(desc);
            resolve(pw === null ? null : String(pw));
            return;
        }

        if (ui.pwModalTitle) ui.pwModalTitle.textContent = title;
        if (ui.pwModalDesc) ui.pwModalDesc.textContent = desc;

        ui.pwModalInput.type = "password";
        ui.pwModalInput.placeholder = placeholder;
        ui.pwModalInput.value = "";

        ui.pwModal.classList.remove("hidden");
        ui.pwModal.classList.add("flex");

        setTimeout(() => ui.pwModalInput.focus(), 0);

        const cleanup = () => {
            ui.pwModal.classList.add("hidden");
            ui.pwModal.classList.remove("flex");
            ui.pwModalOk.removeEventListener("click", onOk);
            ui.pwModalCancel.removeEventListener("click", onCancel);
            ui.pwModalInput.removeEventListener("keydown", onKey);
        };

        const onOk = () => {
            const val = String(ui.pwModalInput.value || "");
            cleanup();
            resolve(val);
        };

        const onCancel = () => {
            cleanup();
            resolve(null);
        };

        const onKey = (e) => {
            if (e.key === "Enter") onOk();
            if (e.key === "Escape") onCancel();
        };

        ui.pwModalOk.addEventListener("click", onOk);
        ui.pwModalCancel.addEventListener("click", onCancel);
        ui.pwModalInput.addEventListener("keydown", onKey);
    });
}

// ---------------- Password / Admin gate ----------------
function getAdminHash() {
    return localStorage.getItem(STORAGE_ADMIN_HASH) || "";
}

function bufToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    let out = "";
    for (const b of bytes) out += b.toString(16).padStart(2, "0");
    return out;
}

async function sha256Hex(text) {
    const enc = new TextEncoder().encode(text);
    const digest = await crypto.subtle.digest("SHA-256", enc);
    return bufToHex(digest);
}

async function setOrChangePasswordFlow() {
    const p1 = await promptPasswordModal({
        title: "Set/Change admin password",
        desc: "Enter new password (min 4 chars):",
        placeholder: "New password",
    });
    if (p1 === null) return false;

    if (String(p1).length < 4) {
        alert("Password too short (min 4).");
        return false;
    }

    const p2 = await promptPasswordModal({
        title: "Confirm password",
        desc: "Re-enter the new password:",
        placeholder: "Confirm password",
    });
    if (p2 === null) return false;

    if (p1 !== p2) {
        alert("Passwords do not match.");
        return false;
    }

    const hash = await sha256Hex(String(p1));
    const r = safeSetLocalStorage(STORAGE_ADMIN_HASH, hash);
    if (!r.ok) {
        alert("Failed to save password (storage error).");
        return false;
    }

    appendStatus("Admin password set/updated ✅");
    return true;
}

async function requireAdmin(actionLabel = "this action") {
    let hash = getAdminHash();
    if (!hash) {
        const ok = await setOrChangePasswordFlow();
        if (!ok) return false;
        hash = getAdminHash();
        if (!hash) return false;
    }

    const pw = await promptPasswordModal({
        title: "Admin confirmation",
        desc: `Enter admin password to confirm:\nAction: ${actionLabel}`,
        placeholder: "Admin password",
    });

    if (pw === null) return false;

    const inputHash = await sha256Hex(String(pw));
    if (inputHash !== hash) {
        alert("Wrong password.");
        return false;
    }
    return true;
}

// ---------------- Admin session toggle ----------------
function isAdminLoggedIn() {
    return localStorage.getItem(STORAGE_ADMIN_SESSION) === "1";
}

function setAdminLoggedIn(v) {
    localStorage.setItem(STORAGE_ADMIN_SESSION, v ? "1" : "0");
}

function applyAdminUiState() {
    const on = isAdminLoggedIn();

    if (ui.adminPanel) ui.adminPanel.classList.toggle("hidden", !on);
    if (ui.btnAdminToggle)
        ui.btnAdminToggle.textContent = on ? "Logout" : "Admin Access";

    // ✅ slider remains fixed & disabled regardless of admin state
    updateThresholdUI();

    // ✅ refresh roster list whenever admin logs in/out
    if (on) renderAdminRoster().catch(() => {});
    else {
        if (ui.adminRosterList) ui.adminRosterList.innerHTML = "";
        if (ui.rosterCount) ui.rosterCount.textContent = "0";
        if (ui.rosterDateLabel) ui.rosterDateLabel.textContent = "—";
    }
}

// ---------------- Storage (legacy fallback for profiles) ----------------
function getProfiles() {
    const raw = localStorage.getItem(STORAGE_PROFILES);
    const profiles = safeJsonParse(raw, []);
    return Array.isArray(profiles)
        ? profiles.filter(
              (p) =>
                  p &&
                  p.name &&
                  Array.isArray(p.descriptor) &&
                  p.descriptor.length === 128
          )
        : [];
}

function saveProfiles(profiles) {
    const r = safeSetLocalStorage(STORAGE_PROFILES, JSON.stringify(profiles));
    if (!r.ok)
        appendStatus(
            "Storage warning: Failed to save profiles (quota/storage error)."
        );
}

// ---------------- Logs (UI-only quick view; DB is the truth) ----------------
function getLogs() {
    const raw = localStorage.getItem(STORAGE_LOGS);
    const logs = safeJsonParse(raw, {});
    return logs && typeof logs === "object" ? logs : {};
}

function saveLogs(logs) {
    const r = safeSetLocalStorage(STORAGE_LOGS, JSON.stringify(logs));
    if (!r.ok)
        appendStatus(
            "Storage warning: Failed to save logs (quota/storage error)."
        );
}

function getLogsForDate(dateStr) {
    const logs = getLogs();
    const arr = logs[dateStr];
    return Array.isArray(arr) ? arr : [];
}

// ✅ add one log row to UI cache
function addLog(dateStr, row) {
    const logs = getLogs();
    if (!Array.isArray(logs[dateStr])) logs[dateStr] = [];
    logs[dateStr].push({
        ...row,
        occurred_at: row?.occurred_at || `${dateStr} ${row?.time || ""}`,
    });
    saveLogs(logs);
}

// ✅ one row per person per day summary
function buildDaySummary(dateStr) {
    const logs = getLogsForDate(dateStr);
    const map = new Map();

    for (const r of logs) {
        if (!r || !r.name) continue;

        if (!map.has(r.name)) {
            map.set(r.name, {
                name: r.name,
                time_in: null,
                time_out: null,
                photo_in: null,
                photo_out: null,
            });
        }

        const item = map.get(r.name);

        if (r.type === "check-in") {
            if (!item.time_in || (r.time && r.time < item.time_in)) {
                item.time_in = r.time || item.time_in;
                item.photo_in = r.photo_data_url || item.photo_in;
            }
        } else if (r.type === "check-out") {
            if (!item.time_out || (r.time && r.time > item.time_out)) {
                item.time_out = r.time || item.time_out;
                item.photo_out = r.photo_data_url || item.photo_out;
            }
        }
    }

    const rows = Array.from(map.values());
    rows.sort((a, b) => {
        const ai = a.time_in || "";
        const bi = b.time_in || "";
        if (ai < bi) return -1;
        if (ai > bi) return 1;
        return a.name.localeCompare(b.name);
    });

    return rows;
}

// ✅ Wait for face-api.js to be available on window (because app.js is a Vite module)
async function waitForFaceApi(timeoutMs = 10000) {
    const start = Date.now();
    while (!window.faceapi) {
        if (Date.now() - start > timeoutMs) return false;
        await new Promise((r) => setTimeout(r, 50));
    }
    return true;
}

function joinBase(base, file) {
    const b = String(base || "").replace(/\/+$/, "");
    return `${b}/${file}`;
}

async function testModelBase(base) {
    const testFile = "tiny_face_detector_model-weights_manifest.json";
    const url = joinBase(base, testFile);

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok)
        throw new Error(
            `Model test failed: ${res.status} ${res.statusText} @ ${url}`
        );

    await res.json();
    return base;
}

async function pickWorkingModelBase() {
    let lastErr = null;

    for (const base of MODEL_BASES) {
        try {
            appendStatus(`Testing model base: ${base}`);
            const okBase = await testModelBase(base);
            appendStatus(`✅ Using model base: ${okBase}`);
            return okBase;
        } catch (e) {
            lastErr = e;
            appendStatus(`❌ Model base failed: ${base} — ${e?.message || e}`);
        }
    }

    throw lastErr || new Error("No working model base found.");
}

// ---------------- Face API setup ----------------
async function loadModels() {
    if (!faceapi)
        throw new Error("face-api.js not loaded (window.faceapi missing)");

    setModelPill("loading", "Loading models…");
    appendStatus("Loading face-api models…");

    const base = await pickWorkingModelBase();

    try {
        await faceapi.nets.tinyFaceDetector.loadFromUri(base);
        await faceapi.nets.faceLandmark68Net.loadFromUri(base);
        await faceapi.nets.faceRecognitionNet.loadFromUri(base);
    } catch (e) {
        throw new Error(
            `Model download/load failed from "${base}": ${e?.message || e}`
        );
    }

    modelsReady = true;
    setModelPill("ready", "Models ready ✅");
    appendStatus("Models loaded ✅");
}

function resizeOverlayToVideo() {
    if (!ui.overlay || !ui.video) return;

    const rect = ui.video.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));

    ui.overlay.width = w;
    ui.overlay.height = h;

    ui.overlay.style.width = w + "px";
    ui.overlay.style.height = h + "px";
}

function clearOverlay() {
    if (!ui.overlay) return;
    const ctx = ui.overlay.getContext("2d");
    ctx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);
}

function drawResultsWithLabels(results, labels, opts = {}) {
    const ctx = ui.overlay.getContext("2d");
    ctx.clearRect(0, 0, ui.overlay.width, ui.overlay.height);

    const rect = ui.video.getBoundingClientRect();
    const displaySize = { width: rect.width, height: rect.height };

    faceapi.matchDimensions(ui.overlay, displaySize);
    const resized = faceapi.resizeResults(results, displaySize);

    const stroke = opts.strokeStyle || "rgba(56, 189, 248, 0.95)";

    for (let i = 0; i < resized.length; i++) {
        const box = resized[i].detection.box;

        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        const label = labels?.[i] || "";
        if (label) {
            const pad = 6;
            ctx.font = "12px ui-sans-serif, system-ui, -apple-system, Segoe UI";
            const textW = ctx.measureText(label).width;
            const rectW = Math.max(60, textW + pad * 2);
            const rectH = 18;

            ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
            ctx.fillRect(box.x, Math.max(0, box.y - rectH), rectW, rectH);

            ctx.fillStyle = "rgba(226, 232, 240, 0.95)";
            ctx.fillText(label, box.x + pad, Math.max(12, box.y - 5));
        }
    }
}

async function getSingleDescriptorStrict() {
    if (!ui.video) return { descriptor: null, reason: "none", count: 0 };

    const options = new faceapi.TinyFaceDetectorOptions({
        inputSize: PERF.ACTION_INPUT_SIZE,
        scoreThreshold: PERF.ACTION_SCORE_THRESHOLD,
    });

    const results = await faceapi
        .detectAllFaces(ui.video, options)
        .withFaceLandmarks()
        .withFaceDescriptors();

    const count = Array.isArray(results) ? results.length : 0;

    if (count === 0) return { descriptor: null, reason: "none", count: 0 };
    if (count > 1) return { descriptor: null, reason: "multiple", count };

    const d = results[0]?.descriptor || null;
    if (!d) return { descriptor: null, reason: "none", count: 1 };
    return { descriptor: d, reason: "ok", count: 1 };
}

function capturePhotoDataUrlScaled(maxW = 420, quality = 0.65) {
    try {
        const v = ui.video;
        if (!v || !v.videoWidth || !v.videoHeight) return null;

        const w0 = v.videoWidth;
        const h0 = v.videoHeight;

        const scale = Math.min(1, maxW / w0);
        const w = Math.round(w0 * scale);
        const h = Math.round(h0 * scale);

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(v, 0, 0, w, h);

        return canvas.toDataURL("image/jpeg", quality);
    } catch {
        return null;
    }
}

// ✅ Live scan
async function runLiveScanOnce() {
    if (!stream || !modelsReady || !ui.video) return;
    if (scanInProgress) return;
    if (PERF.PAUSE_WHEN_HIDDEN && document.hidden) return;

    scanInProgress = true;
    try {
        resizeOverlayToVideo();

        const options = new faceapi.TinyFaceDetectorOptions({
            inputSize: PERF.LIVE_INPUT_SIZE,
            scoreThreshold: PERF.LIVE_SCORE_THRESHOLD,
        });

        const results = await faceapi
            .detectAllFaces(ui.video, options)
            .withFaceLandmarks()
            .withFaceDescriptors();

        const count = Array.isArray(results) ? results.length : 0;
        const nowMs = Date.now();

        const GREEN = "green";
        const BLUE = "blue";
        const RED = "red";

        if (count === 0) {
            clearOverlay();
            if (ui.liveDetectedName) ui.liveDetectedName.textContent = "—";
            liveSingle = {
                matched: false,
                userId: null,
                name: null,
                updatedAt: nowMs,
            };
            resetScanProgress();
            return;
        }

        const labels = new Array(count).fill("");

        if (count > 1) {
            for (let i = 0; i < count; i++) labels[i] = "Multiple faces";
            drawResultsWithLabels(results, labels, { strokeStyle: RED });
            if (ui.liveDetectedName)
                ui.liveDetectedName.textContent = "Multiple faces";
            liveSingle = {
                matched: false,
                userId: null,
                name: null,
                updatedAt: nowMs,
            };
            resetScanProgress();
            return;
        }

        // ✅ FIXED THRESHOLD
        const threshold = FIXED_MATCH_THRESHOLD;
        const d = results[0]?.descriptor || null;

        if (!d) {
            labels[0] = "Face detected";
            drawResultsWithLabels(results, labels, { strokeStyle: BLUE });
            if (ui.liveDetectedName)
                ui.liveDetectedName.textContent = "Face detected";
            liveSingle = {
                matched: false,
                userId: null,
                name: null,
                updatedAt: nowMs,
            };
            resetScanProgress();
            return;
        }

        const resp = await serverMatchDescriptor(d, threshold);

        if (resp.matched && resp.user?.name) {
            const uid = resp.user?.id ?? null;

            if (!uid) {
                resetScanProgress();
            } else if (scanProgressUserId !== uid) {
                scanProgressUserId = uid;
                scanProgressStartAt = nowMs;
                scanProgressPct = 0;
            } else if (!scanProgressStartAt) {
                scanProgressStartAt = nowMs;
            }

            if (scanProgressStartAt) {
                const elapsed = nowMs - scanProgressStartAt;
                scanProgressPct = Math.max(
                    0,
                    Math.min(
                        100,
                        Math.round(
                            (elapsed / PERF.AUTO_CHECKIN_INTERVAL_MS) * 100
                        )
                    )
                );
            } else {
                scanProgressPct = 0;
            }

            const isFlashGreen = nowMs < scanSuccessFlashUntil;
            const isReadyGreen = scanProgressPct >= 100;
            const strokeStyle = isFlashGreen || isReadyGreen ? GREEN : BLUE;

            const labelText = `${resp.user.name} ${scanProgressPct}%`;
            labels[0] = labelText;

            if (ui.liveDetectedName)
                ui.liveDetectedName.textContent = labelText;

            liveSingle = {
                matched: true,
                userId: uid,
                name: resp.user.name,
                updatedAt: nowMs,
            };

            drawResultsWithLabels(results, labels, { strokeStyle });
        } else {
            labels[0] = "Not registered";
            if (ui.liveDetectedName)
                ui.liveDetectedName.textContent = "Not registered";

            liveSingle = {
                matched: false,
                userId: null,
                name: null,
                updatedAt: nowMs,
            };
            resetScanProgress();
            drawResultsWithLabels(results, labels, { strokeStyle: RED });
        }
    } catch {
    } finally {
        scanInProgress = false;
    }
}

// ---------------- Live loop control ----------------
function startLiveLoop() {
    if (liveTimer) return;
    liveTimer = setInterval(
        () => runLiveScanOnce(),
        PERF.LIVE_SCAN_INTERVAL_MS
    );
}

function stopLiveLoop() {
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = null;
}

// ---------------- AUTO CHECK-IN ONLY ----------------
function shouldAutoCheckInNow() {
    if (!stream || !modelsReady) return false;

    // ✅ auto check-in ONLY when selected date is exactly today
    if (!isCheckInAllowedNow()) return false;

    if (PERF.PAUSE_WHEN_HIDDEN && document.hidden) return false;

    if (!liveSingle.matched || !liveSingle.userId) return false;

    // ✅ If user recently cancelled the Time-In confirmation, don't ask again yet
    if (!canPromptTimeIn(liveSingle.userId)) return false;

    if (scanProgressPct < 100) return false;
    if (attendanceInProgress || autoCheckInInFlight) return false;

    const nowMs = Date.now();
    if (
        lastAutoCheckInUserId === liveSingle.userId &&
        nowMs - lastAutoCheckInAt < PERF.AUTO_CHECKIN_SAME_USER_COOLDOWN_MS
    ) {
        return false;
    }

    return true;
}

function startAutoCheckIn() {
    if (autoCheckInTimer) return;
    autoCheckInTimer = setInterval(async () => {
        if (!shouldAutoCheckInNow()) return;

        autoCheckInInFlight = true;
        try {
            await attendance("check-in", { auto: true });
        } finally {
            autoCheckInInFlight = false;
        }
    }, PERF.AUTO_CHECKIN_INTERVAL_MS);
}

function stopAutoCheckIn() {
    if (!autoCheckInTimer) return;
    clearInterval(autoCheckInTimer);
    autoCheckInTimer = null;
    autoCheckInInFlight = false;
}

function syncAutoCheckIn() {
    if (stream && isCheckInAllowedNow()) startAutoCheckIn();
    else stopAutoCheckIn();
}

// ---------------- Camera ----------------
async function startCamera() {
    if (stream) return;
    if (!ui.video) return;

    unlockSpeech();

    if (!navigator.mediaDevices?.getUserMedia) {
        setStatus(
            "Your browser does not support camera access (getUserMedia)."
        );
        return;
    }

    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode,
                width: { ideal: PERF.CAMERA_IDEAL_WIDTH },
                height: { ideal: PERF.CAMERA_IDEAL_HEIGHT },
            },
            audio: false,
        });

        ui.video.srcObject = stream;
        ui.video.onloadedmetadata = () => resizeOverlayToVideo();

        await ui.video.play();
        resizeOverlayToVideo();

        appendStatus(`Camera started ✅ (facingMode: ${facingMode})`);
        startLiveLoop();
        syncAutoCheckIn();
    } catch (e) {
        stream = null;
        appendStatus(`Camera error: ${e?.message || e}`);
    }
}

function stopCamera() {
    if (!stream) return;

    resetScanProgress();
    scanSuccessFlashUntil = 0;

    stopAutoCheckIn();
    stopLiveLoop();
    clearOverlay();

    const tracks = stream.getTracks();
    tracks.forEach((t) => t.stop());

    if (ui.video) ui.video.srcObject = null;
    stream = null;

    appendStatus("Camera stopped.");
    if (ui.liveDetectedName) ui.liveDetectedName.textContent = "—";

    liveSingle = {
        matched: false,
        userId: null,
        name: null,
        updatedAt: Date.now(),
    };
}

async function flipCamera() {
    facingMode = facingMode === "user" ? "environment" : "user";
    if (!stream) {
        appendStatus(`Switched facingMode: ${facingMode}`);
        return;
    }
    stopCamera();
    await startCamera();
}

// ---------------- Robust profile parsing + normalization ----------------
function extractProfilesArray(payload) {
    if (!payload) return [];
    if (Array.isArray(payload)) return payload;

    if (Array.isArray(payload.profiles)) return payload.profiles;
    if (Array.isArray(payload.data)) return payload.data;

    if (payload.profiles && Array.isArray(payload.profiles.data))
        return payload.profiles.data;
    if (payload.data && Array.isArray(payload.data.data))
        return payload.data.data;

    return [];
}

function normalizeProfile(p) {
    const user_id = p?.user_id ?? p?.id ?? p?.user?.id ?? "";
    const name =
        p?.name ??
        p?.user_name ??
        p?.user?.name ??
        (user_id ? `User ${user_id}` : "");
    const role =
        p?.role_name ??
        p?.role?.name ??
        p?.user?.role_name ??
        p?.user?.role?.name ??
        "";

    const key =
        user_id != null && String(user_id) !== ""
            ? String(user_id)
            : String(name || "");
    return {
        key,
        user_id: user_id ?? "",
        name: name || "",
        role: role || "",
        face_profile_id: p?.face_profile_id ?? p?.id ?? "",
        _raw: p,
    };
}

// ---------------- ADMIN ROSTER (Present/Absent/Half day/Day off) ----------------
function getRosterStatusStore() {
    const raw = localStorage.getItem(STORAGE_ADMIN_ROSTER_STATUS);
    const obj = safeJsonParse(raw, {});
    return obj && typeof obj === "object" ? obj : {};
}

function saveRosterStatusStore(store) {
    safeSetLocalStorage(STORAGE_ADMIN_ROSTER_STATUS, JSON.stringify(store));
}

function getStatusFor(dateStr, userKey) {
    const store = getRosterStatusStore();
    return store?.[dateStr]?.[String(userKey)] || "present";
}

function setStatusFor(dateStr, userKey, status) {
    const store = getRosterStatusStore();
    if (!store[dateStr]) store[dateStr] = {};
    store[dateStr][String(userKey)] = status || "present";
    saveRosterStatusStore(store);
}

async function fetchAllRegisteredPeople() {
    const server = await safeFetchJson("/api/face/profiles", { method: "GET" });

    const list = server.ok ? extractProfilesArray(server.data) : [];
    if (list.length) {
        return {
            people: list
                .map(normalizeProfile)
                .filter((x) => x.key && x.name)
                .map((x) => ({
                    key: x.key,
                    user_id: x.user_id || "",
                    name: x.name,
                    role: x.role,
                    source: "db",
                })),
            info: null,
        };
    }

    const info =
        server.status === 404
            ? "Missing endpoint: GET /api/face/profiles (HTTP 404). Add this endpoint to show DB registered people."
            : server.status
            ? `Failed to load /api/face/profiles (HTTP ${server.status}).`
            : "Failed to load /api/face/profiles (network error).";

    const local = getProfiles();
    return {
        people: local
            .map((p) => ({
                key: String(p.id || p.name || ""),
                user_id: "",
                name: p.name || "Unknown",
                role: p.role || p.role_name || "",
                source: "local",
            }))
            .filter((x) => x.key && x.name),
        info,
    };
}

function roleSortKey(role) {
    const r = String(role || "")
        .trim()
        .toUpperCase();
    const order = { ADMIN: 1, IT: 2, CSR: 3, TECHNICAL: 4 };
    return order[r] ?? 999;
}

async function renderAdminRoster() {
    if (!ui.adminRosterList || !ui.rosterCount) return;

    if (!isAdminLoggedIn()) {
        ui.adminRosterList.innerHTML = "";
        ui.rosterCount.textContent = "0";
        if (ui.rosterDateLabel) ui.rosterDateLabel.textContent = "—";
        return;
    }

    const dateStr = ui.datePicker?.value || isoDateLocal();
    if (ui.rosterDateLabel) ui.rosterDateLabel.textContent = dateStr;

    ui.adminRosterList.innerHTML = `<div class="text-xs text-slate-400">Loading…</div>`;

    const { people, info } = await fetchAllRegisteredPeople();

    people.sort((a, b) => {
        const ra = roleSortKey(a.role);
        const rb = roleSortKey(b.role);
        if (ra !== rb) return ra - rb;
        return (a.name || "").localeCompare(b.name || "");
    });

    ui.rosterCount.textContent = String(people.length);
    ui.adminRosterList.innerHTML = "";

    if (info) {
        const note = document.createElement("div");
        note.className =
            "rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200";
        note.textContent = info;
        ui.adminRosterList.appendChild(note);
    }

    if (!people.length) {
        ui.adminRosterList.innerHTML += `<div class="text-xs text-slate-400">No registered people found.</div>`;
        return;
    }

    for (const p of people) {
        const userKey = p.key || p.name;
        const current = getStatusFor(dateStr, userKey);

        const row = document.createElement("div");
        row.className =
            "flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3";

        row.innerHTML = `
            <div class="min-w-0">
                <div class="text-sm font-semibold truncate">${escapeHtml(
                    p.name
                )}</div>
                <div class="text-[11px] text-slate-400 truncate">
                    ${escapeHtml(p.role || "—")}
                    <span class="text-slate-500">•</span>
                    <span class="font-mono text-slate-500">${escapeHtml(
                        p.source
                    )}</span>
                </div>
            </div>

            <div class="shrink-0">
                <select
                    data-roster-key="${escapeHtml(String(userKey))}"
                    class="rounded-xl bg-black border border-white/10 px-3 py-2 text-xs text-slate-100"
                >
                    <option value="present">Set Status</option>
                    <option value="absent">Absent</option>
                    <option value="half_day">Half day</option>
                    <option value="day_off">Day off</option>
                </select>
            </div>
        `;

        ui.adminRosterList.appendChild(row);

        const sel = row.querySelector("select");
        if (sel) {
            sel.value = current || "present";
            sel.addEventListener("change", () => {
                const v = sel.value || "present";
                setStatusFor(dateStr, userKey, v);
                appendStatus(`Roster: ${p.name} = ${v.replaceAll("_", " ")}`);
            });
        }
    }
}

// ---------------- UI rendering ----------------
async function renderProfiles() {
    if (!ui.profilesList || !ui.enrolledCount) return;

    ui.profilesList.innerHTML = "";

    const server = await safeFetchJson("/api/face/profiles", { method: "GET" });

    if (server.ok && Array.isArray(server.data?.profiles)) {
        const profiles = server.data.profiles;

        ui.enrolledCount.textContent = String(profiles.length);

        if (!profiles.length) {
            ui.profilesList.innerHTML = `
                <div class="text-slate-400 text-sm">
                    No registered employees yet.
                </div>`;
            return;
        }

        for (const p of profiles) {
            const name =
                p.name || (p.user_id ? `User ${p.user_id}` : "Unknown");
            const roleName = pickRoleName(p);

            const row = document.createElement("div");
            row.className =
                "flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3";

            row.innerHTML = `
                <div class="min-w-0">
                    <div class="text-sm font-semibold truncate">${escapeHtml(
                        name
                    )}</div>
                    <div class="text-[11px] text-slate-400 truncate">
                        ${escapeHtml(roleName || "—")}
                        <span class="text-slate-500">•</span>
                        <span class="font-mono text-slate-500">db</span>
                    </div>
                </div>

                <div class="text-[11px] text-slate-500">DB</div>
            `;

            ui.profilesList.appendChild(row);
        }

        return;
    }

    const profiles = getProfiles();
    ui.enrolledCount.textContent = String(profiles.length);

    if (!profiles.length) {
        ui.profilesList.innerHTML = `
            <div class="text-slate-400 text-sm">
                Registered list is empty (local).<br/>
                If you're using DB enrollment, add GET
                <span class="font-mono text-[11px]">/api/face/profiles</span>
                to show DB profiles.
            </div>`;
        return;
    }

    for (const p of profiles) {
        const name = p.name || "Unknown";
        const roleName = p.role || p.role_name || "";

        const row = document.createElement("div");
        row.className =
            "flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3";

        row.innerHTML = `
            <div class="min-w-0">
                <div class="text-sm font-semibold truncate">${escapeHtml(
                    name
                )}</div>
                <div class="text-[11px] text-slate-400 truncate">
                    ${escapeHtml(roleName || "—")}
                    <span class="text-slate-500">•</span>
                    <span class="font-mono text-slate-500">local</span>
                </div>
            </div>

            <div class="flex items-center gap-2">
                <button data-del="${escapeHtml(
                    p.id
                )}" class="rounded-xl bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/30">
                    Delete
                </button>
            </div>
        `;

        ui.profilesList.appendChild(row);
    }

    ui.profilesList.querySelectorAll("button[data-del]").forEach((btn) => {
        btn.addEventListener("click", async () => {
            const ok = await requireAdmin("Delete enrolled profile");
            if (!ok) return;

            const id = btn.getAttribute("data-del");
            const next = getProfiles().filter((p) => p.id !== id);
            saveProfiles(next);
            appendStatus(`Deleted profile: ${id}`);
            renderProfiles();
            renderLogs();
            renderAdminRoster();
        });
    });
}

/**
 * Server logs helper
 */
async function fetchServerLogsByDate(dateStr) {
    return await safeFetchJson(
        `/api/attendance/logs?date=${encodeURIComponent(dateStr)}`,
        { method: "GET" }
    );
}

/**
 * Fallback merge:
 * - When viewing/exporting a date, also fetch the NEXT day and include "out" logs that happened
 *   within the overnight window (00:00–07:59 if cutoff=7) so they appear under the previous day.
 *
 * NOTE: If your backend uses `effective_date` properly, you may remove this merge later.
 */
function shouldAssignOutLogToPreviousDate(occurredAt) {
    if (!occurredAt) return false;
    const dt = new Date(occurredAt);
    if (Number.isNaN(dt.getTime())) return false;
    return dt.getHours() < OVERNIGHT_CUTOFF_HOUR + 1; // inclusive hour window
}

/**
 * ✅ NEW RULE (your request):
 * Time-Out should be recorded on the date of the employee's last Time-In (shift date).
 *
 * We resolve it in this order:
 * 1) If user selected a past date in the date picker (e.g., yesterday), we use that (assume they picked the shift date).
 * 2) Try optional backend endpoints for last Time-In date (if you add them later).
 * 3) Fallback to local UI cache (last check-in date we stored).
 * 4) Final fallback: overnight cutoff logic.
 */
async function fetchLastCheckInDateFromServer(userId) {
    const uid = userId != null ? String(userId) : "";
    if (!uid) return null;

    // ✅ OPTIONAL endpoints (safe attempts). Add any of these in Laravel if you want perfect accuracy.
    const candidates = [
        `/api/attendance/last-in?user_id=${encodeURIComponent(uid)}`,
        `/api/attendance/last-in-date?user_id=${encodeURIComponent(uid)}`,
    ];

    for (const url of candidates) {
        const r = await safeFetchJson(url, { method: "GET" });
        if (!r.ok || !r.data) continue;

        const date =
            r.data?.date ||
            r.data?.last_in_date ||
            r.data?.last_in?.date ||
            r.data?.last_in?.effective_date ||
            r.data?.data?.date ||
            null;

        if (date && /^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
            return String(date);
        }
    }

    return null;
}

function findLatestCheckInDateForUserFromLocal(userId, name) {
    const uid = userId != null ? String(userId) : "";
    const nm = String(name || "").trim().toLowerCase();
    const store = getLogs();

    const dates = Object.keys(store || {}).filter((d) =>
        /^\d{4}-\d{2}-\d{2}$/.test(d)
    );

    // newest first
    dates.sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));

    for (const dateStr of dates) {
        const arr = Array.isArray(store[dateStr]) ? store[dateStr] : [];
        // scan newest to oldest
        for (let i = arr.length - 1; i >= 0; i--) {
            const r = arr[i];
            if (!r) continue;
            if (String(r.type || "") !== "check-in") continue;

            const rid = r.user_id != null ? String(r.user_id) : "";
            const rname = String(r.name || "").trim().toLowerCase();

            const matchById = uid && rid && uid === rid;
            const matchByName = !uid && nm && rname && nm === rname;

            if (matchById || matchByName) return dateStr;
        }
    }

    return null;
}

async function resolveEffectiveDateForCheckOut({
    userId,
    name,
    selectedDate,
    nowObj,
} = {}) {
    const todayStr = getTodayStr();
    const sel = selectedDate || todayStr;

    // 1) If user selected a past date (yesterday etc.), treat that as the shift date.
    if (sel && sel !== todayStr) return sel;

    // 2) Try server (if endpoint exists)
    const serverDate = await fetchLastCheckInDateFromServer(userId);
    if (serverDate) return serverDate;

    // 3) Local cache fallback
    const localDate = findLatestCheckInDateForUserFromLocal(userId, name);
    if (localDate) return localDate;

    // 4) Final fallback cutoff logic
    return getEffectiveDateFallback("check-out", nowObj || now());
}

async function renderLogs() {
    if (!ui.logsTbody || !ui.logsCount || !ui.datePicker) return;

    const dateStr = ui.datePicker.value || isoDateLocal();

    const server = await fetchServerLogsByDate(dateStr);

    if (server.ok && Array.isArray(server.data?.logs)) {
        let logs = server.data.logs || [];

        // ✅ Pull overnight OUT logs from next day (fallback display merge)
        const nextDate = addDaysToDateStr(dateStr, +1);
        const next = await fetchServerLogsByDate(nextDate);

        if (next.ok && Array.isArray(next.data?.logs)) {
            const extraOuts = (next.data.logs || []).filter((r) => {
                const t = String(r?.type || "").toLowerCase();
                const isOut =
                    t === "out" || t === "check-out" || t === "time-out";
                if (!isOut) return false;
                return shouldAssignOutLogToPreviousDate(r.occurred_at);
            });
            logs = logs.concat(extraOuts);
        }

        const map = new Map();

        for (const r of logs) {
            const name = r.name || "User " + r.user_id;
            if (!map.has(name)) {
                map.set(name, {
                    name,
                    time_in: null,
                    time_out: null,
                    photo_in: null,
                    photo_out: null,
                });
            }
            const item = map.get(name);

            const t = r.occurred_at ? new Date(r.occurred_at) : null;
            const timeStr = t ? timeLocal(t) : "—";

            if (r.type === "in") {
                if (!item.time_in) item.time_in = timeStr;
            } else if (r.type === "out") {
                item.time_out = timeStr;
            }
        }

        const rows = Array.from(map.values());
        rows.sort((a, b) => a.name.localeCompare(b.name));

        ui.logsCount.textContent = String(rows.length);
        ui.logsTbody.innerHTML = "";

        if (!rows.length) {
            ui.logsTbody.innerHTML = `
                <tr>
                  <td class="px-3 py-3 text-slate-400" colspan="4">No logs for ${dateStr}.</td>
                </tr>
            `;
            return;
        }

        for (const r of rows) {
            const tr = document.createElement("tr");
            tr.className = "text-slate-200";
            tr.innerHTML = `
                <td class="px-3 py-2 font-semibold">${escapeHtml(r.name)}</td>
                <td class="px-3 py-2 font-mono text-[11px] text-slate-300">${escapeHtml(
                    r.time_in || "—"
                )}</td>
                <td class="px-3 py-2 font-mono text-[11px] text-slate-300">${escapeHtml(
                    r.time_out || "—"
                )}</td>
                <td class="px-3 py-2">
                  <span class="text-slate-500 text-[11px]">—</span>
                </td>
            `;
            ui.logsTbody.appendChild(tr);
        }

        return;
    }

    // local fallback
    const rows = buildDaySummary(dateStr);

    ui.logsCount.textContent = String(rows.length);
    ui.logsTbody.innerHTML = "";

    if (!rows.length) {
        ui.logsTbody.innerHTML = `
          <tr>
            <td class="px-3 py-3 text-slate-400" colspan="4">No logs for ${dateStr}.</td>
          </tr>
        `;
        return;
    }

    for (const r of rows) {
        const tr = document.createElement("tr");
        tr.className = "text-slate-200";

        const photo = r.photo_in || r.photo_out || null;

        tr.innerHTML = `
          <td class="px-3 py-2 font-semibold">${escapeHtml(r.name)}</td>
          <td class="px-3 py-2 font-mono text-[11px] text-slate-300">${escapeHtml(
              r.time_in || "—"
          )}</td>
          <td class="px-3 py-2 font-mono text-[11px] text-slate-300">${escapeHtml(
              r.time_out || "—"
          )}</td>
          <td class="px-3 py-2">
            ${
                photo
                    ? `<a class="text-sky-300 hover:text-sky-200 underline text-[11px]" href="${photo}" target="_blank" rel="noopener">View</a>`
                    : `<span class="text-slate-500 text-[11px]">—</span>`
            }
          </td>
        `;
        ui.logsTbody.appendChild(tr);
    }
}

function setDateToToday() {
    if (!ui.datePicker) return;
    ui.datePicker.value = isoDateLocal();
    renderLogs();
    renderAdminRoster();
    updateCheckButtonsState();
    syncAutoCheckIn();
}

// ---------------- Attendance actions ----------------
async function enroll() {
    const name = (ui.enrollName?.value || "").trim();
    const contact_number = (ui.enrollContact?.value || "").trim();
    const password = (ui.enrollPassword?.value || "").trim();
    const roleId = Number(ui.enrollRole?.value || 0);

    if (!name) return appendStatus("Enroll: Please enter a name.");
    if (!contact_number)
        return appendStatus("Enroll: Please enter a contact number.");
    if (!password || password.length < 8)
        return appendStatus("Enroll: Password must be at least 8 characters.");
    if (!roleId) return appendStatus("Enroll: Please select a role.");

    if (!stream) return appendStatus("Enroll: Start the camera first.");
    if (!modelsReady) return appendStatus("Enroll: Models not ready yet.");

    appendStatus("Enroll: Capturing face…");

    const scan = await getSingleDescriptorStrict();
    if (!scan?.descriptor) {
        if (scan?.reason === "multiple") {
            appendStatus(
                `Enroll: Multiple faces detected (${scan.count}). ONLY ONE person allowed.`
            );
        } else {
            appendStatus("Enroll: Face not detected.");
        }
        return;
    }

    // ✅ FIXED THRESHOLD
    const threshold = FIXED_MATCH_THRESHOLD;

    const matchResp = await safeFetchJson("/api/face/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            descriptor: Array.from(scan.descriptor),
            threshold,
        }),
    });

    if (matchResp.ok && matchResp.data?.matched) {
        appendStatus(
            `Enroll blocked: Face already registered as ${
                matchResp.data?.user?.name || "someone"
            }.`
        );
        return;
    }

    const r = await safeFetchJson("/api/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name,
            contact_number,
            password,
            role_id: roleId,
            descriptor: Array.from(scan.descriptor),
            label: "Enrollment",
        }),
    });

    if (!r.ok) {
        const msg =
            r.data?.message ||
            (r.data?.errors
                ? Object.values(r.data.errors).flat().join(" ")
                : `HTTP ${r.status}`);
        appendStatus(`Enroll failed: ${msg}`);
        return;
    }

    appendStatus(`Enroll success ✅ user_id=${r.data?.user?.id ?? "?"}`);
    if (ui.enrollName) ui.enrollName.value = "";
    if (ui.enrollContact) ui.enrollContact.value = "";
    if (ui.enrollPassword) ui.enrollPassword.value = "";

    renderProfiles();
    renderAdminRoster();
}

async function attendance(type, opts = { auto: false }) {
    const isAuto = !!opts?.auto;
    const selectedDate = ui.datePicker?.value || isoDateLocal();
    const todayStr = getTodayStr();
    const nowObj = now();

    if (attendanceInProgress) return;
    attendanceInProgress = true;

    try {
        // ✅ Check-in rules
        if (type === "check-in") {
            if (selectedDate !== todayStr) {
                if (!isAuto) {
                    appendStatus("Check-in works ONLY on TODAY.");
                }
                return;
            }
        }

        // ✅ Check-out rules (UPDATED):
        // Allow Time-Out if selected date is within last CHECKOUT_MAX_PAST_DAYS (default: today/yesterday)
        if (type === "check-out") {
            if (!isCheckOutAllowedNow()) {
                if (!isAuto) {
                    appendStatus(
                        `Check-out blocked: you can time-out for dates within the last ${CHECKOUT_MAX_PAST_DAYS} day(s).`
                    );
                }
                return;
            }
        }

        if (!stream) {
            if (!isAuto) appendStatus(`${type}: Start the camera first.`);
            return;
        }

        if (!modelsReady) {
            if (!isAuto) appendStatus(`${type}: Models not ready yet.`);
            return;
        }

        // ✅ FIXED THRESHOLD
        const threshold = FIXED_MATCH_THRESHOLD;

        if (!isAuto) {
            if (ui.btnCheckIn) ui.btnCheckIn.disabled = true;
            if (ui.btnCheckOut) ui.btnCheckOut.disabled = true;
        }

        if (!isAuto) appendStatus(`${type}: Scanning…`);

        const scan = await getSingleDescriptorStrict();
        if (!scan?.descriptor) {
            if (!isAuto) {
                if (scan?.reason === "multiple") {
                    appendStatus(
                        `${type}: Multiple faces detected (${scan.count}). ONLY ONE person allowed.`
                    );
                } else {
                    appendStatus(`${type}: Face not detected.`);
                }
            }
            return;
        }

        // ✅ pre-match for both check-in and check-out (needed to compute effective out date)
        const pre = await serverMatchDescriptor(scan.descriptor, threshold);
        if (!pre?.matched || !pre?.user?.name) {
            if (!isAuto) appendStatus(`${type} blocked: Not registered.`);
            return;
        }

        const userIdPre = pre.user?.id ?? null;
        const namePre = pre.user?.name || "Unknown";

        // ✅ TIME-IN CONFIRMATION (registered only)
        if (type === "check-in") {
            const uid = userIdPre;

            if (!canPromptTimeIn(uid)) return;

            const ok = await confirmTimeInPopup(namePre);
            if (!ok) {
                markTimeInPrompted(uid);
                if (!isAuto) appendStatus("Time-In cancelled.");
                return;
            }
        }

        const photo = capturePhotoDataUrlScaled(
            PERF.PHOTO_LOG_MAX_WIDTH,
            PERF.PHOTO_LOG_QUALITY
        );
        const apiType = type === "check-in" ? "in" : "out";

        // ✅ Effective date (UPDATED):
        // - check-in: today
        // - check-out: the date of the user's last time-in (shift date)
        const effectiveDate =
            type === "check-in"
                ? todayStr
                : await resolveEffectiveDateForCheckOut({
                      userId: userIdPre,
                      name: namePre,
                      selectedDate,
                      nowObj,
                  });

        const r = await safeFetchJson("/api/attendance/clock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                type: apiType,
                descriptor: Array.from(scan.descriptor),
                threshold,
                device_id: "kiosk-1",
                photo_data_url: photo || null,

                // ✅ IMPORTANT: tell server to store Time-Out under the Time-In date
                effective_date: effectiveDate,
            }),
        });

        if (!r.ok) {
            const msg =
                r.data?.message ||
                (r.data?.errors
                    ? Object.values(r.data.errors).flat().join(" ")
                    : `HTTP ${r.status}`);
            if (!isAuto) appendStatus(`${type}: ${msg}`);
            return;
        }

        const userId = r.data?.user?.id ?? userIdPre ?? null;
        const name = r.data?.user?.name || namePre || "Unknown";

        if (type === "check-in") {
            scanSuccessFlashUntil = Date.now() + 1200;
            resetScanProgress();
        }

        if (isAuto && userId) {
            lastAutoCheckInUserId = userId;
            lastAutoCheckInAt = Date.now();
        }

        if (!isAuto) appendStatus(`${type}: Saved ✅ (${name})`);

        if (!isAuto) {
            window.toastSwal?.(
                `${type === "check-in" ? "Time-In" : "Time-Out"} saved: ${name}`,
                "success"
            );
        }

        const say = type === "check-in" ? "time in" : "time out";
        if (name && name !== "Unknown") speak(`${name} ${say}`);
        else speak("Unknown face. Please scan again.");

        const actionLabel = type === "check-in" ? "Time-In" : "Time-Out";

        showRightToast({
            name,
            date: effectiveDate, // ✅ show effective date (Time-In date for Time-Out)
            time: timeLocal(nowObj),
            action: actionLabel,
            photoDataUrl: photo || null,
        });

        // ✅ Save UI cache under effective date
        addLog(effectiveDate, {
            name,
            type,
            time: timeLocal(nowObj),
            photo_data_url: photo || null,
            user_id: userId || "",
            server_log_id: r.data?.log_id ?? null,

            // store real datetime for debugging if needed
            occurred_at_real: `${isoDateLocal(nowObj)} ${timeLocal(nowObj)}`,
        });

        renderLogs();

        if (isAdminLoggedIn()) renderAdminRoster().catch(() => {});
    } finally {
        attendanceInProgress = false;
        updateCheckButtonsState();
    }
}

// ---------------- CSV/JSON export (local UI cache) ----------------
function downloadText(filename, text) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
    }, 0);
}

function downloadDayCsv() {
    const dateStr = ui.datePicker?.value || isoDateLocal();
    const logs = getLogsForDate(dateStr);

    const headers = ["name", "type", "time", "photo_data_url"];
    const lines = [headers.join(",")];

    for (const r of logs) {
        const row = [
            (r?.name || "").replaceAll('"', '""'),
            (r?.type || "").replaceAll('"', '""'),
            (r?.time || "").replaceAll('"', '""'),
            (r?.photo_data_url || "").replaceAll('"', '""'),
        ].map((v) => `"${v}"`);
        lines.push(row.join(","));
    }

    downloadText(`attendance_${dateStr}.csv`, lines.join("\n"));
}

function downloadDayJson() {
    const dateStr = ui.datePicker?.value || isoDateLocal();
    const logs = getLogsForDate(dateStr);
    downloadText(`attendance_${dateStr}.json`, JSON.stringify(logs, null, 2));
}

// ✅ role sorting helper for export
function roleText(role) {
    return String(role || "").trim();
}

function roleExportOrder(role) {
    const r = roleText(role).toUpperCase();
    const order = { ADMIN: 1, IT: 2, CSR: 3, TECHNICAL: 4 };
    return order[r] ?? 999;
}

async function downloadDayXlsx({ includePhotoDataUrl = false } = {}) {
    const dateStr = ui.datePicker?.value || isoDateLocal();

    if (!window.XLSX?.utils) {
        alert(
            "XLSX library not loaded. (SheetJS script must load before app.js)"
        );
        return;
    }

    const { people } = await fetchAllRegisteredPeople();

    const peopleById = new Map();
    const peopleByName = new Map();

    for (const p of people) {
        const uid = p.user_id != null ? String(p.user_id) : "";
        const nm = String(p.name || "").trim();
        const rl = String(p.role || "").trim();

        if (uid) peopleById.set(uid, { name: nm, role: rl });
        if (nm)
            peopleByName.set(nm.toLowerCase(), {
                name: nm,
                role: rl,
                user_id: uid,
            });
    }

    const resolvePersonRole = (userId, name, fallbackRole = "") => {
        const uid = userId != null ? String(userId) : "";
        const nm = String(name || "").trim();

        if (uid && peopleById.has(uid))
            return peopleById.get(uid).role || fallbackRole || "";
        if (nm) {
            const hit = peopleByName.get(nm.toLowerCase());
            if (hit?.role) return hit.role;
        }
        return String(fallbackRole || "");
    };

    let raw = [];

    // ✅ fetch selected date logs
    const server = await fetchServerLogsByDate(dateStr);

    // ✅ also fetch next day logs (fallback merge for early OUT)
    const nextDate = addDaysToDateStr(dateStr, +1);
    const serverNext = await fetchServerLogsByDate(nextDate);

    const combinedServerLogs = [];
    if (server.ok && Array.isArray(server.data?.logs))
        combinedServerLogs.push(...(server.data.logs || []));
    if (serverNext.ok && Array.isArray(serverNext.data?.logs))
        combinedServerLogs.push(...(serverNext.data.logs || []));

    if (combinedServerLogs.length) {
        raw = combinedServerLogs
            .map((r) => {
                const dt = r.occurred_at ? new Date(r.occurred_at) : null;

                const userId = r.user_id || r.user?.id || "";
                const name =
                    r.name || r.user_name || (userId ? `User ${userId}` : "");
                const roleFromLog =
                    r.role_name ||
                    r.role?.name ||
                    r.user?.role_name ||
                    r.user?.role?.name ||
                    "";

                const role = resolvePersonRole(userId, name, roleFromLog);

                const typ = String(r.type || "").toLowerCase();
                const isOut =
                    typ === "out" || typ === "check-out" || typ === "time-out";

                const effDate =
                    isOut &&
                    r.occurred_at &&
                    shouldAssignOutLogToPreviousDate(r.occurred_at)
                        ? addDaysToDateStr(isoDateLocal(new Date(r.occurred_at)), -1)
                        : dt
                        ? isoDateLocal(dt)
                        : dateStr;

                return {
                    effective_date: effDate,
                    date: effDate,
                    occurred_at: r.occurred_at || "",
                    time: dt ? timeLocal(dt) : "",
                    name,
                    role,
                    type: r.type || "",
                    user_id: userId,
                    device_id: r.device_id || "",
                    photo_path: r.photo_path || "",
                    photo_data_url: includePhotoDataUrl
                        ? r.photo_data_url || ""
                        : "",
                    meta:
                        r.meta == null
                            ? ""
                            : typeof r.meta === "string"
                            ? r.meta
                            : JSON.stringify(r.meta),
                };
            })
            .filter((row) => row.effective_date === dateStr)
            .map(({ effective_date, ...rest }) => rest);
    } else {
        raw = getLogsForDate(dateStr).map((r) => {
            const userId = r?.user_id || "";
            const name = r?.name || "";
            const roleFromLog = r?.role || r?.role_name || "";
            const role = resolvePersonRole(userId, name, roleFromLog);

            return {
                date: dateStr,
                occurred_at:
                    r?.occurred_at || (r?.time ? `${dateStr} ${r.time}` : ""),
                time: r?.time || "",
                name,
                role,
                type: r?.type || "",
                user_id: userId,
                device_id: r?.device_id || "",
                photo_path: r?.photo_path || "",
                photo_data_url: includePhotoDataUrl ? r?.photo_data_url || "" : "",
                meta:
                    r?.meta == null
                        ? ""
                        : typeof r.meta === "string"
                        ? r.meta
                        : JSON.stringify(r.meta),
            };
        });
    }

    raw.sort((a, b) => {
        const ra = roleExportOrder(a.role);
        const rb = roleExportOrder(b.role);
        if (ra !== rb) return ra - rb;

        const na = (a.name || "").toLowerCase();
        const nb = (b.name || "").toLowerCase();
        if (na !== nb) return na.localeCompare(nb);

        const ta = a.time || "";
        const tb = b.time || "";
        return ta.localeCompare(tb);
    });

    const summaryMap = new Map();

    const makeKey = (userId, name) => {
        const uid = userId != null ? String(userId) : "";
        const nm = String(name || "")
            .trim()
            .toLowerCase();
        return uid ? `id:${uid}` : `name:${nm}`;
    };

    for (const p of people) {
        const uid = p.user_id != null ? String(p.user_id) : "";
        const nm = String(p.name || "").trim();
        const rl = String(p.role || "").trim();

        const key = makeKey(uid, nm);
        summaryMap.set(key, {
            date: dateStr,
            user_id: uid,
            name: nm,
            role: rl,
            status: getRosterStatusForExport(dateStr, uid, nm),
            time_in: "",
            time_out: "",
        });
    }

    for (const r of raw) {
        const uid = r.user_id != null ? String(r.user_id) : "";
        const nm = String(r.name || "").trim();
        const key = makeKey(uid, nm);

        if (!summaryMap.has(key)) {
            summaryMap.set(key, {
                date: dateStr,
                user_id: uid,
                name: nm,
                role: resolvePersonRole(uid, nm, r.role || ""),
                status: getRosterStatusForExport(dateStr, uid, nm),
                time_in: "",
                time_out: "",
            });
        }

        const item = summaryMap.get(key);

        if (!item.role) item.role = resolvePersonRole(uid, nm, r.role || "");

        const t = String(r.type || "").toLowerCase();
        const isIn =
            t === "in" ||
            t === "check-in" ||
            t === "time-in" ||
            t === "time_in";
        const isOut =
            t === "out" ||
            t === "check-out" ||
            t === "time-out" ||
            t === "time_out";

        if (isIn) {
            if (!item.time_in || (r.time && r.time < item.time_in))
                item.time_in = r.time || item.time_in;
        }
        if (isOut) {
            if (!item.time_out || (r.time && r.time > item.time_out))
                item.time_out = r.time || item.time_out;
        }

        item.status = getRosterStatusForExport(dateStr, item.user_id, item.name);
    }

    const summary = Array.from(summaryMap.values());

    summary.sort((a, b) => {
        const ra = roleExportOrder(a.role);
        const rb = roleExportOrder(b.role);
        if (ra !== rb) return ra - rb;

        const na = (a.name || "").toLowerCase();
        const nb = (b.name || "").toLowerCase();
        return na.localeCompare(nb);
    });

    const wb = XLSX.utils.book_new();

    const wsSummary = XLSX.utils.json_to_sheet(summary, {
        header: [
            "date",
            "user_id",
            "name",
            "role",
            "status",
            "time_in",
            "time_out",
        ],
    });
    wsSummary["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, wsSummary, `Summary ${dateStr}`);

    const wsRaw = XLSX.utils.json_to_sheet(raw, {
        header: [
            "date",
            "occurred_at",
            "time",
            "name",
            "role",
            "type",
            "user_id",
            "device_id",
            "photo_path",
            "photo_data_url",
            "meta",
        ],
    });
    wsRaw["!freeze"] = { xSplit: 0, ySplit: 1 };
    XLSX.utils.book_append_sheet(wb, wsRaw, `Raw Logs ${dateStr}`);

    XLSX.writeFile(wb, `attendance_${dateStr}.xlsx`);
}

async function clearDay() {
    const ok = await requireAdmin("Clear logs for selected day");
    if (!ok) return;

    const dateStr = ui.datePicker?.value || isoDateLocal();
    const logs = getLogs();
    delete logs[dateStr];
    saveLogs(logs);

    appendStatus(`Cleared logs for ${dateStr}`);
    renderLogs();

    if (isAdminLoggedIn()) renderAdminRoster().catch(() => {});
}

async function clearAll() {
    const ok = await requireAdmin(
        "Reset ALL local data (UI cache + legacy profiles)"
    );
    if (!ok) return;

    localStorage.removeItem(STORAGE_PROFILES);
    localStorage.removeItem(STORAGE_LOGS);
    localStorage.removeItem(STORAGE_ADMIN_ROSTER_STATUS);

    appendStatus("Local reset done ✅ (DB data remains).");
    renderProfiles();
    renderLogs();
    renderAdminRoster();
}

// ---------------- Profile export/import (legacy local) ----------------
function exportProfiles() {
    const profiles = getProfiles();
    downloadText("profiles.json", JSON.stringify(profiles, null, 2));
}

async function importProfilesFromFile(file) {
    const ok = await requireAdmin("Import profiles (legacy local)");
    if (!ok) return;

    const text = await file.text();
    const data = safeJsonParse(text, null);
    if (!Array.isArray(data)) {
        appendStatus("Import failed: JSON must be an array of profiles.");
        return;
    }

    const cleaned = data.filter(
        (p) =>
            p &&
            p.name &&
            Array.isArray(p.descriptor) &&
            p.descriptor.length === 128
    );

    saveProfiles(cleaned);
    appendStatus(`Imported ${cleaned.length} profiles ✅ (local only)`);
    renderProfiles();
    renderAdminRoster();
}

// ---------------- Wire up ----------------
function bindEvents() {
    ui.btnStart?.addEventListener("click", startCamera);
    ui.btnStop?.addEventListener("click", stopCamera);
    ui.btnFlip?.addEventListener("click", flipCamera);

    ui.btnToday?.addEventListener("click", setDateToToday);

    ui.datePicker?.addEventListener("change", () => {
        renderLogs();
        updateCheckButtonsState();
        syncAutoCheckIn();
        renderAdminRoster();
    });

    ui.btnEnroll?.addEventListener("click", (e) => {
        e.preventDefault();
        enroll().catch((err) =>
            appendStatus(`Enroll error: ${err?.message || err}`)
        );
    });

    ui.btnCheckIn?.addEventListener("click", () => {
        unlockSpeech();
        attendance("check-in", { auto: false }).catch((e) =>
            appendStatus(`Check-in error: ${e?.message || e}`)
        );
    });

    ui.btnCheckOut?.addEventListener("click", () => {
        unlockSpeech();
        attendance("check-out", { auto: false }).catch((e) =>
            appendStatus(`Check-out error: ${e?.message || e}`)
        );
    });

    ui.btnDownloadDay?.addEventListener("click", downloadDayCsv);
    ui.btnDownloadDayJson?.addEventListener("click", downloadDayJson);
    ui.btnDownloadDayXlsx?.addEventListener("click", () => {
        downloadDayXlsx({ includePhotoDataUrl: false }).catch((e) =>
            appendStatus(`XLSX export error: ${e?.message || e}`)
        );
    });

    ui.btnClearDay?.addEventListener("click", () => {
        clearDay().catch((e) =>
            appendStatus(`Clear-day error: ${e?.message || e}`)
        );
    });

    ui.btnClearAll?.addEventListener("click", () => {
        clearAll().catch((e) => appendStatus(`Reset error: ${e?.message || e}`));
    });

    ui.btnChangePw?.addEventListener("click", () => {
        setOrChangePasswordFlow().catch((e) =>
            appendStatus(`Password error: ${e?.message || e}`)
        );
    });

    ui.btnExportProfiles?.addEventListener("click", exportProfiles);

    ui.importProfiles?.addEventListener("change", (ev) => {
        const file = ev.target.files?.[0];
        if (!file) return;
        importProfilesFromFile(file).catch((e) =>
            appendStatus(`Import error: ${e?.message || e}`)
        );
        ev.target.value = "";
    });

    ui.btnAdminToggle?.addEventListener("click", async () => {
        if (isAdminLoggedIn()) {
            setAdminLoggedIn(false);
            applyAdminUiState();
            appendStatus("Admin logged out.");
            return;
        }

        const ok = await requireAdmin("Admin access");
        if (!ok) return;

        setAdminLoggedIn(true);
        applyAdminUiState();
        appendStatus("Admin logged in ✅");
    });

    window.addEventListener("resize", () =>
        requestAnimationFrame(resizeOverlayToVideo)
    );
    ui.video?.addEventListener("loadedmetadata", () =>
        requestAnimationFrame(resizeOverlayToVideo)
    );

    document.addEventListener("visibilitychange", () => {
        if (!PERF.PAUSE_WHEN_HIDDEN) return;
        if (!stream) return;

        if (document.hidden) {
            if (ui.liveDetectedName) ui.liveDetectedName.textContent = "—";
        } else {
            runLiveScanOnce();
        }
    });
}

// ---------------- Init ----------------
(async function init() {
    // ✅ Force threshold UI fixed at 0.35 and disable slider
    if (ui.threshold) {
        ui.threshold.value = String(FIXED_MATCH_THRESHOLD);
        ui.threshold.min = String(FIXED_MATCH_THRESHOLD);
        ui.threshold.max = String(FIXED_MATCH_THRESHOLD);
        ui.threshold.step = "0.01";
        ui.threshold.disabled = true;
    }
    updateThresholdUI();

    if (ui.datePicker) ui.datePicker.value = isoDateLocal();

    const tickClock = () => {
        const d = now();
        if (ui.tzLabel) {
            ui.tzLabel.textContent = `Timezone: ${
                Intl.DateTimeFormat().resolvedOptions().timeZone || "local"
            }`;
        }
        if (ui.nowLabel)
            ui.nowLabel.textContent = `Now: ${isoDateLocal(d)} ${timeLocal(d)}`;

        // ✅ keep buttons correct
        updateCheckButtonsState();
        syncAutoCheckIn();
    };
    tickClock();
    setInterval(tickClock, 1000);

    bindEvents();
    applyAdminUiState();
    renderProfiles();
    renderLogs();
    renderAdminRoster();
    updateCheckButtonsState();

    try {
        const ok = await waitForFaceApi();
        if (!ok)
            throw new Error(
                "face-api.js did not load (timeout). Check script tag + network."
            );

        faceapi = window.faceapi;

        await loadModels();

        appendStatus(
            "Ready. Start camera. When it detects 1 face, it will show the person's NAME on the box if registered."
        );
        appendStatus("If not registered, the box will say: Not registered.");
        appendStatus(
            "AUTO check-in runs every 2 seconds when 1 registered face is visible."
        );
        appendStatus("Check-out is MANUAL (must click the button).");

        appendStatus(
            `✅ New rule: TIME-OUT will be recorded on the employee's last TIME-IN date (shift date). Example: Jan 16 10PM in, Jan 17 7AM out => recorded under Jan 16.`
        );

        appendStatus(
            `Fallback window (only if last time-in date can't be resolved): OUT before ${String(
                OVERNIGHT_CUTOFF_HOUR
            ).padStart(2, "0")}:59 will be treated as previous date.`
        );

        appendStatus(
            `Lite mode: live inputSize=${PERF.LIVE_INPUT_SIZE}, interval=${PERF.LIVE_SCAN_INTERVAL_MS}ms, landmarks=${
                PERF.DRAW_LANDMARKS ? "ON" : "OFF"
            }`
        );

        appendStatus(
            `✅ Threshold fixed at ${FIXED_MATCH_THRESHOLD.toFixed(
                2
            )} (slider disabled)`
        );
    } catch (e) {
        setModelPill("error", "Model load failed");
        setStatus(`Model load failed: ${e?.message || e}`);
        appendStatus(`Model load failed: ${e?.message || e}`);
    }
})();

function statusLabel(v) {
    const s = String(v || "present");
    if (s === "present") return "Present";
    if (s === "absent") return "Absent";
    if (s === "half_day") return "Half day";
    if (s === "day_off") return "Day off";
    return "Present";
}

/**
 * Export status lookup:
 * - Try by user_id first (best)
 * - fallback to name
 * - default Present
 */
function getRosterStatusForExport(dateStr, userId, name) {
    const uid = userId != null ? String(userId) : "";
    const nm = name != null ? String(name) : "";

    const byId = uid ? getStatusFor(dateStr, uid) : "";
    if (byId) return statusLabel(byId);

    const byName = nm ? getStatusFor(dateStr, nm) : "";
    if (byName) return statusLabel(byName);

    return "Present";
}

(function() {
            const ROLE_LABELS = {
                "1": "ADMIN",
                "2": "IT",
                "3": "CSR",
                "4": "TECHNICAL",
            };

            function escapeHtml(s) {
                return String(s ?? "")
                    .replaceAll("&", "&amp;")
                    .replaceAll("<", "&lt;")
                    .replaceAll(">", "&gt;")
                    .replaceAll('"', "&quot;")
                    .replaceAll("'", "&#039;");
            }

            function safeJsonParse(str, fallback) {
                try {
                    const v = JSON.parse(str);
                    return v ?? fallback;
                } catch (e) {
                    return fallback;
                }
            }

            // ✅ Your app.js storage key (and fallbacks)
            function detectProfilesKey() {
                const candidates = [
                    "fb_attendance_profiles_v1", // ✅ from app.js
                    "fa_profiles",
                    "fa_face_profiles",
                    "face_profiles",
                    "profiles",
                ];

                for (const key of candidates) {
                    const raw = localStorage.getItem(key);
                    if (!raw) continue;
                    const arr = safeJsonParse(raw, null);
                    if (Array.isArray(arr)) return key;
                }

                // fallback: scan localStorage keys that look like profiles
                for (let i = 0; i < localStorage.length; i++) {
                    const k = localStorage.key(i);
                    if (!k) continue;
                    if (!/profile/i.test(k)) continue;
                    const raw = localStorage.getItem(k);
                    const arr = safeJsonParse(raw, null);
                    if (Array.isArray(arr)) return k;
                }

                return "fb_attendance_profiles_v1";
            }

            // ✅ Normalize role id from MANY shapes (this is where your filter was failing)
            function normalizeRoleId(p) {
                if (!p) return "";

                // numeric direct
                const direct =
                    p.role_id ?? p.roleId ?? p.roleID ?? p.user_role_id ?? p.userRoleId ??
                    p.user?.role_id ?? p.user?.roleId ?? "";

                if (String(direct).match(/^\d+$/)) return String(direct);

                // role object: {id, name}
                const roleObj = p.role ?? p.user?.role ?? null;
                if (roleObj && typeof roleObj === "object") {
                    const rid = roleObj.id ?? roleObj.role_id ?? roleObj.roleId ?? "";
                    if (String(rid).match(/^\d+$/)) return String(rid);

                    const rname = roleObj.name ?? roleObj.role_name ?? "";
                    const upper = String(rname || "").trim().toUpperCase();
                    for (const [id, label] of Object.entries(ROLE_LABELS)) {
                        if (label === upper) return id;
                    }
                }

                // string role name: "CSR" -> id
                const nameLike =
                    p.role_name ?? p.roleName ?? p.role ?? p.user?.role_name ?? p.user?.roleName ?? "";

                const upper = String(nameLike || "").trim().toUpperCase();
                for (const [id, label] of Object.entries(ROLE_LABELS)) {
                    if (label === upper) return id;
                }

                return "";
            }

            function normalizeName(p) {
                return p?.name ?? p?.full_name ?? p?.fullName ?? p?.user?.name ?? "—";
            }

            function normalizeContact(p) {
                return p?.contact ?? p?.contact_number ?? p?.phone ?? p?.mobile ?? p?.user?.contact_number ?? "";
            }

            function normalizeRoleLabel(p) {
                const rid = normalizeRoleId(p);
                if (rid && ROLE_LABELS[rid]) return ROLE_LABELS[rid];

                // fall back to any label we can find
                const nameLike =
                    p?.role_name ?? p?.roleName ?? p?.role?.name ?? p?.role ?? p?.user?.role?.name ?? "—";
                return String(nameLike || "—").toUpperCase();
            }

            async function fetchDbProfiles() {
                try {
                    const res = await fetch("/api/face/profiles", { headers: { "Accept": "application/json" } });
                    if (!res.ok) return { ok: false, profiles: [], info: `DB: HTTP ${res.status}` };
                    const data = await res.json();

                    // Accept common shapes:
                    // {profiles:[...]} OR {data:[...]} OR [...]
                    const profiles =
                        Array.isArray(data) ? data :
                        Array.isArray(data?.profiles) ? data.profiles :
                        Array.isArray(data?.data) ? data.data :
                        Array.isArray(data?.profiles?.data) ? data.profiles.data :
                        Array.isArray(data?.data?.data) ? data.data.data :
                        [];

                    return { ok: true, profiles, info: `DB: ${profiles.length}` };
                } catch (e) {
                    return { ok: false, profiles: [], info: `DB: error` };
                }
            }

            function getLocalProfiles() {
                const key = detectProfilesKey();
                const raw = localStorage.getItem(key);
                const arr = safeJsonParse(raw || "[]", []);
                return { key, profiles: Array.isArray(arr) ? arr : [] };
            }

            async function renderRoster() {
                const listEl = document.getElementById("adminRosterList");
                const countEl = document.getElementById("rosterCount");
                const filterEl = document.getElementById("rosterRoleFilter");
                const infoEl = document.getElementById("rosterSourceInfo");

                if (!listEl || !countEl || !filterEl) return;

                const filterRole = String(filterEl.value || "");

                // ✅ DB first
                const db = await fetchDbProfiles();

                // ✅ Local fallback
                const local = getLocalProfiles();

                const sourceProfiles = db.ok && db.profiles.length ? db.profiles : local.profiles;
                const sourceLabel = db.ok && db.profiles.length ? db.info : `Local(${local.key}): ${local.profiles.length}`;

                if (infoEl) infoEl.textContent = `Source: ${sourceLabel}`;

                const filtered = sourceProfiles.filter(p => {
                    if (!filterRole) return true;
                    return normalizeRoleId(p) === filterRole;
                });

                countEl.textContent = String(filtered.length);

                if (!filtered.length) {
                    const label = filterRole ? (ROLE_LABELS[filterRole] || "Selected role") : "All roles";
                    listEl.innerHTML = `
                        <div class="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                            No registered employee found for: <span class="font-semibold text-slate-100">${escapeHtml(label)}</span>
                        </div>
                    `;
                    return;
                }

                // consistent sorting by role then name
                filtered.sort((a, b) => {
                    const ra = normalizeRoleLabel(a);
                    const rb = normalizeRoleLabel(b);
                    if (ra !== rb) return ra.localeCompare(rb);
                    return normalizeName(a).localeCompare(normalizeName(b));
                });

                listEl.innerHTML = filtered.map((p, idx) => {
                    const name = normalizeName(p);
                    const contact = normalizeContact(p);
                    const roleLabel = normalizeRoleLabel(p);

                    return `
                        <div class="rounded-2xl border border-white/10 bg-slate-950/40 p-3">
                            <div class="flex items-start justify-between gap-3">
                                <div class="min-w-0">
                                    <div class="text-sm font-semibold text-slate-100 truncate">${escapeHtml(name)}</div>
                                    <div class="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-slate-300">
                                        <span class="inline-flex items-center rounded-full bg-white/10 px-2 py-0.5">
                                            ${escapeHtml(roleLabel)}
                                        </span>
                                        ${contact ? `<span class="opacity-90">📞 ${escapeHtml(contact)}</span>` : ``}
                                    </div>
                                </div>
                                <div class="text-[11px] text-slate-400">#${idx + 1}</div>
                            </div>
                        </div>
                    `;
                }).join("");
            }

            // Expose so app.js or other scripts can trigger refresh after enroll/import
            window.renderRosterByRole = renderRoster;

            document.addEventListener("DOMContentLoaded", () => {
                const filterEl = document.getElementById("rosterRoleFilter");
                if (filterEl) {
                    filterEl.addEventListener("change", renderRoster);
                }

                // refresh when profile-ish keys change
                try {
                    const originalSetItem = localStorage.setItem;
                    localStorage.setItem = function(k, v) {
                        originalSetItem.apply(this, arguments);
                        const kk = String(k || "").toLowerCase();
                        if (kk.includes("profile") || kk.includes("attendance_profiles")) {
                            renderRoster();
                        }
                    };
                } catch (e) {}

                renderRoster();
            });
        })();

        // SweetAlert helper used by app.js 
    
        window.confirmTimeInSwal = async function(name) {
            if (!window.Swal) {
                return window.confirm(`Confirm TIME-IN?\n\nName: ${name}`);
            }

            const result = await window.Swal.fire({
                title: "Confirm Check-In?",
                html: `<div style="font-size:14px;line-height:1.4">
                        <div style="opacity:.85">Detected employee:</div>
                        <div style="margin-top:6px;font-weight:700;color:#34d399">${String(name || "—")}</div>
                       </div>`,
                icon: "question",
                showCancelButton: true,
                confirmButtonText: "Yes, Check-In",
                cancelButtonText: "Cancel",
                reverseButtons: true,
                focusCancel: true,
            });

            return !!result.isConfirmed;
        };

        // Theme boot (runs BEFORE paint to prevent flashing)
        (function() {
            const KEY = "fa_theme"; // "dark" | "light"
            const stored = localStorage.getItem(KEY);
            const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
            const theme = stored || (prefersDark ? "dark" : "light");

            document.documentElement.classList.toggle("dark", theme === "dark");
        })();


        // ✅ Always show "Set Status" dropdown even after role filtering (NO HTML changes)
(function ensureRosterStatusAlwaysVisible() {
    function buildStatusSelect(dateStr, userKey, displayName) {
        const wrap = document.createElement("div");
        wrap.className = "shrink-0";

        const sel = document.createElement("select");
        sel.setAttribute("data-roster-key", String(userKey));
        sel.className =
            "rounded-xl bg-black border border-white/10 px-3 py-2 text-xs text-slate-100";

        sel.innerHTML = `
            <option value="present">Set Status</option>
            <option value="absent">Absent</option>
            <option value="half_day">Half day</option>
            <option value="day_off">Day off</option>
        `;

        // set current value from store
        try {
            sel.value = getStatusFor(dateStr, userKey) || "present";
        } catch (e) {
            sel.value = "present";
        }

        sel.addEventListener("change", () => {
            const v = sel.value || "present";
            setStatusFor(dateStr, userKey, v);

            // optional: if you have appendStatus()
            if (typeof appendStatus === "function") {
                appendStatus(`Roster: ${displayName} = ${String(v).replaceAll("_", " ")}`);
            }
        });

        wrap.appendChild(sel);
        return wrap;
    }

    function findNameFromCard(card) {
        // Try common "name" targets (adjusts to your existing card markup)
        const candidates = [
            card.querySelector(".text-sm.font-semibold"),
            card.querySelector(".font-semibold"),
            card.querySelector("[data-name]"),
        ].filter(Boolean);

        const el = candidates[0] || null;
        const name = (el?.textContent || "").trim();
        return name || "";
    }

    function injectStatusDropdowns() {
        const list = document.getElementById("adminRosterList");
        if (!list) return;

        const dateStr = document.getElementById("datePicker")?.value || (typeof isoDateLocal === "function" ? isoDateLocal() : "");

        // Each "card" is a direct child in your #adminRosterList
        const cards = Array.from(list.children || []);
        for (const card of cards) {
            if (!(card instanceof HTMLElement)) continue;

            // Already has status select? just ensure it has correct value for current date
            const existing = card.querySelector('select[data-roster-key]');
            if (existing) {
                const key = existing.getAttribute("data-roster-key") || "";
                try {
                    existing.value = getStatusFor(dateStr, key) || "present";
                } catch (e) {
                    existing.value = existing.value || "present";
                }
                continue;
            }

            // Build key from displayed name (works if names are unique in your roster)
            const displayName = findNameFromCard(card);
            if (!displayName) continue;

            const userKey = displayName; // use name as key (matches your localStorage approach)

            const selWrap = buildStatusSelect(dateStr, userKey, displayName);

            // Try to attach to an existing top row if it's flex/justify-between, else append neatly.
            const topRow =
                card.querySelector(".flex.items-center.justify-between") ||
                card.querySelector(".flex.items-start.justify-between") ||
                card.querySelector(".flex.justify-between");

            if (topRow) {
                topRow.appendChild(selWrap);
            } else {
                // fallback: append at bottom
                selWrap.classList.add("mt-2");
                card.appendChild(selWrap);
            }
        }
    }

    // Run once on load
    document.addEventListener("DOMContentLoaded", () => {
        injectStatusDropdowns();

        // Re-inject whenever roster list changes (e.g., role filtering rerenders)
        const list = document.getElementById("adminRosterList");
        if (!list) return;

        const mo = new MutationObserver(() => injectStatusDropdowns());
        mo.observe(list, { childList: true, subtree: true });

        // Also run whenever role filter changes (extra safety)
        const roleFilter = document.getElementById("rosterRoleFilter");
        if (roleFilter) {
            roleFilter.addEventListener("change", () => {
                // wait for whatever render happens, then inject
                setTimeout(injectStatusDropdowns, 0);
            });
        }
    });

    // If you call renderAdminRoster() manually anywhere, you can also call:
    // injectStatusDropdowns();
})();
