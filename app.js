// ---- One-time setup: fill these in per SETUP.md, then this file is done. ----
const TOKEN = "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"; // classic GitHub PAT, "gist" scope only
const GIST_ID = "51eecb52a1287ba1fc2ae5b39ba5465f"; // returned when the gist is created (see SETUP.md)
const FILENAME = "calendar.json";
// -----------------------------------------------------------------------

const POLL_MS = 6000;
const SAVE_DEBOUNCE_MS = 400;

// ── Customize categories here: name + color ──
const CATEGORIES = [
  { key: "together", label: "Together", color: "#4c6ef5" },
  { key: "work", label: "Work", color: "#e67700" },
  { key: "personal", label: "Personal", color: "#2f9e44" },
  { key: "reminder", label: "Reminder", color: "#e03131" }
];

const configured = TOKEN !== "YOUR_TOKEN_HERE" && GIST_ID !== "YOUR_GIST_ID_HERE";

const setupBanner = document.getElementById("setup-banner");
const syncDot = document.getElementById("sync-dot");

function setSyncStatus(status) {
  syncDot.className = "sync-dot " + status;
  syncDot.title = status === "ok" ? "Synced" : status === "busy" ? "Syncing..." : "Sync error";
}

function uid() {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(16).slice(2);
}

// ── State ──
function sundayOnOrBefore(d) {
  const r = new Date(d);
  r.setDate(r.getDate() - r.getDay());
  return r;
}
function monthStartAnchor(year, month) {
  return sundayOnOrBefore(new Date(year, month, 1));
}
// gridAnchor is the Sunday that starts the visible 6-week (42-day) grid.
// Swiping shifts it by exactly one week; the month buttons and Today snap
// it back to a calendar-month-aligned start.
let gridAnchor = monthStartAnchor(new Date().getFullYear(), new Date().getMonth());
let events = []; // {id, title, date, time, category, notes, addedBy}
let calendarTitle = "Our Calendar";
let editingId = null;
let modalStartDate = null;
let modalEndDate = null;
let dpViewDate = new Date();
let dpAwaitingExtend = true;
let lastKnownRemoteContent = null;
let saveTimer = null;
let pushInFlight = false;

// ── Elements ──
const gridEl = document.getElementById("grid");
const monthLabel = document.getElementById("month-label");
const legendEl = document.getElementById("legend");
const modalOverlay = document.getElementById("modal-overlay");
const modalTitle = document.getElementById("modal-title");
const fTitle = document.getElementById("f-title");
const fDateDisplay = document.getElementById("f-date-display");
const datePopover = document.getElementById("date-popover");
const dpMonthLabel = document.getElementById("dp-month-label");
const dpGrid = document.getElementById("dp-grid");
const dpPrev = document.getElementById("dp-prev");
const dpNext = document.getElementById("dp-next");
const dpClear = document.getElementById("dp-clear");
const dpDone = document.getElementById("dp-done");
const fTime = document.getElementById("f-time");
const fCategory = document.getElementById("f-category");
const fNotes = document.getElementById("f-notes");
const addedByRow = document.getElementById("added-by-row");
const deleteBtn = document.getElementById("delete-btn");
const nameOverlay = document.getElementById("name-overlay");
const nameInput = document.getElementById("name-input");
const appTitleEl = document.getElementById("app-title");

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

// ── Local cache (so the app has something to show before the first fetch) ──
function loadCache() {
  try {
    const raw = localStorage.getItem("calendar_cache");
    if (raw) {
      const parsed = JSON.parse(raw);
      events = parsed.events || [];
      calendarTitle = parsed.title || calendarTitle;
    }
  } catch (e) {
    events = [];
  }
}
function saveCache() {
  localStorage.setItem("calendar_cache", JSON.stringify({ events, title: calendarTitle }));
}

// ── App title (editable, synced) ──
function applyTitle() {
  appTitleEl.textContent = calendarTitle;
  document.title = calendarTitle;
}

