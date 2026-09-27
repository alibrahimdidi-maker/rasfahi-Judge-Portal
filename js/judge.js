// ============================================================
//  JUDGE dashboard — only the judge's own sheets
//  • double-click / double-tap a word  → ލަޙްނު ޖަލީ (red, straight to the rubric sheet)
//  • single click / tap a word          → ލަޙްނު ޚަފީ list pop-up
//  • Save = lock. Changes after saving only through the chief judge.
// ============================================================
import {
  S, db, doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, query, where, onSnapshot, serverTimestamp,
  h, esc, toast, modal, confirmBox, promptBox, select, spinner, empty, audit, sub, idCard, fmt2, round, fmtDateTime,
  loadCategories, catById, sessionLabel, scoreId, uid, beep, DEFAULT_RUBRIC
} from "../core.js";
import { loadQuran, renderPage, renderFlow, wordInfo, qLabelDv, qLabel } from "../quran.js";
import { JALI, JALI_TYPES, KHAFI_GROUPS, khafiInfo, errLabel } from "../tajweed.js";
import { printDoc, scoreSheetHTML } from "../print.js";

async function mySessions() {
  const snap = await getDocs(query(collection(db, "sessions"), where("judgeEmails", "array-contains", S.me.email)));
  return snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time)));
}

