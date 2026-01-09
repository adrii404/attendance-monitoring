import "./bootstrap";
import ExcelJS from "exceljs";
import { saveAs } from "file-saver";

/* app.js (FULL) — CPU/Lite version (no GPU, 16GB RAM friendly)
 * ✅ LIVE name while detecting:
 * - If EXACTLY 1 face AND registered -> show NAME on face box + live label
 * - If face is not registered -> show "Not registered"
 * - If 2+ faces -> show "Multiple faces"
 *
 * ✅ Lite optimizations (CPU-friendly):
 * - Lower camera resolution (default 640x480 ideal)
 * - Live scan uses smaller detector inputSize + slower interval (less CPU)
 * - Live loop uses setInterval (no requestAnimationFrame busy loop)
 * - Landmarks drawing is OFF by default (big CPU saver) — toggle via PERF.DRAW_LANDMARKS
 * - Action scans (button clicks): strict, moderate inputSize
 * - Smaller stored photos to reduce memory/storage pressure
 *
 * ✅ NEW RULE:
 * - AUTO CAPTURE for CHECK-IN only (every 2 seconds) when 1 registered face is seen
 * - CHECK-OUT must be clicked via button (manual)
 *
 * ✅ NEW:
 * - Role shown in Logs table
 * - Excel export includes role
 * - Excel export groups rows into separate TABLE SECTIONS per ROLE (same worksheet)
 */

const MODELS_URL =
  "https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights";

const STORAGE_PROFILES = "fb_attendance_profiles_v1"; // legacy fallback
const STORAGE_LOGS = "fb_attendance_logs_v1"; // UI-only quick view (DB is the truth)
const STORAGE_ADMIN_HASH = "fb_attendance_admin_pw_hash_v1";
const STORAGE_ADMIN_SESSION = "fb_attendance_admin_session_v1";

const el = (id) => document.getElementById(id);

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
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
  btnDownloadDayJson: el("btnDownloadDayJson"),
  btnClearDay: el("btnClearDay"),

  btnDownloadDayXlsx: el("btnDownloadDayXlsx"),

  logsTbody: el("logsTbody"),
  logsCount: el("logsCount"),

  btnClearAll: el("btnClearAll"),
  btnChangePw: el("btnChangePw"),

  modelStatusText: el("modelStatusText"),
  statusDot: el("statusDot"),

  btnExportProfiles: el("btnExportProfiles"),
  importProfiles: el("importProfiles"),

  liveDetectedName: el("liveDetectedName"),

  btnAdminToggle: el("btnAdminToggle"),
  adminPanel: el("adminPanel"),

  pwModal: el("pwModal"),
  pwModalTitle: el("pwModalTitle"),
  pwModalDesc: el("pwModalDesc"),
  pwModalInput: el("pwModalInput"),
  pwModalCancel: el("pwModalCancel"),
  pwModalOk: el("pwModalOk"),

  toastList: el("toastList"),
};

