/*!
 * RASFAHI — Qur'an Competition Judging System
 * Copyright (c) 2026 Ali Ibrahim Didi (AIDD) / Zaadh Holding. All rights reserved. Reg No: MED.03.IP.CR.26.EW5889
 * Unauthorised copying, hosting, modification or redistribution is prohibited.
 */
// ============================================================
//  PLAN B — MARKS DESK (✍ މާކްސް ވެއްދުން)
//  For small competitions / when judges can't use tablets: the secretariat takes each judge's
//  paper sheet and types it in. The marks go into THAT judge's sheet (judge 1, judge 2 …),
//  so results, rubric reports and mistake reports work exactly as if the judge had typed them.
//  Draft → ✍ judge signed the paper → final (locked). Every save is kept in the history.
// ============================================================
import {
  S, db, doc, getDoc, getDocs, setDoc, collection, query, where, serverTimestamp, h, esc, toast, select, empty, spinner, audit,
  loadCategories, loadSessions, catById, scoreId, round, DEFAULT_RUBRIC, hasScope, fmtDateTime
} from "../core.js";
import { KHAFI_GROUPS, JALI_TYPES, errLabel } from "../tajweed.js";
import { datedSessionPicker } from "../roster.js";

const canUse = () => ["superadmin", "adminsec"].includes(S.me.role) || hasScope("marks");

