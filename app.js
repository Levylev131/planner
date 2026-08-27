import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// ── Customize categories here: name + color ──
const CATEGORIES = [
  { key: "together", label: "Together", color: "#4c6ef5" },
  { key: "work", label: "Work", color: "#e67700" },
  { key: "personal", label: "Personal", color: "#2f9e44" },
  { key: "reminder", label: "Reminder", color: "#e03131" }
];

const setupBanner = document.getElementById("setup-banner");
const syncDot = document.getElementById("sync-dot");

let db = null;
let eventsCol = null;

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
  setupBanner.classList.remove("hidden");
} else {
  const fbApp = initializeApp(firebaseConfig);
  db = getFirestore(fbApp);
  eventsCol = collection(db, "events");
}

// ── State ──
let viewDate = new Date();
viewDate.setDate(1);
let events = []; // {id, title, date, time, category, notes, addedBy}
let editingId = null;

// ── Elements ──
const gridEl = document.getElementById("grid");
const monthLabel = document.getElementById("month-label");
const legendEl = document.getElementById("legend");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const fTitle = document.getElementById("f-title");
const fDate = document.getElementById("f-date");
const fTime = document.getElementById("f-time");
const fCategory = document.getElementById("f-category");
const fNotes = document.getElementById("f-notes");
const addedByRow = document.getElementById("added-by-row");
const deleteBtn = document.getElementById("delete-btn");
const nameOverlay = document.getElementById("name-overlay");
const nameInput = document.getElementById("name-input");

// ── Username (local, per device) ──
function getUsername() {
  return localStorage.getItem("cal_username") || "";
}
function ensureUsername(cb) {
  const name = getUsername();
  if (name) { cb(name); return; }
  nameOverlay.classList.remove("hidden");
  document.getElementById("name-save-btn").onclick = () => {
    const v = nameInput.value.trim();
    if (!v) return;
    localStorage.setItem("cal_username", v);
    nameOverlay.classList.add("hidden");
    cb(v);
  };
}

// ── Legend ──
function renderLegend() {
  legendEl.innerHTML = "";
  CATEGORIES.forEach(c => {
    const el = document.createElement("span");
    el.className = "legend-item";
    el.innerHTML = `<span class="legend-dot" style="background:${c.color}"></span>${c.label}`;
    legendEl.appendChild(el);
  });
  fCategory.innerHTML = CATEGORIES.map(c => `<option value="${c.key}">${c.label}</option>`).join("");
}

function categoryColor(key) {
  const c = CATEGORIES.find(c => c.key === key);
  return c ? c.color : "#718096";
}

// ── Date helpers ──
function toDateStr(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function todayStr() {
  return toDateStr(new Date());
}

// ── Calendar render ──
function renderCalendar() {
  monthLabel.textContent = viewDate.toLocaleString("default", { month: "long", year: "numeric" });
  gridEl.innerHTML = "";

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay(); // 0=Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, other: true, date: new Date(year, month - 1, daysInPrevMonth - i) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, other: false, date: new Date(year, month, d) });
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const nextIdx = cells.length - (startOffset + daysInMonth) + 1;
    cells.push({ day: nextIdx, other: true, date: new Date(year, month + 1, nextIdx) });
  }

  const tStr = todayStr();

  cells.forEach(cell => {
    const dateStr = toDateStr(cell.date);
    const cellEl = document.createElement("div");
    cellEl.className = "day-cell" + (cell.other ? " other-month" : "") + (dateStr === tStr ? " today" : "");

    const numEl = document.createElement("div");
    numEl.className = "day-num";
    numEl.textContent = cell.day;
    cellEl.appendChild(numEl);

    const dayEvents = events
      .filter(e => e.date === dateStr)
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

    const MAX_SHOWN = 3;
    dayEvents.slice(0, MAX_SHOWN).forEach(ev => {
      const chip = document.createElement("div");
      chip.className = "event-chip";
      chip.style.background = categoryColor(ev.category);
      chip.textContent = (ev.time ? ev.time + " " : "") + ev.title;
      chip.onclick = (e) => { e.stopPropagation(); openModal(dateStr, ev); };
      cellEl.appendChild(chip);
    });
    if (dayEvents.length > MAX_SHOWN) {
      const more = document.createElement("div");
      more.className = "event-more";
      more.textContent = `+${dayEvents.length - MAX_SHOWN} more`;
      cellEl.appendChild(more);
    }

    cellEl.onclick = () => openModal(dateStr, null);
    gridEl.appendChild(cellEl);
  });
}

// ── Modal ──
function openModal(dateStr, existingEvent) {
  editingId = existingEvent ? existingEvent.id : null;
  modalTitle.textContent = existingEvent ? "Edit Event" : "New Event";
  fTitle.value = existingEvent ? existingEvent.title : "";
  fDate.value = dateStr;
  fTime.value = existingEvent ? (existingEvent.time || "") : "";
  fCategory.value = existingEvent ? existingEvent.category : CATEGORIES[0].key;
  fNotes.value = existingEvent ? (existingEvent.notes || "") : "";
  deleteBtn.classList.toggle("hidden", !existingEvent);
  addedByRow.textContent = existingEvent && existingEvent.addedBy ? `Added by ${existingEvent.addedBy}` : "";
  modalOverlay.classList.remove("hidden");
  fTitle.focus();
}
function closeModal() {
  modalOverlay.classList.add("hidden");
  editingId = null;
}

document.getElementById("modal-close").onclick = closeModal;
document.getElementById("cancel-btn").onclick = closeModal;
modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };

document.getElementById("save-btn").onclick = () => {
  const title = fTitle.value.trim();
  if (!title) { fTitle.focus(); return; }
  if (!db) { alert("Firebase isn't configured yet — see SETUP.md."); return; }

  ensureUsername((username) => {
    const payload = {
      title,
      date: fDate.value,
      time: fTime.value || "",
      category: fCategory.value,
      notes: fNotes.value.trim(),
      addedBy: username,
      updatedAt: serverTimestamp()
    };
    if (editingId) {
      updateDoc(doc(db, "events", editingId), payload).catch(showSyncError);
    } else {
      payload.createdAt = serverTimestamp();
      addDoc(eventsCol, payload).catch(showSyncError);
    }
    closeModal();
  });
};

deleteBtn.onclick = () => {
  if (!editingId || !db) return;
  if (!confirm("Delete this event?")) return;
  deleteDoc(doc(db, "events", editingId)).catch(showSyncError);
  closeModal();
};

function showSyncError(err) {
  console.error(err);
  alert("Couldn't sync: " + err.message);
}

// ── Nav ──
document.getElementById("prev-btn").onclick = () => { viewDate.setMonth(viewDate.getMonth() - 1); renderCalendar(); };
document.getElementById("next-btn").onclick = () => { viewDate.setMonth(viewDate.getMonth() + 1); renderCalendar(); };
document.getElementById("today-btn").onclick = () => { viewDate = new Date(); viewDate.setDate(1); renderCalendar(); };
document.getElementById("add-fab").onclick = () => openModal(todayStr(), null);

// ── Live sync ──
if (db) {
  onSnapshot(eventsCol, (snap) => {
    events = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderCalendar();
    syncDot.classList.add("connected");
    syncDot.classList.remove("error");
    syncDot.title = "Synced";
  }, (err) => {
    console.error(err);
    syncDot.classList.add("error");
    syncDot.title = "Sync error: " + err.message;
  });
}

renderLegend();
renderCalendar();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