// ---------------- Lite/Performance knobs ----------------
const PERF = {
  LIVE_INPUT_SIZE: 160,
  LIVE_SCORE_THRESHOLD: 0.5,
  LIVE_SCAN_INTERVAL_MS: 650,

  ACTION_INPUT_SIZE: 224,
  ACTION_SCORE_THRESHOLD: 0.5,

  AUTO_CHECKIN_INTERVAL_MS: 2000,
  AUTO_CHECKIN_SAME_USER_COOLDOWN_MS: 8000,

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
let liveSingle = {
  matched: false,
  userId: null,
  name: null,
  updatedAt: 0,
};

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
        <span class="${actionClass} font-semibold">${escapeHtml(action || "—")}</span>
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

    setTimeout(() => {
      wrap.remove();
    }, 520);
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
      lastServerMatchResult = { matched: false, user: null, distance: null };
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
let facingMode = "user"; // or "environment"
let modelsReady = false;

let scanInProgress = false;
let liveTimer = null;

let adminUnlockedThreshold = false;
let lastThresholdValue = null;

let attendanceInProgress = false;

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

function updateThresholdUI() {
  if (!ui.thresholdVal || !ui.threshold) return;
  ui.thresholdVal.textContent = Number(ui.threshold.value).toFixed(2);
}

function setThresholdValue(v) {
  if (!ui.threshold) return;
  ui.threshold.value = String(v);
  updateThresholdUI();
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

function isSelectedDateToday() {
  const selected = ui.datePicker?.value || isoDateLocal();
  return selected === isoDateLocal();
}

function updateCheckButtonsState() {
  if (!ui.btnCheckIn || !ui.btnCheckOut) return;

  const ok = isSelectedDateToday();

  ui.btnCheckIn.disabled = !ok;
  ui.btnCheckOut.disabled = !ok;

  const baseOn = "rounded-2xl px-3 py-3 text-sm font-semibold text-slate-950";
  const baseOff =
    "rounded-2xl px-3 py-3 text-sm font-semibold text-slate-400 cursor-not-allowed opacity-60";

  ui.btnCheckIn.className = ok
    ? `${baseOn} bg-sky-400/90 hover:bg-sky-300`
    : `${baseOff} bg-white/10`;

  ui.btnCheckOut.className = ok
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

  adminUnlockedThreshold = on;

  if (!on && lastThresholdValue !== null) {
    setThresholdValue(lastThresholdValue);
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
    appendStatus("Storage warning: Failed to save profiles (quota/storage error).");
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
    appendStatus("Storage warning: Failed to save logs (quota/storage error).");
}

function getLogsForDate(dateStr) {
  const logs = getLogs();
  const arr = logs[dateStr];
  return Array.isArray(arr) ? arr : [];
}

function addLog(dateStr, record) {
  const logs = getLogs();
  if (!Array.isArray(logs[dateStr])) logs[dateStr] = [];
  logs[dateStr].push(record);
  saveLogs(logs);
}

// ✅ one row per person per day summary (INCLUDES ROLE)
function buildDaySummary(dateStr) {
  const logs = getLogsForDate(dateStr);
  const map = new Map();

  for (const r of logs) {
    if (!r || !r.name) continue;

    if (!map.has(r.name)) {
      map.set(r.name, {
        name: r.name,
        role: r.role || "Unknown",
        time_in: null,
        time_out: null,
        photo_in: null,
        photo_out: null,
      });
    }

    const item = map.get(r.name);

    // keep a role if we have it
    if (!item.role || item.role === "Unknown") {
      if (r.role) item.role = r.role;
    }

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

// ---------------- Face API setup ----------------
async function loadModels() {
  setModelPill("loading", "Loading models…");
  appendStatus("Loading face-api models… (first load can take a while)");

  await faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URL);
  await faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URL);
  await faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URL);

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
      liveSingle = { matched: false, userId: null, name: null, updatedAt: nowMs };
      resetScanProgress();
      return;
    }

    const labels = new Array(count).fill("");

    if (count > 1) {
      for (let i = 0; i < count; i++) labels[i] = "Multiple faces";
      drawResultsWithLabels(results, labels, { strokeStyle: RED });
      if (ui.liveDetectedName) ui.liveDetectedName.textContent = "Multiple faces";
      liveSingle = { matched: false, userId: null, name: null, updatedAt: nowMs };
      resetScanProgress();
      return;
    }

    const threshold = Number(ui.threshold?.value ?? 0.55);
    const d = results[0]?.descriptor || null;

    if (!d) {
      labels[0] = "Face detected";
      drawResultsWithLabels(results, labels, { strokeStyle: BLUE });
      if (ui.liveDetectedName) ui.liveDetectedName.textContent = "Face detected";
      liveSingle = { matched: false, userId: null, name: null, updatedAt: nowMs };
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
          Math.min(100, Math.round((elapsed / PERF.AUTO_CHECKIN_INTERVAL_MS) * 100))
        );
      } else {
        scanProgressPct = 0;
      }

      const isFlashGreen = nowMs < scanSuccessFlashUntil;
      const isReadyGreen = scanProgressPct >= 100;
      const strokeStyle = isFlashGreen || isReadyGreen ? GREEN : BLUE;

      const labelText = `${resp.user.name} ${scanProgressPct}%`;
      labels[0] = labelText;

      if (ui.liveDetectedName) ui.liveDetectedName.textContent = labelText;

      liveSingle = {
        matched: true,
        userId: uid,
        name: resp.user.name,
        updatedAt: nowMs,
      };

      drawResultsWithLabels(results, labels, { strokeStyle });
    } else {
      labels[0] = "Not registered";
      if (ui.liveDetectedName) ui.liveDetectedName.textContent = "Not registered";

      liveSingle = { matched: false, userId: null, name: null, updatedAt: nowMs };
      resetScanProgress();

      drawResultsWithLabels(results, labels, { strokeStyle: RED });
    }
  } catch {
  } finally {
    scanInProgress = false;
  }
}

