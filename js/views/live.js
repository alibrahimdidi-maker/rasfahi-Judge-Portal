/*!
 * RASFAHI — Qur'an Competition Judging System
 * Copyright (c) 2026 Ali Ibrahim Didi (AIDD) / Zaadh Holding. All rights reserved. Reg No: MED.03.IP.CR.26.EW5889
 * Unauthorised copying, hosting, modification or redistribution is prohibited.
 */
// ============================================================
//  LIVE CONTROL — judges' table (chief judge / secretary / admin)
//  ▶ ވެއްދި → ދަރިވަރު ނަންބަރެއް ހޮވާ → 🟢 ފަށާ / 🔴 ހުއްޓާ → ދެން ނަންބަރު → ✔ ނިމުނު → ⏭ ދެން ދަރިވަރު
// ============================================================
import {
  S, db, doc, collection, query, where, onSnapshot, h, toast, confirmBox, select, spinner, empty, sub,
  loadCategories, loadSessions, catById, sessionLabel, photoTag, idCard, beep, starsEl, BRANCHES, keepAwake
} from "../core.js";
import { loadQuran, qLabelDv, renderPage, renderQuestion, describeSyllabus, portion } from "../quran.js";
import { gridPicker } from "../gridpick.js";
import { PHASE_DV, writeLive, admitStudent, pickQuestion, backToGrid, refreshGrid, numOf, undoLastPick, finishReading, clearStage } from "../liveops.js";

export function portionBar(q, opts = {}) {
  const p = portion(q); if (!p) return null;
  return h("div.portion" + (opts.big ? ".big" : ""),
    h("span", "ސޫރަތް: ", h("b.ar", p.surahAr), ` (${p.surahNo})`),
    h("span", "ފޮތް: ", h("b", p.juz)),
    h("span", "އާޔަތް: ", h("b", p.from === p.to ? p.from : `${p.from} – ${p.to}`)),
    opts.page === false ? null : h("span", "ޞަފުޙާ: ", h("b", p.page)));
}

