import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInWithPopup,
  GoogleAuthProvider,
  signOut
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// ====================
// Firebase
// ====================
const firebaseConfig = {
  apiKey: "AIzaSyB9SFmEWpMm_COKm_a-I606hBurvPqIhE8",
  authDomain: "test-bf28a.firebaseapp.com",
  projectId: "test-bf28a",
  storageBucket: "test-bf28a.firebasestorage.app",
  messagingSenderId: "609094155946",
  appId: "1:609094155946:web:250649b8c6adc472cfdad3",
  measurementId: "G-GCGP3SMX23"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ====================
// 基本設定
// ====================
let CLASS_ID = "class1";
const STUDENT_COUNT = 24;
let currentMode = "attendance";
let unsubscribeAttendance = null;

// ====================
// 状態
// ====================
let students = [];
let currentAttendance = {
  slot1: [],
  slot2: [],
  slot3: []
};
let draftAttendance = {
  slot1: [],
  slot2: [],
  slot3: []
};

let currentNomination = null;
let monthlyNominationCounts = {};

// ====================
// DOM
// ====================
const authStatus = document.getElementById("authStatus");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginMessage = document.getElementById("loginMessage");
const appBody = document.getElementById("appBody");

const modeAttendanceBtn = document.getElementById("modeAttendanceBtn");
const modeNominateBtn = document.getElementById("modeNominateBtn");
const modeSettingsBtn = document.getElementById("modeSettingsBtn");

const attendancePanel = document.getElementById("attendancePanel");
const studentListPanel = document.getElementById("studentListPanel");
const nominatePanel = document.getElementById("nominatePanel");
const settingsPanel = document.getElementById("settingsPanel");

const classSelect = document.getElementById("classSelect");
const settingsClassSelect = document.getElementById("settingsClassSelect");
const nominateClassSelect = document.getElementById("nominateClassSelect");

const dateInput = document.getElementById("dateInput");
const settingsDateInput = document.getElementById("settingsDateInput");
const nominateDateInput = document.getElementById("nominateDateInput");

const slotSelect = document.getElementById("slotSelect");
const nominateSlotSelect = document.getElementById("nominateSlotSelect");

const saveBtn = document.getElementById("saveBtn");
const todayBtn = document.getElementById("todayBtn");
const prevDayBtn = document.getElementById("prevDayBtn");
const prevWeekBtn = document.getElementById("prevWeekBtn");
const prevMonthBtn = document.getElementById("prevMonthBtn");

const initStudentsBtn = document.getElementById("initStudentsBtn");
const exportCsvBtn = document.getElementById("exportCsvBtn");
const csvFileInput = document.getElementById("csvFileInput");

const absentCount = document.getElementById("absentCount");
const saveState = document.getElementById("saveState");
const slot1State = document.getElementById("slot1State");
const slot2State = document.getElementById("slot2State");
const slot3State = document.getElementById("slot3State");

const studentGrid = document.getElementById("studentGrid");
const studentCount = document.getElementById("studentCount");

const randomNominateBtn = document.getElementById("randomNominateBtn");
const clearNominateBtn = document.getElementById("clearNominateBtn");
const aggregateNominateBtn = document.getElementById("aggregateNominateBtn");
const currentNomineeName = document.getElementById("currentNomineeName");
const currentNomineeNo = document.getElementById("currentNomineeNo");
const nominateState = document.getElementById("nominateState");
const nominateStudentGrid = document.getElementById("nominateStudentGrid");

// ====================
// 開始
// ====================
init();

function init() {
  if (classSelect?.value) {
    CLASS_ID = normalizeClassKey(classSelect.value);
  }

  if (dateInput) dateInput.value = todayStr();
  if (settingsDateInput) settingsDateInput.value = todayStr();
  if (nominateDateInput) nominateDateInput.value = todayStr();

  if (settingsClassSelect) settingsClassSelect.value = CLASS_ID;
  if (nominateClassSelect) nominateClassSelect.value = CLASS_ID;

  bindEvents();
  showLoggedOut();
  setMode("attendance");

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      cleanupAttendanceWatcher();
      clearAttendanceState();
      showLoggedOut();
      return;
    }

    try {
      showLoggedIn(user.email || "");
      await ensureStudentsExist();
      await loadStudents();
      watchAttendance();
    } catch (err) {
      console.error(err);
      alert("初期読込に失敗しました。");
      cleanupAttendanceWatcher();
      clearAttendanceState();
      showLoggedOut();
    }
  });
}

