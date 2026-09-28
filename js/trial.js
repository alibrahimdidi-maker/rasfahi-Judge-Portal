/*!
 * RASFAHI — Qur'an Competition Judging System
 * Copyright (c) 2026 Ali Ibrahim Didi (AIDD) / Zaadh Holding. All rights reserved. Reg No: MED.03.IP.CR.26.EW5889
 * Unauthorised copying, hosting, modification or redistribution is prohibited.
 */
// ============================================================
//  🧪 TRIAL — run a whole competition with the sample data (super admin only)
//  • ✔ everyone present
//  • 🤖 the other judges' sheets for the student on stage (realistic marks + mistakes)
//  • ▶ one student end-to-end:  admit → numbers → read (▶/■) → next … → finish → sheets → result → next
//  • ▶▶ automatic: the same for many students, at the chosen speed — watch every screen live
// ============================================================
import {
  S, db, doc, getDoc, getDocs, setDoc, collection, query, where, writeBatch, serverTimestamp, round, catById, DEFAULT_RUBRIC, toast
} from "./core.js";
import { admitStudent, queuePicks, backToGrid, finishReading, clearStage, writeLive } from "./liveops.js";
import { sampleErrors, rng } from "./dummy.js";

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const liveOf = async (sid) => { const d = await getDoc(doc(db, "live", sid)); return d.exists() ? d.data() : null; };

export async function trialPresentAll(ses) {
  const roster = ses.roster || [];
  for (let i = 0; i < roster.length; i += 200) {
    const b = writeBatch(db);
    roster.slice(i, i + 200).forEach(r => {
      b.set(doc(db, "attendance", `${ses.id}__${r.id}`), { competitionId: S.settings.activeCompetitionId, sessionId: ses.id, studentId: r.id, order: r.order,
        name: r.name, by: S.me.email, byName: "🧪 ޓްރަޔަލް", at: serverTimestamp() });
      b.update(doc(db, "students", r.id), { checkin: { at: new Date(), by: S.me.email, sessionId: ses.id } });
    });
    await b.commit();
  }
  toast(`✔ ${roster.length} ދަރިވަރުން ހާޟިރު`);
}

// sheets for every judge of the session who has not saved yet (skipMe: leave yours for you to mark)
export async function trialJudgeSheets(ses, live, { skipMe = true } = {}) {
  if (!live || !live.studentId) return 0;
  const cat = catById(live.categoryId) || {};
  const rub = cat.rubric && cat.rubric.length ? cat.rubric : DEFAULT_RUBRIC;
  const have = (await getDocs(query(collection(db, "scores"), where("sessionId", "==", ses.id)))).docs.map(d => d.data())
    .filter(x => x.studentId === live.studentId && x.locked).map(x => x.judgeEmail);
  const r = rng(Date.now() % 100000 + live.studentId.length * 7);
  const skill = 0.64 + r() * 0.32;
  const base = sampleErrors(r, skill, (live.questions || []).length || 1);
  let n = 0;
  const b = writeBatch(db);
  (ses.judges || []).forEach(j => {
    if (have.includes(j.email) || (skipMe && j.email === S.me.email)) return;
    const criteria = {};
    rub.forEach(k => { const v = Math.min(1, Math.max(0.3, skill + (r() - 0.5) * 0.12)); criteria[k.key] = Math.round(k.max * v * 4) / 4; });
    const total = round(Object.values(criteria).reduce((a, x) => a + x, 0), 2);
    const errors = base.filter(() => r() < 0.8).map(e => ({ ...e, id: Math.random().toString(36).slice(2, 9), trial: true }));
    b.set(doc(db, "scores", `${ses.id}__${live.studentId}__${j.email}`), { competitionId: S.settings.activeCompetitionId, sessionId: ses.id, sessionName: ses.name,
      sessionDate: ses.date || "", studentId: live.studentId, studentName: (live.student || {}).name || "", regNo: (live.student || {}).regNo || "",
      nid: (live.student || {}).nid || "", categoryId: live.categoryId || "", categoryName: live.categoryName || "", judgeEmail: j.email, judgeName: j.name,
      judgeSlot: j.slot, chiefEmail: ses.chiefEmail || "", criteria, total, rubric: rub, errors, note: "", questions: live.questions || [], amendments: [],
      locked: true, draft: false, trial: true, dummy: true, savedAt: serverTimestamp(), createdAt: serverTimestamp() });
    b.set(doc(db, "judgeStatus", `${ses.id}__${j.email}`), { sessionId: ses.id, email: j.email, name: j.name, slot: j.slot, studentId: live.studentId, saved: true, total, at: serverTimestamp() });
    n++;
  });
  if (n) await b.commit();
  return n;
}

