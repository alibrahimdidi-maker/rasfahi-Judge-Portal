/*!
 * RASFAHI — Qur'an Competition Judging System
 * Copyright (c) 2026 Ali Ibrahim Didi (AIDD) / Zaadh Holding. All rights reserved. Reg No: MED.03.IP.CR.26.EW5889
 * Unauthorised copying, hosting, modification or redistribution is prohibited.
 */
// ============================================================
//  RASFAHI — live session operations (one place, used by every screen)
//
//  Flow of one student:
//   idle ──(▶ ކިޔެވުމަށް ވެއްދި: check-in tablet / chief / secretary)──► grid
//   grid ──(student taps a number on his screen)──► reading   (question 1 opens)
//   reading ──(🟢 ފަށާ / 🔴 ހުއްޓާ)──► … ──(ދެން ސުވާލު ހޮވާ)──► grid ──► reading (question 2) …
//   last question read ──(✔ ނިމުނު: judges' table)──► scoring  (student screen turns off)
//   scoring ──(judges save, chief finalises)──► final ──(⏭ ދެން ދަރިވަރު)──► idle
// ============================================================
import {
  S, db, doc, getDoc, setDoc, updateDoc, runTransaction, serverTimestamp, increment, toast, audit, catById, publicStudent
} from "./core.js";
import { loadQuran, buildCandidates, makeGrid } from "./quran.js";

export const PHASE_DV = { idle: "ހުސް", grid: "ނަންބަރު ހޮވަނީ", reading: "ކިޔަވަނީ", scoring: "މާކްސް ދެނީ", final: "ނިމިއްޖެ" };

export async function writeLive(ses, patch, msg) {
  try {
    await setDoc(doc(db, "live", ses.id), { ...patch, sessionId: ses.id, sessionName: ses.name, seq: increment(1),
      updatedAt: serverTimestamp(), updatedBy: S.me.email }, { merge: true });
    if (msg) toast(msg);
    return true;
  } catch (e) { toast("ނުކުރެވުނު: " + e.message, "err", 7000); return false; }
}

async function makeStudentGrid(ses, cat) {
  await loadQuran();
  const cands = buildCandidates(cat.syllabus, cat.minLines || 3, cat.maxLines || 7);
  if (!cands.length) { toast("މި ބައިގެ މުޤައްރަރުން ސުވާލެއް ނުހެދުނު — ބައިގެ ސެޓިންގްސް ބައްލަވާ", "err"); return null; }
  let pd = { recent: [], grids: 0 };
  try { const p = await getDoc(doc(db, "pools", `${ses.id}__${cat.id}`)); if (p.exists()) pd = p.data(); } catch (e) {}
  const win = S.settings.noRepeatWindow || 100;
  const recent = (pd.recent || []).filter(r => r.g > (pd.grids || 0) - win);
  const g = makeGrid(cands, cat.gridSize || S.settings.gridSize || 20, recent);
  if (g.relaxed) toast("މުޤައްރަރުގެ ހުރިހާ ސުވާލެއް ބޭނުންކުރެވިއްޖެ — ތަކުރާރުވާން ފަށައިފި", "warn", 6000);
  return g;
}

// ▶ ކިޔެވުމަށް ވެއްދި — student has entered; judges see the name, the student screen shows the grid
export async function admitStudent(ses, st, live, upcoming = []) {
  const cat = catById(st.categoryId);
  if (!cat) { toast("މި ދަރިވަރުގެ ބައި ނުފެނުނު", "err"); return false; }
  const g = await makeStudentGrid(ses, cat);
  if (!g) return false;
  if (ses.status !== "live") { try { await updateDoc(doc(db, "sessions", ses.id), { status: "live", startedAt: serverTimestamp() }); ses.status = "live"; } catch (e) {} }
  const ok = await writeLive(ses, {
    phase: "grid", studentId: st.id, student: publicStudent(st, cat), categoryId: cat.id, categoryName: cat.name,
    branch: cat.branch, hint: cat.hifzHintWords ?? 3, qCount: Math.max(1, cat.qCount || 1), grid: g.grid, picks: [], qNums: [], pickQueue: [], questions: [],
    qIndex: -1, light: "stop", next: upcoming.slice(0, 3).map(s => publicStudent(s, catById(s.categoryId))),
    display: (live && live.display) || S.settings.studentDisplay, admittedAt: serverTimestamp(), admittedBy: S.me.email
  }, st.name + " ކިޔެވުމަށް ވެއްދިއްޖެ");
  if (ok) audit("live_admit", { sid: ses.id, st: st.id });
  return ok;
}

// the grid number shown for question i (kept even after the grid is refreshed)
export const numOf = (L, i) => ((L && L.qNums) || [])[i] ?? ((L && L.picks) || [])[i] ?? "";