// ====================
// イベント
// ====================
function bindEvents() {
  loginBtn?.addEventListener("click", loginTeacher);
  logoutBtn?.addEventListener("click", logoutTeacher);

  modeAttendanceBtn?.addEventListener("click", () => setMode("attendance"));
  modeNominateBtn?.addEventListener("click", () => setMode("nominate"));
  modeSettingsBtn?.addEventListener("click", () => setMode("settings"));

  classSelect?.addEventListener("change", async () => {
    CLASS_ID = normalizeClassKey(classSelect.value);
    syncClassSelectors();
    cleanupAttendanceWatcher();
    clearAttendanceState();

    try {
      await ensureStudentsExist();
      await loadStudents();
      watchAttendance();
      updateSaveState("クラス切替");
    } catch (err) {
      console.error(err);
      alert("クラス切替に失敗しました。");
    }
  });

  settingsClassSelect?.addEventListener("change", async () => {
    CLASS_ID = normalizeClassKey(settingsClassSelect.value);
    syncClassSelectors();
    cleanupAttendanceWatcher();
    clearAttendanceState();

    try {
      await ensureStudentsExist();
      await loadStudents();
      watchAttendance();
    } catch (err) {
      console.error(err);
      alert("クラス切替に失敗しました。");
    }
  });

  nominateClassSelect?.addEventListener("change", async () => {
    CLASS_ID = normalizeClassKey(nominateClassSelect.value);
    syncClassSelectors();
    cleanupAttendanceWatcher();
    clearAttendanceState();

    try {
      await ensureStudentsExist();
      await loadStudents();
      watchAttendance();
      loadNominateView();
    } catch (err) {
      console.error(err);
      alert("クラス切替に失敗しました。");
    }
  });

  dateInput?.addEventListener("change", () => {
    if (settingsDateInput) settingsDateInput.value = dateInput.value;
    if (nominateDateInput) nominateDateInput.value = dateInput.value;
    watchAttendance();
  });

  settingsDateInput?.addEventListener("change", () => {
    if (dateInput) dateInput.value = settingsDateInput.value;
    if (nominateDateInput) nominateDateInput.value = settingsDateInput.value;
    watchAttendance();
  });

  nominateDateInput?.addEventListener("change", () => {
    if (dateInput) dateInput.value = nominateDateInput.value;
    if (settingsDateInput) settingsDateInput.value = nominateDateInput.value;
    watchAttendance();
  });

  slotSelect?.addEventListener("change", async () => {
    if (nominateSlotSelect) nominateSlotSelect.value = slotSelect.value;
    await renderStudentGrid();
    updateAbsentCount();
    updateSaveState("読み込み済み");
  });

  nominateSlotSelect?.addEventListener("change", () => {
    if (slotSelect) slotSelect.value = nominateSlotSelect.value;
    renderNominateGrid();
  });

  saveBtn?.addEventListener("click", saveAttendance);

  todayBtn?.addEventListener("click", () => {
    const t = todayStr();
    if (dateInput) dateInput.value = t;
    if (settingsDateInput) settingsDateInput.value = t;
    if (nominateDateInput) nominateDateInput.value = t;
    watchAttendance();
  });

  prevDayBtn?.addEventListener("click", () => moveDateByDays(-1));
  prevWeekBtn?.addEventListener("click", () => moveDateByDays(-7));
  prevMonthBtn?.addEventListener("click", () => moveDateByMonths(-1));

 

  csvFileInput?.addEventListener("change", importStudentsFromCsvFile);

  exportCsvBtn?.addEventListener("click", exportStudentsCsv);

  studentGrid?.addEventListener("click", (e) => {
    const btn = e.target.closest(".state-btn");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    toggleAbsent(id);
  });

  studentGrid?.addEventListener("input", async (e) => {
    const input = e.target.closest(".name-input");
    if (!input) return;

    const id = String(input.dataset.id);
    const name = input.value.trim();

    try {
      await updateDoc(doc(db, "classes", CLASS_ID, "students", id), {
        name: name || `生徒${id}`
      });

      const target = students.find((s) => String(s.id) === id);
      if (target) {
        target.name = name || `生徒${id}`;
      }
      renderNominateGrid();
    } catch (err) {
      console.error(err);
      alert("名前の保存に失敗しました。");
    }
  });

  randomNominateBtn?.addEventListener("click", nominateRandomStudent);
  clearNominateBtn?.addEventListener("click", clearNomination);
  aggregateNominateBtn?.addEventListener("click", aggregateNominationCounts);

  nominateStudentGrid?.addEventListener("click", (e) => {
    const btn = e.target.closest(".force-nominate-btn");
    if (!btn) return;

    const id = Number(btn.dataset.id);
    if (btn.disabled) return;
    forceNominateStudent(id);
  });
}

