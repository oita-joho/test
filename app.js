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
  serverTimestamp,
  deleteDoc
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";


const firebaseConfig = {
  apiKey: "AIzaSyB9SFmEWpMm_COKm_a-I606hBurvPqIhE8",
  authDomain: "test-bf28a.firebaseapp.com",
  projectId: "test-bf28a",
  storageBucket: "test-bf28a.firebasestorage.app",
  messagingSenderId: "609094155946",
  appId: "1:609094155946:web:250649b8c6adc472cfdad3",
  measurementId: "G-GCGP3SMX23"
};

let CLASS_ID = "class1";
const STUDENT_COUNT = 24;
let currentMode = "attendance";
let attendanceCollapsed = false;

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

const authStatus = document.getElementById("authStatus");

const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const loginMessage = document.getElementById("loginMessage");
const appBody = document.getElementById("appBody");

const modeAttendanceBtn = document.getElementById("modeAttendanceBtn");
const modeSettingsBtn = document.getElementById("modeSettingsBtn");
const attendanceToggleBar = document.getElementById("attendanceToggleBar");
const openAttendanceBtn = document.getElementById("openAttendanceBtn");
const attendancePanel = document.getElementById("attendancePanel");
const settingsPanel = document.getElementById("settingsPanel");
const studentListPanel = document.getElementById("studentListPanel");

const classSelect = document.getElementById("classSelect");
const settingsClassSelect = document.getElementById("settingsClassSelect");
const dateInput = document.getElementById("dateInput");
const settingsDateInput = document.getElementById("settingsDateInput");
const slotSelect = document.getElementById("slotSelect");

const saveBtn = document.getElementById("saveBtn");
const todayBtn = document.getElementById("todayBtn");
const prevDayBtn = document.getElementById("prevDayBtn");
const prevWeekBtn = document.getElementById("prevWeekBtn");
const prevMonthBtn = document.getElementById("prevMonthBtn");
const resetMonthBtn = document.getElementById("resetMonthBtn");
const resetYearBtn = document.getElementById("resetYearBtn");
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
let unsubscribeAttendance = null;

init();

