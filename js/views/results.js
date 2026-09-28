// ============================================================
//  Dashboard + final results (Super admin, Admin secretary, Supervisor, Consultant, Secretary)
//  Supervisor / consultant / secretary see a session's results only after it is closed.
// ============================================================
import { S, db, doc, getDocs, collection, query, where, onSnapshot, h, toast, select, spinner, empty, sub, fmt2, starsHtml,
  loadCategories, loadSessions, catById, sessionLabel, downloadCSV, GENDERS, genderName } from "../core.js";
import { printDoc, resultsHTML, fullReportHTML, scoreSheetHTML, ceremonyHTML } from "../print.js";

const isAdmin = () => ["superadmin", "adminsec"].includes(S.me.role);

export async function dashboard(view) {
  if (!S.settings.activeCompetitionId) return view.appendChild(h("div.card", empty("ހިނގަމުންދާ މުބާރާތެއް ހޮވާފައެއް ނުވޭ")));
  await loadCategories();
  const sessions = await loadSessions(true);
  const kp = h("div.grid4");
  const liveBox = h("div.card", h("h2", "ސެޝަންތަކުގެ ޙާލަތު (ލައިވް)"));
  view.append(h("div.card", h("h2", "ޚުލާޞާ"), kp), liveBox);
  const cid = S.settings.activeCompetitionId;
  try {
    const [st, apps] = await Promise.all([
      getDocs(query(collection(db, "students"), where("competitionId", "==", cid))),
      isAdmin() ? getDocs(query(collection(db, "applications"), where("competitionId", "==", cid))) : Promise.resolve(null)]);
    const studs = st.docs.map(d => d.data());
    kp.append(h("div.kpi", h("b", studs.length), h("span", "ރަޖިސްޓަރީ ދަރިވަރުން")),
      h("div.kpi", h("b", studs.filter(s => s.checkin).length), h("span", "ޗެކްއިން ވެފައި")),
      h("div.kpi", h("b", `${sessions.filter(s => s.status === "closed").length} / ${sessions.length}`), h("span", "ނިމުނު ސެޝަން")),
      apps ? h("div.kpi", h("b", apps.docs.filter(d => ["submitted", "resubmitted"].includes(d.data().status)).length), h("span", "ބަލަންޖެހޭ އެޕްލިކޭޝަން"))
        : h("div.kpi", h("b", sessions.filter(s => s.status === "live").length), h("span", "ހިނގަމުންދާ ސެޝަން")));
  } catch (e) { kp.appendChild(h("div.small.muted", e.message)); }
  const rows = {};
  const tbl = h("div");
  liveBox.appendChild(tbl);
  const drawLive = () => {
    tbl.innerHTML = "";
    if (!sessions.length) return tbl.appendChild(empty("ސެޝަނެއް ނެތް"));
    tbl.appendChild(h("div.tbl-wrap", h("table.tbl", h("thead", h("tr", ["ސެޝަން", "ތާރީޚް", "ޙާލަތު", "ނިމުނު", "މިހާރު", "ފޭސް"].map(x => h("th", x)))),
      h("tbody", sessions.map(s => { const L = rows[s.id] || {};
        return h("tr", h("td", h("b", s.name)), h("td.ltr", s.date + " " + (s.time || "")),
          h("td", h("span.tag." + (s.status === "closed" ? "gold" : s.status === "live" ? "green" : "blue"), s.status === "closed" ? "ނިމިފައި" : s.status === "live" ? "ހިނގަނީ" : "ރޭވިފައި")),
          h("td", `${(L.done || []).length} / ${(s.order || []).length}`), h("td", L.student ? L.student.name : "-"),
          h("td.small", L.phase === "reading" ? `ސުވާލު ${L.qIndex + 1}/${(L.questions || []).length}` : L.phase || "-")); })))));
  };
  sessions.filter(s => s.status !== "closed").forEach(s => sub(onSnapshot(doc(db, "live", s.id), d => { rows[s.id] = d.exists() ? d.data() : {}; drawLive(); }, () => {})));
  drawLive();
}