// one student from start to end; step(text) reports progress; stop() → true to stop
export async function trialRunStudent(ses, st, upcoming, { speed = 1500, step = () => {}, stop = () => false, skipMe = false } = {}) {
  let L = await liveOf(ses.id);
  if (!L || L.studentId !== st.id) { step(`▶ ${st.name} ވެއްދުން`); if (!await admitStudent(ses, st, L, upcoming)) return false; await sleep(speed); }
  L = await liveOf(ses.id);
  const qn = L.qCount || 1, left = qn - (L.questions || []).length;
  if (L.phase === "grid" && left > 0) {
    const pool = (L.grid || []).map(g => g.n).filter(n => !(L.picks || []).includes(n));
    const nums = []; while (nums.length < Math.min(left, pool.length)) { const n = pool[Math.floor(Math.random() * pool.length)]; if (!nums.includes(n)) nums.push(n); }
    step(`🔢 ނަންބަރު: ${nums.join("، ")}`);
    await queuePicks(ses.id, nums); await sleep(speed);
  }
  for (let i = 0; i < qn; i++) {
    if (stop()) return false;
    L = await liveOf(ses.id);
    if (L.phase !== "reading") break;
    step(`📖 ސުވާލު ${L.qIndex + 1} / ${qn} — ކިޔަވަނީ`);
    await writeLive(ses, { light: "go", startedQ: L.qIndex }); await sleep(speed * 2);
    await writeLive(ses, { light: "stop" }); await sleep(speed / 2);
    L = await liveOf(ses.id);
    if ((L.questions || []).length < qn) { await backToGrid(ses, L); await sleep(speed); }
  }
  L = await liveOf(ses.id);
  step("✔ ކިޔެވުން ނިމުނީ — ޖަޖުން މާކްސް ދެނީ");
  await finishReading(ses, L); await sleep(speed);
  const n = await trialJudgeSheets(ses, await liveOf(ses.id), { skipMe });
  step(`🤖 ${n} ޖަޖު ޝީޓު`); await sleep(speed);
  if (skipMe && (ses.judges || []).some(j => j.email === S.me.email)) {
    // you mark as judge: wait until your sheet is saved (🔀 judge screen in another tab)
    for (let t = 0; t < 600 && !stop(); t++) {
      const d = await getDoc(doc(db, "scores", `${ses.id}__${st.id}__${S.me.email}`)).catch(() => null);
      if (d && d.exists() && d.data().locked) break;
      step(`⏳ ${st.name} — ތިބާގެ (ޖަޖު) މާކްސް ފައިނަލް ސޭވް ކުރައްވަން އިންތިޒާރު ކުރަނީ...`);
      await sleep(2000);
    }
    if (stop()) return false;
  }
  const { finalizeStudent } = await import("./views/chief.js");
  const scores = (await getDocs(query(collection(db, "scores"), where("sessionId", "==", ses.id)))).docs.map(d => ({ id: d.id, ...d.data() }));
  L = await liveOf(ses.id);
  const res = await finalizeStudent(ses, st.id, scores, L);
  if (res) { await setDoc(doc(db, "live", ses.id), { phase: "final", light: "stop", lastResult: { student: L.student, stars: res.stars, at: new Date() }, updatedAt: serverTimestamp() }, { merge: true });
    step(`🏅 ${st.name}: ${res.final} (${res.stars} ★)`); }
  await sleep(speed * 1.5);
  await clearStage(ses, await liveOf(ses.id), upcoming);
  return true;
}