// ------------------------------------------------------------ LIVE MARKING
export async function live(view) {
  await Promise.all([loadQuran({ tanzil: S.settings.textSource === "tanzil" }), loadCategories()]);
  const all = await mySessions();
  const open = all.filter(s => s.status !== "closed");
  if (!open.length) return view.appendChild(h("div.card", empty("ތިބާ ޖަޖަކަށް ހަމަޖައްސާފައިވާ ހުޅުވިފައިވާ ސެޝަނެއް ނެތް")));
  const today = new Date().toISOString().slice(0, 10);
  const def = (open.find(s => s.status === "live") || open.find(s => s.date === today) || open[open.length - 1]).id;
  const pick = select(open.map(s => [s.id, sessionLabel(s)]), sessionStorage.getItem("jSes") || def);
  const body = h("div");
  view.append(h("div.row", { style: { marginBottom: "10px" } }, h("b", "ސެޝަން:"), h("div.grow", pick)), body);
  pick.onchange = () => { sessionStorage.setItem("jSes", pick.value); run(); };
  let stop = [];
  run();

  function run() {
    stop.forEach(u => u()); stop = [];
    const ses = open.find(s => s.id === pick.value) || open[0];
    const me = (ses.judges || []).find(j => j.email === S.me.email) || { slot: "?", name: S.me.name };
    let L = null, scoreDoc = null, curStudent = "", viewQ = 0, lastQ = -1, lastSeq = null;
    let D = null; // working draft {errors, adj, note}
    let tapT = null, tapW = null;
    body.innerHTML = "";
    const head = h("div"), main = h("div"), side = h("div");
    body.append(head, h("div.judge-layout", main, side));

    stop.push(sub(onSnapshot(doc(db, "live", ses.id), s => {
      const prev = L; L = s.exists() ? s.data() : null;
      if (L && L.studentId && L.studentId !== curStudent) switchStudent(L.studentId);
      if (L && !L.studentId) { curStudent = ""; scoreDoc = null; D = null; }
      if (L && L.qIndex !== lastQ && L.qIndex >= 0 && L.phase === "reading") {
        if (lastQ >= 0 && prev && prev.studentId === L.studentId) flash(`ސުވާލު ${L.qIndex + 1}`);
        viewQ = L.qIndex; lastQ = L.qIndex;
      }
      if (L && prev && prev.light !== L.light && L.light === "go") beep(988, 150);
      draw();
    }, e => toast(e.message, "err"))));

    let scoreUnsub = null;
    function switchStudent(stId) {
      curStudent = stId; lastQ = -1; viewQ = 0; scoreDoc = null;
      D = loadDraft(ses.id, stId) || { errors: [], adj: {}, note: "" };
      if (scoreUnsub) scoreUnsub();
      scoreUnsub = onSnapshot(doc(db, "scores", scoreId(ses.id, stId, S.me.email)), s => {
        scoreDoc = s.exists() ? s.data() : null;
        if (scoreDoc && !scoreDoc.locked && !D._fromScore) { D = { errors: scoreDoc.errors || [], adj: scoreDoc.adj || {}, note: scoreDoc.note || "", _fromScore: true }; }
        draw();
      }, () => {});
      stop.push(() => scoreUnsub && scoreUnsub());
      setDoc(doc(db, "judgeStatus", `${ses.id}__${S.me.email}`), { sessionId: ses.id, email: S.me.email, name: me.name, slot: me.slot, studentId: stId, saved: false, at: serverTimestamp() })
        .catch(() => {});
    }

    const cat = () => catById(L && L.categoryId) || { rubric: DEFAULT_RUBRIC, jaliDed: 1, khafiDed: 0.5, autoDeduct: true, deductSteps: [0.25, 0.5, 1] };
    const rubric = () => cat().rubric || DEFAULT_RUBRIC;
    const critKey = (k) => rubric().find(r => r.key === k) ? k : rubric()[0].key;
    const locked = () => !!(scoreDoc && scoreDoc.locked);
    function persist() { if (D && curStudent) saveDraft(ses.id, curStudent, D); }

    function compute() {
      const c = cat(), crit = {}, auto = {};
      rubric().forEach(r => auto[r.key] = 0);
      if (c.autoDeduct !== false) (D.errors || []).forEach(e => { const k = critKey(e.crit); auto[k] = (auto[k] || 0) + (+e.ded || 0); });
      let total = 0;
      rubric().forEach(r => {
        const v = Math.max(0, Math.min(+r.max, +r.max - auto[r.key] + (+(D.adj || {})[r.key] || 0)));
        crit[r.key] = round(v, 2); total += v;
      });
      return { crit, auto, total: round(total, 2) };
    }

    function addError(w, e) {
      if (locked()) return toast("މާކްސް ލޮކް ވެފައި", "warn");
      const info = wordInfo(isNaN(+w) ? w : +w);
      D.errors.push({ id: uid(), w: info.w, word: info.text, surah: info.surah, surahName: info.surahName, ayah: info.ayah, page: info.page, line: info.line,
        qIndex: viewQ, at: Date.now(), ...e });
      persist(); draw();
    }
    function removeError(id) { D.errors = D.errors.filter(e => e.id !== id); persist(); draw(); }
    function jali(w) {
      const ex = D.errors.find(e => String(e.w) === String(w) && e.type === "jali" && e.qIndex === viewQ);
      if (ex) { removeError(ex.id); return toast("ލަޙްނު ޖަލީ ފޮހެލެވިއްޖެ", "warn", 1500); }
      addError(w, { type: "jali", crit: JALI.crit, ded: +cat().jaliDed || JALI.ded, groupDv: "", subDv: "" });
    }
    function khafiPop(w) {
      if (locked()) return;
      const info = wordInfo(isNaN(+w) ? w : +w);
      const existing = D.errors.filter(e => String(e.w) === String(w) && e.qIndex === viewQ);
      const content = h("div.khafi-pop",
        h("div.pop-word", info.text),
        h("div.small.muted.center", `${info.surahName} : ${info.ayah} • ޞަފުޙާ ${info.page}${info.line ? " • ފޮޅުވަތް " + info.line : ""}`),
        existing.length ? h("div.card", { style: { margin: "10px 0" } }, h("h4", "މި ކަލިމައިގެ ކުށްތައް"),
          existing.map(e => h("div.erritem." + e.type, h("span.etype", errLabel(e)), h("button.btn.sm.red", { onclick: () => { removeError(e.id); close(); } }, "ފޮހެލާ")))) : null,
        h("div.grp", h("h4", { style: { color: "#ff7070" } }, "ލަޙްނު ޖަލީ"), h("div.opts",
          h("button", { onclick: () => { jali(w); close(); } }, "ލަޙްނު ޖަލީ", h("small", "لحن جلي")),
          JALI_TYPES.map(t => h("button", { onclick: () => { addError(w, { type: "jali", crit: JALI.crit, ded: +cat().jaliDed || 1, sub: t.key, subDv: t.dv, subAr: t.ar }); close(); } }, t.dv, h("small", t.ar))))),
        KHAFI_GROUPS.map(g => h("div.grp", h("h4", `${g.dv} — ${g.ar}`), h("div.opts", g.items.map(([k, ar, dv]) => h("button", { onclick: () => {
          const ki = khafiInfo(g.key, k);
          addError(w, { type: "khafi", group: g.key, groupDv: g.dv, sub: k, subDv: dv, subAr: ar, crit: ki.crit, ded: +(cat().khafiDed ?? ki.ded) });
          close();
        } }, dv, h("small", ar)))))));
      let closer = null;
      function close() { if (closer) closer(null); }
      return modal("ކުށް ފާހަގަކުރުން", content, [{ label: "ކެންސަލް" }], { wide: true, noFocus: true, onOpen: (c) => { closer = c; } });
    }
    // single vs double tap on the same word (works with mouse and touch)
    function onWordTap(e) {
      const el = e.target.closest(".w.in"); if (!el) return;
      e.preventDefault();
      if (L && L.phase === "reading" && viewQ !== L.qIndex) { /* allow marking on previous question view */ }
      const w = el.dataset.w;
      if (tapT && tapW === w) { clearTimeout(tapT); tapT = null; tapW = null; jali(w); return; }
      if (tapT) clearTimeout(tapT);
      tapW = w;
      tapT = setTimeout(() => { tapT = null; tapW = null; khafiPop(w); }, 300);
    }

    async function save() {
      const { crit, total } = compute();
      const errs = D.errors || [];
      const ok = await confirmBox("މާކްސް ސޭވްކުރުން", `ޖުމްލަ: ${fmt2(total)} • ކުށް: ${errs.length} (ޖަލީ ${errs.filter(e => e.type === "jali").length})\nސޭވް ކުރުމުން ބަދަލު ނުކުރެވޭނެ. ކުރިއަށް ދާންތޯ؟`, "💾 ސޭވް ކޮށް ލޮކްކުރޭ", "green");
      if (!ok) return;
      const id = scoreId(ses.id, curStudent, S.me.email);
      const st = L.student || {};
      const data = { criteria: crit, adj: D.adj || {}, total, errors: errs, note: D.note || "", locked: true, savedAt: serverTimestamp(),
        questions: L.questions || [], rubric: rubric() };
      try {
        if (scoreDoc) await updateDoc(doc(db, "scores", id), { ...data, resavedAt: serverTimestamp() });
        else await setDoc(doc(db, "scores", id), { ...data, competitionId: S.settings.activeCompetitionId, sessionId: ses.id, sessionName: ses.name, sessionDate: ses.date,
          studentId: curStudent, studentName: st.name, regNo: st.regNo, nid: st.nid, categoryId: L.categoryId, categoryName: L.categoryName,
          judgeEmail: S.me.email, judgeName: me.name, judgeSlot: me.slot, chiefEmail: ses.chiefEmail, amendments: [], createdAt: serverTimestamp() });
        await setDoc(doc(db, "judgeStatus", `${ses.id}__${S.me.email}`), { sessionId: ses.id, email: S.me.email, name: me.name, slot: me.slot, studentId: curStudent, saved: true, total, at: serverTimestamp() });
        clearDraft(ses.id, curStudent);
        audit("score_save", { id, total });
        toast("ސޭވް ކުރެވި ލޮކް ވެއްޖެ ✔");
      } catch (e) { toast("ސޭވް ނުވި: " + e.message, "err", 7000); }
    }
    async function requestAmend() {
      const r = await promptBox("އެމެންޑް ރިކުއެސްޓް — ޗީފް ޖަޖަށް", "ބަދަލު ކުރަން ބޭނުންވާ ސަބަބު", "", true);
      if (!r) return;
      await addDoc(collection(db, "amendRequests"), { sessionId: ses.id, scoreId: scoreId(ses.id, curStudent, S.me.email), studentId: curStudent,
        studentName: (L.student || {}).name || "", judgeEmail: S.me.email, judgeName: me.name, judgeSlot: me.slot, chiefEmail: ses.chiefEmail,
        reason: r, status: "pending", createdAt: serverTimestamp() });
      audit("amend_request", { st: curStudent }); toast("ޗީފް ޖަޖަށް ފޮނުވިއްޖެ");
    }

    function draw() {
      head.innerHTML = ""; main.innerHTML = ""; side.innerHTML = "";
      head.appendChild(h("div.row.between", { style: { marginBottom: "8px" } },
        h("div.row", h("span.tag.gold", `ޖަޖު ${me.slot}`), h("b", me.name)),
        h("div.row", L && L.light ? h("span.light." + (L.light === "go" ? "go" : "stop")) : null,
          h("span.small.muted", L ? ({ idle: "ދަރިވަރަކަށް އިންތިޒާރުކުރަނީ", grid: "ދަރިވަރު ސުވާލު ހޮވަނީ", reading: L.light === "go" ? "ކިޔަވަނީ" : "ހުއްޓިފައި", scoring: "މާކްސް ސޭވްކުރައްވާ", final: "ނިމިއްޖެ" }[L.phase] || "") : "ލައިވް ނެތް"))));
      if (!L || !L.studentId) { main.appendChild(h("div.card", empty("ދަރިވަރަކު ގޮވުމަށް އިންތިޒާރުކުރަނީ..."))); if (L && L.lastResult) main.appendChild(h("div.card", h("div.small.muted", "ކުރީގެ ދަރިވަރު"), idCard(L.lastResult.student, { more: false }))); return; }
      main.appendChild(h("div", { style: { marginBottom: "10px" } }, idCard(L.student)));
      if (!D) D = { errors: [], adj: {}, note: "" };
      const qs = L.questions || [];
      if (!qs.length) { main.appendChild(h("div.card", empty(L.phase === "grid" ? `ދަރިވަރު ގްރިޑުން ސުވާލު ހޮވަނީ... (${(L.picks || []).length}/${L.qCount})` : "ސުވާލު ނެތް"))); }
      else {
        if (viewQ >= qs.length) viewQ = qs.length - 1;
        const q = qs[viewQ];
        main.appendChild(h("div.qbar",
          h("span.qn", `ސުވާލު ${viewQ + 1} / ${qs.length}`),
          h("div.qtabs", qs.map((x, i) => h("button" + (i === viewQ ? ".view" : "") + (i === L.qIndex ? ".cur" : ""), { onclick: () => { viewQ = i; draw(); } },
            `${i + 1}${i === L.qIndex ? " ●" : ""}`))),
          h("span.grow.small", qLabelDv(q)),
          viewQ !== L.qIndex && L.phase === "reading" ? h("button.btn.sm.orange", { onclick: () => { viewQ = L.qIndex; draw(); } }, "ހިނގަމުންދާ ސުވާލަށް ↩") : null));
        const marks = {};
        D.errors.filter(e => e.qIndex === viewQ).forEach(e => { marks[e.w] = marks[e.w] && marks[e.w] !== e.type ? "both" : e.type; });
        const src = S.settings.textSource;
        const pg = h("div.clickable", { html: src === "tanzil" ? `<div class="flow tz">${renderFlow(q, { source: "tanzil", marks })}</div>` : renderPage(q.page, { range: [q.wStart, q.wEnd], marks }) });
        pg.addEventListener("click", onWordTap);
        pg.addEventListener("dblclick", e => e.preventDefault());
        main.appendChild(pg);
        main.appendChild(h("p.small.muted", "ކަލިމަ މައްޗަށް 2 ފަހަރު ފިއްތުމުން = ލަޙްނު ޖަލީ (ރަތް) • 1 ފަހަރު ފިއްތުމުން = ލަޙްނު ޚަފީ ލިސްޓު • ޖަލީ ފޮހެލުމަށް އަލުން 2 ފަހަރު ފިއްތާ"));
      }
      // ---- side: rubric
      const { crit, auto, total } = compute();
      const lk = locked();
      const steps = cat().deductSteps && cat().deductSteps.length ? cat().deductSteps : [0.25, 0.5, 1];
      const card = h("div.card");
      side.appendChild(card);
      card.appendChild(h("h3", "ރުބްރިކް ޝީޓް"));
      if (lk) card.appendChild(h("div.locked-banner", "🔒 ސޭވް ކުރެވި ލޮކް ވެފައި — ", fmtDateTime(scoreDoc.savedAt)));
      else if (scoreDoc && !scoreDoc.locked) card.appendChild(h("div.locked-banner", { style: { borderColor: "#ff9800", color: "#ffc062", background: "#211504" } }, "🔓 ޗީފް ޖަޖު ބަދަލުކުރުމަށް ހުޅުވައިދީފި"));
      const src = lk ? scoreDoc : null;
      rubric().forEach(r => {
        const val = src ? (src.criteria || {})[r.key] : crit[r.key];
        const inp = h("input", { type: "number", step: "0.25", min: 0, max: r.max, value: fmt2(val), disabled: lk });
        inp.onchange = () => { const v = Math.max(0, Math.min(+r.max, +inp.value || 0)); D.adj[r.key] = round(v - (+r.max - (auto[r.key] || 0)), 2); persist(); draw(); };
        card.appendChild(h("div.rub-row",
          h("div.nm", r.name, " ", h("small", `(${r.max})`), !src && auto[r.key] ? h("small", { style: { color: "#ff7070" } }, ` −${fmt2(auto[r.key])}`) : null),
          h("div.rub-ctl", lk ? null : steps.map(sv => h("button", { onclick: () => { D.adj[r.key] = round((+D.adj[r.key] || 0) - sv, 2); persist(); draw(); } }, "−" + sv)),
            inp, lk ? null : h("button", { onclick: () => { D.adj[r.key] = round((+D.adj[r.key] || 0) + steps[0], 2); persist(); draw(); } }, "+"))));
      });
      card.appendChild(h("div.total-box", h("span", "ޖުމްލަ"), h("b", fmt2(src ? src.total : total))));
      // errors
      const errs = (src ? src.errors : D.errors) || [];
      const ecard = h("div.card", h("h3", `ކުށްތައް (${errs.length}) — ޖަލީ ${errs.filter(e => e.type === "jali").length} • ޚަފީ ${errs.filter(e => e.type === "khafi").length}`));
      const el = h("div.errlist");
      errs.slice().sort((a, b) => a.qIndex - b.qIndex || a.at - b.at).forEach(e => el.appendChild(h("div.erritem." + e.type,
        h("span.tag", "ސ" + (e.qIndex + 1)), h("span.ew", e.word), h("span.etype", errLabel(e), h("div.small.muted", `${e.surahName} ${e.ayah} • ޞ ${e.page}${e.line ? " • ފ " + e.line : ""}`)),
        h("span.small", { style: { color: "#ff7070" } }, e.ded ? "−" + e.ded : ""),
        lk ? null : h("button.icon-btn", { onclick: () => removeError(e.id) }, "✕"))));
      if (!errs.length) el.appendChild(h("div.small.muted.center", "ކުށެއް ފާހަގަ ނުކުރެ"));
      ecard.appendChild(el);
      const note = h("textarea", { rows: 2, placeholder: "ނޯޓު (އިޚްތިޔާރީ)", disabled: lk }, (src ? src.note : D.note) || "");
      note.oninput = () => { D.note = note.value; persist(); };
      ecard.appendChild(note);
      side.appendChild(ecard);
      const act = h("div.row", { style: { gap: "8px" } });
      if (!lk) act.appendChild(h("button.btn.green.lg", { style: { flex: 1 }, onclick: save, disabled: !(L.questions || []).length }, "💾 މާކްސް ސޭވްކުރޭ"));
      else {
        act.appendChild(h("button.btn", { onclick: () => printDoc("ޖަޖުގެ މާކްސް ޝީޓް", scoreSheetHTML(scoreDoc, cat())) }, "🖨 ޝީޓް"));
        act.appendChild(h("button.btn.orange", { onclick: requestAmend }, "✎ އެމެންޑް ރިކުއެސްޓް"));
      }
      side.appendChild(act);
    }
  }
}