export async function results(view) {
  if (!S.settings.activeCompetitionId) return view.appendChild(h("div.card", empty("ހިނގަމުންދާ މުބާރާތެއް ނެތް")));
  const cats = await loadCategories();
  const sessions = await loadSessions(true);
  const card = h("div.card", h("h2", "ފައިނަލް ނަތީޖާ"), spinner());
  view.appendChild(card);
  const cid = S.settings.activeCompetitionId;
  let rows;
  try {
    const snap = isAdmin() ? await getDocs(query(collection(db, "results"), where("competitionId", "==", cid)))
      : await getDocs(query(collection(db, "results"), where("published", "==", true)));
    rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(r => r.competitionId === cid);
  } catch (e) { card.lastChild.remove(); card.appendChild(empty(e.message)); return; }
  card.lastChild.remove();
  if (!isAdmin()) card.appendChild(h("p.small.muted", "ނަތީޖާ ފެންނާނީ ނިމިފައިވާ ސެޝަންތަކުގެ ނަތީޖާ އެކަނި."));
  const fCat = select([["", "ހުރިހާ ބައެއް"], ...cats.map(c => [c.id, c.name])], "");
  const fSes = select([["", "ހުރިހާ ސެޝަނެއް"], ...sessions.map(s => [s.id, sessionLabel(s)])], "");
  const fGen = select([["", "ދެ ޖިންސު"], ...GENDERS], "");
  const fTop = select([["", "ހުރިހާ"], ["1", "1 ވަނަ (ބިއްލޫރި)"], ["3", "ގަދަ 3"], ["5", "ގަދަ 5"], ["10", "ގަދަ 10"], ["20", "ގަދަ 20"]], "");
  const fStar = select([["", "ހުރިހާ ތަރި"], ["1", "1+ ތަރި"], ["3", "3+ ތަރި"], ["5", "5 ތަރި"]], "");
  const sigN = select([["3", "3 ސޮއި"], ["5", "5 ސޮއި"], ["7", "7 ސޮއި"]], "3");
  const box = h("div");
  card.append(h("div.filters", fCat, fSes, fGen, fStar, fTop, sigN,
    h("button.btn", { onclick: () => printRanked() }, "🖨 ނަތީޖާ"),
    h("button.btn.primary", { onclick: () => printCeremony() }, "🏅 ނަތީޖާ އިޢުލާނުކުރާ ޖަލްސާގެ ޕްރިންޓް"),
    h("button.btn", { onclick: () => exportCSV() }, "⬇ CSV"),
    isAdmin() ? h("button.btn", { onclick: () => printFull() }, "📑 ފުރިހަމަ ރުބްރިކް ރިޕޯޓް") : null,
    isAdmin() ? h("button.btn", { onclick: () => printJudgeSheets() }, "🗂 ޖަޖު ޝީޓްތައް") : null), box);
  // rank within category
  const ranked = () => {
    const f = rows.filter(r => (!fCat.value || r.categoryId === fCat.value) && (!fSes.value || r.sessionId === fSes.value) &&
      (!fGen.value || r.gender === fGen.value) && (!fStar.value || (r.stars || 0) >= +fStar.value));
    const byCat = {};
    f.forEach(r => (byCat[r.categoryId] = byCat[r.categoryId] || []).push(r));
    const out = [];
    Object.keys(byCat).sort((a, b) => ((catById(a) || {}).order || 0) - ((catById(b) || {}).order || 0)).forEach(k => {
      const list = byCat[k].sort((a, b) => b.final - a.final);
      let prev = null, rank = 0;
      list.forEach((r, i) => { if (r.final !== prev) rank = i + 1; prev = r.final; r.rank = rank; });
      out.push(...(fTop.value ? list.filter(r => r.rank <= +fTop.value) : list));
    });
    return out;
  };
  function draw() {
    const list = ranked();
    box.innerHTML = "";
    if (!list.length) return box.appendChild(empty("ނަތީޖާއެއް ނެތް"));
    let lastCat = null;
    const tb = h("tbody");
    list.forEach(r => {
      if (r.categoryId !== lastCat) { lastCat = r.categoryId; tb.appendChild(h("tr", h("td", { colspan: 11, style: { background: "var(--th)", color: "var(--gold2)", fontWeight: 700, padding: "8px" } }, r.categoryName))); }
      const rankBg = r.rank===1?"rgba(212,175,55,.18)":r.rank===2?"rgba(180,180,180,.10)":r.rank===3?"rgba(200,140,80,.12)":"";
      tb.appendChild(h("tr", { style: { background: rankBg } },
        h("td", h("b", { style: { fontSize: r.rank<=3?"18px":"" } }, r.rank<=3?"🥇🥈🥉"[r.rank-1]+" "+r.rank:String(r.rank))),
        h("td", r.photoThumb ? h("img.ph", { src: r.photoThumb }) : ""),
        h("td", h("b", r.name), h("div.small.muted", r.ageGroup||"")),
        h("td", r.regNo), h("td.ltr", r.nid),
        h("td.small", r.sessionName + " " + (r.sessionDate || "")),
        h("td.small", (r.judges || []).map(j => fmt2(j.total)).join(" | ")),
        h("td", h("b", { style: { color: "var(--green2)", fontSize: "16px" } }, fmt2(r.final))),
        h("td", { html: starsHtml(r.stars) }),
        h("td", r.institution ? h("div.small.muted", r.institution) : ""),
        h("td", h("button.btn.sm", { onclick: async () => { const m = await import("./report.js"); m.openStudentReport(r.id); } }, "📋 ރިޕޯޓް"))));
    });
    box.appendChild(h("div.tbl-wrap", h("table.tbl", h("thead", h("tr", ["ވަނަ", "", "ނަން", "ރެޖި", "އައިޑީ", "ސެޝަން", "ޖަޖުން", "ފައިނަލް", "ތަރި", "މުއައްސަސާ", ""].map(x => h("th", x)))), tb)));
  }
  [fCat, fSes, fGen, fTop, fStar].forEach(x => x.onchange = draw);
  const sub2 = () => [fCat.value && (catById(fCat.value) || {}).name, fSes.value && sessionLabel(sessions.find(s => s.id === fSes.value)), fGen.value && genderName(fGen.value)].filter(Boolean).join(" • ");
  function printRanked() {
    const list = ranked(); const byCat = {};
    list.forEach(r => (byCat[r.categoryId] = byCat[r.categoryId] || []).push(r));
    printDoc("ފައިނަލް ނަތީޖާ", Object.values(byCat).map(l => `<div class="page"><h3>${l[0].categoryName}</h3>${resultsHTML(l, +sigN.value)}</div>`).join(""), { sub: sub2() });
  }
  function exportCSV() {
    const list = ranked();
    const maxJ = Math.max(0, ...list.map(r => (r.judges || []).length));
    downloadCSV("results.csv", [["Rank", "Category", "Name", "Reg No", "ID", "Session", "Date", ...Array.from({ length: maxJ }, (_, i) => "Judge " + (i + 1)), "Final", "Stars"],
      ...list.map(r => [r.rank, r.categoryName, r.name, r.regNo, r.nid, r.sessionName, r.sessionDate, ...Array.from({ length: maxJ }, (_, i) => ((r.judges || [])[i] || {}).total ?? ""), r.final, r.stars])]);
  }
  async function loadScores() {
    const snap = await getDocs(query(collection(db, "scores"), where("competitionId", "==", cid)));
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  async function printFull() {
    const list = ranked(); if (!list.length) return;
    toast("ލޯޑުވަނީ..."); const sc = await loadScores();
    printDoc("ފުރިހަމަ ރުބްރިކް ރިޕޯޓް", list.map(r => fullReportHTML(r, sc.filter(s => s.sessionId === r.sessionId && s.studentId === r.studentId), catById(r.categoryId))).join(""));
  }
  async function printJudgeSheets() {
    const list = ranked(); if (!list.length) return;
    toast("ލޯޑުވަނީ..."); const sc = await loadScores();
    const keys = new Set(list.map(r => r.sessionId + "|" + r.studentId));
    const sel = sc.filter(s => keys.has(s.sessionId + "|" + s.studentId)).sort((a, b) => String(a.studentName).localeCompare(b.studentName) || a.judgeSlot - b.judgeSlot);
    printDoc("ޖަޖުންގެ މާކްސް ޝީޓް", sel.map(s => scoreSheetHTML(s, catById(s.categoryId))).join(""));
  }
  async function printCeremony() {
    const list = ranked(); if (!list.length) return toast("ނަތީޖާއެއް ނެތް", "warn");
    const snap = await import("../core.js").then(m => m.getDoc(m.doc(m.db, "competitions", S.settings.activeCompetitionId || "-"))).catch(()=>null);
    const comp = snap && snap.exists() ? { id: snap.id, ...snap.data() } : { name: "ޤުރްއާން މުބާރާތް" };
    const byCat = {};
    list.forEach(r => (byCat[r.categoryId] = byCat[r.categoryId] || []).push(r));
    const topN = fTop.value ? +fTop.value : 0;
    const html = Object.entries(byCat).map(([, l]) => `<div class="page">${ceremonyHTML(l, comp, topN)}</div>`).join("");
    printDoc("ނަތީޖާ އިޢުލާނުކުރާ ޖަލްސާ", html, { sub: sub2(), landscape: true });
  }
  draw();
}
