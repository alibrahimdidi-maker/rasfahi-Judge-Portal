/*!
 * RASFAHI — Qur'an Competition Judging System
 * Copyright (c) 2026 Ali Ibrahim Didi (AIDD) / Zaadh Holding. All rights reserved. Reg No: MED.03.IP.CR.26.EW5889
 * Unauthorised copying, hosting, modification or redistribution is prohibited.
 */
// ============================================================
//  CHIEF JUDGE: live monitor of all judges, finalize results, amendments, close session
// ============================================================
import {
  S, db, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, onSnapshot, serverTimestamp, writeBatch, arrayUnion,
  h, esc, toast, modal, confirmBox, promptBox, field, select, spinner, empty, audit, sub, idCard, fmt2, round, fmtDateTime,
  loadCategories, loadSessions, catById, sessionLabel, starsFor, starsHtml, starsEl, resultId, DEFAULT_RUBRIC, publicStudent
} from "../core.js";
import { errLabel } from "../tajweed.js";
import { admitStudent, finishReading, backToGrid, clearStage, PHASE_DV } from "../liveops.js";
import { printDoc, scoreSheetHTML, fullReportHTML, resultsHTML } from "../print.js";

async function chiefSessions() {
  const all = await loadSessions(true);
  return ["superadmin", "adminsec"].includes(S.me.role) ? all : all.filter(s => s.chiefEmail === S.me.email);
}
const isAdminRole = () => ["superadmin", "adminsec"].includes(S.me.role);
function scoreQuery(sid) {
  return isAdminRole() ? query(collection(db, "scores"), where("sessionId", "==", sid))
    : query(collection(db, "scores"), where("chiefEmail", "==", S.me.email), where("sessionId", "==", sid));
}
function resultQuery(sid) {
  return isAdminRole() ? query(collection(db, "results"), where("sessionId", "==", sid))
    : query(collection(db, "results"), where("chiefEmail", "==", S.me.email), where("sessionId", "==", sid));
}

export function computeFinal(scores, method = S.settings.scoring.method) {
  const t = scores.map(s => +s.total).sort((a, b) => a - b);
  if (!t.length) return 0;
  const use = method === "trimmed" && t.length >= 5 ? t.slice(1, -1) : t;
  return round(use.reduce((a, b) => a + b, 0) / use.length, S.settings.scoring.decimals ?? 2);
}

export async function finalizeStudent(ses, stId, scores, liveDoc) {
  const locked = scores.filter(s => s.studentId === stId && s.locked);
  if (!locked.length) { toast("ސޭވް ކޮށްފައިވާ ޝީޓެއް ނެތް", "err"); return null; }
  const rub = locked[0].rubric || (catById(locked[0].categoryId) || {}).rubric || DEFAULT_RUBRIC;
  const criteriaAvg = {};
  rub.forEach(r => criteriaAvg[r.key] = round(locked.reduce((a, s) => a + (+(s.criteria || {})[r.key] || 0), 0) / locked.length, 2));
  const final = computeFinal(locked);
  const stars = starsFor(final);
  const s0 = locked[0];
  let st = liveDoc && liveDoc.studentId === stId ? liveDoc.student : null;
  if (!st) { try { const d = await getDoc(doc(db, "students", stId)); if (d.exists()) st = publicStudent({ id: d.id, ...d.data() }, catById(d.data().categoryId)); } catch (e) {} }
  st = st || { name: s0.studentName, regNo: s0.regNo, nid: s0.nid };
  const data = {
    competitionId: S.settings.activeCompetitionId, sessionId: ses.id, sessionName: ses.name, sessionDate: ses.date, chiefEmail: ses.chiefEmail,
    studentId: stId, nid: st.nid || s0.nid || "", regNo: st.regNo || s0.regNo || "", name: st.name || s0.studentName, photoThumb: st.photoThumb || "",
    institution: st.institution || "", gender: st.gender || "", categoryId: s0.categoryId, categoryName: s0.categoryName,
    judges: locked.map(s => ({ slot: s.judgeSlot, name: s.judgeName, email: s.judgeEmail, total: s.total, criteria: s.criteria,
      jali: (s.errors || []).filter(e => e.type === "jali").length, khafi: (s.errors || []).filter(e => e.type === "khafi").length }))
      .sort((a, b) => a.slot - b.slot),
    criteriaAvg, final, stars, method: S.settings.scoring.method, rubric: rub,
    finalizedBy: S.me.email, finalizedAt: serverTimestamp(), published: ses.status === "closed"
  };
  await setDoc(doc(db, "results", resultId(ses.id, stId)), data);
  audit("result_finalize", { sid: ses.id, stId, final });
  return data;
}