function flash(text) {
  const b = h("div.flash-banner", text);
  document.body.appendChild(b); beep(660, 160);
  setTimeout(() => b.remove(), 1700);
}
const dKey = (sid, st) => `rasfahi_draft_${sid}_${st}_${S.me.email}`;
function loadDraft(sid, st) { try { const v = localStorage.getItem(dKey(sid, st)); return v ? JSON.parse(v) : null; } catch (e) { return null; } }
function saveDraft(sid, st, d) { try { localStorage.setItem(dKey(sid, st), JSON.stringify(d)); } catch (e) {} }
function clearDraft(sid, st) { try { localStorage.removeItem(dKey(sid, st)); } catch (e) {} }

// ------------------------------------------------------------ SCORE SHEET BANK
export async function bank(view) {
  await loadCategories();
  const sess = await mySessions();
  const dates = [...new Set(sess.map(s => s.date))].sort().reverse();
  const fDate = select([["", "ހުރިހާ ތާރީޚެއް"], ...dates.map(d => [d, d])], "");
  const fSes = select([["", "ހުރިހާ ސެޝަނެއް"], ...sess.map(s => [s.id, sessionLabel(s)])], "");
  const box = h("div", spinner());
  view.append(h("div.card", h("h2", "މާކްސް ޝީޓް ބޭންކު"), h("div.filters", fDate, fSes), box));
  const [scSnap, arSnap] = await Promise.all([
    getDocs(query(collection(db, "scores"), where("judgeEmail", "==", S.me.email))),
    getDocs(query(collection(db, "amendRequests"), where("judgeEmail", "==", S.me.email)))]);
  const scores = scSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  const reqs = arSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  function draw() {
    const rows = scores.filter(s => (!fSes.value || s.sessionId === fSes.value) && (!fDate.value || s.sessionDate === fDate.value))
      .sort((a, b) => (b.savedAt?.seconds || 0) - (a.savedAt?.seconds || 0));
    box.innerHTML = "";
    if (!rows.length) return box.appendChild(empty("ޝީޓެއް ނެތް"));
    box.appendChild(h("div.tbl-wrap", h("table.tbl",
      h("thead", h("tr", ["ތާރީޚް", "ސެޝަން", "ދަރިވަރު", "ރެޖި", "ބައި", "ޖުމްލަ", "ކުށް", "ޙާލަތު", ""].map(x => h("th", x)))),
      h("tbody", rows.map(s => {
        const rq = reqs.filter(r => r.scoreId === s.id).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))[0];
        return h("tr", h("td.ltr", s.sessionDate), h("td", s.sessionName), h("td", s.studentName), h("td", s.regNo), h("td", s.categoryName),
          h("td", h("b", fmt2(s.total))), h("td", (s.errors || []).length),
          h("td", s.locked ? h("span.tag.green", "🔒 ލޮކް") : h("span.tag.orange", "🔓 ހުޅުވާފައި"),
            rq ? h("div.small", { pending: "⏳ ރިކުއެސްޓް", approved: "✔ ގަބޫލު", rejected: "✕ ރިޖެކްޓް" }[rq.status] || rq.status) : null),
          h("td", h("div.row", h("button.btn.sm", { onclick: () => printDoc("ޖަޖުގެ މާކްސް ޝީޓް", scoreSheetHTML(s, catById(s.categoryId))) }, "🖨 ބަލާ"),
            s.locked && (!rq || rq.status !== "pending") ? h("button.btn.sm.orange", { onclick: async () => {
              const r = await promptBox("އެމެންޑް ރިކުއެސްޓް", "ސަބަބު", "", true); if (!r) return;
              const sesDoc = sess.find(x => x.id === s.sessionId);
              await addDoc(collection(db, "amendRequests"), { sessionId: s.sessionId, scoreId: s.id, studentId: s.studentId, studentName: s.studentName,
                judgeEmail: S.me.email, judgeName: s.judgeName, judgeSlot: s.judgeSlot, chiefEmail: sesDoc ? sesDoc.chiefEmail : s.chiefEmail, reason: r, status: "pending", createdAt: serverTimestamp() });
              toast("ފޮނުވިއްޖެ"); reqs.push({ scoreId: s.id, status: "pending" }); draw();
            } }, "✎ އެމެންޑް") : null)));
      })))));
  }
  fDate.onchange = draw; fSes.onchange = draw;
  draw();
}
