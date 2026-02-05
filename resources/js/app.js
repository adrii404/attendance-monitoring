import "./bootstrap";

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
 * - CHECK-IN must be clicked via button (manual)
 * - CHECK-OUT must be clicked via button (manual)
 *
 * ✅ NEW:
 * - "Request OB" modal (injects modal DOM if not present)
 * - Uses single DB column: requested_at (YYYY-MM-DD HH:mm:ss)
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
  enrollRole: el("enrollRole"),
  enrollSchedule: el("enrollSchedule"),
  pendingObBody: el("pendingObBody"),
  pendingObCount: el("pendingObCount"),

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
  btnEnroll: el("btnEnroll"),
  profilesList: el("profilesList"),
  enrolledCount: el("enrolledCount"),

  btnCheckIn: el("btnCheckIn"),
  btnCheckOut: el("btnCheckOut"),

  btnDownloadDay: el("btnDownloadDay"),
  btnDownloadDayJson: el("btnDownloadDayJson"),
  btnClearDay: el("btnClearDay"),

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

  // ✅ Request OB button (set this ID in blade)
  btnRequestOb: el("btnRequestOb"),
};

// ---------------- Lite/Performance knobs ----------------
const PERF = {
  LIVE_INPUT_SIZE: 160,
  LIVE_SCORE_THRESHOLD: 0.5,
  LIVE_SCAN_INTERVAL_MS: 650,

  ACTION_INPUT_SIZE: 224,
  ACTION_SCORE_THRESHOLD: 0.5,

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

// ✅ Live single-face matched user (for UI display only)
let liveSingle = {
  matched: false,
  userId: null,
  name: null,
  updatedAt: 0,
};

// ✅ Green flash after successful clock-in/out
let scanSuccessFlashUntil = 0;

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
    "w-full rounded-3xl border border-white/10 bg-white/5 p-4 shadow mb-4 " +
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
    } catch (_) {
      // ignore non-json
    }

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

async function renderPendingOb() {
  if (!ui.pendingObBody || !ui.pendingObCount) return;

  ui.pendingObBody.innerHTML = `
    <tr><td class="px-3 py-3 text-slate-400" colspan="5">Loading…</td></tr>
  `;

  const r = await safeFetchJson("/api/official-businesses?status=pending", { method: "GET" });

  if (!r.ok || !Array.isArray(r.data?.items)) {
    ui.pendingObCount.textContent = "0";
    ui.pendingObBody.innerHTML = `
      <tr><td class="px-3 py-3 text-slate-400" colspan="5">Failed to load pending OB.</td></tr>
    `;
    return;
  }

  const items = r.data.items;
  ui.pendingObCount.textContent = String(items.length);

  if (!items.length) {
    ui.pendingObBody.innerHTML = `
      <tr><td class="px-3 py-3 text-slate-400" colspan="5">No pending OB requests.</td></tr>
    `;
    return;
  }

  const typeLabel = (t) => (t === "in" ? "Check-in" : t === "out" ? "Check-out" : (t || "—"));
  const statusClass = (s) =>
    s === "pending" ? "text-amber-300" :
    s === "approved" ? "text-emerald-300" :
    s === "rejected" ? "text-rose-300" : "text-slate-200";

  ui.pendingObBody.innerHTML = items.map((x) => `
    <tr class="text-slate-200">
      <td class="px-3 py-2 font-semibold">${escapeHtml(x.name || "—")}</td>
      <td class="px-3 py-2">${escapeHtml(x.schedule || "—")}</td>
      <td class="px-3 py-2">${escapeHtml(typeLabel(x.type))}</td>
      <td class="px-3 py-2 font-mono text-[11px] text-slate-300">${escapeHtml(x.requested_at || "—")}</td>
      <td class="px-3 py-2 font-semibold ${statusClass(x.status)}">${escapeHtml(x.status || "—")}</td>
    </tr>
  `).join("");
}


let stream = null;
let facingMode = "user";
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

