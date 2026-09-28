// ============================================================
//  RASFAHI — core: Firebase, auth, roles, helpers, UI primitives
// ============================================================
import { initializeApp } from "./firebase.bundle.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "./firebase.bundle.js";
import {
  initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where,
  onSnapshot, serverTimestamp, runTransaction, writeBatch, arrayUnion, arrayRemove, increment, Timestamp
} from "./firebase.bundle.js";
import { firebaseConfig, BOOTSTRAP_SUPERADMIN, PUBLIC_BASE_URL } from "./firebase-config.js";
import { applyTheme, DEFAULT_THEME } from "./frames.js";

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
let _db;
try {
  _db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) { _db = initializeFirestore(app, {}); }
export const db = _db;
export {
  doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where,
  onSnapshot, serverTimestamp, runTransaction, writeBatch, arrayUnion, arrayRemove, increment, Timestamp,
  BOOTSTRAP_SUPERADMIN, PUBLIC_BASE_URL
};

// ---------------- ROLES ----------------
export const ROLES = {
  superadmin:     { dv: "ސުޕަރ އެޑްމިން", en: "Super Admin" },
  adminsec:       { dv: "އެޑްމިން ސެކްރެޓަރީ", en: "Admin Secretary" },
  secretary:      { dv: "ސެކްރެޓަރީ", en: "Secretary" },
  chief:          { dv: "ޗީފް ޖަޖު", en: "Chief Judge" },
  judge:          { dv: "ޖަޖު", en: "Judge" },
  supervisor:     { dv: "ސުޕަވައިޒަރ", en: "Supervisor" },
  consultant:     { dv: "ކޮންސަލްޓެންޓް", en: "Consultant" },
  checkin:        { dv: "ޗެކްއިން ސްޓާފް (ޓެބްލެޓް)", en: "Check-in Staff" },
  screen_student: { dv: "ދަރިވަރު ސްކްރީން", en: "Student Screen" },
  screen_waiting: { dv: "ވެއިޓިންގ ރޫމް ސްކްރީން", en: "Waiting Room Screen" }
};
export const roleName = (r) => (ROLES[r] ? ROLES[r].dv : r);

export const BRANCHES = { mushaf: "ބަލައިގެން", hifz: "ނުބަލައި" };
export const AGE_GROUPS = [
  ["U6", "6 އަހަރުން ދަށް"], ["U9", "9 އަހަރުން ދަށް"], ["U11", "11 އަހަރުން ދަށް"],
  ["U13", "13 އަހަރުން ދަށް"], ["U16", "16 އަހަރުން ދަށް"], ["U19", "19 އަހަރުން ދަށް"],
  ["U21", "21 އަހަރުން ދަށް"], ["GEN", "ޢާއްމު ބައި"], ["SN", "ނުކުޅެދުންތެރިކަން ހުންނަ"]
];
export const INST_TYPES = [
  ["School", "ސްކޫލް"], ["University", "ޔުނިވަރސިޓީ / ކޮލެޖް"], ["QuranClass", "ޤުރްއާން ކްލާސް"],
  ["Club", "ކްލަބް / ޖަމްޢިއްޔާ"], ["Office", "އޮފީސް"], ["Private", "އަމިއްލަ ގޮތުން"]
];
export const GENDERS = [["M", "ފިރިހެން"], ["F", "އަންހެން"]];
export const ageGroupName = (k) => (AGE_GROUPS.find(a => a[0] === k) || [k, k || "-"])[1];
export const instTypeName = (k) => (INST_TYPES.find(a => a[0] === k) || [k, k || "-"])[1];
export const genderName = (k) => (GENDERS.find(a => a[0] === k) || [k, k || "-"])[1];

export const DEFAULT_RUBRIC = [
  { key: "thilawa",  name: "ތިލާވަތު", max: 30 },
  { key: "tajweed",  name: "ތަޖްވީދު", max: 20 },
  { key: "makhraj",  name: "މަޚްރަޖު", max: 20 },
  { key: "sifa",     name: "ޞިފަ", max: 10 },
  { key: "fasaha",   name: "ފަޞާޙަތް", max: 5 },
  { key: "talaffuz", name: "ތަލައްފުޒު", max: 5 },
  { key: "maqamat",  name: "މަޤާމާތު / އަޑު", max: 5 },
  { key: "quality",  name: "ޖުމްލަ ފެންވަރު", max: 5 }
];
export const DEFAULT_SETTINGS = {
  activeCompetitionId: "",
  stars: [75, 80, 85, 90, 95],
  noRepeatWindow: 100,
  gridSize: 20,
  textSource: "kfgqpc",          // kfgqpc | tanzil
  studentDisplay: "text",        // text | image
  mushaf: { base: "mushaf/", pattern: "{p3}.png", top: 7.2, bottom: 6.2, left: 7, right: 7, p12top: 38, p12bottom: 30 },
  scoring: { method: "mean", decimals: 2 },
  liveControllers: ["chief", "secretary"],
  theme: DEFAULT_THEME,           // app colour theme (js/frames.js THEMES)
  qframe: 1                       // royal frame around the Quran on the student screen (0 = none, 1–50)
};