async function init() {
  if (classSelect?.value) {
    CLASS_ID = normalizeClassKey(classSelect.value);
  }

  if (dateInput) dateInput.value = todayStr();
  if (settingsDateInput) settingsDateInput.value = todayStr();
  if (settingsClassSelect) settingsClassSelect.value = CLASS_ID;

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
      const ok = await isTeacher(user.uid);

      if (!ok) {
        alert("このGoogleアカウントには先生権限がありません。");
        await signOut(auth);
        cleanupAttendanceWatcher();
        clearAttendanceState();
        showLoggedOut();
        return;
      }

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

function bindEvents() {
  loginBtn?.addEventListener("click", loginTeacher);
  logoutBtn?.addEventListener("click", logoutTeacher);

  modeAttendanceBtn?.addEventListener("click", () => setMode("attendance"));
  modeSettingsBtn?.addEventListener("click", () => setMode("settings"));

  openAttendanceBtn?.addEventListener("click", () => {
    attendanceCollapsed = false;
    updateAttendanceVisibility();
  });

  classSelect?.addEventListener("change", async () => {
    CLASS_ID = normalizeClassKey(classSelect.value);
    if (settingsClassSelect) settingsClassSelect.value = CLASS_ID;

    cleanupAttendanceWatcher();
    clearAttendanceState();
    attendanceCollapsed = false;
    updateAttendanceVisibility();

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

  settingsClassSelect?.addEventListener("change", () => {
    CLASS_ID = normalizeClassKey(settingsClassSelect.value);
    if (classSelect) classSelect.value = CLASS_ID;
  });

  dateInput?.addEventListener("change", () => {
    if (settingsDateInput) settingsDateInput.value = dateInput.value;
    attendanceCollapsed = false;
    updateAttendanceVisibility();
    watchAttendance();
  });

  settingsDateInput?.addEventListener("change", () => {
    if (dateInput) dateInput.value = settingsDateInput.value;
  });

  slotSelect?.addEventListener("change", async () => {
    await renderStudentGrid();
    updateAbsentCount();
    updateSaveState("読み込み済み");
  });

  saveBtn?.addEventListener("click", saveAttendance);

  todayBtn?.addEventListener("click", () => {
    dateInput.value = todayStr();
    if (settingsDateInput) settingsDateInput.value = dateInput.value;
    attendanceCollapsed = false;
    updateAttendanceVisibility();
    watchAttendance();
  });

  prevDayBtn?.addEventListener("click", () => moveDateByDays(-1));
  prevWeekBtn?.addEventListener("click", () => moveDateByDays(-7));
  prevMonthBtn?.addEventListener("click", () => moveDateByMonths(-1));

  resetMonthBtn?.addEventListener("click", resetMonthData);
  resetYearBtn?.addEventListener("click", resetYearData);
  exportCsvBtn?.addEventListener("click", exportAttendanceCsv);

  initStudentsBtn?.addEventListener("click", async () => {
    const ok = confirm(`クラス「${CLASS_ID}」の名簿を 1〜${STUDENT_COUNT} の初期状態に戻します。よろしいですか？`);
    if (!ok) return;

    try {
      await resetStudents();
      await loadStudents();
      alert("名簿を初期化しました。");
    } catch (err) {
      console.error(err);
      alert("名簿初期化に失敗しました。");
    }
  });

  csvFileInput?.addEventListener("change", async (e) => {
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

      await importStudentsFromCsv(studentsFromCsv);
      await loadStudents();
      alert(`クラス「${CLASS_ID}」の名簿を登録しました。`);
    } catch (err) {
      console.error(err);
      alert("CSVの読込に失敗しました。");
    } finally {
      csvFileInput.value = "";
    }
  });

  studentGrid?.addEventListener("click", (e) => {
    if (e.target.classList.contains("state-btn")) {
      const id = Number(e.target.dataset.id);
      toggleAbsent(id);
    }
  });

  studentGrid?.addEventListener("input", async (e) => {
    if (!e.target.classList.contains("name-input")) return;

    const id = e.target.dataset.id;
    const name = e.target.value.trim();

    try {
      await updateDoc(doc(db, "classes", CLASS_ID, "students", id), {
        name: name || `生徒${id}`
      });

      const student = students.find(s => s.id === Number(id));
      if (student) {
        student.name = name || `生徒${id}`;
      }
    } catch (err) {
      console.error(err);
      alert("名前の保存に失敗しました。");
    }
  });
}

function setMode(mode) {
  currentMode = mode;

  if (settingsPanel) {
    settingsPanel.style.display = mode === "settings" ? "" : "none";
  }

  updateAttendanceVisibility();

  if (modeAttendanceBtn) {
    modeAttendanceBtn.className = `btn ${mode === "attendance" ? "primary" : "secondary"}`;
  }
  if (modeSettingsBtn) {
    modeSettingsBtn.className = `btn ${mode === "settings" ? "primary" : "secondary"}`;
  }
}

function updateAttendanceVisibility() {
  const isAttendanceMode = currentMode === "attendance";

  if (attendancePanel) {
    attendancePanel.style.display = isAttendanceMode && !attendanceCollapsed ? "" : "none";
  }

  if (studentListPanel) {
    studentListPanel.style.display = isAttendanceMode && !attendanceCollapsed ? "" : "none";
  }

  if (attendanceToggleBar) {
    attendanceToggleBar.style.display = isAttendanceMode && attendanceCollapsed ? "" : "none";
  }
}

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

async function isTeacher(uid) {
  const ref = doc(db, "teachers", uid);
  const snap = await getDoc(ref);
  return snap.exists() && snap.data().active === true;
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

  if (studentGrid) studentGrid.innerHTML = "";
  if (studentCount) studentCount.textContent = "登録人数：0人";
  if (absentCount) absentCount.textContent = "0";
  if (saveState) saveState.textContent = "---";
  if (slot1State) slot1State.textContent = "---";
  if (slot2State) slot2State.textContent = "---";
  if (slot3State) slot3State.textContent = "---";
}

async function ensureStudentsExist() {
  const snap = await getDocs(collection(db, "classes", CLASS_ID, "students"));
  if (!snap.empty) return;

  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const ref = doc(db, "classes", CLASS_ID, "students", String(i));
    await setDoc(ref, {
      id: i,
      displayNo: String(i),
      name: `生徒${i}`
    });
  }
}

async function resetStudents() {
  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const ref = doc(db, "classes", CLASS_ID, "students", String(i));
    await setDoc(ref, {
      id: i,
      displayNo: String(i),
      name: `生徒${i}`
    });
  }
}