// ====================
// 表示制御
// ====================
function setMode(mode) {
  currentMode = mode;

  const isAttendance = mode === "attendance";
  const isNominate = mode === "nominate";
  const isSettings = mode === "settings";

  if (attendancePanel) attendancePanel.style.display = isAttendance ? "" : "none";
  if (studentListPanel) studentListPanel.style.display = isAttendance ? "" : "none";
  if (nominatePanel) nominatePanel.style.display = isNominate ? "" : "none";
  if (settingsPanel) settingsPanel.style.display = isSettings ? "" : "none";

  if (modeAttendanceBtn) {
    modeAttendanceBtn.className = `btn ${isAttendance ? "primary" : "secondary"}`;
  }
  if (modeNominateBtn) {
    modeNominateBtn.className = `btn ${isNominate ? "primary" : "secondary"}`;
  }
  if (modeSettingsBtn) {
    modeSettingsBtn.className = `btn ${isSettings ? "primary" : "secondary"}`;
  }

  if (isNominate) {
    loadNominateView();
  }
}

function showLoggedOut() {
  if (appBody) appBody.style.display = "none";
  if (loginBtn) loginBtn.style.display = "inline-flex";
  if (logoutBtn) logoutBtn.style.display = "none";
  if (loginMessage) loginMessage.textContent = "先生ログインが必要です。";
  if (authStatus) authStatus.textContent = "未ログイン";
}

function showLoggedIn(email = "") {
  if (appBody) appBody.style.display = "block";
  if (loginBtn) loginBtn.style.display = "none";
  if (logoutBtn) logoutBtn.style.display = "inline-flex";
  if (loginMessage) loginMessage.textContent = email ? `ログイン中: ${email}` : "ログイン中";
  if (authStatus) authStatus.textContent = "先生ログイン済み";
}

function syncClassSelectors() {
  if (classSelect) classSelect.value = CLASS_ID;
  if (settingsClassSelect) settingsClassSelect.value = CLASS_ID;
  if (nominateClassSelect) nominateClassSelect.value = CLASS_ID;
}

function cleanupAttendanceWatcher() {
  if (unsubscribeAttendance) {
    unsubscribeAttendance();
    unsubscribeAttendance = null;
  }
}

function clearAttendanceState() {
  currentAttendance = { slot1: [], slot2: [], slot3: [] };
  draftAttendance = { slot1: [], slot2: [], slot3: [] };
  students = [];
  currentNomination = null;

  if (studentGrid) studentGrid.innerHTML = "";
  if (nominateStudentGrid) nominateStudentGrid.innerHTML = "";
  if (studentCount) studentCount.textContent = "登録人数：0人";
  if (absentCount) absentCount.textContent = "0";
  if (saveState) saveState.textContent = "---";
  if (slot1State) slot1State.textContent = "---";
  if (slot2State) slot2State.textContent = "---";
  if (slot3State) slot3State.textContent = "---";
  renderCurrentNominee();
}

// ====================
// ログイン
// ====================
async function loginTeacher() {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    console.error(err);
    alert("ログインに失敗しました。");
  }
}

async function logoutTeacher() {
  try {
    await signOut(auth);
  } catch (err) {
    console.error(err);
    alert("ログアウトに失敗しました。");
  }
}

// ====================
// 名簿
// ====================
async function ensureStudentsExist() {
  const snap = await getDocs(collection(db, "classes", CLASS_ID, "students"));
  if (!snap.empty) return;

  for (let i = 1; i <= STUDENT_COUNT; i++) {
    await setDoc(doc(db, "classes", CLASS_ID, "students", String(i)), {
      id: i,
      displayNo: String(i),
      name: `生徒${i}`
    });
  }
}