// ------------------------------------------------------------ PANEL
export async function panel(view) {
  await loadCategories();
  const sessions = await chiefSessions();
  if (!sessions.length) return view.appendChild(h("div.card", empty("ތިބާ ޗީފް ޖަޖަކަށް ހަމަޖައްސާފައިވާ ސެޝަނެއް ނެތް")));
  const { datedSessionPicker, rosterPanel, notesPanel, syncRoster } = await import("../roster.js");
  const body = h("div");
  let stop = [];
  const pick = datedSessionPicker(sessions, "cSes", () => run());
  view.append(h("div.card", pick.el), body);
  run();
  function run() {
    stop.forEach(u => u()); stop = [];
    const ses = pick.current();
    body.innerHTML = "";
    if (!ses) return body.appendChild(h("div.card", empty("ދުވަހާއި ސެޝަން ހޮއްވަވާ")));
    let L = null, scores = [], results = [], pending = 0, studs = [];
    body.innerHTML = "";
    const top = h("div"), grid = h("div"), resBox = h("div.card");
    // the session list (same order as the sheets): attendance ✔ (chief may remove), comments, reschedule requests
    if (!(ses.roster || []).length) syncRoster(ses);
    const rp = rosterPanel(ses, { untick: true, comment: true, live: () => L, compact: false });
    const np = notesPanel(ses, true);
    stop.push(() => { rp._stop && rp._stop(); np._stop && np._stop(); });
    const side = h("details.card.chief-roster", { open: "" }, h("summary", h("b", "📋 ސެޝަން ލިސްޓު، ހާޟިރީ އަދި ކޮމެންޓް")), h("div.grid2", rp, np));
    body.append(top, grid, side, resBox);
    stop.push(sub(onSnapshot(doc(db, "live", ses.id), s => { L = s.exists() ? s.data() : null; draw(); })));
    stop.push(sub(onSnapshot(query(collection(db, "students"), where("sessionId", "==", ses.id)), s => {
      studs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); draw(); }, () => {})));
    const upcoming = (except) => { const d = new Set((L && L.done) || []); return studs.filter(x => !d.has(x.id) && x.id !== except); };
    stop.push(sub(onSnapshot(scoreQuery(ses.id), s => { scores = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, e => toast(e.message, "err"))));
    stop.push(sub(onSnapshot(resultQuery(ses.id), s => { results = s.docs.map(d => ({ id: d.id, ...d.data() })); drawResults(); }, e => toast(e.message, "err"))));
    if (!isAdminRole()) stop.push(sub(onSnapshot(query(collection(db, "amendRequests"), where("chiefEmail", "==", S.me.email)), s => {
      pending = s.docs.filter(d => d.data().sessionId === ses.id && d.data().status === "pending").length; draw(); })));

    async function unlock(sc) {
      if (!await confirmBox("ޝީޓު ހުޅުވައިދިނުން", `ޖަޖު ${sc.judgeSlot} (${sc.judgeName}) އަށް ${sc.studentName} ގެ ޝީޓު އަލުން ބަދަލުކުރެވޭނެ ގޮތް ހަދަންތޯ؟`, "🔓 ހުޅުވާ", "orange")) return;
      await updateDoc(doc(db, "scores", sc.id), { locked: false, unlockedBy: S.me.email, unlockedAt: serverTimestamp(),
        amendments: arrayUnion({ at: new Date(), by: S.me.email, note: "ޖަޖަށް ހުޅުވައިދިނީ", oldTotal: sc.total, newTotal: sc.total }) });
      audit("score_unlock", { id: sc.id }); toast("ހުޅުވައިދެވިއްޖެ");
    }
    async function amend(sc) {
      const rub = sc.rubric || DEFAULT_RUBRIC;
      const ins = rub.map(r => [r, h("input", { type: "number", step: "0.25", min: 0, max: r.max, value: (sc.criteria || {})[r.key] })]);
      const note = h("textarea", { rows: 2 });
      const ok = await modal(`އެމެންޑް — ޖަޖު ${sc.judgeSlot}: ${sc.judgeName}`, h("div",
        h("p.small.muted", sc.studentName + " • މިހާރުގެ ޖުމްލަ: " + fmt2(sc.total)),
        h("div.grid2", ins.map(([r, i]) => field(`${r.name} (${r.max})`, i))), field("ސަބަބު (މަޖުބޫރު)", note)),
        [{ label: "ކެންސަލް" }, { label: "ސޭވް", cls: "primary", onClick: async () => {
          if (!note.value.trim()) { toast("ސަބަބު ލިޔުއްވާ", "err"); return false; }
          const crit = {}; let tot = 0;
          ins.forEach(([r, i]) => { const v = Math.max(0, Math.min(+r.max, +i.value || 0)); crit[r.key] = v; tot += v; });
          await updateDoc(doc(db, "scores", sc.id), { criteria: crit, total: round(tot, 2), locked: true,
            amendments: arrayUnion({ at: new Date(), by: S.me.email, note: note.value.trim(), oldTotal: sc.total, newTotal: round(tot, 2), oldCriteria: sc.criteria || {} }) });
          audit("score_amend", { id: sc.id, old: sc.total, new: tot }); return true;
        } }]);
      if (ok) toast("އެމެންޑް ކުރެވިއްޖެ — ނަތީޖާ އަލުން ނިންމަވާ");
    }
    async function finalize() {
      const mine = scores.filter(s => s.studentId === L.studentId);
      const missing = (ses.judges || []).filter(j => !mine.find(s => s.judgeEmail === j.email && s.locked));
      if (missing.length && !await confirmBox("ހުރިހާ ޖަޖުން ސޭވް ނުކުރޭ", `${missing.map(j => "ޖަޖު " + j.slot).join("، ")} ސޭވް ކޮށްފައި ނުވޭ. ލިބިފައިވާ ޝީޓްތަކުން ނިންމަންތޯ؟`, "ނިންމާ", "red")) return;
      const r = await finalizeStudent(ses, L.studentId, scores, L);
      if (!r) return;
      await setDoc(doc(db, "live", ses.id), { phase: "final", light: "stop", lastResult: { student: L.student, stars: r.stars, at: new Date() }, updatedAt: serverTimestamp() }, { merge: true });
      toast(`ނަތީޖާ ނިމިއްޖެ: ${fmt2(r.final)} (${r.stars} ތަރި)`);
    }
    async function closeSession() {
      const drafts = scores.filter(x => !x.locked);
      if (drafts.length && !await confirmBox("ފައިނަލް ސޭވް ނުކުރާ ޝީޓު", `${drafts.length} ޝީޓު އަދި ޑްރާފްޓް / ހުޅުވިފައި (${[...new Set(drafts.map(x => "ޖަޖު " + x.judgeSlot))].join("، ")}). ޖަޖުން ފައިނަލް ސޭވް ނުކޮށް ސެޝަން ނިންމަންތޯ؟`, "އާދެ، ނިންމާ", "red")) return;
      if (!await confirmBox("ސެޝަން ނިންމުން", "ސެޝަން ނިންމާލުމުން ނަތީޖާ ސުޕަވައިޒަރ އަދި އެޑްމިނަށް ފެންނާނެ. ނިންމަންތޯ؟", "✔ ނިންމާ", "red")) return;
      const b = writeBatch(db);
      b.update(doc(db, "sessions", ses.id), { status: "closed", closedAt: serverTimestamp(), closedBy: S.me.email });
      results.forEach(r => b.update(doc(db, "results", r.id), { published: true }));
      b.set(doc(db, "live", ses.id), { phase: "closed", studentId: "", student: null, questions: [], grid: [], updatedAt: serverTimestamp() }, { merge: true });
      await b.commit(); ses.status = "closed";
      audit("session_close", { id: ses.id, n: results.length }); toast("ސެޝަން ނިމިއްޖެ");
      drawResults();
    }

    function draw() {
      top.innerHTML = ""; grid.innerHTML = "";
      top.appendChild(h("div.card", h("div.row.between",
        h("div.row", h("h2", { style: { margin: 0 } }, ses.name), h("span.tag", ses.date + " " + (ses.time || "")), h("span.tag.gold", ses.status === "closed" ? "ނިމިފައި" : ses.status === "live" ? "ހިނގަމުންދަނީ" : "ރޭވިފައި"),
          pending ? h("a.tag.orange", { href: "#amend" }, `⏳ ${pending} އެމެންޑް ރިކުއެސްޓް`) : null),
        ses.status !== "closed" ? h("button.btn.red", { onclick: closeSession }, "✔ ސެޝަން ނިންމާ") : h("span.tag.green", "ނަތީޖާ ޕަބްލިޝް ކުރެވިފައި"))));
      if (!L || !L.studentId) {
        if ((L && L.phase === "closed") || ses.status === "closed") { grid.appendChild(h("div.card", empty("ސެޝަން ނިމިފައި"))); return; }
        const rest = upcoming(""), nx = rest.find(x => x.checkin) || rest[0];
        const other = select([["", "— އެހެން ދަރިވަރަކު —"], ...rest.map(x => [x.id, `${x.order || ""}. ${x.name}${x.checkin ? "" : " (ނާދޭ)"}`])], "");
        other.onchange = () => { const st = rest.find(x => x.id === other.value); if (st) admitStudent(ses, st, L, upcoming(st.id)); };
        grid.appendChild(h("div.card", h("h3", "ދެން ދަރިވަރު ކިޔެވުމަށް ވެއްދުން"),
          nx ? h("div", idCard(nx), h("button.btn.primary.lg", { style: { width: "100%", marginTop: "10px" }, onclick: () => admitStudent(ses, nx, L, upcoming(nx.id)) }, "▶ " + nx.name + " — ކިޔެވުމަށް ވެއްދި"))
            : empty("ބާކީ ދަރިވަރެއް ނެތް"),
          rest.length > 1 ? h("div", { style: { marginTop: "10px" } }, other) : null));
        return;
      }
      const mine = scores.filter(s => s.studentId === L.studentId);
      const rub = (mine[0] && mine[0].rubric) || (catById(L.categoryId) || {}).rubric || DEFAULT_RUBRIC;
      const locked = mine.filter(s => s.locked);
      const fin = computeFinal(locked);
      const card = h("div.card");
      card.append(h("div.row.between", idCard(L.student),
        h("div.center", h("div.small.muted", "ޕްރޮވިޜަނަލް ފައިނަލް"), h("div", { style: { fontSize: "40px", fontWeight: 900, color: "#00e676" } }, locked.length ? fmt2(fin) : "-"),
          starsEl(locked.length ? starsFor(fin) : 0))),
        h("div.row", { style: { margin: "8px 0" } }, h("span.phase-pill", L.phase === "reading" ? `ކިޔަވަނީ — ސުވާލު ${L.qIndex + 1}/${L.qCount || (L.questions || []).length}` : PHASE_DV[L.phase] || L.phase),
          L.phase === "reading" ? ((L.questions || []).length < (L.qCount || 1)
            ? h("button.btn.primary", { onclick: () => backToGrid(ses, L) }, "ދެން ސުވާލު ހޮވާ ▶")
            : h("button.btn.blue", { onclick: async () => { if (await confirmBox("✔ ކިޔެވުން ނިމުނީ", "ދަރިވަރު ސްކްރީން އޮފްވެ، ޖަޖުންނަށް މާކްސް ސޭވްކުރުމަށް ފޮނުވާނެ.", "ނިމުނީ", "green")) finishReading(ses, L); } }, "✔ ނިމުނު")) : null,
          L.phase === "final" ? h("button.btn.primary", { onclick: () => clearStage(ses, L, upcoming(L.studentId)) }, "⏭ ދެން ދަރިވަރު") : null,
          L.light ? h("span.light." + (L.light === "go" ? "go" : "stop")) : null));
      const js = (ses.judges || []).slice().sort((a, b) => a.slot - b.slot);
      card.appendChild(h("div.tbl-wrap", h("table.tbl",
        h("thead", h("tr", h("th", "ބައި"), h("th", "މެކްސް"), js.map(j => h("th", `ޖަޖު ${j.slot}`, h("div.small.muted", j.name))), h("th", "އެވަރެޖު"))),
        h("tbody",
          rub.map(r => h("tr", h("td", r.name), h("td", r.max), js.map(j => { const s = mine.find(x => x.judgeEmail === j.email); return h("td", s ? fmt2((s.criteria || {})[r.key]) : "…"); }),
            h("td", h("b", locked.length ? fmt2(locked.reduce((a, s) => a + (+(s.criteria || {})[r.key] || 0), 0) / locked.length) : "-")))),
          h("tr", h("th", "ޖުމްލަ"), h("th", rub.reduce((a, r) => a + (+r.max || 0), 0)), js.map(j => { const s = mine.find(x => x.judgeEmail === j.email);
            return h("th", s ? h("span", { style: { color: s.locked ? "#00e676" : "#ffb74d" } }, fmt2(s.total), s.locked ? " 🔒" : " 🔓") : h("span.muted", "ސޭވް ނުކުރޭ")); }), h("th", fmt2(fin))),
          h("tr", h("td", "ކުށް"), h("td"), js.map(j => { const s = mine.find(x => x.judgeEmail === j.email);
            return h("td", s ? `ޖަލީ ${(s.errors || []).filter(e => e.type === "jali").length} • ޚަފީ ${(s.errors || []).filter(e => e.type === "khafi").length}` : ""); }), h("td")),
          h("tr", h("td"), h("td"), js.map(j => { const s = mine.find(x => x.judgeEmail === j.email);
            return h("td", s ? h("div.row", { style: { gap: "4px" } }, h("button.btn.sm", { onclick: () => showErrs(s) }, "👁"),
              s.locked ? h("button.btn.sm.orange", { onclick: () => unlock(s) }, "🔓") : null, h("button.btn.sm", { onclick: () => amend(s) }, "✎")) : null); }), h("td"))))));
      card.appendChild(h("div.row", { style: { marginTop: "10px" } },
        h("button.btn.green.lg", { onclick: finalize, disabled: !locked.length }, L.phase === "final" ? "↻ ނަތީޖާ އަލުން ނިންމާ" : "✔ ނަތީޖާ ނިންމާ (ފައިނަލް)"),
        h("button.btn", { onclick: () => compareErrs(mine) }, "ކުށްތައް އަޅާކިޔާ")));
      grid.appendChild(card);
    }
    function showErrs(s) {
      printDoc("ޖަޖުގެ މާކްސް ޝީޓް", scoreSheetHTML(s, catById(s.categoryId)));
    }
    function compareErrs(mine) {
      const byWord = {};
      mine.forEach(s => (s.errors || []).forEach(e => { const k = e.qIndex + "|" + e.w; (byWord[k] = byWord[k] || { e, by: [] }).by.push({ slot: s.judgeSlot, e }); }));
      const rows = Object.values(byWord).sort((a, b) => a.e.qIndex - b.e.qIndex || String(a.e.w).localeCompare(String(b.e.w)));
      modal("ކުށްތައް — ޖަޖުން އަޅާކިޔުން", rows.length ? h("div.tbl-wrap", h("table.tbl", h("thead", h("tr", ["ސުވާލު", "ކަލިމަ", "ޖަޖުން"].map(x => h("th", x)))),
        h("tbody", rows.map(r => h("tr", h("td", r.e.qIndex + 1), h("td", { style: { fontFamily: "var(--quran)", fontSize: "22px" } }, r.e.word),
          h("td", r.by.map(b => h("div.small", { style: { color: b.e.type === "jali" ? "#ff7070" : "#ffb74d" } }, `ޖަޖު ${b.slot}: ${errLabel(b.e)}`)))))))) : empty("ކުށެއް ނެތް"), [], { wide: true });
    }
    function drawResults() {
      resBox.innerHTML = "";
      const rows = results.slice().sort((a, b) => b.final - a.final);
      rows.forEach((r, i) => r.rank = i + 1);
      resBox.append(h("div.row.between", h("h3", `ނިމުނު ދަރިވަރުން (${rows.length})`),
        h("div.row", h("button.btn.sm", { onclick: () => printDoc("ސެޝަން ނަތީޖާ — " + ses.name, resultsHTML(rows, (ses.judges || []).length + 1), { sub: ses.date }) }, "🖨 ނަތީޖާ"),
          h("button.btn.sm", { onclick: () => printDoc("ފުރިހަމަ ރުބްރިކް ރިޕޯޓް", rows.map(r => fullReportHTML(r, scores.filter(s => s.studentId === r.studentId), catById(r.categoryId))).join("")) }, "📑 ފުރިހަމަ ރިޕޯޓް"))));
      if (!rows.length) return resBox.appendChild(empty("އަދި ނަތީޖާއެއް ނެތް"));
      resBox.appendChild(h("div.tbl-wrap", h("table.tbl", h("thead", h("tr", ["#", "ދަރިވަރު", "ރެޖި", "ބައި", ...(ses.judges || []).map(j => "ޖ" + j.slot), "ފައިނަލް", "ތަރި", ""].map(x => h("th", x)))),
        h("tbody", rows.map(r => h("tr", h("td", r.rank), h("td", r.name), h("td", r.regNo), h("td", r.categoryName),
          (ses.judges || []).map(j => h("td", fmt2(((r.judges || []).find(x => x.email === j.email) || {}).total))),
          h("td", h("b", fmt2(r.final))), h("td", starsEl(r.stars)),
          h("td", h("div.row", h("button.btn.sm", { onclick: async () => { const x = await finalizeStudent(ses, r.studentId, scores, L); if (x) toast("އަލުން ހިސާބުކުރެވިއްޖެ: " + fmt2(x.final)); } }, "↻"),
            h("button.btn.sm", { onclick: () => printDoc("ފުރިހަމަ ރިޕޯޓް", fullReportHTML(r, scores.filter(s => s.studentId === r.studentId), catById(r.categoryId))) }, "📑")))))))));
    }
  }
}