async function importStudentsFromCsv(studentsFromCsv) {
  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const ref = doc(db, "classes", CLASS_ID, "students", String(i));
    const row = studentsFromCsv[i - 1];

    await setDoc(ref, {
      id: i,
      displayNo: row?.displayNo || String(i),
      name: row?.name || `生徒${i}`
    });
  }
}

async function loadStudents() {
  const snap = await getDocs(collection(db, "classes", CLASS_ID, "students"));
  students = snap.docs
    .map(d => d.data())
    .sort((a, b) => {
      const aNo = Number(a.displayNo);
      const bNo = Number(b.displayNo);
      if (!Number.isNaN(aNo) && !Number.isNaN(bNo)) return aNo - bNo;
      return String(a.displayNo || "").localeCompare(String(b.displayNo || ""));
    });

  await renderStudentGrid();
}

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

    attendanceCollapsed = true;
    updateAttendanceVisibility();
  } catch (err) {
    console.error(err);
    alert("保存に失敗しました。");
  }
}

async function toggleAbsent(studentId) {
  const slot = getCurrentSlotKey();
  if (!slot) return;

  const current = new Set(draftAttendance[slot] || []);
  if (current.has(studentId)) {
    current.delete(studentId);
  } else {
    current.add(studentId);
  }

  draftAttendance[slot] = [...current].sort((a, b) => a - b);

  await renderStudentGrid();
  updateAbsentCount();
  updateSaveState("未保存");
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

function getWeekRange(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const start = new Date(d);
  start.setDate(d.getDate() + diffToMonday);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: formatDate(start),
    end: formatDate(end)
  };
}

function getMonthRange(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const start = new Date(d.getFullYear(), d.getMonth(), 1);
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);

  return {
    start: formatDate(start),
    end: formatDate(end)
  };
}