appTitleEl.addEventListener("keydown", (e) => {
  if (e.key === "Enter") { e.preventDefault(); appTitleEl.blur(); }
  else if (e.key === "Escape") { e.preventDefault(); appTitleEl.textContent = calendarTitle; appTitleEl.blur(); }
});
appTitleEl.addEventListener("blur", () => {
  const newTitle = appTitleEl.textContent.trim() || "Our Calendar";
  if (newTitle !== calendarTitle) {
    calendarTitle = newTitle;
    applyTitle();
    scheduleSave();
  } else {
    applyTitle();
  }
});

// ── Gist sync ──
function scheduleSave() {
  saveCache();
  clearTimeout(saveTimer);
  saveTimer = setTimeout(pushRemote, SAVE_DEBOUNCE_MS);
}

async function pushRemote() {
  if (!configured) return;
  pushInFlight = true;
  setSyncStatus("busy");
  const content = JSON.stringify({ events, title: calendarTitle });
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      method: "PATCH",
      headers: {
        Authorization: `token ${TOKEN}`,
        Accept: "application/vnd.github+json",
      },
      body: JSON.stringify({ files: { [FILENAME]: { content } } }),
    });
    if (!res.ok) throw new Error("push failed: " + res.status);
    lastKnownRemoteContent = content;
    setSyncStatus("ok");
  } catch (e) {
    setSyncStatus("error");
  } finally {
    pushInFlight = false;
  }
}

async function fetchRemote() {
  if (!configured) return;
  try {
    const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) throw new Error("fetch failed: " + res.status);
    const data = await res.json();
    const content = data.files && data.files[FILENAME] && data.files[FILENAME].content;
    if (content == null) throw new Error("missing file in gist");
    if (content !== lastKnownRemoteContent && !pushInFlight) {
      lastKnownRemoteContent = content;
      const parsed = JSON.parse(content);
      events = parsed.events || [];
      if (parsed.title) {
        calendarTitle = parsed.title;
        if (document.activeElement !== appTitleEl) applyTitle();
      }
      saveCache();
      renderCalendar();
    }
    setSyncStatus("ok");
  } catch (e) {
    setSyncStatus("error");
  }
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
// Renders a fixed 6-week (42-day) window starting at `anchor` (a Sunday).
// Days outside `refYear`/`refMonth` (the month shown in the header) are dimmed.
function buildWeekGrid(container, anchor, refYear, refMonth) {
  container.innerHTML = "";
  const tStr = todayStr();

  for (let i = 0; i < 42; i++) {
    const date = new Date(anchor);
    date.setDate(date.getDate() + i);
    const dateStr = toDateStr(date);
    const other = date.getMonth() !== refMonth || date.getFullYear() !== refYear;

    const cellEl = document.createElement("div");
    cellEl.className = "day-cell" + (other ? " other-month" : "") + (dateStr === tStr ? " today" : "");
    cellEl.dataset.date = dateStr;

    const numEl = document.createElement("div");
    numEl.className = "day-num";
    numEl.textContent = date.getDate();
    cellEl.appendChild(numEl);

    const dayEvents = events
      .filter(e => dateStr >= e.date && dateStr <= (e.endDate || e.date))
      .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

    const MAX_SHOWN = 3;
    dayEvents.slice(0, MAX_SHOWN).forEach(ev => {
      const chip = document.createElement("div");
      chip.className = "event-chip";
      chip.style.background = categoryColor(ev.category);
      const isStart = dateStr === ev.date;
      chip.textContent = isStart ? (ev.time ? ev.time + " " : "") + ev.title : "→ " + ev.title;
      chip.onclick = (e) => { e.stopPropagation(); openModal(ev.date, ev); };
      cellEl.appendChild(chip);
    });
    if (dayEvents.length > MAX_SHOWN) {
      const more = document.createElement("div");
      more.className = "event-more";
      more.textContent = `+${dayEvents.length - MAX_SHOWN} more`;
      cellEl.appendChild(more);
    }

    cellEl.onclick = () => openModal(dateStr, null);
    container.appendChild(cellEl);
  }
}

function renderCalendar() {
  const refDate = new Date(gridAnchor);
  refDate.setDate(refDate.getDate() + 17); // roughly the middle of the 6-week window
  monthLabel.textContent = refDate.toLocaleString("default", { month: "long", year: "numeric" });
  buildWeekGrid(gridEl, gridAnchor, refDate.getFullYear(), refDate.getMonth());
}