// ---------------- SESSION STATE ----------------
export const S = { user: null, me: null, settings: { ...DEFAULT_SETTINGS }, unsubs: [] };
export const emailOf = (u) => (u && u.email ? u.email.toLowerCase() : "");

export async function loginGoogle() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, p);
}
export const logout = () => signOut(auth);
export { onAuthStateChanged };

export async function loadSettings() {
  try {
    const s = await getDoc(doc(db, "settings", "app"));
    if (s.exists()) {
      const d = s.data();
      S.settings = { ...DEFAULT_SETTINGS, ...d, mushaf: { ...DEFAULT_SETTINGS.mushaf, ...(d.mushaf || {}) },
        scoring: { ...DEFAULT_SETTINGS.scoring, ...(d.scoring || {}) } };
    }
  } catch (e) { console.warn("settings", e); }
  applyTheme(S.settings.theme);
  return S.settings;
}

export function starsFor(score, th = S.settings.stars) {
  const t = th && th.length === 5 ? th : DEFAULT_SETTINGS.stars;
  let n = 0;
  for (let i = 0; i < 5; i++) if (score >= t[i]) n = i + 1;
  return n;
}
export const starsEl = (n, cls = "") => h("span", { html: starsHtml(n, cls) });
export const starsHtml = (n, cls = "") =>
  `<span class="stars ${cls}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? "on" : ""}">★</i>`).join("")}</span>`;

export async function audit(action, data = {}) {
  try {
    await addDoc(collection(db, "audit"), { action, data, by: emailOf(S.user), at: serverTimestamp() });
  } catch (e) { /* audit is best-effort */ }
}

// ---------------- HELPERS ----------------
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
export const normId = (s) => String(s || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
export const digits = (s) => String(s || "").replace(/\D/g, "");
export const fmt2 = (n, d = 2) => (n == null || isNaN(n) ? "-" : Number(n).toFixed(d));
export const round = (n, d = 2) => Math.round(n * 10 ** d) / 10 ** d;
export const toDate = (t) => (t && t.toDate ? t.toDate() : t ? new Date(t) : null);
export const fmtDate = (t) => { const d = toDate(t); return d ? d.toLocaleDateString("en-GB") : "-"; };
export const fmtDateTime = (t) => { const d = toDate(t); return d ? d.toLocaleString("en-GB") : "-"; };
export const todayISO = () => new Date().toISOString().slice(0, 10);
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
export const scoreId = (sid, stId, email) => `${sid}__${stId}__${email}`;
export const resultId = (sid, stId) => `${sid}__${stId}`;
export function ageOn(dob, onDate = new Date()) {
  const d = toDate(dob); if (!d || isNaN(d)) return "";
  let a = onDate.getFullYear() - d.getFullYear();
  const m = onDate.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && onDate.getDate() < d.getDate())) a--;
  return a;
}
export async function sha256Hex(text) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

// element builder: h('div.cls#id', {attrs}, children...)
export function h(tag, attrs, ...kids) {
  const m = tag.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement((m && m[1]) || "div");
  if (m && m[2]) m[2].replace(/([.#])([\w-]+)/g, (_, t, v) => (t === "." ? el.classList.add(v) : (el.id = v)));
  if (attrs && (typeof attrs !== "object" || attrs instanceof Node || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
  for (const k in attrs || {}) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === "html") el.innerHTML = v;
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else if (k === "value") el.value = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  const add = (c) => {
    if (c == null || c === false) return;
    if (Array.isArray(c)) c.forEach(add);
    else el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  };
  kids.forEach(add);
  return el;
}

export function toast(msg, type = "ok", ms = 3200) {
  let box = $("#toasts");
  if (!box) { box = h("div#toasts"); document.body.appendChild(box); }
  const t = h("div.toast." + type, msg);
  box.appendChild(t);
  setTimeout(() => t.classList.add("out"), ms);
  setTimeout(() => t.remove(), ms + 400);
}

export function modal(title, body, actions = [], opts = {}) {
  return new Promise((resolve) => {
    const close = (v) => { wrap.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
    const onKey = (e) => { if (e.key === "Escape" && !opts.noEsc) close(null); };
    const wrap = h("div.modal-wrap", { onclick: (e) => { if (e.target === wrap && !opts.noEsc) close(null); } },
      h("div.modal" + (opts.wide ? ".wide" : ""),
        h("div.modal-head", h("h3", title), h("button.icon-btn", { onclick: () => close(null), title: "ބަންދުކުރޭ" }, "✕")),
        h("div.modal-body", body),
        actions.length ? h("div.modal-foot", actions.map(a =>
          h("button.btn." + (a.cls || "ghost"), { onclick: async () => {
            if (a.onClick) { const r = await a.onClick(); if (r === false) return; close(r === undefined ? a.value : r); }
            else close(a.value);
          } }, a.label))) : null));
    document.body.appendChild(wrap);
    document.addEventListener("keydown", onKey);
    const f = wrap.querySelector("input,select,textarea"); if (f && !opts.noFocus) setTimeout(() => f.focus(), 50);
    if (opts.onOpen) opts.onOpen(close);
  });
}
export const confirmBox = (title, msg, okLabel = "އާދެ", cls = "primary") =>
  modal(title, h("p", msg), [{ label: "ނޫން", value: false }, { label: okLabel, value: true, cls }]);
export async function promptBox(title, label, value = "", multiline = false) {
  const inp = multiline ? h("textarea", { rows: 4 }, value) : h("input", { value });
  const r = await modal(title, h("label.field", h("span", label), inp),
    [{ label: "ކެންސަލް", value: null }, { label: "ފޮނުވާ", cls: "primary", onClick: () => inp.value.trim() || false }]);
  return r;
}

export function field(label, input, hint) {
  return h("label.field", h("span", label), input, hint ? h("small.hint", hint) : null);
}
export function select(options, value, attrs = {}) {
  const s = h("select", attrs);
  options.forEach(o => {
    const [v, t] = Array.isArray(o) ? o : [o, o];
    const op = h("option", { value: v }, t);
    if (String(v) === String(value)) op.selected = true;
    s.appendChild(op);
  });
  return s;
}
export function spinner(msg = "ލޯޑުވަނީ...") { return h("div.loading", h("div.spin"), h("span", msg)); }
export function empty(msg) { return h("div.empty", msg); }

export function clearSubs() { S.unsubs.forEach(u => { try { u(); } catch (e) {} }); S.unsubs = []; }
export function sub(u) { S.unsubs.push(u); return u; }

// resize image file -> JPEG dataURL
export function resizeImage(file, maxSide = 480, quality = 0.82) {
  return new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = rej;
    fr.onload = () => {
      const img = new Image();
      img.onerror = rej;
      img.onload = () => {
        const sc = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL("image/jpeg", quality));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

export function photoTag(src, cls = "ph") {
  return src ? h("img." + cls, { src, alt: "" }) : h("div." + cls + ".noph", "👤");
}

// identity card used on every screen
export function idCard(st, opts = {}) {
  if (!st) return h("div.idcard.emptycard", "ދަރިވަރަކު ނެތް");
  return h("div.idcard" + (opts.big ? ".big" : ""),
    photoTag(st.photoThumb || st.photo, "idph"),
    h("div.idinfo",
      h("div.idname", st.name || "-"),
      st.nameEn ? h("div.idname-en", st.nameEn) : null,
      h("div.idrow",
        h("span.tag.gold", "ރެޖި: " + (st.regNo || "-")),
        h("span.tag", "އައިޑީ: " + (st.nid || st.id || "-"))),
      h("div.idrow.small",
        h("span", st.categoryName || ""),
        st.age !== undefined && st.age !== "" ? h("span", " • " + st.age + " އަހަރު") : null),
      opts.more === false ? null : h("div.idrow.small.muted",
        [st.institution, st.island || st.permAddress].filter(Boolean).join(" • "))));
}

// Beep for start/stop light (no audio files needed)
export function beep(freq = 880, ms = 180) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = freq; o.connect(g); g.connect(ctx.destination);
    g.gain.setValueAtTime(0.25, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
    o.start(); o.stop(ctx.currentTime + ms / 1000 + 0.02);
  } catch (e) {}
}

// CSV export
export function downloadCSV(filename, rows) {
  const csv = "﻿" + rows.map(r => r.map(v => `"${String(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const a = h("a", { href: URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })), download: filename });
  document.body.appendChild(a); a.click(); a.remove();
}