function getYearRange(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const year = d.getFullYear();
  return {
    start: `${year}-01-01`,
    end: `${year}-12-31`
  };
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function collectDailyAbsentSet(attendanceDoc) {
  const result = new Set();
  ["slot1", "slot2", "slot3"].forEach(slot => {
    (attendanceDoc[slot] || []).forEach(id => result.add(id));
  });
  return result;
}

async function calcSummaryCounts(baseDateStr) {
  const dayCounts = {};
  const weekCounts = {};
  const monthCounts = {};

  for (let i = 1; i <= STUDENT_COUNT; i++) {
    dayCounts[i] = 0;
    weekCounts[i] = 0;
    monthCounts[i] = 0;
  }

  const weekRange = getWeekRange(baseDateStr);
  const monthRange = getMonthRange(baseDateStr);
  const snap = await getDocs(collection(db, "classes", CLASS_ID, "attendance"));

  snap.forEach((docSnap) => {
    const dateKey = docSnap.id;
    const data = docSnap.data();
    const absentSet = collectDailyAbsentSet(data);

    if (dateKey === baseDateStr) {
      absentSet.forEach(id => {
        dayCounts[id] = 1;
      });
    }

    if (dateKey >= weekRange.start && dateKey <= weekRange.end) {
      absentSet.forEach(id => {
        weekCounts[id] += 1;
      });
    }

    if (dateKey >= monthRange.start && dateKey <= monthRange.end) {
      absentSet.forEach(id => {
        monthCounts[id] += 1;
      });
    }
  });

  return { dayCounts, weekCounts, monthCounts };
}

async function resetMonthData() {
  if (!settingsDateInput?.value) return;

  const ok = confirm(`クラス「${CLASS_ID}」の対象月データをすべて削除します。よろしいですか？`);
  if (!ok) return;

  try {
    const { start, end } = getMonthRange(settingsDateInput.value);
    const snap = await getDocs(collection(db, "classes", CLASS_ID, "attendance"));

    const tasks = [];
    snap.forEach((docSnap) => {
      const dateKey = docSnap.id;
      if (dateKey >= start && dateKey <= end) {
        tasks.push(deleteDoc(docSnap.ref));
      }
    });

    await Promise.all(tasks);
    currentAttendance = { slot1: [], slot2: [], slot3: [] };
    draftAttendance = { slot1: [], slot2: [], slot3: [] };
    watchAttendance();
    alert("月データを初期化しました。");
  } catch (err) {
    console.error(err);
    alert("月データ初期化に失敗しました。");
  }
}

async function resetYearData() {
  if (!settingsDateInput?.value) return;

  const ok = confirm(`クラス「${CLASS_ID}」の対象年データをすべて削除します。よろしいですか？`);
  if (!ok) return;

  try {
    const { start, end } = getYearRange(settingsDateInput.value);
    const snap = await getDocs(collection(db, "classes", CLASS_ID, "attendance"));

    const tasks = [];
    snap.forEach((docSnap) => {
      const dateKey = docSnap.id;
      if (dateKey >= start && dateKey <= end) {
        tasks.push(deleteDoc(docSnap.ref));
      }
    });

    await Promise.all(tasks);
    currentAttendance = { slot1: [], slot2: [], slot3: [] };
    draftAttendance = { slot1: [], slot2: [], slot3: [] };
    watchAttendance();
    alert("年データを初期化しました。");
  } catch (err) {
    console.error(err);
    alert("年データ初期化に失敗しました。");
  }
}

async function exportAttendanceCsv() {
  try {
    if (!dateInput?.value) {
      alert("日付を選んでください。");
      return;
    }

    const dateStr = dateInput.value;
    const slotNo = slotSelect?.value || "1";
    const slotKey = getCurrentSlotKey();
    if (!slotKey) {
      alert("時限を選んでください。");
      return;
    }

    const { dayCounts, weekCounts, monthCounts } = await calcSummaryCounts(dateStr);

    const rows = [];
    rows.push(["クラス", "日付", "時限", "番号", "氏名", "状態", "日", "週", "月"]);

    const sortedStudents = [...students].sort((a, b) => {
      const aNo = Number(a.displayNo);
      const bNo = Number(b.displayNo);
      if (!Number.isNaN(aNo) && !Number.isNaN(bNo)) return aNo - bNo;
      return String(a.displayNo || "").localeCompare(String(b.displayNo || ""));
    });

    for (const student of sortedStudents) {
      if (!student.name || student.name.trim() === "" || student.name.startsWith("生徒")) continue;

      const absent = (draftAttendance[slotKey] || []).includes(student.id);

      rows.push([
        classSelect?.options[classSelect.selectedIndex]?.text || CLASS_ID,
        dateStr,
        `${slotNo}限`,
        student.displayNo || String(student.id),
        student.name || "",
        absent ? "不在" : "出席",
        dayCounts[student.id] || 0,
        weekCounts[student.id] || 0,
        monthCounts[student.id] || 0
      ]);
    }

    const csvText = rows.map(row => row.map(csvEscape).join(",")).join("\r\n");
    const bom = "\uFEFF";
    const blob = new Blob([bom + csvText], { type: "text/csv;charset=utf-8;" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const classLabel = classSelect?.options[classSelect.selectedIndex]?.text || CLASS_ID;
    a.href = url;
    a.download = `${classLabel}_${dateStr}_${slotNo}限_出欠.csv`;

    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  } catch (err) {
    console.error(err);
    alert("CSV書き出しに失敗しました。");
  }
}

function csvEscape(value) {
  const s = String(value ?? "");
  if (s.includes('"') || s.includes(",") || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function renderStudentGrid() {
  if (!studentGrid) return;

  studentGrid.innerHTML = "";
  const baseDateStr = dateInput?.value;
  if (!baseDateStr) return;

  const { dayCounts, weekCounts, monthCounts } = await calcSummaryCounts(baseDateStr);

  let count = 0;

  students.forEach((student) => {
    if (!student.name || student.name.trim() === "" || student.name.startsWith("生徒")) return;

    count++;
    const absent = isAbsentInDraft(student.id);

    const card = document.createElement("div");
    card.className = `student-card ${absent ? "row-absent" : ""}`;

    card.innerHTML = `
      <div class="student-id-box">${escapeHtml(student.displayNo || String(student.id))}</div>
      <input
        type="text"
        class="name-input student-name"
        data-id="${student.id}"
        value="${escapeHtml(student.name || "")}"
      />
      <button
        type="button"
        class="state-btn ${absent ? "state-absent" : "state-present"}"
        data-id="${student.id}"
      >
        ${absent ? "不在" : "出席"}
      </button>
      <div class="total-count" title="日">${dayCounts[student.id] || 0}</div>
      <div class="total-count" title="週">${weekCounts[student.id] || 0}</div>
      <div class="total-count" title="月">${monthCounts[student.id] || 0}</div>
    `;

    studentGrid.appendChild(card);
  });

  if (studentCount) {
    studentCount.textContent = `登録人数：${count}人`;
  }
}

function renderSlotStates() {
  if (slot1State) slot1State.textContent = slotLabel(currentAttendance.slot1);
  if (slot2State) slot2State.textContent = slotLabel(currentAttendance.slot2);
  if (slot3State) slot3State.textContent = slotLabel(currentAttendance.slot3);
}

function slotLabel(arr) {
  if (!Array.isArray(arr)) return "---";
  return `保存済 (${arr.length}人)`;
}

function updateAbsentCount() {
  const slot = getCurrentSlotKey();
  if (!slot || !absentCount) return;
  absentCount.textContent = (draftAttendance[slot] || []).length;
}

function updateSaveState(text) {
  if (saveState) saveState.textContent = text;
}

function parseSingleClassCsv(text) {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line !== "");

  if (!lines.length) return [];

  const result = [];
  let startIndex = 0;

  let firstCols = splitCsvLine(lines[0]);
  if (firstCols.length === 1 && firstCols[0].includes(",")) {
    firstCols = firstCols[0].split(",").map(v => v.trim());
  }

  if (
    String(firstCols[0] || "").includes("番号") &&
    String(firstCols[1] || "").includes("氏名")
  ) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    let cols = splitCsvLine(lines[i]);

    if (cols.length === 1 && cols[0].includes(",")) {
      cols = cols[0].split(",").map(v => v.trim());
    }

    if (cols.length < 2) continue;

    const displayNo = String(cols[0] ?? "").replace(/"/g, "").trim();
    const name = String(cols[1] ?? "").replace(/"/g, "").trim();

    if (!displayNo || !name) continue;

    result.push({ displayNo, name });
  }

  result.sort((a, b) => {
    const aNo = Number(a.displayNo);
    const bNo = Number(b.displayNo);
    if (!Number.isNaN(aNo) && !Number.isNaN(bNo)) return aNo - bNo;
    return String(a.displayNo).localeCompare(String(b.displayNo));
  });

  return result.slice(0, STUDENT_COUNT);
}

function splitCsvLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];

    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current);
      current = "";
    } else {
      current += ch;
    }
  }

  result.push(current);
  return result.map(v => v.trim());
}

function moveDateByDays(diffDays) {
  if (!dateInput?.value) return;

  const d = new Date(dateInput.value + "T00:00:00");
  d.setDate(d.getDate() + diffDays);

  dateInput.value = formatDate(d);
  if (settingsDateInput) settingsDateInput.value = dateInput.value;

  attendanceCollapsed = false;
  updateAttendanceVisibility();
  watchAttendance();
}

function moveDateByMonths(diffMonths) {
  if (!dateInput?.value) return;

  const d = new Date(dateInput.value + "T00:00:00");
  const originalDay = d.getDate();

  d.setDate(1);
  d.setMonth(d.getMonth() + diffMonths);

  const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(originalDay, lastDay));

  dateInput.value = formatDate(d);
  if (settingsDateInput) settingsDateInput.value = dateInput.value;

  attendanceCollapsed = false;
  updateAttendanceVisibility();
  watchAttendance();
}

function todayStr() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function escapeHtml(str) {
  return String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function normalizeClassKey(value) {
  const raw = String(value ?? "").trim();
  const match = raw.match(/(\d+)/);
  const classNo = match ? Number(match[1]) : 1;
  return `class${classNo}`;
}