// ── Date field popover (pick a date, then pick another to extend the range) ──
function formatDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("default", { month: "short", day: "numeric", year: "numeric" });
}
function updateDateDisplay() {
  fDateDisplay.textContent = modalStartDate === modalEndDate
    ? formatDateLabel(modalStartDate)
    : `${formatDateLabel(modalStartDate)} → ${formatDateLabel(modalEndDate)}`;
}

function renderDatePopover() {
  dpMonthLabel.textContent = dpViewDate.toLocaleString("default", { month: "long", year: "numeric" });
  dpGrid.innerHTML = "";

  const year = dpViewDate.getFullYear();
  const month = dpViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells = [];
  for (let i = startOffset - 1; i >= 0; i--) {
    cells.push({ day: daysInPrevMonth - i, other: true, date: new Date(year, month - 1, daysInPrevMonth - i) });
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ day: d, other: false, date: new Date(year, month, d) });
  }
  while (cells.length % 7 !== 0) {
    const nextIdx = cells.length - (startOffset + daysInMonth) + 1;
    cells.push({ day: nextIdx, other: true, date: new Date(year, month + 1, nextIdx) });
  }

  cells.forEach(cell => {
    const dateStr = toDateStr(cell.date);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "dp-day" + (cell.other ? " other" : "");
    if (dateStr >= modalStartDate && dateStr <= modalEndDate) btn.classList.add("in-range");
    if (dateStr === modalStartDate) btn.classList.add("range-start");
    if (dateStr === modalEndDate) btn.classList.add("range-end");
    btn.textContent = cell.day;
    btn.onclick = () => handleDpDayClick(dateStr);
    dpGrid.appendChild(btn);
  });
}

function handleDpDayClick(dateStr) {
  if (dpAwaitingExtend) {
    if (dateStr < modalStartDate) modalStartDate = dateStr;
    else if (dateStr > modalEndDate) modalEndDate = dateStr;
    else { modalStartDate = dateStr; modalEndDate = dateStr; }
    dpAwaitingExtend = false;
  } else {
    modalStartDate = dateStr;
    modalEndDate = dateStr;
    dpAwaitingExtend = true;
  }
  updateDateDisplay();
  renderDatePopover();
}

function onDocClickForPopover(e) {
  if (!datePopover.contains(e.target) && e.target !== fDateDisplay) closeDatePopover();
}
function openDatePopover() {
  dpViewDate = new Date(modalStartDate + "T00:00:00");
  dpViewDate.setDate(1);
  dpAwaitingExtend = true;
  renderDatePopover();
  datePopover.classList.remove("hidden");
  document.addEventListener("click", onDocClickForPopover, true);
}
function closeDatePopover() {
  datePopover.classList.add("hidden");
  document.removeEventListener("click", onDocClickForPopover, true);
}

fDateDisplay.onclick = (e) => {
  e.stopPropagation();
  if (datePopover.classList.contains("hidden")) openDatePopover();
  else closeDatePopover();
};
dpPrev.onclick = () => { dpViewDate.setMonth(dpViewDate.getMonth() - 1); renderDatePopover(); };
dpNext.onclick = () => { dpViewDate.setMonth(dpViewDate.getMonth() + 1); renderDatePopover(); };
dpClear.onclick = () => { modalEndDate = modalStartDate; dpAwaitingExtend = true; updateDateDisplay(); renderDatePopover(); };
dpDone.onclick = () => closeDatePopover();

// ── Modal ──
function openModal(dateStr, existingEvent) {
  editingId = existingEvent ? existingEvent.id : null;
  modalTitle.textContent = existingEvent ? "Edit Event" : "New Event";
  fTitle.value = existingEvent ? existingEvent.title : "";
  modalStartDate = existingEvent ? existingEvent.date : dateStr;
  modalEndDate = existingEvent ? (existingEvent.endDate || existingEvent.date) : dateStr;
  updateDateDisplay();
  fTime.value = existingEvent ? (existingEvent.time || "") : "";
  fCategory.value = existingEvent ? existingEvent.category : CATEGORIES[0].key;
  fNotes.value = existingEvent ? (existingEvent.notes || "") : "";
  deleteBtn.classList.toggle("hidden", !existingEvent);
  addedByRow.textContent = existingEvent && existingEvent.addedBy ? `Added by ${existingEvent.addedBy}` : "";
  modalOverlay.classList.remove("hidden");
  closeDatePopover();
  fTitle.focus();
}
function closeModal() {
  modalOverlay.classList.add("hidden");
  closeDatePopover();
  editingId = null;
}