function startLiveLoop() {
  if (liveTimer) return;
  liveTimer = setInterval(() => {
    runLiveScanOnce();
  }, PERF.LIVE_SCAN_INTERVAL_MS);
}

function stopLiveLoop() {
  if (liveTimer) clearInterval(liveTimer);
  liveTimer = null;
}

// ---------------- AUTO CHECK-IN ONLY ----------------
function shouldAutoCheckInNow() {
  if (!stream || !modelsReady) return false;
  if (!isSelectedDateToday()) return false;
  if (PERF.PAUSE_WHEN_HIDDEN && document.hidden) return false;

  if (!liveSingle.matched || !liveSingle.userId) return false;
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
  if (stream && isSelectedDateToday()) startAutoCheckIn();
  else stopAutoCheckIn();
}

// ---------------- Camera ----------------
async function startCamera() {
  if (stream) return;
  if (!ui.video) return;

  unlockSpeech();

  if (!navigator.mediaDevices?.getUserMedia) {
    setStatus("Your browser does not support camera access (getUserMedia).");
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

  liveSingle = { matched: false, userId: null, name: null, updatedAt: Date.now() };
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
          No enrolled profiles yet.
        </div>`;
      return;
    }

    for (const p of profiles) {
      const row = document.createElement("div");
      row.className =
        "flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3";
      row.innerHTML = `
        <div class="min-w-0">
          <div class="text-sm font-semibold truncate">${escapeHtml(
            p.name || "User " + p.user_id
          )}</div>
          <div class="text-[11px] text-slate-400 font-mono truncate">user_id: ${
            p.user_id
          } • face_profile_id: ${p.face_profile_id}</div>
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
        Enrolled list is empty (local).<br/>
        If you're using DB enrollment, add GET <span class="font-mono text-[11px]">/api/face/profiles</span> to show DB profiles.
      </div>`;
    return;
  }

  for (const p of profiles) {
    const row = document.createElement("div");
    row.className =
      "flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-3";
    row.innerHTML = `
      <div class="min-w-0">
        <div class="text-sm font-semibold truncate">${escapeHtml(p.name)}</div>
        <div class="text-[11px] text-slate-400 font-mono truncate">${escapeHtml(
          p.id
        )}</div>
      </div>
      <div class="flex items-center gap-2">
        <button data-del="${escapeHtml(
          p.id
        )}" class="rounded-xl bg-rose-500/20 px-3 py-2 text-xs font-semibold text-rose-200 hover:bg-rose-500/30">Delete</button>
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
    });
  });
}

function extractRoleFromUser(user) {
  // supports many possible shapes
  return (
    user?.role_name ||
    user?.role?.name ||
    user?.role?.title ||
    user?.role ||
    user?.roleLabel ||
    "Unknown"
  );
}