// ✅ Live scan (throttled by setInterval)
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
      return;
    }

    const labels = new Array(count).fill("");

    if (count > 1) {
      for (let i = 0; i < count; i++) labels[i] = "Multiple faces";
      drawResultsWithLabels(results, labels, { strokeStyle: RED });
      if (ui.liveDetectedName) ui.liveDetectedName.textContent = "Multiple faces";
      liveSingle = { matched: false, userId: null, name: null, updatedAt: nowMs };
      return;
    }

    const threshold = Number(ui.threshold?.value ?? 0.55);
    const d = results[0]?.descriptor || null;

    if (!d) {
      labels[0] = "Face detected";
      drawResultsWithLabels(results, labels, { strokeStyle: BLUE });
      if (ui.liveDetectedName) ui.liveDetectedName.textContent = "Face detected";
      liveSingle = { matched: false, userId: null, name: null, updatedAt: nowMs };
      return;
    }

    const resp = await serverMatchDescriptor(d, threshold);

    if (resp.matched && resp.user?.name) {
      const uid = resp.user?.id ?? null;

      const isFlashGreen = nowMs < scanSuccessFlashUntil;
      const strokeStyle = isFlashGreen ? GREEN : BLUE;

      const labelText = `${resp.user.name}`;
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
      drawResultsWithLabels(results, labels, { strokeStyle: RED });
    }
  } catch {
    // ignore live scan errors
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
  } catch (e) {
    stream = null;
    appendStatus(`Camera error: ${e?.message || e}`);
  }
}

function stopCamera() {
  if (!stream) return;

  scanSuccessFlashUntil = 0;

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

async function renderLogs() {
  const holder = document.getElementById("scheduleTables");
  if (!holder || !ui.logsCount || !ui.datePicker) return;

  const dateStr = ui.datePicker.value || isoDateLocal();

  const server = await safeFetchJson(
    `/api/attendance/logs?date=${encodeURIComponent(dateStr)}`,
    { method: "GET" }
  );

  const schedules = Array.isArray(window.__SCHEDULES__) ? window.__SCHEDULES__ : [];

  const groups = new Map();
  for (const s of schedules) {
    groups.set(String(s.id), {
      id: s.id,
      title: s.description || `Schedule #${s.id}`,
      rows: new Map(),
    });
  }
  groups.set("unassigned", {
    id: null,
    title: "Unassigned Schedule",
    rows: new Map(),
  });

  holder.innerHTML = "";

  if (!server.ok || !Array.isArray(server.data?.logs)) {
    holder.innerHTML = `
      <div class="rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-300">
        Failed to load logs for ${escapeHtml(dateStr)}.
      </div>
    `;
    ui.logsCount.textContent = "0";
    return;
  }

  const logs = server.data.logs;

  for (const r of logs) {
    const name = r.name || `User ${r.user_id}`;
    const sid = r.schedule_id ? String(r.schedule_id) : "unassigned";
    const group = groups.get(sid) || groups.get("unassigned");

    if (!group.rows.has(name)) {
      group.rows.set(name, { name, time_in: null, time_out: null });
    }
    const item = group.rows.get(name);

    const t = r.occurred_at ? new Date(r.occurred_at) : null;
    const timeStr = t ? timeLocal(t) : "—";

    if (r.type === "in") {
      if (!item.time_in || timeStr < item.time_in) item.time_in = timeStr;
    } else if (r.type === "out") {
      if (!item.time_out || timeStr > item.time_out) item.time_out = timeStr;
    }
  }

  let totalPeople = 0;
  for (const g of groups.values()) totalPeople += g.rows.size;
  ui.logsCount.textContent = String(totalPeople);

  const renderGroup = (g) => {
    const rows = Array.from(g.rows.values()).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    if (!rows.length) return;

    const wrap = document.createElement("div");
    wrap.className =
      "overflow-hidden rounded-2xl border border-white/10 bg-slate-950/30";

    wrap.innerHTML = `
      <div class="flex items-center justify-between bg-white/10 px-3 py-2">
        <div class="text-xs font-semibold text-slate-200">${escapeHtml(g.title)}</div>
        <div class="text-[11px] text-slate-400">${rows.length} people</div>
      </div>

      <div class="scrollbar-att max-h-[18.5em] overflow-y-auto rounded-b-2xl bg-slate-950/20">
        <table class="w-full text-left text-xs">
          <thead class="sticky top-0 bg-slate-950/60 text-slate-200 backdrop-blur">
            <tr>
              <th class="px-3 py-2">Name</th>
              <th class="px-3 py-2">Time In</th>
              <th class="px-3 py-2">Time Out</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-white/10">
            ${rows
              .map(
                (r) => `
                <tr class="text-slate-200">
                  <td class="px-3 py-2 font-semibold">${escapeHtml(r.name)}</td>
                  <td class="px-3 py-2 font-mono text-[11px] text-slate-300">${escapeHtml(
                    r.time_in || "—"
                  )}</td>
                  <td class="px-3 py-2 font-mono text-[11px] text-slate-300">${escapeHtml(
                    r.time_out || "—"
                  )}</td>
                </tr>
              `
              )
              .join("")}
          </tbody>
        </table>
      </div>
    `;

    holder.appendChild(wrap);
  };

  for (const s of schedules) {
    renderGroup(groups.get(String(s.id)));
  }

  renderGroup(groups.get("unassigned"));

  if (!holder.children.length) {
    holder.innerHTML = `
      <div class="scrollbar-att max-h-[18.5em] overflow-y-auto rounded-2xl border border-white/10 bg-slate-950/40 p-3 text-sm text-slate-400">
        No logs for ${escapeHtml(dateStr)}.
      </div>
    `;
  }
}

function setDateToToday() {
  if (!ui.datePicker) return;
  ui.datePicker.value = isoDateLocal();
  renderLogs();
  updateCheckButtonsState();
}

// ---------------- Attendance actions ----------------
async function enroll() {
  const name = (ui.enrollName?.value || "").trim();
  const contact_number = (ui.enrollContact?.value || "").trim();
  const password = (ui.enrollPassword?.value || "").trim();
  const role_id = ui.enrollRole?.value || "";
  const schedule_id = ui.enrollSchedule?.value || "";

  if (!name) return appendStatus("Enroll: Please enter a name.");
  if (!contact_number) return appendStatus("Enroll: Please enter a contact number.");
  if (!password || password.length < 8)
    return appendStatus("Enroll: Password must be at least 8 characters.");
  if (!role_id) return appendStatus("Enroll: Please select a role.");
  if (!schedule_id) return appendStatus("Enroll: Please select a schedule.");

  if (!stream) return appendStatus("Enroll: Start the camera first.");
  if (!modelsReady) return appendStatus("Enroll: Models not ready yet.");

  appendStatus("Enroll: Capturing face…");

  const scan = await getSingleDescriptorStrict();
  if (!scan?.descriptor) {
    if (scan?.reason === "multiple") {
      appendStatus(`Enroll: Multiple faces detected (${scan.count}). ONLY ONE person allowed.`);
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
      `Enroll blocked: Face already registered as ${matchResp.data?.user?.name || "someone"}.`
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
      role_id: Number(role_id),
      schedule_id: Number(schedule_id),
      descriptor: Array.from(scan.descriptor),
      label: "Enrollment",
    }),
  });

  if (!r.ok) {
    const msg =
      r.data?.message ||
      (r.data?.errors ? Object.values(r.data.errors).flat().join(" ") : `HTTP ${r.status}`);
    appendStatus(`Enroll failed: ${msg}`);
    return;
  }

  appendStatus(`Enroll success ✅ user_id=${r.data?.user?.id ?? "?"}`);

  if (ui.enrollName) ui.enrollName.value = "";
  if (ui.enrollContact) ui.enrollContact.value = "";
  if (ui.enrollPassword) ui.enrollPassword.value = "";
  if (ui.enrollRole) ui.enrollRole.value = "";
  if (ui.enrollSchedule) ui.enrollSchedule.value = "";

  renderProfiles();
}