// student (or controller / judge) taps grid box n → that question opens at once
export async function pickQuestion(sid, n, queue = null) {
  const ref = doc(db, "live", sid);
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists()) return "none";
      const L = snap.data();
      if (L.phase !== "grid") return "phase";
      const picks = L.picks || [], qs = L.questions || [];
      if (picks.includes(n)) return "taken";
      if (qs.length >= (L.qCount || 1)) return "full";
      const box = (L.grid || []).find(g => g.n === n);
      if (!box) return "none";
      const upd = { picks: [...picks, n], qNums: [...(L.qNums || []), n], questions: [...qs, box.q], qIndex: qs.length, phase: "reading", light: "stop",
        seq: (L.seq || 0) + 1, updatedAt: serverTimestamp(), updatedBy: S.me.email };
      if (queue) upd.pickQueue = queue.filter(x => x !== n).slice(0, Math.max(0, (L.qCount || 1) - qs.length - 1));
      tx.update(ref, upd);
      return "ok";
    });
  } catch (e) { toast("ނުކުރެވުނު: " + e.message, "err"); return "error"; }
}

// the student said several numbers at once (e.g. 3, 5, 8): the first opens now, the rest one after another
export async function queuePicks(sid, nums) {
  if (!nums.length) return "none";
  return pickQuestion(sid, nums[0], nums.slice(1));
}

// a disabled student / a wrong number: make a new grid (questions already read are kept)
export async function refreshGrid(ses, live) {
  const cat = catById(live.categoryId);
  if (!cat) return toast("ބައި ނުފެނުނު", "err");
  const g = await makeStudentGrid(ses, cat);
  if (!g) return false;
  let qs = live.questions || [], nums = live.qNums || live.picks || [];
  if (live.phase === "reading" && live.startedQ !== live.qIndex) { qs = qs.slice(0, -1); nums = nums.slice(0, -1); }   // not read yet → drop
  return writeLive(ses, { grid: g.grid, picks: [], pickQueue: [], questions: qs, qNums: nums.slice(0, qs.length), qIndex: qs.length - 1,
    phase: "grid", light: "stop" }, "🔄 ގްރިޑް އަލުން ހެދިއްޖެ");
}

export const setLight = (ses, l) => writeLive(ses, { light: l });

// after a question: the next number from the queue opens at once, otherwise back to the grid
export async function backToGrid(ses, live) {
  if ((live.questions || []).length >= (live.qCount || 1)) return false;
  const queue = (live.pickQueue || []).filter(n => !(live.picks || []).includes(n));
  const ok = await writeLive(ses, { phase: "grid", light: "stop", pickQueue: queue.slice(1) });
  if (ok && queue.length) await pickQuestion(ses.id, queue[0]);
  return ok;
}
// wrong pick before reading started: undo it
export async function undoLastPick(ses, live) {
  const qs = (live.questions || []).slice(0, -1), picks = (live.picks || []).slice(0, -1), nums = (live.qNums || []).slice(0, -1);
  return writeLive(ses, { phase: "grid", light: "stop", questions: qs, picks, qNums: nums, pickQueue: [], qIndex: qs.length - 1 });
}

// ✔ ނިމުނު — reading finished: student screen turns off, judges save their sheets
export async function finishReading(ses, live) {
  const ok = await writeLive(ses, { phase: "scoring", light: "stop", finishedAt: serverTimestamp() }, "ކިޔެވުން ނިމުނީ — ޖަޖުން މާކްސް ސޭވްކުރައްވާ");
  if (!ok) return false;
  // remember starts / ends so they are not repeated in this session
  try {
    const pRef = doc(db, "pools", `${ses.id}__${live.categoryId}`);
    const p = await getDoc(pRef); const pd = p.exists() ? p.data() : { recent: [], grids: 0 };
    const gno = (pd.grids || 0) + 1, win = S.settings.noRepeatWindow || 100;
    const recent = [...(pd.recent || []).filter(r => r.g > gno - win), ...(live.questions || []).map(q => ({ s: q.startKey, e: q.endKey, g: gno }))];
    await setDoc(pRef, { recent, grids: gno, sessionId: ses.id, categoryId: live.categoryId, updatedAt: serverTimestamp() });
  } catch (e) { /* only controllers can write pools */ }
  audit("live_finish", { sid: ses.id, st: live.studentId });
  return true;
}

// ⏭ next student — clears the stage
export async function clearStage(ses, live, upcoming = []) {
  const done = [...new Set([...(live.done || []), live.studentId].filter(Boolean))];
  return writeLive(ses, { done, phase: "idle", studentId: "", student: null, grid: [], picks: [], qNums: [], pickQueue: [], questions: [], qIndex: -1, light: "stop",
    next: upcoming.slice(0, 3).map(s => publicStudent(s, catById(s.categoryId))) }, "ދެން ދަރިވަރަކަށް ތައްޔާރު");
}