document.getElementById("modal-close").onclick = closeModal;
document.getElementById("cancel-btn").onclick = closeModal;
modalOverlay.onclick = (e) => { if (e.target === modalOverlay) closeModal(); };

document.getElementById("save-btn").onclick = () => {
  const title = fTitle.value.trim();
  if (!title) { fTitle.focus(); return; }
  if (!configured) { alert("GitHub sync isn't configured yet — see SETUP.md."); return; }

  ensureUsername((username) => {
    const startDate = modalStartDate;
    const endDate = modalEndDate;

    if (editingId) {
      const ev = events.find(e => e.id === editingId);
      if (ev) {
        ev.title = title;
        ev.date = startDate;
        ev.endDate = endDate;
        ev.time = fTime.value || "";
        ev.category = fCategory.value;
        ev.notes = fNotes.value.trim();
      }
    } else {
      events.unshift({
        id: uid(),
        title,
        date: startDate,
        endDate,
        time: fTime.value || "",
        category: fCategory.value,
        notes: fNotes.value.trim(),
        addedBy: username,
      });
    }
    renderCalendar();
    scheduleSave();
    closeModal();
  });
};

deleteBtn.onclick = () => {
  if (!editingId) return;
  if (!confirm("Delete this event?")) return;
  events = events.filter(e => e.id !== editingId);
  renderCalendar();
  scheduleSave();
  closeModal();
};

// ── Nav ──
function shiftMonth(delta) {
  const ref = new Date(gridAnchor);
  ref.setDate(ref.getDate() + 17);
  gridAnchor = monthStartAnchor(ref.getFullYear(), ref.getMonth() + delta);
  renderCalendar();
}
document.getElementById("prev-btn").onclick = () => shiftMonth(-1);
document.getElementById("next-btn").onclick = () => shiftMonth(1);
document.getElementById("today-btn").onclick = () => {
  const now = new Date();
  gridAnchor = monthStartAnchor(now.getFullYear(), now.getMonth());
  renderCalendar();
};
document.getElementById("add-fab").onclick = () => openModal(todayStr(), null);

// ── Drag up/down on the grid to move a week at a time ──
const SWIPE_TRIGGER_PX = 55;
let swipeState = null;
let suppressGridClick = false;

gridEl.addEventListener("pointerdown", (e) => {
  if (e.button !== undefined && e.button !== 0) return;
  suppressGridClick = false;
  swipeState = { pointerId: e.pointerId, startX: e.clientX, startY: e.clientY };
});

document.addEventListener("pointermove", (e) => {
  if (!swipeState || swipeState.pointerId !== e.pointerId) return;
  const dx = e.clientX - swipeState.startX;
  const dy = e.clientY - swipeState.startY;
  if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 10) e.preventDefault();
  if (Math.abs(dy) > SWIPE_TRIGGER_PX && Math.abs(dy) > Math.abs(dx)) {
    gridAnchor.setDate(gridAnchor.getDate() + (dy < 0 ? 7 : -7));
    renderCalendar();
    swipeState.startX = e.clientX;
    swipeState.startY = e.clientY;
    suppressGridClick = true;
  }
});

document.addEventListener("pointerup", (e) => {
  if (!swipeState || swipeState.pointerId !== e.pointerId) return;
  swipeState = null;
});
document.addEventListener("pointercancel", (e) => {
  if (!swipeState || swipeState.pointerId !== e.pointerId) return;
  swipeState = null;
});

gridEl.addEventListener("click", (e) => {
  if (suppressGridClick) { e.stopPropagation(); suppressGridClick = false; }
}, true);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") fetchRemote();
});

// ── Init ──
if (!configured) {
  setupBanner.classList.remove("hidden");
  setSyncStatus("error");
}
renderLegend();
loadCache();
applyTitle();
renderCalendar();
fetchRemote();
setInterval(fetchRemote, POLL_MS);

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
