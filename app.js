import { initializeApp } from "https://www.gstatic.com/firebasejs/12.5.0/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  collection,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/12.5.0/firebase-firestore.js";

// =========================
// Firebase 設定
// 自分の値に書き換える
// =========================
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// =========================
// 基本設定
// =========================
const CLASS_ID = "class1";
const STUDENT_COUNT = 40;

// =========================
// Firebase
// =========================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// =========================
// DOM
// =========================
const authStatus = document.getElementById("authStatus");
const dateInput = document.getElementById("dateInput");
const slotSelect = document.getElementById("slotSelect");
const saveBtn = document.getElementById("saveBtn");
const todayBtn = document.getElementById("todayBtn");
const initStudentsBtn = document.getElementById("initStudentsBtn");

const absentCount = document.getElementById("absentCount");
const saveState = document.getElementById("saveState");
const slot1State = document.getElementById("slot1State");
const slot2State = document.getElementById("slot2State");
const slot3State = document.getElementById("slot3State");

const studentTableBody = document.getElementById("studentTableBody");

// =========================
// 状態
// =========================
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

// =========================
// 開始
// =========================
init();

async function init() {
  dateInput.value = todayStr();
  bindEvents();

  try {
    await signInAnonymously(auth);
  } catch (err) {
    console.error(err);
    authStatus.textContent = "認証失敗";
    alert("Firebase の匿名認証に失敗しました。");
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      authStatus.textContent = "未認証";
      return;
    }

    authStatus.textContent = "接続済み";
    await ensureStudentsExist();
    await loadStudents();
    watchAttendance();
  });
}

function bindEvents() {
  dateInput.addEventListener("change", () => {
    watchAttendance();
  });

  slotSelect.addEventListener("change", () => {
    renderStudentTable();
    updateAbsentCount();
    updateSaveState("読み込み済み");
  });

  saveBtn.addEventListener("click", saveAttendance);

  todayBtn.addEventListener("click", () => {
    dateInput.value = todayStr();
    watchAttendance();
  });

  initStudentsBtn.addEventListener("click", async () => {
    const ok = confirm("名簿を 1〜40 の初期状態に戻します。よろしいですか？");
    if (!ok) return;
    await resetStudents();
    await loadStudents();
    alert("名簿を初期化しました。");
  });

  studentTableBody.addEventListener("click", (e) => {
    if (e.target.classList.contains("state-btn")) {
      const id = Number(e.target.dataset.id);
      toggleAbsent(id);
    }
  });

  studentTableBody.addEventListener("input", async (e) => {
    if (!e.target.classList.contains("name-input")) return;
    const id = e.target.dataset.id;
    const name = e.target.value.trim();

    try {
      await updateDoc(doc(db, "classes", CLASS_ID, "students", id), {
        name: name || `生徒${id}`
      });
    } catch (err) {
      console.error(err);
      alert("名前の保存に失敗しました。");
    }
  });
}

// =========================
// 生徒名簿
// =========================
async function ensureStudentsExist() {
  const snap = await getDocs(collection(db, "classes", CLASS_ID, "students"));
  if (!snap.empty) return;

  const batch = writeBatch(db);
  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const ref = doc(db, "classes", CLASS_ID, "students", String(i));
    batch.set(ref, {
      id: i,
      name: `生徒${i}`
    });
  }
  await batch.commit();
}

async function resetStudents() {
  const batch = writeBatch(db);
  for (let i = 1; i <= STUDENT_COUNT; i++) {
    const ref = doc(db, "classes", CLASS_ID, "students", String(i));
    batch.set(ref, {
      id: i,
      name: `生徒${i}`
    });
  }
  await batch.commit();
}

async function loadStudents() {
  const snap = await getDocs(collection(db, "classes", CLASS_ID, "students"));
  students = snap.docs
    .map(d => d.data())
    .sort((a, b) => a.id - b.id);

  renderStudentTable();
}