async function renderLogs() {
  if (!ui.logsTbody || !ui.logsCount || !ui.datePicker) return;

  const dateStr = ui.datePicker.value || isoDateLocal();

  const server = await safeFetchJson(
    `/api/attendance/logs?date=${encodeURIComponent(dateStr)}`,
    { method: "GET" }
  );

  // DB-backed logs (if your endpoint returns role, it will show; else "—")
  if (server.ok && Array.isArray(server.data?.logs)) {
    const logs = server.data.logs;

    const map = new Map();

    for (const r of logs) {
      const name = r.name || "User " + r.user_id;
      if (!map.has(name)) {
        map.set(name, {
          name,
          role: r.role_name || r.role || r.role_label || "Unknown",
          time_in: null,
          time_out: null,
          photo_in: null,
          photo_out: null,
        });
      }
      const item = map.get(name);

      if (!item.role || item.role === "Unknown") {
        const rr = r.role_name || r.role || r.role_label;
        if (rr) item.role = rr;
      }

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
          <td class="px-3 py-3 text-slate-400" colspan="5">No logs for ${dateStr}.</td>
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
        <td class="px-3 py-2 text-[11px] text-slate-300">${escapeHtml(r.role || "—")}</td>
        <td class="px-3 py-2">
          <span class="text-slate-500 text-[11px]">—</span>
        </td>
      `;
      ui.logsTbody.appendChild(tr);
    }

    return;
  }

  // Fallback to local UI cache
  const rows = buildDaySummary(dateStr);

  ui.logsCount.textContent = String(rows.length);
  ui.logsTbody.innerHTML = "";

  if (!rows.length) {
    ui.logsTbody.innerHTML = `
      <tr>
        <td class="px-3 py-3 text-slate-400" colspan="5">No logs for ${dateStr}.</td>
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
      <td class="px-3 py-2 text-[11px] text-slate-300">${escapeHtml(r.role || "Unknown")}</td>
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
  updateCheckButtonsState();
  syncAutoCheckIn();
}

// ---------------- Attendance actions ----------------
async function enroll() {
  const name = (ui.enrollName?.value || "").trim();
  const contact_number = (ui.enrollContact?.value || "").trim();
  const password = (ui.enrollPassword?.value || "").trim();
  const roleId = Number(ui.enrollRole?.value || 0);

  if (!name) {
    appendStatus("Enroll: Please enter a name.");
    return;
  }
  if (!contact_number) {
    appendStatus("Enroll: Please enter a contact number.");
    return;
  }
  if (!password || password.length < 8) {
    appendStatus("Enroll: Password must be at least 8 characters.");
    return;
  }
  if (!roleId) {
    appendStatus("Enroll: Please select a role.");
    return;
  }
  if (!stream) {
    appendStatus("Enroll: Start the camera first.");
    return;
  }
  if (!modelsReady) {
    appendStatus("Enroll: Models not ready yet.");
    return;
  }

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

  const threshold = Number(ui.threshold?.value ?? 0.55);

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
}

async function attendance(type, opts = { auto: false }) {
  const isAuto = !!opts?.auto;
  const dateStr = ui.datePicker?.value || isoDateLocal();

  if (attendanceInProgress) return;
  attendanceInProgress = true;

  try {
    if (dateStr !== isoDateLocal()) {
      if (!isAuto) {
        appendStatus("Range view is read-only. Set date to TODAY to log.");
        appendStatus("Check In/Out works ONLY on TODAY.");
      }
      return;
    }

    if (!stream) {
      if (!isAuto) appendStatus(`${type}: Start the camera first.`);
      return;
    }

    if (!modelsReady) {
      if (!isAuto) appendStatus(`${type}: Models not ready yet.`);
      return;
    }

    const threshold = Number(ui.threshold?.value ?? 0.55);

    if (!isSelectedDateToday()) {
      if (!isAuto) appendStatus("Check In/Out is disabled for past dates.");
      return;
    }

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

    const photo = capturePhotoDataUrlScaled(
      PERF.PHOTO_LOG_MAX_WIDTH,
      PERF.PHOTO_LOG_QUALITY
    );

    const apiType = type === "check-in" ? "in" : "out";

    const r = await safeFetchJson("/api/attendance/clock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: apiType,
        descriptor: Array.from(scan.descriptor),
        threshold,
        device_id: "kiosk-1",
        photo_data_url: photo || null,
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

    const userId = r.data?.user?.id ?? null;
    const name = r.data?.user?.name || "Unknown";
    const role = extractRoleFromUser(r.data?.user);

    if (type === "check-in") {
      scanSuccessFlashUntil = Date.now() + 1200;
      resetScanProgress();
    }

    if (isAuto && userId) {
      lastAutoCheckInUserId = userId;
      lastAutoCheckInAt = Date.now();
    }

    if (!isAuto) appendStatus(`${type}: Saved ✅ (${name})`);

    const say = type === "check-in" ? "time in" : "time out";
    if (name && name !== "Unknown") speak(`${name} ${say}`);
    else speak("Unknown face. Please scan again.");

    const actionLabel = type === "check-in" ? "Time-In" : "Time-Out";

    showRightToast({
      name,
      date: dateStr,
      time: timeLocal(now()),
      action: actionLabel,
      photoDataUrl: photo || null,
    });

    // ✅ store ROLE in local UI cache
    addLog(dateStr, {
      name,
      role: role || "Unknown",
      type,
      time: timeLocal(now()),
      photo_data_url: photo || null,
      server_log_id: r.data?.log_id ?? null,
    });

    renderLogs();
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

  const headers = ["name", "role", "type", "time", "photo_data_url"];
  const lines = [headers.join(",")];

  for (const r of logs) {
    const row = [
      (r?.name || "").replaceAll('"', '""'),
      (r?.role || "").replaceAll('"', '""'),
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

// ---------------- ✅ Excel export (XLSX) — separated TABLES per ROLE ----------------
function parseImageDataUrl(dataUrl) {
  const s = String(dataUrl || "");
  const m = s.match(/^data:image\/(png|jpeg|jpg);base64,(.+)$/i);
  if (!m) return null;

  let ext = (m[1] || "").toLowerCase();
  if (ext === "jpg") ext = "jpeg";
  return { extension: ext, base64: m[2] };
}

function groupByRole(rows) {
  const groups = new Map();
  for (const r of rows) {
    const role = (r.role || "Unknown").trim() || "Unknown";
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role).push(r);
  }

  const sortedRoles = Array.from(groups.keys()).sort((a, b) => {
    if (a === "Unknown") return 1;
    if (b === "Unknown") return -1;
    return a.localeCompare(b);
  });

  return { groups, sortedRoles };
}

function thinBorder() {
  return {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };
}

function applyBorderRange(ws, r1, r2, c1, c2) {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      ws.getCell(r, c).border = thinBorder();
    }
  }
}

// Writes one "role table" section and returns next row index
function writeRoleSection({ wb, ws, startRow, roleName, rows }) {
  let r = startRow;

  // Title row (merged across A..E)
  ws.mergeCells(r, 1, r, 5);
  const titleCell = ws.getCell(r, 1);
  titleCell.value = `ROLE: ${roleName}`;
  titleCell.font = { bold: true, size: 12 };
  titleCell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(r).height = 20;

  r += 1;

  // Header row
  const headerRow = ws.getRow(r);
  headerRow.values = ["Name", "Role", "Time In", "Time Out", "Photo"];
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle", horizontal: "left" };
  headerRow.height = 18;

  r += 1;

  const firstDataRow = r;

  for (let i = 0; i < rows.length; i++) {
    const item = rows[i];
    const rowNum = r + i;

    ws.getCell(rowNum, 1).value = item.name || "";
    ws.getCell(rowNum, 2).value = item.role || "Unknown";
    ws.getCell(rowNum, 3).value = item.time_in || "";
    ws.getCell(rowNum, 4).value = item.time_out || "";
    ws.getCell(rowNum, 5).value = "";

    const excelRow = ws.getRow(rowNum);
    excelRow.height = 52;
    excelRow.alignment = { vertical: "middle", horizontal: "left" };

    const photo = item.photo_in || item.photo_out || null;
    const img = parseImageDataUrl(photo);
    if (img) {
      const imageId = wb.addImage({
        base64: img.base64,
        extension: img.extension,
      });

      // Photo column = E => col=4 (0-based); row=(rowNum-1)
      ws.addImage(imageId, {
        tl: { col: 4, row: rowNum - 1 },
        ext: { width: 72, height: 48 },
      });
    }
  }

  const lastDataRow = firstDataRow + rows.length - 1;

  // Borders (header + data)
  applyBorderRange(ws, startRow + 1, startRow + 1, 1, 5);
  if (rows.length) applyBorderRange(ws, firstDataRow, lastDataRow, 1, 5);

  // Blank row after section
  return (rows.length ? lastDataRow : (firstDataRow - 1)) + 2;
}

async function downloadDayXlsx() {
  const dateStr = ui.datePicker?.value || isoDateLocal();

  // ✅ One row per person per day (includes role)
  const rows = buildDaySummary(dateStr);

  if (!rows.length) {
    appendStatus(`Excel: No logs for ${dateStr}.`);
    return;
  }

  const wb = new ExcelJS.Workbook();
  wb.creator = "Face Attendance";
  wb.created = new Date();

  const ws = wb.addWorksheet(`By Role ${dateStr}`.slice(0, 31));

  // Column widths (A..E)
  ws.columns = [
    { header: "Name", key: "name", width: 28 },
    { header: "Role", key: "role", width: 16 },
    { header: "Time In", key: "time_in", width: 14 },
    { header: "Time Out", key: "time_out", width: 14 },
    { header: "Photo", key: "photo", width: 16 },
  ];

  const { groups, sortedRoles } = groupByRole(rows);

  let nextRow = 1;

  // Write each role as a separated table section (same sheet)
  for (const role of sortedRoles) {
    const roleRows = groups.get(role) || [];
    nextRow = writeRoleSection({
      wb,
      ws,
      startRow: nextRow,
      roleName: role,
      rows: roleRows,
    });
  }

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  saveAs(blob, `attendance_${dateStr}_role_tables.xlsx`);
  appendStatus(`Excel exported ✅ attendance_${dateStr}_role_tables.xlsx`);
}

// ---------------- Clear logs ----------------
async function clearDay() {
  const ok = await requireAdmin("Clear logs for selected day");
  if (!ok) return;

  const dateStr = ui.datePicker?.value || isoDateLocal();
  const logs = getLogs();
  delete logs[dateStr];
  saveLogs(logs);

  appendStatus(`Cleared logs for ${dateStr}`);
  renderLogs();
}

async function clearAll() {
  const ok = await requireAdmin("Reset ALL local data (UI cache + legacy profiles)");
  if (!ok) return;

  localStorage.removeItem(STORAGE_PROFILES);
  localStorage.removeItem(STORAGE_LOGS);

  appendStatus("Local reset done ✅ (DB data remains).");
  renderProfiles();
  renderLogs();
}

// ---------------- Threshold gating ----------------
function gateThresholdEvents() {
  if (!ui.threshold) return;

  ui.threshold.addEventListener("mousedown", async () => {
    if (adminUnlockedThreshold) return;

    const ok = await requireAdmin("Unlock threshold slider");
    if (ok) {
      adminUnlockedThreshold = true;
      setAdminLoggedIn(true);
      applyAdminUiState();
      appendStatus("Threshold unlocked ✅ (admin)");
    } else {
      if (lastThresholdValue !== null) setThresholdValue(lastThresholdValue);
      appendStatus("Threshold change blocked (admin password required).");
    }
  });

  ui.threshold.addEventListener("input", () => {
    if (adminUnlockedThreshold) {
      lastThresholdValue = Number(ui.threshold.value);
      updateThresholdUI();
      return;
    }
    if (lastThresholdValue === null) lastThresholdValue = Number(ui.threshold.value);
    setThresholdValue(lastThresholdValue);
  });

  ui.threshold.addEventListener("change", () => {
    if (adminUnlockedThreshold) {
      lastThresholdValue = Number(ui.threshold.value);
      updateThresholdUI();
      appendStatus(`Threshold set to ${Number(ui.threshold.value).toFixed(2)}`);
    }
  });
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
    (p) => p && p.name && Array.isArray(p.descriptor) && p.descriptor.length === 128
  );

  saveProfiles(cleaned);
  appendStatus(`Imported ${cleaned.length} profiles ✅ (local only)`);
  renderProfiles();
}

// ---------------- Wire up ----------------
function bindEvents() {
  if (ui.btnStart) ui.btnStart.addEventListener("click", startCamera);
  if (ui.btnStop) ui.btnStop.addEventListener("click", stopCamera);
  if (ui.btnFlip) ui.btnFlip.addEventListener("click", flipCamera);

  if (ui.btnToday) ui.btnToday.addEventListener("click", setDateToToday);

  if (ui.datePicker) {
    ui.datePicker.addEventListener("change", () => {
      renderLogs();
      updateCheckButtonsState();
      syncAutoCheckIn();
    });
  }

  if (ui.btnEnroll) {
    ui.btnEnroll.addEventListener("click", (e) => {
      e.preventDefault();
      enroll().catch((err) => appendStatus(`Enroll error: ${err?.message || err}`));
    });
  }

  if (ui.btnCheckIn) {
    ui.btnCheckIn.addEventListener("click", () => {
      unlockSpeech();
      attendance("check-in", { auto: false }).catch((e) =>
        appendStatus(`Check-in error: ${e?.message || e}`)
      );
    });
  }

  if (ui.btnCheckOut) {
    ui.btnCheckOut.addEventListener("click", () => {
      unlockSpeech();
      attendance("check-out", { auto: false }).catch((e) =>
        appendStatus(`Check-out error: ${e?.message || e}`)
      );
    });
  }

  if (ui.btnDownloadDay) ui.btnDownloadDay.addEventListener("click", downloadDayCsv);

  if (ui.btnDownloadDayXlsx) {
    ui.btnDownloadDayXlsx.addEventListener("click", () => {
      downloadDayXlsx().catch((e) =>
        appendStatus(`Excel export error: ${e?.message || e}`)
      );
    });
  }

  if (ui.btnDownloadDayJson)
    ui.btnDownloadDayJson.addEventListener("click", downloadDayJson);

  if (ui.btnClearDay) {
    ui.btnClearDay.addEventListener("click", () =>
      clearDay().catch((e) => appendStatus(`Clear-day error: ${e?.message || e}`))
    );
  }

  if (ui.btnClearAll) {
    ui.btnClearAll.addEventListener("click", () =>
      clearAll().catch((e) => appendStatus(`Reset error: ${e?.message || e}`))
    );
  }

  if (ui.btnChangePw) {
    ui.btnChangePw.addEventListener("click", () => {
      setOrChangePasswordFlow().catch((e) =>
        appendStatus(`Password error: ${e?.message || e}`)
      );
    });
  }

  if (ui.btnExportProfiles)
    ui.btnExportProfiles.addEventListener("click", exportProfiles);

  if (ui.importProfiles) {
    ui.importProfiles.addEventListener("change", (ev) => {
      const file = ev.target.files?.[0];
      if (!file) return;
      importProfilesFromFile(file).catch((e) =>
        appendStatus(`Import error: ${e?.message || e}`)
      );
      ev.target.value = "";
    });
  }

  if (ui.btnAdminToggle) {
    ui.btnAdminToggle.addEventListener("click", async () => {
      if (isAdminLoggedIn()) {
        setAdminLoggedIn(false);
        adminUnlockedThreshold = false;

        if (lastThresholdValue !== null) setThresholdValue(lastThresholdValue);

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
  }

  window.addEventListener("resize", () => requestAnimationFrame(resizeOverlayToVideo));
  ui.video?.addEventListener?.("loadedmetadata", () =>
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

  gateThresholdEvents();
}

// ---------------- Init ----------------
(async function init() {
  updateThresholdUI();
  if (ui.threshold) lastThresholdValue = Number(ui.threshold.value);

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
  };
  tickClock();
  setInterval(tickClock, 1000);

  bindEvents();
  applyAdminUiState();
  renderProfiles();
  renderLogs();
  updateCheckButtonsState();

  try {
    await loadModels();
    appendStatus(
      "Ready. Start camera. When it detects 1 face, it will show the person's NAME on the box if registered."
    );
    appendStatus("If not registered, the box will say: Not registered.");
    appendStatus("AUTO check-in runs every 2 seconds when 1 registered face is visible.");
    appendStatus("Check-out is MANUAL (must click the button).");
    appendStatus("Check In/Out works ONLY on TODAY. You can still browse history by changing date.");

    appendStatus(
      `Lite mode: live inputSize=${PERF.LIVE_INPUT_SIZE}, interval=${PERF.LIVE_SCAN_INTERVAL_MS}ms, landmarks=${
        PERF.DRAW_LANDMARKS ? "ON" : "OFF"
      }`
    );
  } catch (e) {
    setModelPill("error", "Model load failed");
    setStatus(`Model load failed: ${e?.message || e}`);
  }
})();
