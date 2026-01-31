import "./bootstrap";

/* ---------------- STATE ---------------- */

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
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
}

function stopCamera() {
    if (!stream) return;
    stream.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    stream = null;
}

btnStart.onclick = startCamera;
btnStop.onclick = stopCamera;

/* ---------------- EMPLOYEES ---------------- */

async function loadEmployees() {
    const res = await fetch("/api/face/profiles", { headers: { Accept: "application/json" } });
    const data = await res.json();
    employees = Array.isArray(data?.profiles) ? data.profiles : [];
}

employeeSearch.oninput = () => {
    const q = employeeSearch.value.toLowerCase();
    employeeResults.innerHTML = "";

    employees.filter(e => e.name.toLowerCase().includes(q)).forEach(emp => {
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
    btnModeIn.className = "flex-1 rounded-xl bg-sky-400 text-black py-2 font-semibold";
    btnModeOut.className = "flex-1 rounded-xl bg-white/10 py-2 font-semibold";
};

btnModeOut.onclick = () => {
    mode = "out";
    btnModeOut.className = "flex-1 rounded-xl bg-amber-400 text-black py-2 font-semibold";
    btnModeIn.className = "flex-1 rounded-xl bg-white/10 py-2 font-semibold";
};

/* ---------------- PHOTO ---------------- */

function capturePhoto() {
    const c = document.createElement("canvas");
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext("2d").drawImage(video, 0, 0);
    return c.toDataURL("image/jpeg", 0.7);
}

/* ---------------- CAPTURE ---------------- */

btnCapture.onclick = async () => {
    if (!stream) return alert("Camera not started");
    if (!selectedEmployee) return alert("Select employee first");

    const photo = capturePhoto();
    const date = datePicker.value || new Date().toISOString().slice(0, 10);

    const res = await fetch("/api/attendance/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            employee_id: selectedEmployee.id,
            type: mode,
            date,
            photo_data_url: photo,
            device_id: "kiosk-1"
        })
    });

    const data = await res.json();
    if (!res.ok) return alert(data.message || "Failed");

    logs.unshift({
        name: selectedEmployee.name,
        department: selectedEmployee.role?.name || "",
        date: data.date,
        time: data.time,
        type: mode,
        photo
    });

    renderLogs();
};

/* ---------------- RENDER ---------------- */

function renderLogs() {
    logsTbody.innerHTML = "";
    logs.forEach(l => {
        const tr = document.createElement("tr");
        tr.innerHTML = `
            <td class="px-3 py-2"><img src="${l.photo}" class="w-16 h-12 object-cover rounded"></td>
            <td class="px-3 py-2 font-semibold">${l.name}</td>
            <td class="px-3 py-2">${l.department}</td>
            <td class="px-3 py-2">${l.date}</td>
            <td class="px-3 py-2">${l.time}</td>
            <td class="px-3 py-2">${l.type.toUpperCase()}</td>
        `;
        logsTbody.appendChild(tr);
    });
}

/* ---------------- EXPORTS ---------------- */

btnExportJson.onclick = () => {
    const blob = new Blob([JSON.stringify(logs, null, 2)], { type: "application/json" });
    saveAs(blob, "attendance.json");
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
        const base64 = l.photo.split(",")[1];
        imgFolder.file(`log_${i + 1}.jpg`, base64, { base64: true });
    });

    zip.file("attendance.json", JSON.stringify(logs, null, 2));
    const content = await zip.generateAsync({ type: "blob" });
    saveAs(content, "attendance_with_images.zip");
};

/* ---------------- INIT ---------------- */

(async function init() {
    datePicker.value = new Date().toISOString().slice(0, 10);
    await loadEmployees();
})();