// ------------------------------------------------------------ AMENDMENTS
export async function amendments(view) {
  const card = h("div.card", h("h2", "އެމެންޑް ރިކުއެސްޓްތައް"), spinner());
  view.appendChild(card);
  sub(onSnapshot(query(collection(db, "amendRequests"), where("chiefEmail", "==", S.me.email)), s => {
    const rows = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.status === "pending" ? -1 : 1) - (b.status === "pending" ? -1 : 1) || (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    card.innerHTML = ""; card.appendChild(h("h2", "އެމެންޑް ރިކުއެސްޓްތައް"));
    if (!rows.length) return card.appendChild(empty("ރިކުއެސްޓެއް ނެތް"));
    card.appendChild(h("div.tbl-wrap", h("table.tbl", h("thead", h("tr", ["ވަގުތު", "ޖަޖު", "ދަރިވަރު", "ސަބަބު", "ޙާލަތު", ""].map(x => h("th", x)))),
      h("tbody", rows.map(r => h("tr", h("td.small", fmtDateTime(r.createdAt)), h("td", `${r.judgeSlot || ""}. ${r.judgeName}`), h("td", r.studentName), h("td", r.reason),
        h("td", { pending: h("span.tag.orange", "⏳ ބަލަންޖެހޭ"), approved: h("span.tag.green", "ގަބޫލު"), rejected: h("span.tag.red", "ރިޖެކްޓް") }[r.status] || r.status),
        h("td", r.status === "pending" ? h("div.row",
          h("button.btn.sm.green", { onclick: async () => {
            const sc = await getDoc(doc(db, "scores", r.scoreId));
            const b = writeBatch(db);
            if (sc.exists()) b.update(doc(db, "scores", r.scoreId), { locked: false, unlockedBy: S.me.email, unlockedAt: serverTimestamp(),
              amendments: arrayUnion({ at: new Date(), by: S.me.email, note: "ރިކުއެސްޓް ގަބޫލުކުރީ: " + r.reason, oldTotal: sc.data().total, newTotal: sc.data().total }) });
            b.update(doc(db, "amendRequests", r.id), { status: "approved", decidedBy: S.me.email, decidedAt: serverTimestamp() });
            await b.commit(); audit("amend_approve", { id: r.id }); toast("ޖަޖަށް ޝީޓު ހުޅުވައިދެވިއްޖެ");
          } }, "✔ ގަބޫލު (ހުޅުވާ)"),
          h("button.btn.sm.red", { onclick: async () => {
            const n = await promptBox("ރިޖެކްޓް", "ސަބަބު", ""); if (n === null) return;
            await updateDoc(doc(db, "amendRequests", r.id), { status: "rejected", chiefNote: n || "", decidedBy: S.me.email, decidedAt: serverTimestamp() });
            audit("amend_reject", { id: r.id });
          } }, "✕ ރިޖެކްޓް")) : h("span.small.muted", r.chiefNote || ""))))))));
  }, e => { card.innerHTML = ""; card.appendChild(empty(e.message)); }));
}