export async function manual(view) {
  if (!canUse()) return view.appendChild(h("div.card", empty("✍ މާކްސް ވެއްދުމަށް އެޑްމިން / ހެޑް ސުޕަވައިޒަރގެ ހުއްދަ ('ޖަޖުންގެ މާކްސް ވެއްދުން') ބޭނުންވޭ.")));
  await loadCategories();
  const sessions = await loadSessions(true);
  const body = h("div");
  const pick = datedSessionPicker(sessions, "manSes", () => run());
  view.append(h("div.card", h("h2", "✍ ޖަޖުންގެ ކަރުދާހުގެ މާކްސް ވެއްދުން (ޕްލޭން B)"),
    h("p.small.muted", "ޖަޖު ހޮއްވަވައި، ލިސްޓުން ދަރިވަރު ހޮއްވަވައި، ޖަޖު ކަރުދާހުގައި ލިޔުއްވި މާކްސް ރުބްރިކަށް ވައްދަވާ. ކުށްތައް ވެއްދުމުން ކުށުގެ ރިޕޯޓްވެސް ހެދޭނެ. ފައިނަލް ކުރެވޭނީ ޖަޖުގެ ސޮއި ލިބުމުން."),
    pick.el), body);
  run();

  function run() {
    body.innerHTML = "";
    const ses = pick.current();
    if (!ses) return body.appendChild(h("div.card", empty("ދުވަހާއި ސެޝަން ހޮއްވަވާ")));
    const judges = ses.judges || [];
    if (!judges.length) return body.appendChild(h("div.card", empty("މި ސެޝަނަށް ޖަޖުން ލާފައެއް ނުވޭ")));
    const jSel = select(judges.map(j => [j.email, `ޖަޖު ${j.slot} — ${j.name}`]), sessionStorage.getItem("manJudge_" + ses.id) || judges[0].email);
    const listBox = h("div"), formBox = h("div");
    body.append(h("div.card", h("div.row", h("b", "ޖަޖު:"), h("div.grow", jSel))), h("div.manual-layout", h("div.card", listBox), formBox));
    jSel.onchange = () => { sessionStorage.setItem("manJudge_" + ses.id, jSel.value); drawList(); formBox.innerHTML = ""; };
    let sheets = {};
    async function drawList() {
      listBox.innerHTML = ""; listBox.appendChild(spinner());
      const judge = judges.find(j => j.email === jSel.value);
      try {
        const snap = await getDocs(query(collection(db, "scores"), where("sessionId", "==", ses.id)));
        sheets = Object.fromEntries(snap.docs.map(d => d.data()).filter(x => x.judgeEmail === judge.email).map(x => [x.studentId, x]));
      } catch (e) { sheets = {}; }
      listBox.innerHTML = "";
      const roster = ses.roster || [];
      const done = roster.filter(r => sheets[r.id] && sheets[r.id].locked).length;
      listBox.append(h("h3", `ޖަޖު ${judge.slot} — ${judge.name}`), h("div.small.muted", `ފައިނަލް: ${done} / ${roster.length}`));
      if (!roster.length) listBox.appendChild(empty("ސެޝަނުގެ ލިސްޓު ނެތް"));
      roster.forEach(r => { const sh = sheets[r.id];
        listBox.appendChild(h("div.roster-row" + (sh && sh.locked ? ".in" : ""), { style: { cursor: "pointer" }, onclick: () => openForm(r, judge) },
          h("div.rr-no", r.order), h("div.rr-main", h("div.rr-name", r.name), h("div.small.muted", `${r.regNo} • ${r.categoryName}`)),
          h("div.rr-state", sh ? (sh.locked ? h("span.tag.green", `✔ ${round(sh.total, 2)}`) : h("span.tag.blue", `📝 ${round(sh.total, 2)}`)) : h("span.rr-tick.off", "—")))); });
    }
    async function openForm(r, judge) {
      formBox.innerHTML = ""; formBox.appendChild(h("div.card", spinner()));
      const st = (await getDoc(doc(db, "students", r.id))).data() || {};
      const cat = catById(st.categoryId) || {};
      const rub = cat.rubric && cat.rubric.length ? cat.rubric : DEFAULT_RUBRIC;
      const id = scoreId(ses.id, r.id, judge.email);
      const exist = (await getDoc(doc(db, "scores", id)).catch(() => null));
      const old = exist && exist.exists() ? exist.data() : null;
      const lockedSheet = !!(old && old.locked) && !["superadmin", "adminsec"].includes(S.me.role);
      const inputs = {}; let errors = (old && old.errors) ? old.errors.slice() : [];
      const total = h("b.man-total");
      const calc = () => { let t = 0; rub.forEach(k => { t += Math.min(+k.max, Math.max(0, +inputs[k.key].value || 0)); }); total.textContent = `${round(t, 2)} / ${rub.reduce((a, k) => a + +k.max, 0)}`; return round(t, 2); };
      const rubRows = rub.map(k => { const inp = h("input.man-in", { type: "number", min: 0, max: k.max, step: 0.25, value: old && old.criteria ? old.criteria[k.key] ?? "" : "", disabled: lockedSheet });
        inp.oninput = calc; inputs[k.key] = inp; return h("label.man-row", h("span", `${k.name} (${k.max})`), inp); });
      // mistakes (optional): each tap adds one — for the mistakes report
      const errList = h("div.man-errs");
      const drawErrs = () => { errList.innerHTML = ""; if (!errors.length) errList.appendChild(h("span.small.muted", "ކުށެއް ނުލާ"));
        errors.forEach((e, i) => errList.appendChild(h("span.tag." + (e.type === "jali" ? "red" : "orange"), errLabel(e), lockedSheet ? null : h("b", { style: { cursor: "pointer", marginInlineStart: "6px" }, onclick: () => { errors.splice(i, 1); drawErrs(); } }, "×")))); };
      const addE = (e) => { errors.push({ ...e, id: Math.random().toString(36).slice(2, 9), manual: true, at: Date.now() }); drawErrs(); };
      const jaliSel = select(JALI_TYPES.map(t => [t.key, t.dv]), JALI_TYPES[0].key);
      const letter = h("input", { placeholder: "އަކުރު (ބޭނުންނަމަ)", style: { width: "120px" } });
      const withL = (e) => (letter.value.trim() ? { ...e, letter: letter.value.trim() } : e);
      const kRows = KHAFI_GROUPS.map(g => { const s2 = select(g.items.map(it => [it[0], it[2]]), g.items[0][0]);
        return h("div.man-krow", h("span", g.dv), s2, h("button.btn.sm", { disabled: lockedSheet, onclick: () => { const it = g.items.find(x => x[0] === s2.value);
          addE(withL({ type: "khafi", group: g.key, groupDv: g.dv, sub: it[0], subAr: it[1], subDv: it[2], crit: g.crit, ded: +(cat.khafiDed ?? g.ded) })); } }, "+")); });
      const note = h("textarea", { rows: 2, placeholder: "ޖަޖުގެ ނޯޓު" }); note.value = (old && old.note) || "";
      const signed = h("input", { type: "checkbox" }); signed.checked = !!(old && old.signedOnPaper);
      drawErrs();
      async function save(final) {
        const miss = rub.filter(k => inputs[k.key].value === "");
        if (miss.length) return toast("ހުސް ގޮޅި: " + miss.map(k => k.name).join("، "), "warn");
        if (final && !signed.checked) return toast("ފައިނަލް ކުރުމުގެ ކުރިން ޖަޖުގެ ސޮއި ހޯއްދަވާ", "warn");
        const criteria = {}; rub.forEach(k => criteria[k.key] = Math.min(+k.max, Math.max(0, +inputs[k.key].value || 0)));
        const tot = calc();
        const data = { competitionId: S.settings.activeCompetitionId, sessionId: ses.id, sessionName: ses.name, sessionDate: ses.date || "",
          studentId: r.id, studentName: r.name, regNo: r.regNo || "", nid: st.nid || "", categoryId: st.categoryId || "", categoryName: st.categoryName || "",
          judgeEmail: judge.email, judgeName: judge.name, judgeSlot: judge.slot, chiefEmail: ses.chiefEmail || "", criteria, total: tot, rubric: rub,
          errors, note: note.value.trim(), questions: (old && old.questions) || [], amendments: (old && old.amendments) || [],
          locked: !!final, draft: !final, manual: true, enteredBy: S.me.email, enteredByName: S.me.name || "", signedOnPaper: signed.checked,
          savedAt: serverTimestamp() };
        try {
          await setDoc(doc(db, "scores", id), data);
          await setDoc(doc(db, "judgeStatus", `${ses.id}__${judge.email}`), { sessionId: ses.id, email: judge.email, name: judge.name, slot: judge.slot,
            studentId: r.id, saved: !!final, draft: !final, manual: true, total: tot, at: serverTimestamp() }).catch(() => {});
          audit(final ? "score_manual_final" : "score_manual_draft", { session: ses.name, student: r.name, judge: `${judge.slot}. ${judge.name}`, total: tot, errors: errors.length,
            changes: old ? { total: [old.total, tot] } : null });
          toast(final ? "✔ ފައިނަލް ކުރެވިއްޖެ (ލޮކް)" : "📝 ޑްރާފްޓް ސޭވްކުރެވިއްޖެ");
          drawList(); openForm(r, judge);
        } catch (e) { toast("ސޭވް ނުވި: " + (e.code || e.message), "err", 7000); }
      }
      calc();
      formBox.innerHTML = "";
      formBox.appendChild(h("div.card.man-form",
        h("div.row.between", h("div", h("h3", { style: { margin: 0 } }, `#${r.order} ${r.name}`), h("div.small.muted", `${r.regNo} • ${st.categoryName || ""} • ޖަޖު ${judge.slot} — ${judge.name}`)),
          old ? h("span.tag." + (old.locked ? "green" : "blue"), old.locked ? "✔ ފައިނަލް" : "📝 ޑްރާފްޓް") : null),
        old && old.enteredBy ? h("div.small.muted", `ވެއްދީ: ${old.enteredByName || old.enteredBy}${old.savedAt && old.savedAt.toDate ? " • " + fmtDateTime(old.savedAt.toDate()) : ""}`) : null,
        lockedSheet ? h("div.status-box.approved", "✔ ފައިނަލް ކޮށް ލޮކްވެފައި — ބަދަލު ކުރެވޭނީ ޗީފް ޖަޖު ހުޅުވައިދިނުމުން") : null,
        h("h4", "ރުބްރިކް"), h("div.man-grid", rubRows), h("div.man-sum", "ޖުމްލަ: ", total),
        h("h4", "ކުށްތައް (ކަރުދާހުގައި ފާހަގަކޮށްފައިވާނަމަ)"), errList,
        lockedSheet ? null : h("div.man-krow", h("span", "ލަޙްނު ޖަލީ"), jaliSel, h("button.btn.sm.red", { onclick: () => { const t = JALI_TYPES.find(x => x.key === jaliSel.value);
          addE(withL({ type: "jali", crit: "thilawa", ded: +cat.jaliDed || 1, sub: t.key, subDv: t.dv, subAr: t.ar })); } }, "+"), letter),
        lockedSheet ? null : h("details", h("summary", "ލަޙްނު ޚަފީ — ބައިތައް"), h("div.man-kgrid", kRows)),
        h("label.field", h("span", "ނޯޓު"), note),
        lockedSheet ? null : h("label.row.man-sign", signed, "✍ ޖަޖު ކަރުދާހުގައި ސޮއި ކުރައްވައިފި"),
        lockedSheet ? null : h("div.row", { style: { gap: "8px", marginTop: "10px" } },
          h("button.btn.blue.lg", { onclick: () => save(false) }, "📝 ޑްރާފްޓް"),
          h("button.btn.green.lg", { onclick: () => save(true) }, "💾 ފައިނަލް (ލޮކް)"))));
      inputs[rub[0].key] && inputs[rub[0].key].focus();
    }
    drawList();
  }
}