async function resetStudents() {
  for (let i = 1; i <= STUDENT_COUNT; i++) {
    await setDoc(doc(db, "classes", CLASS_ID, "students", String(i)), {
      id: i,
      displayNo: String(i),
      name: `生徒${i}`
    });
  }
}

async function importStudentsFromCsvFile(e) {
  const file = e.target.files?.[0];
  if (!file) return;

  try {
    const text = await file.text();
    const studentsFromCsv = parseSingleClassCsv(text);

    if (!studentsFromCsv.length) {
      alert("CSVから番号・氏名を読み取れませんでした。");
      return;
    }

    const ok = confirm(`クラス「${CLASS_ID}」に ${studentsFromCsv.length}人分の名簿を登録します。よろしいですか？`);
    if (!ok) return;

    for (let i = 1; i <= STUDENT_COUNT; i++) {
      const row = studentsFromCsv[i - 1];
      await setDoc(doc(db, "classes", CLASS_ID, "students", String(i)), {
        id: i,
        displayNo: row?.displayNo || String(i),
        name: row?.name || `生徒${i}`
      });
    }

    await loadStudents();
    alert(`クラス「${CLASS_ID}」の名簿を登録しました。`);
  } catch (err) {
    console.error(err);
    alert("CSVの読込に失敗しました。");
  } finally {
    if (csvFileInput) csvFileInput.value = "";
  }
}

async function loadStudents() {
  const snap = await getDocs(collection(db, "classes", CLASS_ID, "students"));
  students = snap.docs
    .map((d) => d.data())
    .sort((a, b) => {
      const aNo = Number(a.displayNo);
      const bNo = Number(b.displayNo);
      if (!Number.isNaN(aNo) && !Number.isNaN(bNo)) return aNo - bNo;
      return String(a.displayNo || "").localeCompare(String(b.displayNo || ""));
    });

  await renderStudentGrid();
  renderNominateGrid();
}

function parseSingleClassCsv(text) {
  const rows = parseCsv(text)
    .map((row) => row.map((v) => String(v ?? "").trim()))
    .filter((row) => row.some((v) => v !== ""));

  if (!rows.length) return [];

  const header = rows[0].map((v) => normalizeHeader(v));
  const noIndex = findHeaderIndex(header, ["番号", "no", "num", "displayno"]);
  const nameIndex = findHeaderIndex(header, ["氏名", "名前", "name"]);

  const body = (noIndex !== -1 || nameIndex !== -1) ? rows.slice(1) : rows;

  return body
    .map((row, idx) => {
      let displayNo = "";
      let name = "";

      if (noIndex !== -1) {
        displayNo = row[noIndex] || "";
      } else {
        displayNo = row[0] || String(idx + 1);
      }

      if (nameIndex !== -1) {
        name = row[nameIndex] || "";
      } else {
        name = row[1] || "";
      }

      return {
        displayNo: displayNo || String(idx + 1),
        name: name || `生徒${idx + 1}`
      };
    })
    .filter((row) => row.displayNo || row.name);
}