export async function control(view) {
  await Promise.all([loadQuran(), loadCategories()]);
  const role = S.me.role;
  let sessions = (await loadSessions(true)).filter(s => s.status !== "closed");
  if (role === "chief") sessions = sessions.filter(s => s.chiefEmail === S.me.email);
  const { datedSessionPicker, syncRoster } = await import("../roster.js");
  const body = h("div");
  let unsubs = [];
  const pickSes = datedSessionPicker(sessions, "liveSes", (ses) => ses ? start(ses.id) : (unsubs.forEach(u => u()), unsubs = [], body.innerHTML = "", body.appendChild(empty("ސެޝަނެއް ހޮއްވަވާ"))));
  view.append(h("div.card", h("h2", { style: { margin: "0 0 8px" } }, "ލައިވް ކޮންޓްރޯލް — ޖަޖުންގެ މޭޒު"), pickSes.el), body);
  if (pickSes.current()) start(pickSes.current().id);
  else body.appendChild(empty(sessions.length ? "ދުވަހާއި ސެޝަން ހޮއްވަވާ" : "ހުޅުވިފައިވާ ސެޝަނެއް ނެތް"));

  function start(sid) {
    unsubs.forEach(u => u()); unsubs = [];
    body.innerHTML = ""; body.appendChild(spinner());
    const ses = sessions.find(s => s.id === sid);
    if (!ses) return;
    syncRoster(ses);   // keep the judges' / tablet list identical to the current order
    let live = null, studs = [], jstat = {};
    const left = h("div.card"), right = h("div");
    body.innerHTML = ""; body.appendChild(h("div.live-layout", left, right));
    if (S.me.realRole === "superadmin") body.appendChild(trialCard());
    keepAwake();

    // ---- 🧪 full-competition trial with the sample data (super admin)
    function trialCard() {
      let running = false, stopFlag = false;
      const status = h("div.trial-status", "—");
      const count = select([["1", "1 ދަރިވަރު"], ["3", "3 ދަރިވަރުން"], ["5", "5 ދަރިވަރުން"], ["10", "10 ދަރިވަރުން"], ["999", "ސެޝަނުގެ ހުރިހާ ދަރިވަރުން"]], "3");
      const speed = select([["3000", "🐢 ލަސްލަހުން"], ["1500", "⏱ އާދައިގެ"], ["600", "⚡ އަވަހަށް"]], "1500");
      const skipMe = h("input", { type: "checkbox" });
      const step = (t) => { status.textContent = t; };
      const btns = [];
      const B = (t, cls, fn) => { const b = h("button.btn" + cls, { onclick: async () => { if (running) return; running = true; btns.forEach(x => x.disabled = true); stopBtn.disabled = false;
        try { await fn(); } catch (e) { toast(e.message || String(e), "err", 7000); } finally { running = false; btns.forEach(x => x.disabled = false); stopBtn.disabled = true; } } }, t); btns.push(b); return b; };
      const stopBtn = h("button.btn.red", { disabled: true, onclick: () => { stopFlag = true; step("■ ހުއްޓަނީ... (މި ދަރިވަރު ނިމުމުން)"); } }, "■ ހުއްޓާ");
      const T = () => import("../trial.js");
      return h("div.card.trial-card", h("h3", "🧪 ފުލް މުބާރާތުގެ ޓްރަޔަލް (ނަމޫނާ ޑޭޓާ)"),
        h("p.small.muted", "ދަރިވަރުން ވެއްދުމާއި، ނަންބަރު ހޮވުމާއި، ކިޔެވުމާއި، ޖަޖުން މާކްސް ދިނުމާއި، ނަތީޖާ ނިންމުމާއި، ދެން ދަރިވަރަށް ދިއުން ސިސްޓަމުން އަމިއްލައަށް ކުރާނެ. ދަރިވަރުގެ ސްކްރީނާއި ޖަޖުންގެ ސްކްރީން އެހެން ޓެބް / ޑިވައިސްއެއްގައި ހުޅުވައިގެން ބައްލަވާ."),
        h("div.row", { style: { gap: "8px", flexWrap: "wrap" } },
          B("✔ ހުރިހާ ދަރިވަރުން ހާޟިރު", "", async () => { const m = await T(); await m.trialPresentAll(ses); }),
          B("🤖 އެހެން ޖަޖުންގެ މާކްސް (މި ދަރިވަރު)", ".blue", async () => { const m = await T(); const n = await m.trialJudgeSheets(ses, live, { skipMe: true }); step(`🤖 ${n} ޖަޖު ޝީޓު ސޭވްވެއްޖެ`); })),
        h("div.row", { style: { gap: "8px", flexWrap: "wrap", marginTop: "10px" } }, count, speed,
          h("label.row.small", skipMe, "ޖަޖު 1 (ތިބާ) ގެ މާކްސް ތިބާ ދޭނަން"),
          B("▶▶ އޮޓޯ ޓްރަޔަލް", ".green", async () => {
            const m = await T(); stopFlag = false;
            const d = new Set((live && live.done) || []);
            let list = studs.filter(x => !d.has(x.id));
            if (live && live.studentId) list = [studs.find(x => x.id === live.studentId), ...list.filter(x => x.id !== live.studentId)].filter(Boolean);
            list = list.slice(0, +count.value);
            for (let i = 0; i < list.length && !stopFlag; i++) {
              step(`(${i + 1}/${list.length}) ${list[i].name}`);
              await m.trialRunStudent(ses, list[i], list.slice(i + 1), { speed: +speed.value, step: (t) => step(`(${i + 1}/${list.length}) ${t}`), stop: () => stopFlag, skipMe: skipMe.checked });
            }
            step(stopFlag ? "■ ހުއްޓިއްޖެ" : `✔ ޓްރަޔަލް ނިމުނީ — ${list.length} ދަރިވަރުން. '📊 ރިޕޯޓް' އާއި 'ނަތީޖާ' ބައްލަވާ.`);
          }), stopBtn),
        status);
    }

    unsubs.push(sub(onSnapshot(doc(db, "live", sid), s => {
      const prev = live; live = s.exists() ? s.data() : null;
      if (prev && live && prev.phase === "grid" && live.phase === "reading") beep(660, 160);
      draw();
    }, e => toast(e.message, "err"))));
    unsubs.push(sub(onSnapshot(query(collection(db, "students"), where("sessionId", "==", sid)), s => {
      studs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); draw();
    }, e => toast(e.message, "err"))));
    unsubs.push(sub(onSnapshot(query(collection(db, "judgeStatus"), where("sessionId", "==", sid)), s => {
      jstat = Object.fromEntries(s.docs.map(d => [d.data().email, d.data()])); draw();
    })));

    const done = () => new Set((live && live.done) || []);
    const upcoming = (exceptId) => { const d = done(); return studs.filter(s => !d.has(s.id) && s.id !== exceptId); };
    const onStage = () => live && live.studentId && ["grid", "reading", "scoring"].includes(live.phase);

    async function admit(st) {
      if (onStage() && live.studentId !== st.id &&
        !await confirmBox("ދަރިވަރު ބަދަލުކުރުން", `${live.student.name} ގެ ކިޔެވުން ނުނިމެނީސް ${st.name} ވައްދަންތޯ؟`, "އާދެ", "red")) return;
      await admitStudent(ses, st, live, upcoming(st.id));
    }
    async function pick(n) {
      const r = await pickQuestion(sid, n);
      if (r === "taken") toast("އެ ނަންބަރު ހޮވިފައި", "warn");
      else if (r === "full") toast("ސުވާލުގެ ޢަދަދު ހަމަވެއްޖެ", "warn");
    }
    async function finish() {
      if (!await confirmBox("✔ ކިޔެވުން ނިމުނީ", "ދަރިވަރު ސްކްރީން އޮފްވެ، ޖަޖުންނަށް މާކްސް ސޭވްކުރުމަށް ފޮނުވާނެ.", "ނިމުނީ", "green")) return;
      await finishReading(ses, live);
    }
    async function nextStudent() {
      if (live.phase !== "final" && role !== "superadmin" &&
        !await confirmBox("ދެން ދަރިވަރު", "ޗީފް ޖަޖު ނަތީޖާ އަދި ނުނިންމަވާ. ދެން ދަރިވަރަށް ދާންތޯ؟", "އާދެ", "red")) return;
      await clearStage(ses, live, upcoming(live.studentId));
    }
    async function skip() {
      if (!await confirmBox("ފަހަތަށް ލުން", "މި ދަރިވަރު ކިޔެވުމުން ބާކީކޮށް ސްޓޭޖު ހުސްކުރާނަމަ؟", "އާދެ")) return;
      await writeLive(ses, { phase: "idle", studentId: "", student: null, grid: [], picks: [], questions: [], qIndex: -1, light: "stop" });
    }

    // several updates arriving together are drawn once (keeps tablets smooth)
    let _frame = 0;
    function draw() { if (_frame) return; _frame = requestAnimationFrame(() => { _frame = 0; drawNow(); }); }
    function drawNow() {
      // ---------- left: order of students
      const d = done();
      left.innerHTML = "";
      left.append(h("h3", `ދަރިވަރުންގެ ތަރުތީބު (${d.size}/${studs.length})`),
        h("div.small.muted", (ses.venue || "") + " • ޖަޖުން: " + (ses.judges || []).length + " • ދަރިވަރެއްގެ މައްޗަށް ފިތުމުން ކިޔެވުމަށް ވައްދާނެ"));
      studs.forEach(st => left.appendChild(h("div.queue-item" + (live && live.studentId === st.id ? ".cur" : "") + (d.has(st.id) ? ".done" : ""),
        { onclick: () => admit(st) },
        h("b", st.order || ""), photoTag(st.photoThumb),
        h("div.grow", st.name, h("div.small.muted", `${st.regNo} • ${st.categoryName}`)),
        d.has(st.id) ? h("span.tag.gold", "ނިމުނު") : st.checkin ? h("span.tag.green", "ހާޟިރު") : h("span.tag", "ނާދޭ"))));
      if (!studs.length) left.appendChild(empty("މި ސެޝަނަށް ދަރިވަރުން ލާފައި ނުވޭ"));

      // ---------- right
      right.innerHTML = "";
      const top = h("div.card");
      right.appendChild(top);
      const judgesRow = h("div.judge-status", (ses.judges || []).map(j => {
        const js = jstat[j.email]; const ok = js && live && js.studentId === live.studentId && js.saved;
        const on = js && js.ping && js.ping.toMillis && Date.now() - js.ping.toMillis() < 70000;
        return h("span" + (ok ? ".ok" : ""), { title: on ? "ކަނެކްޓްވެފައި" : "ކަނެކްޓްވެފައެއް ނުވޭ" }, `${on ? "🟢" : "⚪"} ޖަޖު ${j.slot}: ${j.name} ${ok ? "✔ ސޭވް" : js && live && js.studentId === live.studentId ? "✎" : "…"}`);
      }));
      const dispSel = select([["text", "ސްކްރީން: ޓެކްސްޓް"], ["image", "ސްކްރީން: މުޞްޙަފު PNG"]], (live && live.display) || S.settings.studentDisplay);
      dispSel.onchange = () => writeLive(ses, { display: dispSel.value });

      if (!live || !live.studentId) {
        const nx = upcoming("").find(s => s.checkin) || upcoming("")[0];
        top.append(h("div.row.between", h("span.phase-pill", PHASE_DV.idle), dispSel),
          h("p.small.muted", "ދަރިވަރު ސްކްރީން އޮފްވެފައި. ދަރިވަރު ވެއްދުމުން ޖަޖުންގެ ސްކްރީނަށް ނަން ފެންނާނެ، ދަރިވަރަށް ނަންބަރު ގްރިޑް ފެންނާނެ."),
          live && live.lastResult ? h("div", { style: { margin: "10px 0" } }, h("div.small.muted", "ކުރީގެ ދަރިވަރު:"), idCard(live.lastResult.student, { more: false }), h("div.center", starsEl(live.lastResult.stars))) : null,
          nx ? h("div", { style: { marginTop: "10px" } }, h("div.small.muted", "ދެން:"), idCard(nx),
            h("button.btn.primary.lg", { style: { marginTop: "10px", width: "100%" }, onclick: () => admit(nx) }, "▶ " + nx.name + " — ކިޔެވުމަށް ވެއްދި"))
            : h("div.empty", { style: { marginTop: "10px" } }, "ހުރިހާ ދަރިވަރުން ނިމިއްޖެ. ޗީފް ޖަޖު ސެޝަން ނިންމަވާ."),
          h("div", { style: { marginTop: "10px" } }, judgesRow));
        return;
      }
      const cat = catById(live.categoryId) || {};
      const qs = live.questions || [], qn = live.qCount || 1;
      top.append(h("div.row.between", h("div.row", h("span.phase-pill", PHASE_DV[live.phase] || live.phase),
        h("span.tag", BRANCHES[live.branch] || ""), h("span.tag.gold", describeSyllabus(cat.syllabus)),
        h("span.tag.blue", `ސުވާލު ${qs.length} / ${qn}`)), dispSel),
        h("div", { style: { margin: "10px 0" } }, idCard(live.student)), judgesRow);

      if (live.phase === "grid") {
        right.appendChild(h("div.card",
          h("h3", qs.length ? `ދަރިވަރު ${qs.length + 1} ވަނަ ސުވާލުގެ ނަންބަރު ހޮވަނީ` : "ދަރިވަރު ނަންބަރެއް ހޮވަނީ"),
          h("p.small.muted", `ދަރިވަރަށް ހޮވޭނީ ${qn} ނަންބަރު. ދަރިވަރުގެ ސްކްރީނުން ފިތުމުން ސުވާލު ހުޅުވޭނެ. ނުފިތޭނަމަ ދަރިވަރު ބުނާ ނަންބަރުތައް މިތަނުން އެއްފަހަރާ ހޮއްވަވާ.`),
          gridPicker(live, sid),
          h("div.row", { style: { marginTop: "10px" } },
            h("button.btn", { onclick: async () => { if (await confirmBox("🔄 ގްރިޑް އަލުން", "އާ ނަންބަރުތަކަކާއެކު ގްރިޑް އަލުން ހަދާނެ. ކިޔެވި ސުވާލުތައް ނުގެއްލޭނެ.", "ހަދާ")) refreshGrid(ses, live); } }, "🔄 ގްރިޑް އަލުން"),
            h("button.btn.ghost", { onclick: skip }, "⏭ ފަހަތަށް ލާ"))));
      }
      if (["reading", "scoring", "final"].includes(live.phase) && qs.length) {
        const qi = Math.max(0, Math.min(live.qIndex, qs.length - 1));
        const q = qs[qi];
        const card = h("div.card");
        card.append(h("div.qbar", h("span.qn", `ސުވާލު ${qi + 1} / ${qn}`),
          numOf(live, qi) !== "" ? h("span.tag.gold", `ނަންބަރު ${numOf(live, qi)}`) : null, h("span.grow", portionBar(q)),
          h("span.light." + (live.light === "go" ? "go" : "stop"))));
        if (live.phase === "reading") {
          const more = qs.length < qn;
          card.append(h("div.row", { style: { gap: "8px", marginBottom: "10px", flexWrap: "wrap" } },
            h("button.btn.green.lg", { onclick: () => { beep(988, 200); writeLive(ses, { light: "go", startedQ: live.qIndex }); }, disabled: live.light === "go" }, "▶ ފަށާ"),
            h("button.btn.red.lg", { onclick: () => { beep(440, 200); setLight(ses, "stop"); }, disabled: live.light !== "go" }, "■ ހުއްޓާ"),
            more ? h("button.btn.primary.lg", { onclick: () => backToGrid(ses, live) }, (live.pickQueue || []).length ? `ދެން ސުވާލު — ނަންބަރު ${live.pickQueue[0]} ▶` : `ދެން ސުވާލު ހޮވާ (${qs.length + 1}/${qn}) ▶`)
              : h("button.btn.blue.lg", { onclick: finish }, "✔ ނިމުނު"),
            live.light !== "go" && live.startedQ !== live.qIndex ? h("button.btn.ghost", { onclick: () => undoLastPick(ses, live) }, "↩ ނަންބަރު ބާޠިލު") : null,
            live.light !== "go" && live.startedQ !== live.qIndex ? h("button.btn.ghost", { onclick: async () => { if (await confirmBox("🔄 ގްރިޑް އަލުން", "މި ނަންބަރު ބާޠިލުކޮށް އާ ގްރިޑެއް ހަދާނެ.", "ހަދާ")) refreshGrid(ses, live); } }, "🔄 ގްރިޑް އަލުން") : null));
        } else {
          const allSaved = (ses.judges || []).every(j => jstat[j.email] && jstat[j.email].studentId === live.studentId && jstat[j.email].saved);
          card.append(h("div.row", { style: { marginBottom: "10px", flexWrap: "wrap" } },
            h("span", live.phase === "final" ? "✔ ޗީފް ޖަޖު ނަތީޖާ ނިންމައިފި" : allSaved ? "ހުރިހާ ޖަޖުން ސޭވްކޮށްފި — ޗީފް ޖަޖު ނަތީޖާ ނިންމަވާ" : "ދަރިވަރު ސްކްރީން އޮފް • ޖަޖުން މާކްސް ސޭވްކުރަނީ..."),
            h("button.btn.ghost", { onclick: () => writeLive(ses, { phase: "reading" }) }, "↩ ކިޔެވުމަށް"),
            h("button.btn.primary.lg", { onclick: nextStudent }, "⏭ ދެން ދަރިވަރު")));
        }
        const pv = h("div", { html: renderQuestion(q, { source: S.settings.textSource }) });
        pv.querySelectorAll(".mushaf-page").forEach(x => x.style.setProperty("--qsize", "22px"));
        card.appendChild(pv);
        right.appendChild(card);
      }
    }
  }
}
