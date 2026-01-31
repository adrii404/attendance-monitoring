import "./bootstrap";

/* ---------------- STATE ---------------- */

function showError(message) {
    Swal.fire({
        icon: "warning",
        title: "Action Not Allowed",
        text: message,
        confirmButtonColor: "#10b981",
    });
}

const video = document.getElementById("video");
const btnStart = document.getElementById("btnStart");
const btnStop = document.getElementById("btnStop");
const btnCapture = document.getElementById("btnCapture");

const employeeSearch = document.getElementById("employeeSearch");
const employeeResults = document.getElementById("employeeResults");

const btnModeIn = document.getElementById("btnModeIn");
const btnModeOut = document.getElementById("btnModeOut");

const datePicker = document.getElementById("datePicker");
const logsTbody = document.getElementById("logsTbody");

const btnExportXlsx = document.getElementById("btnExportXlsx");
const btnExportJson = document.getElementById("btnExportJson");
const btnExportZip = document.getElementById("btnExportZip");

let stream = null;
let employees = [];
let selectedEmployee = null;
let mode = "in";
let logs = [];

/* ---------------- CAMERA ---------------- */

async function startCamera() {
    if (stream) return;
    stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
    });
    video.srcObject = stream;
}

function stopCamera() {
    if (!stream) return;
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
    stream = null;
}

btnStart.onclick = startCamera;
btnStop.onclick = stopCamera;

/* ---------------- EMPLOYEES ---------------- */

/* ---------------- EMPLOYEES ---------------- */

async function loadEmployees() {
    const res = await fetch("/api/employees", {
        headers: { Accept: "application/json" },
    });

    const data = await res.json();
    employees = Array.isArray(data?.employees) ? data.employees : [];
}

employeeSearch.oninput = () => {
    const q = employeeSearch.value.toLowerCase().trim();
    employeeResults.innerHTML = "";

    if (!q) return;

    employees
        .filter((e) => (e.name || "").toLowerCase().includes(q))
        .slice(0, 30)
        .forEach((emp) => {
            const div = document.createElement("div");
            div.className = "px-3 py-2 hover:bg-white/10 cursor-pointer";
            div.textContent = `${emp.name} — ${emp.role?.name || "No Role"}`;

            div.onclick = () => {
                selectedEmployee = emp;
                employeeSearch.value = emp.name;
                employeeResults.innerHTML = "";
            };

            employeeResults.appendChild(div);
        });
};


employeeSearch.oninput = () => {
    const q = employeeSearch.value.toLowerCase();
    employeeResults.innerHTML = "";

    employees
        .filter((e) => e.name.toLowerCase().includes(q))
        .forEach((emp) => {
            const div = document.createElement("div");
            div.className = "px-3 py-2 hover:bg-white/10 cursor-pointer";
            div.textContent = `${emp.name} — ${emp.role?.name || ""}`;
            div.onclick = () => {
                selectedEmployee = emp;
                employeeSearch.value = emp.name;
                employeeResults.innerHTML = "";
            };
            employeeResults.appendChild(div);
        });
};

/* ---------------- MODE TOGGLE ---------------- */

btnModeIn.onclick = () => {
    mode = "in";
    btnModeIn.className =
        "flex-1 rounded-xl bg-sky-400 text-black py-2 font-semibold";
    btnModeOut.className = "flex-1 rounded-xl bg-white/10 py-2 font-semibold";
};

btnModeOut.onclick = () => {
    mode = "out";
    btnModeOut.className =
        "flex-1 rounded-xl bg-amber-400 text-black py-2 font-semibold";
    btnModeIn.className = "flex-1 rounded-xl bg-white/10 py-2 font-semibold";
};

/* ---------------- PHOTO ---------------- */

function capturePhoto() {
    const canvas = document.createElement("canvas");
    const w = video.videoWidth;
    const h = video.videoHeight;

    canvas.width = w;
    canvas.height = h;

    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, w, h);

    return canvas.toDataURL("image/jpeg", 0.75);
}

/* ---------------- CAPTURE ---------------- */

