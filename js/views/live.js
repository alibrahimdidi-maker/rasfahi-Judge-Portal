// ============================================================
//  LIVE CONTROL (Chief judge / Secretary / Admin)
//  call student → grid → student picks → questions → green/red light → next → scoring
// ============================================================
import {
  S, db, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, onSnapshot, serverTimestamp, increment,
  h, esc, toast, modal, confirmBox, select, spinner, empty, audit, sub, loadCategories, loadSessions, catById, sessionLabel,
  photoTag, idCard, publicStudent, beep, starsHtml, starsEl, BRANCHES
} from "../core.js";
import { loadQuran, buildCandidates, makeGrid, qLabelDv, renderPage, describeSyllabus } from "../quran.js";

export async function control(view) {
  await Promise.all([loadQuran(), loadCategories()]);
  const role = S.me.role;
  let sessions = (await loadSessions(true)).filter(s => s.status !== "closed");
  if (role === "chief") sessions = sessions.filter(s => s.chiefEmail === S.me.email);
  const pickSes = select([["", "— ސެޝަން ހޮވާ —"], ...sessions.map(s => [s.id, sessionLabel(s)])], sessionStorage.getItem("liveSes") || "");
  const body = h("div");
  view.append(h("div.card", h("div.row", h("h2", { style: { margin: 0 } }, "ލައިވް ކޮންޓްރޯލް"), h("div.grow", pickSes))), body);
  let unsubs = [];
  pickSes.onchange = () => { sessionStorage.setItem("liveSes", pickSes.value); start(pickSes.value); };
  if (pickSes.value && sessions.find(s => s.id === pickSes.value)) start(pickSes.value);
  else body.appendChild(empty(sessions.length ? "ސެޝަނެއް ހޮއްވަވާ" : "ހުޅުވިފައިވާ ސެޝަނެއް ނެތް"));

  function start(sid) {
    unsubs.forEach(u => u()); unsubs = [];
    body.innerHTML = ""; body.appendChild(spinner());
    const ses = sessions.find(s => s.id === sid);
    if (!ses) return;
    let live = null, studs = [], jstat = {};
    const liveRef = doc(db, "live", sid);
    const left = h("div.card"), right = h("div");
    body.innerHTML = ""; body.appendChild(h("div.live-layout", left, right));

    unsubs.push(sub(onSnapshot(liveRef, s => { live = s.exists() ? s.data() : null; draw(); }, e => toast(e.message, "err"))));
    unsubs.push(sub(onSnapshot(query(collection(db, "students"), where("sessionId", "==", sid)), s => {
      studs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); draw();
    }, e => toast(e.message, "err"))));
    unsubs.push(sub(onSnapshot(query(collection(db, "judgeStatus"), where("sessionId", "==", sid)), s => {
      jstat = Object.fromEntries(s.docs.map(d => [d.data().email, d.data()])); draw();
    })));

    const done = () => new Set((live && live.done) || []);
    const nextOf = (curId) => {
      const d = done(); const list = studs.filter(s => !d.has(s.id) && s.id !== curId);
      return list;
    };

    async function write(patch, msg) {
      try {
        await setDoc(liveRef, { ...patch, sessionId: sid, sessionName: ses.name, seq: increment(1), updatedAt: serverTimestamp(), updatedBy: S.me.email }, { merge: true });
        if (msg) toast(msg);
      } catch (e) { toast("ނުކުރެވުނު: " + e.message, "err"); }
    }

    async function callStudent(st) {
      if (live && live.studentId && ["grid", "reading", "scoring"].includes(live.phase) && live.studentId !== st.id) {
        if (!await confirmBox("ދަރިވަރު ބަދަލުކުރުން", `${live.student.name} ގެ ކިޔެވުން ނުނިމެނީސް ${st.name} ގޮވަންތޯ؟`, "އާދެ", "red")) return;
      }
      const cat = catById(st.categoryId);
      if (!cat) return toast("މި ދަރިވަރުގެ ބައި ނުފެނުނު", "err");
      const grid = await genGrid(cat);
      if (!grid) return;
      if (ses.status !== "live") { try { await updateDoc(doc(db, "sessions", sid), { status: "live", startedAt: serverTimestamp() }); ses.status = "live"; } catch (e) {} }
      const nxt = nextOf(st.id).slice(0, 3).map(s => publicStudent(s, catById(s.categoryId)));
      await write({ phase: "grid", studentId: st.id, student: publicStudent(st, cat), categoryId: cat.id, categoryName: cat.name,
        branch: cat.branch, hint: cat.hifzHintWords ?? 3, qCount: cat.qCount || 3, grid: grid.grid, picks: [], questions: [], qIndex: -1,
        light: "stop", next: nxt, display: (live && live.display) || S.settings.studentDisplay, calledAt: serverTimestamp() },
        st.name + " ގޮވައިފި");
      audit("live_call", { sid, st: st.id });
    }
    async function genGrid(cat) {
      const cands = buildCandidates(cat.syllabus, cat.minLines || 3, cat.maxLines || 7);
      if (!cands.length) { toast("މި ބައިގެ މުޤައްރަރުން ސުވާލެއް ނުހެދުނު — ފޮޅުވަތުގެ ޢަދަދު ބަލާ", "err"); return null; }
      const pRef = doc(db, "pools", `${sid}__${cat.id}`);
      const p = await getDoc(pRef); const pd = p.exists() ? p.data() : { recent: [], grids: 0 };
      const win = S.settings.noRepeatWindow || 100;
      const recent = (pd.recent || []).filter(r => r.g > (pd.grids || 0) - win);
      const g = makeGrid(cands, cat.gridSize || S.settings.gridSize || 20, recent);
      if (g.relaxed) toast("މުޤައްރަރުގެ ހުރިހާ ސުވާލެއް ބޭނުންކުރެވިއްޖެ — ތަކުރާރުވާން ފަށައިފި", "warn", 6000);
      else if (g.grid.length < (cat.gridSize || 20)) toast(`ރިޕީޓް ނުވާގޮތަށް ލިބުނީ ${g.grid.length} ސުވާލު`, "warn");
      return g;
    }
    async function regenGrid() {
      const cat = catById(live.categoryId); const g = await genGrid(cat); if (!g) return;
      await write({ grid: g.grid, picks: [], questions: [], qIndex: -1, phase: "grid" }, "ގްރިޑް އަލުން ހެދިއްޖެ");
    }
    async function pickBox(n) {
      if (!live || live.phase !== "grid") return;
      const picks = live.picks || [];
      if (picks.includes(n)) return write({ picks: picks.filter(x => x !== n) });
      if (picks.length >= live.qCount) return toast("ސުވާލު ޢަދަދު ހަމަވެއްޖެ", "warn");
      const np = [...picks, n];
      const patch = { picks: np };
      if (np.length === live.qCount) {
        const qs = np.map(k => live.grid.find(g => g.n === k).q);
        Object.assign(patch, { questions: qs, qIndex: 0, phase: "reading", light: "stop" });
        // remember starts/ends so they don't repeat in this session
        const pRef = doc(db, "pools", `${sid}__${live.categoryId}`);
        const p = await getDoc(pRef); const pd = p.exists() ? p.data() : { recent: [], grids: 0 };
        const gno = (pd.grids || 0) + 1, win = S.settings.noRepeatWindow || 100;
        const recent = [...(pd.recent || []).filter(r => r.g > gno - win), ...qs.map(q => ({ s: q.startKey, e: q.endKey, g: gno }))];
        await setDoc(pRef, { recent, grids: gno, sessionId: sid, categoryId: live.categoryId, updatedAt: serverTimestamp() });
      }
      await write(patch);
    }
    const setLight = (l) => { beep(l === "go" ? 988 : 440, 220); return write({ light: l }); };
    async function nextQ() {
      if (live.qIndex >= live.questions.length - 1) return;
      if (!await confirmBox("ދެން ސުވާލު", `ސުވާލު ${live.qIndex + 2} / ${live.questions.length} އަށް ދާންތޯ؟ (ޖަޖުން ސްކްރީން ބަދަލުވާނެ)`, "އާދެ ▶", "green")) return;
      await write({ qIndex: live.qIndex + 1, light: "stop" });
    }
    async function prevQ() {
      if (live.qIndex <= 0) return;
      if (!await confirmBox("ކުރީ ސުވާލު", "ކުރީ ސުވާލަށް އެނބުރި ދާންތޯ؟", "އާދެ")) return;
      await write({ qIndex: live.qIndex - 1, light: "stop" });
    }
    async function toScoring() {
      if (!await confirmBox("ކިޔެވުން ނިމުނީ", "ޖަޖުންނަށް މާކްސް ސޭވްކުރުމަށް ފޮނުވާނަމަ؟", "އާދެ", "green")) return;
      await write({ phase: "scoring", light: "stop" });
    }
    async function skipStudent() {
      if (!await confirmBox("ދަރިވަރު ހާޟިރުނުވާ / ފަހަތަށް", "މި ދަރިވަރު ލިސްޓުގެ ފަހަތަށް ލާނަމަ؟", "އާދެ")) return;
      await write({ phase: "idle", studentId: "", student: null, grid: [], picks: [], questions: [], qIndex: -1 });
    }
    async function markDone() {
      const d = [...done(), live.studentId];
      const nxt = nextOf(live.studentId).slice(0, 3).map(s => publicStudent(s, catById(s.categoryId)));
      await write({ done: d, phase: "idle", studentId: "", student: null, grid: [], picks: [], questions: [], qIndex: -1, next: nxt, light: "stop" }, "ދަރިވަރު ނިމިއްޖެ");
    }

    function draw() {
      // ---------- left: queue
      const d = done();
      left.innerHTML = "";
      left.append(h("h3", `ދަރިވަރުންގެ ތަރުތީބު (${d.size}/${studs.length})`),
        h("div.small.muted", ses.venue + " • ޖަޖުން: " + (ses.judges || []).length));
      studs.forEach(st => left.appendChild(h("div.queue-item" + (live && live.studentId === st.id ? ".cur" : "") + (d.has(st.id) ? ".done" : ""),
        { onclick: () => callStudent(st) },
        h("b", st.order || ""), photoTag(st.photoThumb),
        h("div.grow", st.name, h("div.small.muted", `${st.regNo} • ${st.categoryName}`)),
        d.has(st.id) ? h("span.tag.gold", "ނިމުނު") : st.checkin ? h("span.tag.green", "ހާޟިރު") : h("span.tag", "ނާދޭ"))));
      if (!studs.length) left.appendChild(empty("މި ސެޝަނަށް ދަރިވަރުން ލާފައި ނުވޭ"));

      // ---------- right: controls
      right.innerHTML = "";
      const top = h("div.card");
      right.appendChild(top);
      const judgesRow = h("div.judge-status", (ses.judges || []).map(j => {
        const js = jstat[j.email]; const ok = js && live && js.studentId === live.studentId && js.saved;
        return h("span" + (ok ? ".ok" : ""), `ޖަޖު ${j.slot}: ${j.name} ${ok ? "✔ ސޭވް" : js && live && js.studentId === live.studentId ? "✎" : "…"}`);
      }));
      const dispSel = select([["text", "ސްކްރީން: ޓެކްސްޓް"], ["image", "ސްކްރީން: މުޞްޙަފު PNG"]], (live && live.display) || S.settings.studentDisplay);
      dispSel.onchange = () => write({ display: dispSel.value });
      if (!live || !live.studentId) {
        const nx = studs.find(s => !d.has(s.id));
        top.append(h("div.row.between", h("span.phase-pill", "ހުސް"), dispSel),
          live && live.lastResult ? h("div", { style: { margin: "10px 0" } }, h("div.small.muted", "ކުރީގެ ދަރިވަރު:"), idCard(live.lastResult.student, { more: false }), h("div.center", starsEl(live.lastResult.stars))) : null,
          nx ? h("div", { style: { marginTop: "10px" } }, h("div.small.muted", "ދެން:"), idCard(nx), h("button.btn.primary.lg", { style: { marginTop: "10px", width: "100%" }, onclick: () => callStudent(nx) }, "📣 " + nx.name + " ގޮވާ"))
            : h("div.empty", { style: { marginTop: "10px" } }, "ހުރިހާ ދަރިވަރުން ނިމިއްޖެ. ޗީފް ޖަޖު ސެޝަން ނިންމަވާ."),
          h("div", { style: { marginTop: "10px" } }, judgesRow));
        return;
      }
      const cat = catById(live.categoryId) || {};
      top.append(h("div.row.between", h("div.row", h("span.phase-pill", { grid: "ގްރިޑް", reading: "ކިޔަވަނީ", scoring: "މާކްސް ދެނީ", final: "ނިމިއްޖެ" }[live.phase] || live.phase),
        h("span.tag", BRANCHES[live.branch] || ""), h("span.tag.gold", describeSyllabus(cat.syllabus))), dispSel),
        h("div", { style: { margin: "10px 0" } }, idCard(live.student)), judgesRow);

      if (live.phase === "grid") {
        const card = h("div.card", h("div.row.between", h("h3", `ދަރިވަރު ހޮވާ ނަންބަރުތައް ފިއްތާ (${(live.picks || []).length} / ${live.qCount})`),
          h("button.btn.sm", { onclick: regenGrid }, "🔄 ގްރިޑް އަލުން")),
          h("div.gridbox", (live.grid || []).map(g => h("button" + ((live.picks || []).includes(g.n) ? ".taken" : ""), { onclick: () => pickBox(g.n) },
            g.n, (live.picks || []).includes(g.n) ? h("span.sub", "ސުވާލު " + ((live.picks || []).indexOf(g.n) + 1)) : null))),
          h("div.row", { style: { marginTop: "10px" } }, h("button.btn.ghost", { onclick: skipStudent }, "⏭ ފަހަތަށް ލާ")));
        right.appendChild(card);
      }
      if (live.phase === "reading" || live.phase === "scoring" || live.phase === "final") {
        const q = live.questions[live.qIndex];
        const card = h("div.card");
        const qtabs = h("div.qtabs", live.questions.map((x, i) => h("button" + (i === live.qIndex ? ".view" : ""), {}, `${i + 1}`)));
        card.append(h("div.qbar", h("span.qn", `ސުވާލު ${live.qIndex + 1} / ${live.questions.length}`), qtabs,
          h("span.grow", qLabelDv(q)), h("span.light." + (live.light === "go" ? "go" : "stop"))));
        if (live.phase === "reading") {
          card.append(h("div.row", { style: { gap: "8px", marginBottom: "10px" } },
            h("button.btn.green.lg", { onclick: () => setLight("go"), disabled: live.light === "go" }, "🟢 ފަށާ"),
            h("button.btn.red.lg", { onclick: () => setLight("stop"), disabled: live.light !== "go" }, "🔴 ހުއްޓާ"),
            h("button.btn.lg", { onclick: prevQ, disabled: live.qIndex <= 0 }, "◀ ކުރީ"),
            live.qIndex < live.questions.length - 1
              ? h("button.btn.primary.lg", { onclick: nextQ }, "ދެން ސުވާލު ▶")
              : h("button.btn.blue.lg", { onclick: toScoring }, "✔ ކިޔެވުން ނިމުނީ")));
        } else {
          const allSaved = (ses.judges || []).every(j => jstat[j.email] && jstat[j.email].studentId === live.studentId && jstat[j.email].saved);
          card.append(h("div.row", { style: { marginBottom: "10px" } },
            h("span", live.phase === "final" ? "✔ ޗީފް ޖަޖު ނަތީޖާ ނިންމައިފި" : allSaved ? "ހުރިހާ ޖަޖުން ސޭވް ކޮށްފި — ޗީފް ޖަޖު ނަތީޖާ ނިންމަވާ" : "ޖަޖުން މާކްސް ސޭވް ކުރަނީ..."),
            h("button.btn.ghost", { onclick: () => write({ phase: "reading" }) }, "↩ ކިޔެވުމަށް"),
            h("button.btn.primary.lg", { onclick: markDone, disabled: live.phase !== "final" && role !== "superadmin" }, "⏭ ދެން ދަރިވަރު")));
        }
        const pv = h("div", { html: renderPage(q.page, { range: [q.wStart, q.wEnd] }) });
        pv.firstChild.style.setProperty("--qsize", "22px");
        card.appendChild(pv);
        right.appendChild(card);
      }
    }
  }
}