// =========================
// 出欠
// attendance/{yyyy-mm-dd}
// {
//   slot1: [1,2],
//   slot2: [3],
//   slot3: []
// }
// =========================
function attendanceRef(dateStr) {
  return doc(db, "classes", CLASS_ID, "attendance", dateStr);
}

function watchAttendance() {
  const dateStr = dateInput.value;
  if (!dateStr) return;

  if (unsubscribeAttendance) unsubscribeAttendance();

  unsubscribeAttendance = onSnapshot(attendanceRef(dateStr), (snap) => {
    if (!snap.exists()) {
      currentAttendance = {
        slot1: [],
        slot2: [],
        slot3: []
      };
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

    renderStudentTable();
    renderSlotStates();
    updateAbsentCount();
    updateSaveState("読み込み済み");
  });
}

async function saveAttendance() {
  const dateStr = dateInput.value;
  const slot = getCurrentSlotKey();

  try {
    const ref = attendanceRef(dateStr);
    const snap = await getDoc(ref);

    let data = {
      slot1: [],
      slot2: [],
      slot3: []
    };

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

    updateSaveState("保存済み");
  } catch (err) {
    console.error(err);
    alert("保存に失敗しました。");
  }
}

function toggleAbsent(studentId) {
  const slot = getCurrentSlotKey();
  const current = new Set(draftAttendance[slot] || []);

  if (current.has(studentId)) {
    current.delete(studentId);
  } else {
    current.add(studentId);
  }

  draftAttendance[slot] = [...current].sort((a, b) => a - b);

  renderStudentTable();
  updateAbsentCount();
  updateSaveState("未保存");
}

function getCurrentSlotKey() {
  return `slot${slotSelect.value}`;
}

function isAbsentInDraft(studentId) {
  const slot = getCurrentSlotKey();
  return (draftAttendance[slot] || []).includes(studentId);
}

// =========================
// 表示
// =========================
function renderStudentTable() {
  studentTableBody.innerHTML = "";
  const totals = calcTotalsFromAttendanceCache();

  students.forEach((student) => {
    const absent = isAbsentInDraft(student.id);
    const tr = document.createElement("tr");
    if (absent) tr.classList.add("row-absent");

    tr.innerHTML = `
      <td>${student.id}</td>
      <td>
        <input
          type="text"
          class="name-input"
          data-id="${student.id}"
          value="${escapeHtml(student.name || `生徒${student.id}`)}"
        />
      </td>
      <td>
        <button
          type="button"
          class="state-btn ${absent ? "state-absent" : "state-present"}"
          data-id="${student.id}"
        >
          ${absent ? "不在" : "出席"}
        </button>
      </td>
      <td>${totals[student.id] || 0}</td>
    `;
    studentTableBody.appendChild(tr);
  });
}

function renderSlotStates() {
  slot1State.textContent = slotLabel(currentAttendance.slot1);
  slot2State.textContent = slotLabel(currentAttendance.slot2);
  slot3State.textContent = slotLabel(currentAttendance.slot3);
}

function slotLabel(arr) {
  if (!Array.isArray(arr)) return "---";
  return `保存済 (${arr.length}人)`;
}

function updateAbsentCount() {
  const slot = getCurrentSlotKey();
  absentCount.textContent = (draftAttendance[slot] || []).length;
}

function updateSaveState(text) {
  saveState.textContent = text;
}

// =========================
// 累計
// 現在は表示中の日付の1〜3回合計
// =========================
function calcTotalsFromAttendanceCache() {
  const totals = {};
  for (let i = 1; i <= STUDENT_COUNT; i++) totals[i] = 0;

  ["slot1", "slot2", "slot3"].forEach(slot => {
    (currentAttendance[slot] || []).forEach(id => {
      totals[id] = (totals[id] || 0) + 1;
    });
  });

  return totals;
}

// =========================
// util
// =========================
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