async function attendance(type) {
  const dateStr = ui.datePicker?.value || isoDateLocal();

  if (attendanceInProgress) return;
  attendanceInProgress = true;

  try {
    if (dateStr !== isoDateLocal()) {
      appendStatus("Check In/Out works ONLY on TODAY.");
      return;
    }

    if (!stream) return appendStatus(`${type}: Start the camera first.`);
    if (!modelsReady) return appendStatus(`${type}: Models not ready yet.`);

    const threshold = Number(ui.threshold?.value ?? 0.55);

    if (!isSelectedDateToday()) {
      appendStatus("Check In/Out is disabled for past dates.");
      return;
    }

    if (ui.btnCheckIn) ui.btnCheckIn.disabled = true;
    if (ui.btnCheckOut) ui.btnCheckOut.disabled = true;

    appendStatus(`${type}: Scanning…`);

    const scan = await getSingleDescriptorStrict();
    if (!scan?.descriptor) {
      if (scan?.reason === "multiple") {
        appendStatus(`${type}: Multiple faces detected (${scan.count}). ONLY ONE person allowed.`);
      } else {
        appendStatus(`${type}: Face not detected.`);
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
        (r.data?.errors ? Object.values(r.data.errors).flat().join(" ") : `HTTP ${r.status}`);
      appendStatus(`${type}: ${msg}`);
      return;
    }

    const name = r.data?.user?.name || "Unknown";

    scanSuccessFlashUntil = Date.now() + 1200;

    appendStatus(`${type}: Saved ✅ (${name})`);

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

    addLog(dateStr, {
      name,
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

// ---------------- Official Business (OB) modal ----------------
let obModalEls = null;

function ensureObModalInjected() {
  // If already in Blade (your case)
  if (document.getElementById("obModal")) {
    obModalEls = {
      modal: el("obModal"),
      user: el("obUser"),
      schedule: el("obSchedule"),
      type: el("obType"),
      date: el("obDate"),
      time: el("obTime"),
      notes: el("obNotes"),
      cancel: el("obCancel"),
      submit: el("obSubmit"),
      status: el("obStatus"),
      x: el("obX"), // optional if you add it
    };

    // ✅ bind close handlers ONCE
    if (!obModalEls.modal?.dataset.bound) {
      const close = () => closeObModal();

      obModalEls.cancel?.addEventListener("click", (e) => {
        e.preventDefault();
        close();
      });

      obModalEls.x?.addEventListener("click", (e) => {
        e.preventDefault();
        close();
      });

      obModalEls.modal?.addEventListener("click", (e) => {
        if (e.target === obModalEls.modal) close();
      });

      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") close();
      });

      obModalEls.modal.dataset.bound = "1";
    }

    return obModalEls;
  }

  // Otherwise inject (fallback)
  const wrap = document.createElement("div");
  wrap.innerHTML = `...`; // keep your injected HTML as-is
  document.body.appendChild(wrap);

  obModalEls = {
    modal: el("obModal"),
    user: el("obUser"),
    schedule: el("obSchedule"),
    type: el("obType"),
    date: el("obDate"),
    time: el("obTime"),
    notes: el("obNotes"),
    cancel: el("obCancel"),
    submit: el("obSubmit"),
    status: el("obStatus"),
    x: el("obX"),
  };

  // close handlers (injected)
  const close = () => closeObModal();
  obModalEls.cancel?.addEventListener("click", close);
  obModalEls.x?.addEventListener("click", close);
  obModalEls.modal?.addEventListener("click", (e) => {
    if (e.target === obModalEls.modal) close();
  });

  return obModalEls;
}

function openObModal() {
  const m = ensureObModalInjected();
  if (!m?.modal) return;

  // defaults
  m.status?.classList.add("hidden");
  if (m.status) m.status.textContent = "";

  if (m.date) m.date.value = isoDateLocal();
  if (m.time) m.time.value = timeLocal().slice(0, 5); // HH:mm

  // load schedules into select
  const schedules = Array.isArray(window.__SCHEDULES__) ? window.__SCHEDULES__ : [];
  if (m.schedule) {
    m.schedule.innerHTML = `<option value="" selected disabled class="bg-slate-900 text-slate-400">Select Schedule</option>`;
    for (const s of schedules) {
      const opt = document.createElement("option");
      opt.value = String(s.id);
      opt.textContent = s.description || `Schedule #${s.id}`;
      opt.className = "bg-slate-900 text-slate-100";
      m.schedule.appendChild(opt);
    }
  }

  // load users (from enrolled face profiles endpoint)
  loadObUsers().catch(() => {});

  m.modal.classList.remove("hidden");
  m.modal.classList.add("flex");
}

function closeObModal() {
  const m = ensureObModalInjected();
  if (!m?.modal) return;
  m.modal.classList.add("hidden");
  m.modal.classList.remove("flex");
}

function obShowStatus(msg) {
  const m = ensureObModalInjected();
  if (!m?.status) return;
  m.status.textContent = msg || "";
  m.status.classList.remove("hidden");
}

async function loadObUsers() {
  const m = ensureObModalInjected();
  if (!m?.user) return;

  m.user.innerHTML = `<option value="" selected disabled class="bg-slate-900 text-slate-400">Loading users…</option>`;

  const r = await safeFetchJson("/api/face/profiles", { method: "GET" });

  if (!r.ok || !Array.isArray(r.data?.profiles)) {
    m.user.innerHTML = `<option value="" selected disabled class="bg-slate-900 text-slate-400">Failed to load users</option>`;
    obShowStatus("Could not load users. Ensure GET /api/face/profiles returns profiles.");
    return;
  }

  // Unique users from profiles
  const map = new Map();
  for (const p of r.data.profiles) {
    const uid = p.user_id ?? p.user?.id ?? null;
    const name = p.name ?? p.user?.name ?? null;
    if (!uid) continue;
    map.set(String(uid), name || `User ${uid}`);
  }

  const users = Array.from(map.entries()).map(([id, name]) => ({
    id,
    name,
  }));
  users.sort((a, b) => a.name.localeCompare(b.name));

  m.user.innerHTML = `<option value="" selected disabled class="bg-slate-900 text-slate-400">Select User</option>`;
  for (const u of users) {
    const opt = document.createElement("option");
    opt.value = String(u.id);
    opt.textContent = u.name;
    opt.className = "bg-slate-900 text-slate-100";
    m.user.appendChild(opt);
  }
}

async function submitObRequest() {
  const m = ensureObModalInjected();
  if (!m?.user || !m?.schedule || !m?.type || !m?.date || !m?.time) return;

  const user_id = Number(m.user.value || 0);
  const schedule_id = Number(m.schedule.value || 0);
  const type = String(m.type.value || "in");
  const date = String(m.date.value || "").trim();
  const time = String(m.time.value || "").trim();
  const notes = String(m.notes?.value || "").trim();

  if (!user_id) return obShowStatus("Please select a user.");
  if (!schedule_id) return obShowStatus("Please select a schedule.");
  if (!date) return obShowStatus("Please select a date.");
  if (!time) return obShowStatus("Please select a time.");

  // requested_at: YYYY-MM-DD HH:mm:ss
  const requested_at = `${date} ${time}:00`;

  // Optional: disable submit to prevent double submit
  if (m.submit) {
    m.submit.disabled = true;
    m.submit.classList.add("opacity-60", "cursor-not-allowed");
  }

  try {
    const r = await safeFetchJson("/api/official-businesses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id,
        schedule_id,
        type, // 'in'|'out'
        requested_at,
        notes: notes || null,
      }),
    });

    if (!r.ok) {
      const msg =
        r.data?.message ||
        (r.data?.errors ? Object.values(r.data.errors).flat().join(" ") : `HTTP ${r.status}`);
      obShowStatus(`Request failed: ${msg}`);
      appendStatus(`OB: Request failed — ${msg}`);
      return;
    }

    obShowStatus("Request submitted ✅ (Pending approval)");
    appendStatus(`OB: Submitted ✅ user_id=${user_id} schedule_id=${schedule_id} requested_at=${requested_at}`);
    // close after a short delay
    renderPendingOb();
    setTimeout(() => closeObModal(), 800);
  } finally {
    if (m.submit) {
      m.submit.disabled = false;
      m.submit.classList.remove("opacity-60", "cursor-not-allowed");
    }
  }
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
      attendance("check-in").catch((e) =>
        appendStatus(`Check-in error: ${e?.message || e}`)
      );
    });
  }

  if (ui.btnCheckOut) {
    ui.btnCheckOut.addEventListener("click", () => {
      unlockSpeech();
      attendance("check-out").catch((e) =>
        appendStatus(`Check-out error: ${e?.message || e}`)
      );
    });
  }

  if (ui.btnDownloadDay) ui.btnDownloadDay.addEventListener("click", downloadDayCsv);
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

  // ✅ Request OB button
  if (ui.btnRequestOb) {
    ui.btnRequestOb.addEventListener("click", () => {
      openObModal();
    });
  } else {
    // If you forgot the ID, still try to bind by text (fallback)
    const maybe = Array.from(document.querySelectorAll("button")).find((b) =>
      /request\s*ob/i.test(b.textContent || "")
    );
    if (maybe) {
      maybe.addEventListener("click", () => openObModal());
    }
  }

  // OB submit button handler (exists only after injection)
  document.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.id === "obSubmit") {
      e.preventDefault();
      submitObRequest().catch((err) => {
        obShowStatus(`Request failed: ${err?.message || err}`);
      });
    }
  });

  window.addEventListener("resize", () => requestAnimationFrame(resizeOverlayToVideo));
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

  renderPendingOb();

  try {
    await loadModels();
    appendStatus(
      "Ready. Start camera. When it detects 1 face, it will show the person's NAME on the box if registered."
    );
    appendStatus("If not registered, the box will say: Not registered.");
    appendStatus("Check-in is MANUAL (must click the button).");
    appendStatus("Check-out is MANUAL (must click the button).");
    appendStatus(
      "Check In/Out works ONLY on TODAY. You can still browse history by changing date."
    );

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