// ------------------------------------------------------------ SESSION RESULTS (chief)
export async function sessionResults(view) {
  await loadCategories();
  const card = h("div.card", h("h2", "ތިބާގެ ސެޝަންތަކުގެ ނަތީޖާ"), spinner());
  view.appendChild(card);
  const snap = await getDocs(query(collection(db, "results"), where("chiefEmail", "==", S.me.email)));
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  const sesList = [...new Map(rows.map(r => [r.sessionId, r.sessionName + " " + r.sessionDate])).entries()];
  const fS = select([["", "ހުރިހާ ސެޝަނެއް"], ...sesList], "");
  const box = h("div");
  card.innerHTML = ""; card.append(h("h2", "ތިބާގެ ސެޝަންތަކުގެ ނަތީޖާ"), h("div.filters", fS,
    h("button.btn", { onclick: () => printDoc("ނަތީޖާ", resultsHTML(cur())) }, "🖨 ޕްރިންޓް")), box);
  const cur = () => rows.filter(r => !fS.value || r.sessionId === fS.value).sort((a, b) => b.final - a.final).map((r, i) => ({ ...r, rank: i + 1 }));
  const draw = () => { box.innerHTML = ""; const list = cur(); if (!list.length) return box.appendChild(empty("ނަތީޖާއެއް ނެތް"));
    box.appendChild(h("div.tbl-wrap", h("table.tbl", h("thead", h("tr", ["#", "ދަރިވަރު", "ރެޖި", "ބައި", "ސެޝަން", "ފައިނަލް", "ތަރި"].map(x => h("th", x)))),
      h("tbody", list.map(r => h("tr", h("td", r.rank), h("td", r.name), h("td", r.regNo), h("td", r.categoryName), h("td.small", r.sessionName), h("td", h("b", fmt2(r.final))), h("td", starsEl(r.stars)))))))); };
  fS.onchange = draw; draw();
}