// shared data caches
export const cache = { categories: null, sessions: null };
export async function loadCategories(force = false) {
  if (cache.categories && !force) return cache.categories;
  const cid = S.settings.activeCompetitionId;
  const snap = await getDocs(cid ? query(collection(db, "categories"), where("competitionId", "==", cid)) : collection(db, "categories"));
  cache.categories = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name).localeCompare(b.name));
  return cache.categories;
}
export async function loadSessions(force = false) {
  if (cache.sessions && !force) return cache.sessions;
  const cid = S.settings.activeCompetitionId;
  const snap = await getDocs(cid ? query(collection(db, "sessions"), where("competitionId", "==", cid)) : collection(db, "sessions"));
  cache.sessions = snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => String(a.date + (a.time || "")).localeCompare(String(b.date + (b.time || ""))));
  return cache.sessions;
}
export const catById = (id) => (cache.categories || []).find(c => c.id === id);
export function catLabel(c) { return c ? c.name : "-"; }
export function sessionLabel(s) { return s ? `${s.name} — ${s.date || ""} ${s.time || ""} ${s.venue ? "(" + s.venue + ")" : ""}` : "-"; }

// student info snapshot for live docs (no private data like phone/email)
export function publicStudent(st, cat) {
  return {
    id: st.id, nid: st.nid || st.id, regNo: st.regNo || "", name: st.name || "", nameEn: st.nameEn || "",
    photoThumb: st.photoThumb || "", categoryId: st.categoryId || "", categoryName: cat ? cat.name : (st.categoryName || ""),
    institution: st.institution || "", island: st.island || "", permAddress: st.permAddress || "",
    age: st.dob ? ageOn(st.dob) : "", gender: st.gender || ""
  };
}