btnCapture.onclick = async () => {
    if (!stream || !selectedEmployee) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    const employeeId =
        selectedEmployee.id ??
        selectedEmployee.user_id ??
        selectedEmployee.user?.id ??
        null;

    if (!employeeId) return;

    const photo = capturePhoto();
    const date = datePicker.value || new Date().toISOString().slice(0, 10);

    const payload = {
        employee_id: employeeId,
        type: mode,
        date,
        photo_data_url: photo,
        device_id: "kiosk-1",
    };

    logs.unshift({
        name: selectedEmployee.name,
        department: selectedEmployee.role?.name || "",
        date,
        time: new Date().toLocaleTimeString(),
        type: mode,
        photo,
    });

    renderOptimistic();

    try {
        const res = await fetch("/api/attendance/capture", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                "X-CSRF-TOKEN": document.querySelector(
                    'meta[name="csrf-token"]',
                )?.content,
            },
            body: JSON.stringify(payload),
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.message || "Attendance rule violation.");
        }

        logs = [];
        await renderLogs();
    } catch (err) {
        showError(err.message);
        logs.shift();
        await renderLogs();
    }
};

/* ---------------- RENDER ---------------- */

async function renderLogs() {
    const date = datePicker.value;

    const res = await fetch(`/api/attendance/summary?date=${date}`);
    const data = await res.json();

    logsTbody.innerHTML = "";

    if (!data.rows.length) {
        logsTbody.innerHTML = `
            <tr>
                <td colspan="6" class="px-3 py-4 text-slate-400 text-center">
                    No attendance logs for ${date}
                </td>
            </tr>
        `;
        return;
    }

    data.rows.forEach((r) => {
        const tr = document.createElement("tr");

        tr.innerHTML = `
            <td class="px-3 py-2">
                ${
                    r.photo_path
                        ? `<img src="/storage/${r.photo_path}" class="w-16 h-12 object-cover rounded">`
                        : "—"
                }
            </td>
            <td class="px-3 py-2 font-semibold">${r.name}</td>
            <td class="px-3 py-2">${r.department ?? "—"}</td>
            <td class="px-3 py-2 font-mono">${r.time_in ?? "—"}</td>
            <td class="px-3 py-2 font-mono">${r.time_out ?? "—"}</td>
            <td class="px-3 py-2 font-semibold text-emerald-300">
                ${r.hours_rendered ?? "—"}
            </td>
        `;

        logsTbody.appendChild(tr);
    });
}

function renderOptimistic() {
    logsTbody.innerHTML = "";

    logs.forEach((l) => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="px-3 py-2">
                <img src="${l.photo}" class="w-16 h-12 object-cover rounded">
            </td>
            <td class="px-3 py-2 font-semibold">${l.name}</td>
            <td class="px-3 py-2">${l.department}</td>
            <td class="px-3 py-2">—</td>
            <td class="px-3 py-2">—</td>
            <td class="px-3 py-2 text-slate-400 italic">saving…</td>
        `;
        logsTbody.appendChild(tr);
    });
}

/* ---------------- EXPORTS ---------------- */

btnExportJson.onclick = () => {
    saveAs(
        new Blob([JSON.stringify(logs, null, 2)], {
            type: "application/json",
        }),
        "attendance.json",
    );
};

btnExportXlsx.onclick = () => {
    const ws = XLSX.utils.json_to_sheet(logs);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    XLSX.writeFile(wb, "attendance.xlsx");
};

btnExportZip.onclick = async () => {
    const zip = new JSZip();
    const imgFolder = zip.folder("images");

    logs.forEach((l, i) => {
        imgFolder.file(`log_${i + 1}.jpg`, l.photo.split(",")[1], {
            base64: true,
        });
    });

    zip.file("attendance.json", JSON.stringify(logs, null, 2));
    saveAs(
        await zip.generateAsync({ type: "blob" }),
        "attendance_with_images.zip",
    );
};

/* ---------------- INIT ---------------- */

(async function init() {
    datePicker.value = new Date().toISOString().slice(0, 10);
    datePicker.onchange = renderLogs;
    await loadEmployees();
    await renderLogs();
})();