function exportStudentsCsv() {
  const lines = [["番号", "氏名"]];
  for (const s of students) {
    lines.push([s.displayNo ?? "", s.name ?? ""]);
  }

  const csv = "\uFEFF" + lines.map((row) => row.map(csvEscape).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${CLASS_ID}_meibo.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ====================
// 出欠
// ====================
function attendanceRef(dateStr) {
  return doc(db, "classes", CLASS_ID, "attendance", dateStr);
}

function watchAttendance() {
  const dateStr = dateInput?.value;
  if (!dateStr) return;

  cleanupAttendanceWatcher();

  unsubscribeAttendance = onSnapshot(
    attendanceRef(dateStr),
    async (snap) => {
      if (!snap.exists()) {
        currentAttendance = { slot1: [], slot2: [], slot3: [] };
      } else {
        const data = snap.data();
        currentAttendance = {
          slot1: Array.isArray(data.slot1) ? data.slot1 : [],
          slot2: Array.isArray(data.slot2) ? data.slot2 : [],
          slot3: Array.isArray(data.slot3) ? data.slot3 : []
        };
      }

      draftAttendance = {
        slot1: [...currentAttendance.slot1],
        slot2: [...currentAttendance.slot2],
        slot3: [...currentAttendance.slot3]
      };

      await renderStudentGrid();
      renderSlotStates();
      updateAbsentCount();
      updateSaveState("読み込み済み");
      renderNominateGrid();
    },
    (err) => {
      console.error(err);
      alert("出欠データの読込に失敗しました。");
    }
  );
}

async function saveAttendance() {
  const dateStr = dateInput?.value;
  const slot = getCurrentSlotKey();
  if (!dateStr || !slot) return;

  try {
    const ref = attendanceRef(dateStr);
    const snap = await getDoc(ref);

    let data = { slot1: [], slot2: [], slot3: [] };

    if (snap.exists()) {
      const old = snap.data();
      data.slot1 = Array.isArray(old.slot1) ? old.slot1 : [];
      data.slot2 = Array.isArray(old.slot2) ? old.slot2 : [];
      data.slot3 = Array.isArray(old.slot3) ? old.slot3 : [];
    }

    data[slot] = [...draftAttendance[slot]].sort((a, b) => a - b);

    await setDoc(ref, {
      ...data,
      updatedAt: serverTimestamp()
    });

    currentAttendance = {
      slot1: [...data.slot1],
      slot2: [...data.slot2],
      slot3: [...data.slot3]
    };

    draftAttendance = {
      slot1: [...data.slot1],
      slot2: [...data.slot2],
      slot3: [...data.slot3]
    };

    await renderStudentGrid();
    renderSlotStates();
    updateAbsentCount();
    updateSaveState("保存済み");
    renderNominateGrid();
  } catch (err) {
    console.error(err);
    alert("保存に失敗しました。");
  }
}

async function toggleAbsent(studentId) {
  const slot = getCurrentSlotKey();
  if (!slot) return;

  const set = new Set(draftAttendance[slot] || []);
  if (set.has(studentId)) {
    set.delete(studentId);
  } else {
    set.add(studentId);
  }

  draftAttendance[slot] = [...set].sort((a, b) => a - b);

  await renderStudentGrid();
  updateAbsentCount();
  updateSaveState("未保存");
  renderNominateGrid();
}

function getCurrentSlotKey() {
  const value = slotSelect?.value;
  return value ? `slot${value}` : null;
}

function isAbsentInDraft(studentId) {
  const slot = getCurrentSlotKey();
  if (!slot) return false;
  return (draftAttendance[slot] || []).includes(studentId);
}

async function renderStudentGrid() {
  if (!studentGrid) return;

  studentGrid.innerHTML = students.map((s) => {
    const absent = isAbsentInDraft(Number(s.id));

    return `
      <div class="student-card ${absent ? "row-absent" : ""}">
        <div class="student-id-box">${escapeHtml(s.displayNo || s.id)}</div>
        <input
          class="student-name name-input"
          data-id="${s.id}"
          value="${escapeHtmlAttr(s.name || "")}"
        />
        <button
          class="state-btn ${absent ? "state-absent" : "state-present"}"
          data-id="${s.id}"
        >
          ${absent ? "欠席" : "出席"}
        </button>
        <div class="total-count">-</div>
        <div class="total-count">-</div>
        <div class="total-count">-</div>
      </div>
    `;
  }).join("");

  if (studentCount) {
    studentCount.textContent = `登録人数：${students.length}人`;
  }
}

function renderSlotStates() {
  if (slot1State) slot1State.textContent = currentAttendance.slot1.length ? "入力済み" : "---";
  if (slot2State) slot2State.textContent = currentAttendance.slot2.length ? "入力済み" : "---";
  if (slot3State) slot3State.textContent = currentAttendance.slot3.length ? "入力済み" : "---";
}

function updateAbsentCount() {
  const slot = getCurrentSlotKey();
  const count = slot ? (draftAttendance[slot] || []).length : 0;
  if (absentCount) absentCount.textContent = String(count);
}

function updateSaveState(text) {
  if (saveState) saveState.textContent = text;
}

// ====================
// 指名
// ====================
function loadNominateView() {
  if (nominateClassSelect) nominateClassSelect.value = CLASS_ID;
  if (nominateDateInput && dateInput) nominateDateInput.value = dateInput.value;
  if (nominateSlotSelect && slotSelect) nominateSlotSelect.value = slotSelect.value;

  renderNominateGrid();
  renderCurrentNominee();
}

function getNominateSlotKey() {
  const value = nominateSlotSelect?.value || slotSelect?.value || "1";
  return `slot${value}`;
}

function getAbsentIdsForNominate() {
  const slot = getNominateSlotKey();
  return Array.isArray(currentAttendance[slot]) ? currentAttendance[slot] : [];
}

function renderCurrentNominee() {
  if (!currentNomination) {
    if (currentNomineeName) currentNomineeName.textContent = "---";
    if (currentNomineeNo) currentNomineeNo.textContent = "---";
    if (nominateState) nominateState.textContent = "未指名";
    return;
  }

  if (currentNomineeName) currentNomineeName.textContent = currentNomination.name || "---";
  if (currentNomineeNo) currentNomineeNo.textContent = currentNomination.displayNo || "---";
  if (nominateState) nominateState.textContent = "指名中";
}

function renderNominateGrid() {
  if (!nominateStudentGrid) return;

  const absentIds = new Set(getAbsentIdsForNominate());

  nominateStudentGrid.innerHTML = students.map((s) => {
    const monthCount = monthlyNominationCounts[String(s.id)] || 0;
    const absent = absentIds.has(Number(s.id));

    return `
      <div class="student-card ${absent ? "row-absent" : ""}">
        <div class="student-id-box">${escapeHtml(s.displayNo || s.id)}</div>
        <div>
          <div style="font-weight:700;">${escapeHtml(s.name || "")}</div>
          <div style="font-size:13px;color:#666;">月累計：${monthCount}回</div>
        </div>
        <button
          class="btn ${absent ? "secondary" : "primary"} force-nominate-btn"
          data-id="${s.id}"
          ${absent ? "disabled" : ""}
        >
          ${absent ? "欠席" : "強制指名"}
        </button>
      </div>
    `;
  }).join("");
}

function nominateRandomStudent() {
  const absentIds = new Set(getAbsentIdsForNominate());
  const candidates = students.filter((s) => !absentIds.has(Number(s.id)));

  if (!candidates.length) {
    alert("指名できる生徒がいません。");
    return;
  }

  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  currentNomination = picked;
  renderCurrentNominee();
}

function forceNominateStudent(studentId) {
  const student = students.find((s) => Number(s.id) === Number(studentId));
  if (!student) return;

  currentNomination = student;
  renderCurrentNominee();
}

function clearNomination() {
  currentNomination = null;
  renderCurrentNominee();
}

function aggregateNominationCounts() {
  if (!currentNomination) {
    alert("先に指名してください。");
    return;
  }

  const id = String(currentNomination.id);
  monthlyNominationCounts[id] = (monthlyNominationCounts[id] || 0) + 1;

  renderNominateGrid();
  renderCurrentNominee();

  if (nominateState) nominateState.textContent = "集計済み";
  alert(`${currentNomination.name} を集計しました。`);
}

// ====================
// 日付移動
// ====================
function moveDateByDays(days) {
  if (!dateInput?.value) return;
  const d = new Date(dateInput.value);
  d.setDate(d.getDate() + days);
  const v = dateToInputValue(d);

  if (dateInput) dateInput.value = v;
  if (settingsDateInput) settingsDateInput.value = v;
  if (nominateDateInput) nominateDateInput.value = v;

  watchAttendance();
}

function moveDateByMonths(months) {
  if (!dateInput?.value) return;
  const d = new Date(dateInput.value);
  d.setMonth(d.getMonth() + months);
  const v = dateToInputValue(d);

  if (dateInput) dateInput.value = v;
  if (settingsDateInput) settingsDateInput.value = v;
  if (nominateDateInput) nominateDateInput.value = v;

  watchAttendance();
}

// ====================
// 共通関数
// ====================
function todayStr() {
  return dateToInputValue(new Date());
}

function dateToInputValue(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function normalizeClassKey(value) {
  return String(value || "class1").trim();
}

function normalizeHeader(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0xFEE0)
    );
}

function findHeaderIndex(headerRow, candidates) {
  return headerRow.findIndex((h) => candidates.includes(h));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let inQuotes = false;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (ch === ",") {
      row.push(cell);
      cell = "";
      i++;
      continue;
    }

    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
      continue;
    }

    if (ch === "\r") {
      i++;
      continue;
    }

    cell += ch;
    i++;
  }

  row.push(cell);
  rows.push(row);
  return rows;
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (/[",\r\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (m) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[m]));
}

function escapeHtmlAttr(value) {
  return escapeHtml(value);
}
