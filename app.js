// ===== Firebase =====
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

// ===== 設定 =====
const firebaseConfig = {
  apiKey: "AIzaSyB9SFmEWpMm_COKm_a-I606hBurvPqIhE8",
  authDomain: "test-bf28a.firebaseapp.com",
  projectId: "test-bf28a"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const provider = new GoogleAuthProvider();

// ===== 状態 =====
let CLASS_ID = "class1";
const STUDENT_COUNT = 24;
let currentMode = "attendance";

let students = [];
let currentAttendance = { slot1: [], slot2: [], slot3: [] };
let draftAttendance = { slot1: [], slot2: [], slot3: [] };

let currentNomination = null;
let monthlyNominationCounts = {};

// ===== DOM =====
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const authStatus = document.getElementById("authStatus");
const appBody = document.getElementById("appBody");

const modeAttendanceBtn = document.getElementById("modeAttendanceBtn");
const modeNominateBtn = document.getElementById("modeNominateBtn");
const modeSettingsBtn = document.getElementById("modeSettingsBtn");

const attendancePanel = document.getElementById("attendancePanel");
const studentListPanel = document.getElementById("studentListPanel");
const nominatePanel = document.getElementById("nominatePanel");
const settingsPanel = document.getElementById("settingsPanel");

const studentGrid = document.getElementById("studentGrid");

const randomNominateBtn = document.getElementById("randomNominateBtn");
const clearNominateBtn = document.getElementById("clearNominateBtn");
const aggregateNominateBtn = document.getElementById("aggregateNominateBtn");

const currentNomineeName = document.getElementById("currentNomineeName");
const currentNomineeNo = document.getElementById("currentNomineeNo");

// ===== 初期化 =====
init();

function init() {
  bindEvents();

  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      appBody.style.display = "none";
      authStatus.textContent = "未ログイン";
      return;
    }

    appBody.style.display = "block";
    authStatus.textContent = "ログイン中";

    await loadStudents();
    watchAttendance();
  });
}

// ===== イベント =====
function bindEvents() {
  loginBtn.onclick = () => signInWithPopup(auth, provider);
  logoutBtn.onclick = () => signOut(auth);

  modeAttendanceBtn.onclick = () => setMode("attendance");
  modeNominateBtn.onclick = () => setMode("nominate");
  modeSettingsBtn.onclick = () => setMode("settings");

  randomNominateBtn.onclick = nominateRandom;
  clearNominateBtn.onclick = clearNomination;
  aggregateNominateBtn.onclick = aggregateNomination;
}

// ===== モード切替 =====
function setMode(mode) {
  currentMode = mode;

  attendancePanel.style.display = mode === "attendance" ? "" : "none";
  studentListPanel.style.display = mode === "attendance" ? "" : "none";
  nominatePanel.style.display = mode === "nominate" ? "" : "none";
  settingsPanel.style.display = mode === "settings" ? "" : "none";

  if (mode === "nominate") renderNominateGrid();
}

// ===== 生徒 =====
async function loadStudents() {
  const snap = await getDocs(collection(db, "classes", CLASS_ID, "students"));

  if (snap.empty) {
    for (let i = 1; i <= STUDENT_COUNT; i++) {
      await setDoc(doc(db, "classes", CLASS_ID, "students", String(i)), {
        id: i,
        displayNo: String(i),
        name: `生徒${i}`
      });
    }
    return loadStudents();
  }

  students = snap.docs.map(d => d.data());
  renderStudents();
}

function renderStudents() {
  studentGrid.innerHTML = students.map(s => `
    <div class="student-card">
      <div class="student-id-box">${s.displayNo}</div>
      <input class="student-name" value="${s.name}">
      <button class="state-btn state-present">出席</button>
    </div>
  `).join("");
}

// ===== 出欠 =====
function watchAttendance() {
  onSnapshot(doc(db, "classes", CLASS_ID, "attendance", "today"), snap => {
    if (!snap.exists()) return;
    currentAttendance = snap.data();
  });
}

// ===== 指名 =====
function nominateRandom() {
  const absent = new Set(currentAttendance.slot1 || []);
  const candidates = students.filter(s => !absent.has(s.id));

  if (!candidates.length) {
    alert("指名できる生徒がいません");
    return;
  }

  currentNomination = candidates[Math.floor(Math.random() * candidates.length)];
  renderNominee();
}

function renderNominee() {
  if (!currentNomination) {
    currentNomineeName.textContent = "---";
    currentNomineeNo.textContent = "---";
    return;
  }

  currentNomineeName.textContent = currentNomination.name;
  currentNomineeNo.textContent = currentNomination.displayNo;
}

function clearNomination() {
  currentNomination = null;
  renderNominee();
}

function aggregateNomination() {
  if (!currentNomination) return;

  const id = currentNomination.id;
  monthlyNominationCounts[id] = (monthlyNominationCounts[id] || 0) + 1;

  alert("集計しました");
  renderNominateGrid();
}

// ===== 指名一覧 =====
function renderNominateGrid() {
  const grid = document.getElementById("nominateStudentGrid");

  grid.innerHTML = students.map(s => `
    <div class="student-card">
      <div class="student-id-box">${s.displayNo}</div>
      <div>
        <div>${s.name}</div>
        <div style="font-size:12px;">月:${monthlyNominationCounts[s.id] || 0}</div>
      </div>
      <button class="btn primary" onclick="forceNominate(${s.id})">指名</button>
    </div>
  `).join("");
}

window.forceNominate = (id) => {
  currentNomination = students.find(s => s.id === id);
  renderNominee();
};
