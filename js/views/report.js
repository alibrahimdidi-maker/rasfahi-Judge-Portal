// ============================================================
//  COMPETITION REPORT (ނަތީޖާގެ ތަފާސް ހިސާބު)
//  Everything comes from the judges' rubric sheets (scores) and the final results.
//  • filters: branch, age group, junior / senior, gender, category, rank (1st / top 3 / 5 / 10) and rank scope
//  • charts: bar / grouped bar / donut, drawn here (no library) so they also print
//  • student report card: most frequent mistakes, rubric vs category average
// ============================================================
import {
  S, db, collection, getDocs, query, where, h, esc, toast, modal, select, spinner, empty,
  loadCategories, catById, fmt2, round, starsHtml, AGE_GROUPS, ageGroupName, genderName, BRANCHES
} from "../core.js";
import { KHAFI_GROUPS, JALI_TYPES } from "../tajweed.js";
import { printDoc } from "../print.js";

// ---------- palette & helpers ----------
const COL = { gold: "#c9a443", emerald: "#1c8a5c", purple: "#6a4bc4", lapis: "#3d6fe0", ruby: "#c0392b", teal: "#13a3a8", orange: "#e67e22", rose: "#d45d91", slate: "#7f8fa6" };
const SERIES = [COL.emerald, COL.purple, COL.gold, COL.lapis, COL.ruby, COL.teal, COL.orange, COL.rose, COL.slate];
const AGE_ORDER = AGE_GROUPS.map(a => a[0]);
const JUNIOR = new Set(["U6", "U9", "U11", "U13"]);
const levelOf = (ag) => (ag === "SN" ? "sn" : JUNIOR.has(ag) ? "junior" : "senior");
const LEVEL_DV = { junior: "ޖޫނިއަރ (13 އަހަރުން ދަށް)", senior: "ސީނިއަރ (16 އަހަރުން މަތި)", sn: "ނުކުޅެދުންތެރިކަން ހުންނަ" };
const PASSAGE_DV = { juz30: "ޢައްމަ ކޮޅު (ފޮތް 30)", baqarah: "ބަޤަރާ ސޫރަތް", other: "އެހެން ތަންތަނުން" };
const avg = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const pct = (v, m) => (m ? (v / m) * 100 : 0);
const groupBy = (arr, fn) => arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {});
const KG = Object.fromEntries(KHAFI_GROUPS.map(g => [g.key, g]));
const JT = Object.fromEntries(JALI_TYPES.map(t => [t.key, t]));
// a readable name for an error
const errKey = (e) => e.type === "jali" ? `jali:${e.sub || "_"}` : `khafi:${e.group || "?"}:${e.sub || "?"}`;
const errName = (k) => {
  const [t, a, b] = k.split(":");
  if (t === "jali") return a === "_" ? "ލަޙްނު ޖަލީ" : "ޖަލީ — " + ((JT[a] || {}).dv || a);
  const g = KG[a]; const it = g ? (g.items.find(x => x[0] === b) || []) : [];
  return `${g ? g.dv : a} — ${it[2] || b}`;
};

// ---------- charts (HTML/SVG, work on screen and in print) ----------
function barsH(items, o = {}) {           // horizontal bars, labels on the right (RTL)
  const max = o.max ?? Math.max(1, ...items.map(i => i.value));
  if (!items.length) return `<div class="rep-empty">ޑޭޓާ ނެތް</div>`;
  return `<div class="rb">${items.map((it, i) => `<div class="rb-row"><div class="rb-l">${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ""}</div>
    <div class="rb-t"><div class="rb-f" style="width:${Math.max(1.5, pct(it.value, max)).toFixed(1)}%;background:${it.color || SERIES[i % SERIES.length]}"></div></div>
    <div class="rb-v">${o.fmt ? o.fmt(it.value) : fmt2(it.value, o.dec ?? 1)}</div></div>`).join("")}</div>`;
}
function barsV(groups, series, o = {}) {   // grouped vertical bars: groups = [{label, values:[..]}]
  const max = o.max ?? Math.max(1, ...groups.flatMap(g => g.values.filter(v => v != null)));
  if (!groups.length) return `<div class="rep-empty">ޑޭޓާ ނެތް</div>`;
  return `<div class="rv"><div class="rv-plot">${groups.map(g => `<div class="rv-g"><div class="rv-bars">${g.values.map((v, i) => v == null ? `<div class="rv-b none"></div>` :
      `<div class="rv-b" style="height:${Math.max(1, pct(v, max)).toFixed(1)}%;background:${series[i].color}"><span>${fmt2(v, o.dec ?? 1)}</span></div>`).join("")}</div>
      <div class="rv-x">${esc(g.label)}</div></div>`).join("")}</div>
    <div class="rep-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div></div>`;
}
function donut(items, o = {}) {
  const tot = items.reduce((a, b) => a + b.value, 0);
  if (!tot) return `<div class="rep-empty">ޑޭޓާ ނެތް</div>`;
  const R = 70, C = 2 * Math.PI * R; let off = 0;
  const segs = items.map((it, i) => { const len = (it.value / tot) * C; const s = `<circle r="${R}" cx="90" cy="90" fill="none" stroke="${it.color || SERIES[i % SERIES.length]}" stroke-width="30"
      stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 90 90)"/>`; off += len; return s; }).join("");
  return `<div class="rd"><svg viewBox="0 0 180 180" class="rd-svg">${segs}<text x="90" y="86" text-anchor="middle" class="rd-n">${o.center ?? tot}</text>
    <text x="90" y="108" text-anchor="middle" class="rd-c">${esc(o.caption || "")}</text></svg>
    <div class="rd-leg">${items.map((it, i) => `<div><i style="background:${it.color || SERIES[i % SERIES.length]}"></i>${esc(it.label)}<b>${it.value}</b><small>${fmt2(pct(it.value, tot), 0)}%</small></div>`).join("")}</div></div>`;
}
const section = (title, body, note) => `<section class="rep-card"><h3>${esc(title)}</h3>${note ? `<p class="rep-note">${note}</p>` : ""}${body}</section>`;

// ---------- data ----------
async function loadData() {
  const cid = S.settings.activeCompetitionId;
  const cats = await loadCategories(true);
  const res = (await getDocs(query(collection(db, "results"), where("competitionId", "==", cid)))).docs.map(d => ({ id: d.id, ...d.data() }));
  let scores = [], scoreErr = "";
  try { scores = (await getDocs(query(collection(db, "scores"), where("competitionId", "==", cid)))).docs.map(d => d.data()); }
  catch (e) { scoreErr = e.code || e.message; }
  const byStudent = groupBy(scores.filter(s => s.locked !== false), s => s.studentId);
  const rows = res.map(r => {
    const cat = catById(r.categoryId) || {};
    const sheets = byStudent[r.studentId] || [];
    const errs = sheets.flatMap(s => s.errors || []);
    const nJ = Math.max(1, sheets.length || (r.judges || []).length || 1);
    const qs = (sheets[0] && sheets[0].questions) || [];
    const passage = qs.length && qs.every(q => +q.juz === 30) ? "juz30" : qs.some(q => +q.surah === 2) ? "baqarah" : qs.length ? "other" : "";
    const rub = r.rubric || cat.rubric || [];
    const max = rub.reduce((a, x) => a + (+x.max || 0), 0) || 100;
    return { ...r, cat, branch: cat.branch || r.branch || "", ageGroup: r.ageGroup || cat.ageGroup || "", level: levelOf(r.ageGroup || cat.ageGroup),
      gender: r.gender || "", passage, errs, nJ, max, pctFinal: pct(+r.final || 0, max),
      jali: errs.filter(e => e.type === "jali").length / nJ, khafi: errs.filter(e => e.type === "khafi").length / nJ, rub };
  });
  return { cats, rows, scoreErr, nScores: scores.length };
}
// rank inside a scope (category / age group / branch / whole competition)
function withRanks(rows, scope) {
  const key = { cat: r => r.categoryId, age: r => r.ageGroup, branch: r => r.branch, all: () => "all" }[scope];
  const out = rows.map(r => ({ ...r }));
  Object.values(groupBy(out, key)).forEach(list => {
    list.sort((a, b) => (scope === "cat" ? b.final - a.final : b.pctFinal - a.pctFinal));
    let prev = null, rk = 0; list.forEach((r, i) => { const v = scope === "cat" ? r.final : r.pctFinal; if (v !== prev) rk = i + 1; prev = v; r.rank = rk; });
  });
  return out;
}

// ---------- the view ----------
export async function report(view) {
  if (!S.settings.activeCompetitionId) return view.appendChild(h("div.card", empty("ހިނގަމުންދާ މުބާރާތެއް ނެތް")));
  const wrap = h("div.rep");
  view.appendChild(wrap);
  wrap.appendChild(spinner());
  let D;
  try { D = await loadData(); } catch (e) { wrap.innerHTML = ""; return wrap.appendChild(h("div.card", empty("ނަތީޖާ ނުލިބުނު: " + (e.code || e.message)))); }
  wrap.innerHTML = "";
  if (!D.rows.length) return wrap.appendChild(h("div.card", empty("މި މުބާރާތުގައި އަދި ނަތީޖާއެއް ނެތް. (ނަމޫނާ ޑޭޓާ 'މާކްސް އާއެކު' ލޯޑުކޮށް ޓެސްޓް ކުރެވޭނެ)")));

  const ages = AGE_ORDER.filter(a => D.rows.some(r => r.ageGroup === a));
  const F = {
    branch: select([["", "ހުރިހާ ގޮފި"], ["mushaf", "ބަލައިގެން"], ["hifz", "ނުބަލައި"]], ""),
    age: select([["", "ހުރިހާ ޢުމުރުފުރާ"], ...ages.map(a => [a, ageGroupName(a)])], ""),
    level: select([["", "ޖޫނިއަރ / ސީނިއަރ"], ["junior", LEVEL_DV.junior], ["senior", LEVEL_DV.senior]], ""),
    gender: select([["", "ދެ ޖިންސު"], ["M", "ފިރިހެން"], ["F", "އަންހެން"]], ""),
    cat: select([["", "ހުރިހާ ބައެއް"], ...D.cats.map(c => [c.id, c.name])], ""),
    top: select([["", "ހުރިހާ ދަރިވަރުން"], ["1", "1 ވަނަ"], ["3", "ގަދަ 3"], ["5", "ގަދަ 5"], ["10", "ގަދަ 10"]], ""),
    scope: select([["cat", "ވަނަ: ބައިގެ ތެރޭގައި"], ["age", "ވަނަ: ޢުމުރުފުރާގެ ތެރޭގައި"], ["branch", "ވަނަ: ގޮފީގެ ތެރޭގައި"], ["all", "ވަނަ: މުޅި މުބާރާތުގައި"]], "cat")
  };
  const body = h("div");
  const bar = h("div.rep-head",
    h("div.rep-title", h("div.rep-orn", "✦"), h("div", h("h2", "މުބާރާތުގެ ރިޕޯޓް"), h("div.small.muted", "ޖަޖުންގެ ރުބްރިކް ޝީޓްތަކާއި ފައިނަލް ނަތީޖާއިން")), h("div.rep-orn", "✦")),
    h("div.rep-filters", ...Object.values(F)),
    h("div.row", { style: { gap: "8px" } },
      h("button.btn.primary", { onclick: () => printReport() }, "🖨 ރިޕޯޓް ޕްރިންޓް / PDF"),
      h("button.btn", { onclick: () => { const el = wrap; (el.requestFullscreen ? el.requestFullscreen() : Promise.reject()).catch(() => {}); } }, "📺 ބޮޑު ސްކްރީނަށް")));
  wrap.append(bar, body);
  Object.values(F).forEach(s => s.onchange = draw);
  if (D.scoreErr) toast("ޖަޖުންގެ ޝީޓްތައް ނުލިބުނު — ކުށުގެ ތަފާސް ހިސާބު ނުފެންނާނެ (" + D.scoreErr + ")", "warn", 8000);

  let current = [];
  function filtered() {
    let rows = D.rows.filter(r => (!F.branch.value || r.branch === F.branch.value) && (!F.age.value || r.ageGroup === F.age.value) &&
      (!F.level.value || r.level === F.level.value) && (!F.gender.value || r.gender === F.gender.value) && (!F.cat.value || r.categoryId === F.cat.value));
    rows = withRanks(rows, F.scope.value);
    if (F.top.value) rows = rows.filter(r => r.rank <= +F.top.value);
    return rows;
  }
  function draw() { current = filtered(); body.innerHTML = buildHTML(current, true); wire(); }

  function buildHTML(rows, screen) {
    if (!rows.length) return `<div class="rep-empty big">މި ފިލްޓަރަށް ދަރިވަރަކު ނެތް</div>`;
    const errs = rows.flatMap(r => r.errs);
    const judged = rows.reduce((a, r) => a + r.nJ, 0);
    const jali = errs.filter(e => e.type === "jali"), khafi = errs.filter(e => e.type === "khafi");
    const stats = (list) => ({ n: list.length, avg: avg(list.map(r => r.pctFinal)), jali: avg(list.map(r => r.jali)), khafi: avg(list.map(r => r.khafi)) });
    const out = [];

    // --- headline numbers
    const st = stats(rows), best = rows.slice().sort((a, b) => b.pctFinal - a.pctFinal)[0];
    out.push(`<div class="rep-kpis">
      <div><b>${rows.length}</b><span>ދަރިވަރުން</span></div>
      <div><b>${fmt2(st.avg, 1)}%</b><span>މާކްސްގެ އެވަރެޖު</span></div>
      <div><b>${fmt2(best.pctFinal, 1)}%</b><span>އެންމެ މަތީ — ${esc(best.name)}</span></div>
      <div><b>${fmt2(st.jali, 2)}</b><span>ދަރިވަރަކަށް ލަޙްނު ޖަލީ</span></div>
      <div><b>${fmt2(st.khafi, 2)}</b><span>ދަރިވަރަކަށް ލަޙްނު ޚަފީ</span></div></div>`);

    // --- findings in words
    out.push(section("ފާހަގަވާ ކަންކަން", `<ul class="rep-find">${insights(rows).map(t => `<li>${t}</li>`).join("")}</ul>`));

    // --- age groups × branch
    const agesHere = AGE_ORDER.filter(a => rows.some(r => r.ageGroup === a));
    const byAB = (a, b) => { const l = rows.filter(r => r.ageGroup === a && r.branch === b); return l.length ? avg(l.map(r => r.pctFinal)) : null; };
    out.push(`<div class="rep-grid2">` +
      section("ޢުމުރުފުރާ އަދި ގޮފި — މާކްސްގެ އެވަރެޖު (%)", barsV(agesHere.map(a => ({ label: a, values: [byAB(a, "mushaf"), byAB(a, "hifz")] })),
        [{ label: "ބަލައިގެން", color: COL.emerald }, { label: "ނުބަލައި", color: COL.purple }], { max: 100 })) +
      section("ގޮފި — ދަރިވަރުން", donut([{ label: "ބަލައިގެން", value: rows.filter(r => r.branch === "mushaf").length, color: COL.emerald },
        { label: "ނުބަލައި", value: rows.filter(r => r.branch === "hifz").length, color: COL.purple }], { caption: "ދަރިވަރުން" })) + `</div>`);

    // --- gender
    const byAG = (a, g) => { const l = rows.filter(r => r.ageGroup === a && r.gender === g); return l.length ? avg(l.map(r => r.pctFinal)) : null; };
    const m = stats(rows.filter(r => r.gender === "M")), f = stats(rows.filter(r => r.gender === "F"));
    out.push(`<div class="rep-grid2">` +
      section("ފިރިހެން / އަންހެން — ޢުމުރުފުރާއިން (%)", barsV(agesHere.map(a => ({ label: a, values: [byAG(a, "M"), byAG(a, "F")] })),
        [{ label: "ފިރިހެން", color: COL.lapis }, { label: "އަންހެން", color: COL.rose }], { max: 100 })) +
      section("ފިރިހެން / އަންހެން", donut([{ label: "ފިރިހެން", value: m.n, color: COL.lapis }, { label: "އަންހެން", value: f.n, color: COL.rose }], { caption: "ދަރިވަރުން" }) +
        barsH([{ label: "ފިރިހެން — އެވަރެޖު", value: m.avg, color: COL.lapis }, { label: "އަންހެން — އެވަރެޖު", value: f.avg, color: COL.rose },
          { label: "ފިރިހެން — ޖަލީ / ޚަފީ", value: m.jali + m.khafi, color: COL.lapis, sub: `ޖަލީ ${fmt2(m.jali, 1)} • ޚަފީ ${fmt2(m.khafi, 1)}` },
          { label: "އަންހެން — ޖަލީ / ޚަފީ", value: f.jali + f.khafi, color: COL.rose, sub: `ޖަލީ ${fmt2(f.jali, 1)} • ޚަފީ ${fmt2(f.khafi, 1)}` }], { dec: 1 })) + `</div>`);

    // --- junior / senior and Juz Amma / Baqarah
    const jn = stats(rows.filter(r => r.level === "junior")), sn = stats(rows.filter(r => r.level === "senior"));
    const pj = stats(rows.filter(r => r.passage === "juz30")), pb = stats(rows.filter(r => r.passage === "baqarah")), po = stats(rows.filter(r => r.passage === "other"));
    out.push(`<div class="rep-grid2">` +
      section("ޖޫނިއަރ / ސީނިއަރ", barsV([{ label: "މާކްސް %", values: [jn.n ? jn.avg : null, sn.n ? sn.avg : null] },
        { label: "ޖަލީ ×10", values: [jn.n ? jn.jali * 10 : null, sn.n ? sn.jali * 10 : null] }, { label: "ޚަފީ ×10", values: [jn.n ? jn.khafi * 10 : null, sn.n ? sn.khafi * 10 : null] }],
        [{ label: `ޖޫނިއަރ (${jn.n})`, color: COL.teal }, { label: `ސީނިއަރ (${sn.n})`, color: COL.gold }]),
        "ޖޫނިއަރ = 13 އަހަރުން ދަށް • ސީނިއަރ = 16 އަހަރުން މަތި • ކުށުގެ ޢަދަދު ފެންނަނީ 10 ން ގުނައިގެން (ދަރިވަރަކަށް)") +
      section("ޢައްމަ ކޮޅު / ބަޤަރާ ސޫރަތް", barsV([{ label: "މާކްސް %", values: [pj.n ? pj.avg : null, pb.n ? pb.avg : null, po.n ? po.avg : null] },
        { label: "ކުށް ×10", values: [pj.n ? (pj.jali + pj.khafi) * 10 : null, pb.n ? (pb.jali + pb.khafi) * 10 : null, po.n ? (po.jali + po.khafi) * 10 : null] }],
        [{ label: `${PASSAGE_DV.juz30} (${pj.n})`, color: COL.emerald }, { label: `${PASSAGE_DV.baqarah} (${pb.n})`, color: COL.ruby }, { label: `${PASSAGE_DV.other} (${po.n})`, color: COL.slate }]),
        "ދަރިވަރު ކިޔެވި ސުވާލުތަކުން ބަލައިގެން") + `</div>`);

    // --- rubric criteria
    const crit = {};
    rows.forEach(r => (r.rub || []).forEach(k => { const v = (r.criteriaAvg || {})[k.key]; if (v == null) return; (crit[k.name] = crit[k.name] || { b: {}, max: k.max });
      (crit[k.name].b[r.branch] = crit[k.name].b[r.branch] || []).push(pct(+v, +k.max)); }));
    const critNames = Object.keys(crit);
    out.push(section("ރުބްރިކްގެ ބައިތައް — ލިބުނު މިންވަރު (%)", barsV(critNames.map(n => ({ label: n, values: ["mushaf", "hifz"].map(b => crit[n].b[b] ? avg(crit[n].b[b]) : null) })),
      [{ label: "ބަލައިގެން", color: COL.emerald }, { label: "ނުބަލައި", color: COL.purple }], { max: 100 }), "ކޮންމެ ބައެއްގެ މެކްސަށް ބަލާއިރު ދަރިވަރުންނަށް ލިބުނު ދަރަޖަ"));

    // --- errors
    if (!D.nScores) out.push(section("ކުށުގެ ތަފާސް ހިސާބު", `<div class="rep-empty">ޖަޖުންގެ ޝީޓްތައް ނެތް / ނުލިބުނު</div>`));
    else {
      const cnt = (list, fn) => Object.entries(groupBy(list, fn)).map(([k, v]) => ({ k, n: v.length })).sort((a, b) => b.n - a.n);
      const top = cnt(errs, errKey).slice(0, 15).map((x, i) => ({ label: errName(x.k), value: x.n, color: x.k.startsWith("jali") ? COL.ruby : SERIES[(i + 1) % SERIES.length] }));
      const groups = cnt(khafi, e => e.group || "?").map((x, i) => ({ label: (KG[x.k] || {}).dv || x.k, value: x.n, color: SERIES[i % SERIES.length] }));
      const items = (g) => cnt(khafi.filter(e => e.group === g), e => e.sub || "?").map(x => ({ label: ((KG[g] || { items: [] }).items.find(i => i[0] === x.k) || [0, 0, x.k])[2], value: x.n }));
      const rules = ["madd", "ghunna", "nun", "mim", "idgham", "tafkhim", "haraka", "waqf", "hamz"].filter(g => khafi.some(e => e.group === g));
      out.push(`<div class="rep-grid2">` +
        section("ލަޙްނު ޖަލީ / ލަޙްނު ޚަފީ", donut([{ label: "ލަޙްނު ޖަލީ", value: jali.length, color: COL.ruby }, { label: "ލަޙްނު ޚަފީ", value: khafi.length, color: COL.orange }],
          { caption: "ފާހަގަކުރި ކުށް" }), `ޖަޖުން ފާހަގަކުރި ކުށްތައް (${judged} ޝީޓް)`) +
        section("ލަޙްނު ޚަފީ — ބައިތައް", donut(groups, { caption: "ޚަފީ" })) + `</div>`);
      out.push(section("އެންމެ ގިނައިން ކުރެވުނު ކުށްތައް", barsH(top, { dec: 0 })));
      out.push(`<div class="rep-grid2">` + section("ތަޖްވީދުގެ ޙުކުމްތައް", barsH(rules.map((g, i) => ({ label: KG[g].dv, value: khafi.filter(e => e.group === g).length, color: SERIES[i % SERIES.length] })), { dec: 0 })) +
        section("ޞިފަތައް", barsH(items("sifat"), { dec: 0 })) + `</div>`);
      out.push(`<div class="rep-grid2">` + section("އަކުރުގެ މަޚްރަޖު", barsH(items("makhraj"), { dec: 0 })) +
        section("މައްދު، ޣުންނާ، ވަޤްފު، ޙަރަކާތް", barsH(["madd", "ghunna", "waqf", "haraka"].flatMap(g => items(g).slice(0, 4).map(x => ({ ...x, label: `${(KG[g] || {}).dv} — ${x.label}` }))), { dec: 0 })) + `</div>`);
    }

    // --- categories side by side
    const byCat = groupBy(rows, r => r.categoryId);
    out.push(section("ބައިތަކުގެ އަޅާކިޔުން", `<div class="tbl-wrap"><table class="tbl rep-tbl"><thead><tr><th>ބައި</th><th>ގޮފި</th><th>ޢުމުރުފުރާ</th><th>ދަރިވަރުން</th>
      <th>އެވަރެޖު %</th><th>މަތީ</th><th>ދަށް</th><th>ޖަލީ</th><th>ޚަފީ</th><th>އެންމެ ގިނަ ކުށް</th></tr></thead><tbody>${Object.values(byCat).map(l => {
        const c = l[0], s2 = stats(l), e2 = cnt2(l.flatMap(r => r.errs));
        return `<tr><td><b>${esc(c.categoryName || c.cat.name || "")}</b></td><td>${esc(BRANCHES[c.branch] || "")}</td><td>${esc(ageGroupName(c.ageGroup))}</td><td>${l.length}</td>
          <td><b>${fmt2(s2.avg, 1)}</b></td><td>${fmt2(Math.max(...l.map(r => r.pctFinal)), 1)}</td><td>${fmt2(Math.min(...l.map(r => r.pctFinal)), 1)}</td>
          <td>${fmt2(s2.jali, 1)}</td><td>${fmt2(s2.khafi, 1)}</td><td class="small">${e2 ? esc(errName(e2)) : "-"}</td></tr>`; }).join("")}</tbody></table></div>`));

    // --- ranked students
    const scopeDv = { cat: "ބައި", age: "ޢުމުރުފުރާ", branch: "ގޮފި", all: "މުޅި މުބާރާތް" }[F.scope.value];
    const listRows = rows.slice().sort((a, b) => (a.rank - b.rank) || (b.pctFinal - a.pctFinal)).slice(0, screen ? 300 : 500);
    out.push(section(`ވަނަތަކުގެ ދަރިވަރުން — ${scopeDv}${F.top.value ? " • ގަދަ " + F.top.value : ""}`, `<div class="tbl-wrap"><table class="tbl rep-tbl"><thead><tr><th>ވަނަ</th><th>ނަން</th>
      <th>ބައި</th><th>ޢުމުރުފުރާ</th><th>ޖިންސު</th><th>ފައިނަލް</th><th>%</th><th>ތަރި</th><th>ޖަލީ</th><th>ޚަފީ</th><th>އެންމެ ގިނަ ކުށް</th>${screen ? "<th></th>" : ""}</tr></thead>
      <tbody>${listRows.map(r => { const e2 = cnt2(r.errs); return `<tr class="${r.rank <= 3 ? "rk" + r.rank : ""}"><td><b>${r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] + " " : ""}${r.rank}</b></td>
        <td><b>${esc(r.name)}</b><div class="small muted">${esc(r.regNo || "")} • ${esc(r.institution || "")}</div></td><td>${esc(r.categoryName || "")}</td>
        <td>${esc(r.ageGroup)}</td><td>${esc(genderName(r.gender))}</td><td><b>${fmt2(r.final)}</b></td><td>${fmt2(r.pctFinal, 1)}</td><td>${starsHtml(r.stars)}</td>
        <td>${fmt2(r.jali, 1)}</td><td>${fmt2(r.khafi, 1)}</td><td class="small">${e2 ? esc(errName(e2)) : "-"}</td>
        ${screen ? `<td><button class="btn sm" data-card="${esc(r.id)}">📋 ރިޕޯޓް</button></td>` : ""}</tr>`; }).join("")}</tbody></table></div>`,
      "ފިލްޓަރުތަކުން ޢުމުރުފުރާ، ގޮފި، ޖިންސު، ޖޫނިއަރ / ސީނިއަރ ހޮވުމުން އެ ދަރިވަރުން އަޅާކިޔޭނެ"));
    return out.join("");
  }
  const cnt2 = (errs) => { const g = groupBy(errs, errKey); let best = "", n = 0; for (const k in g) if (g[k].length > n) { n = g[k].length; best = k; } return best; };

  function insights(rows) {
    const t = [];
    const s = (l) => l.length ? avg(l.map(r => r.pctFinal)) : null;
    const M = s(rows.filter(r => r.gender === "M")), Fm = s(rows.filter(r => r.gender === "F"));
    if (M != null && Fm != null) t.push(`${Fm > M ? "އަންހެން" : "ފިރިހެން"} ދަރިވަރުންގެ އެވަރެޖު <b>${fmt2(Math.abs(Fm - M), 1)}%</b> މަތި (ފިރިހެން ${fmt2(M, 1)}% • އަންހެން ${fmt2(Fm, 1)}%).`);
    const Bm = s(rows.filter(r => r.branch === "mushaf")), Bh = s(rows.filter(r => r.branch === "hifz"));
    if (Bm != null && Bh != null) t.push(`ބަލައިގެން ${fmt2(Bm, 1)}% • ނުބަލައި ${fmt2(Bh, 1)}% — ތަފާތު <b>${fmt2(Math.abs(Bm - Bh), 1)}%</b>.`);
    const J = s(rows.filter(r => r.level === "junior")), Sn = s(rows.filter(r => r.level === "senior"));
    if (J != null && Sn != null) t.push(`ސީނިއަރ ${fmt2(Sn, 1)}% • ޖޫނިއަރ ${fmt2(J, 1)}% — ${Sn >= J ? "މަތީ ޢުމުރުފުރާތައް" : "ދަށު ޢުމުރުފުރާތައް"} <b>${fmt2(Math.abs(Sn - J), 1)}%</b> ކުރީގައި.`);
    const P1 = s(rows.filter(r => r.passage === "juz30")), P2 = s(rows.filter(r => r.passage === "baqarah"));
    if (P1 != null && P2 != null) t.push(`ޢައްމަ ކޮޅުން ކިޔެވި ދަރިވަރުން ${fmt2(P1, 1)}% • ބަޤަރާއިން ${fmt2(P2, 1)}%.`);
    const byAge = AGE_ORDER.map(a => [a, s(rows.filter(r => r.ageGroup === a))]).filter(x => x[1] != null).sort((a, b) => b[1] - a[1]);
    if (byAge.length > 1) t.push(`އެންމެ މަތީ ޢުމުރުފުރާ: <b>${esc(ageGroupName(byAge[0][0]))}</b> (${fmt2(byAge[0][1], 1)}%) • އެންމެ ދަށް: ${esc(ageGroupName(byAge[byAge.length - 1][0]))} (${fmt2(byAge[byAge.length - 1][1], 1)}%).`);
    const errs = rows.flatMap(r => r.errs);
    if (errs.length) { const k = cnt2(errs); t.push(`އެންމެ ގިނައިން ފާހަގަކުރެވުނު ކުށް: <b>${esc(errName(k))}</b> (${errs.filter(e => errKey(e) === k).length} ފަހަރު).`);
      const kh = errs.filter(e => e.type === "khafi"); if (kh.length) { const g = groupBy(kh, e => e.group || "?"); const gk = Object.keys(g).sort((a, b) => g[b].length - g[a].length)[0];
        t.push(`ލަޙްނު ޚަފީގެ ތެރެއިން އެންމެ ގިނައީ <b>${esc((KG[gk] || {}).dv || gk)}</b> (${fmt2(pct(g[gk].length, kh.length), 0)}%).`); } }
    return t.length ? t : ["ފާހަގަކުރެވޭ ތަފާތެއް ހޯދުމަށް ދަރިވަރުން މަދު"];
  }

  function wire() {
    body.querySelectorAll("[data-card]").forEach(b => b.onclick = () => { const r = current.find(x => x.id === b.dataset.card); if (r) studentCard(r, D.rows); });
  }
  function printReport() {
    const f = Object.values(F).filter(s => s.value).map(s => s.options[s.selectedIndex].text).join(" • ");
    printDoc("މުބާރާތުގެ ރިޕޯޓް", `<style>${PRINT_CSS}</style><div class="rep print">${buildHTML(current, false)}</div>`, { sub: f || "ހުރިހާ ދަރިވަރުން", landscape: true });
  }
  draw();
}

// ---------- one student's report card (also used from the results page) ----------
export function studentCardHTML(r, all) {
  const peers = all.filter(x => x.categoryId === r.categoryId);
  const byK = groupBy(r.errs, errKey);
  const top = Object.entries(byK).map(([k, v]) => ({ label: errName(k), value: v.length / r.nJ, color: k.startsWith("jali") ? COL.ruby : COL.orange }))
    .sort((a, b) => b.value - a.value).slice(0, 10);
  const byG = groupBy(r.errs.filter(e => e.type === "khafi"), e => e.group || "?");
  const crit = (r.rub || []).map((k, i) => {
    const mine = pct(+(r.criteriaAvg || {})[k.key] || 0, +k.max);
    const cavg = avg(peers.map(p => pct(+(p.criteriaAvg || {})[k.key] || 0, +k.max)));
    return { label: k.name, values: [mine, cavg] };
  });
  return `<div class="rep-student">
    <div class="rs-head"><div><h2>${esc(r.name)}</h2><div class="muted">${esc(r.regNo || "")} • ${esc(r.categoryName || "")} • ${esc(ageGroupName(r.ageGroup))} • ${esc(genderName(r.gender))}</div>
      <div class="muted">${esc(r.institution || "")}</div></div>
      <div class="rs-score"><b>${fmt2(r.final)}</b><span>${fmt2(r.pctFinal, 1)}%</span><div>${starsHtml(r.stars)}</div>${r.rank ? `<div class="rs-rank">ވަނަ: ${r.rank}</div>` : ""}</div></div>
    <div class="rep-kpis small4"><div><b>${fmt2(r.jali, 1)}</b><span>ލަޙްނު ޖަލީ (ޖަޖަކަށް)</span></div><div><b>${fmt2(r.khafi, 1)}</b><span>ލަޙްނު ޚަފީ (ޖަޖަކަށް)</span></div>
      <div><b>${fmt2(avg(peers.map(p => p.pctFinal)), 1)}%</b><span>ބައިގެ އެވަރެޖު</span></div><div><b>${r.nJ}</b><span>ޖަޖުން</span></div></div>
    ${section("އެންމެ ގިނައިން ކުރެވުނު ކުށްތައް", barsH(top, { dec: 1 }), "ޖަޖަކު ފާހަގަކުރި އެވަރެޖު ޢަދަދު")}
    <div class="rep-grid2">${section("ލަޙްނު ޚަފީ — ބައިތައް", donut(Object.entries(byG).map(([g, v], i) => ({ label: (KG[g] || {}).dv || g, value: v.length, color: SERIES[i % SERIES.length] })), { caption: "ޚަފީ" }))}
    ${section("ރުބްރިކް — ބައިގެ އެވަރެޖާ އަޅާކިޔުން (%)", barsV(crit, [{ label: "މި ދަރިވަރު", color: COL.gold }, { label: "ބައިގެ އެވަރެޖު", color: COL.slate }], { max: 100 }))}</div>
    ${section("ޖަޖުންގެ މާކްސް", barsH((r.judges || []).map(j => ({ label: `ޖަޖު ${j.slot || ""} — ${j.name || ""}`, value: +j.total || 0, color: COL.emerald })), { max: r.max, dec: 2 }))}
  </div>`;
}
export function studentCard(r, all) {
  const html = studentCardHTML(r, all);
  modal("ދަރިވަރުގެ ރިޕޯޓް", h("div.rep", { html }),
    [{ label: "🖨 ޕްރިންޓް", cls: "primary", onClick: () => { printDoc("ދަރިވަރުގެ ރިޕޯޓް — " + r.name, `<style>${PRINT_CSS}</style><div class="rep print">${html}</div>`); return false; } },
     { label: "ބަންދު" }], { wide: true });
}
// open a student's card from anywhere (results page)
export async function openStudentReport(resultId) {
  const D = await loadData();
  const r = withRanks(D.rows, "cat").find(x => x.id === resultId);
  if (!r) return toast("މި ދަރިވަރުގެ ރިޕޯޓް ނުލިބުނު", "warn");
  studentCard(r, D.rows);
}

// light styles for printing / PDF
const PRINT_CSS = `
.rep.print{color:#111;font-size:12px}.rep.print h3{margin:0 0 6px;font-size:14px;color:#6b5210}
.rep-card{border:1.5px solid #c9a443;border-radius:10px;padding:10px 12px;margin:0 0 10px;page-break-inside:avoid}
.rep-note{margin:0 0 6px;color:#666;font-size:11px}.rep-grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.rep-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:10px}.rep-kpis.small4{grid-template-columns:repeat(4,1fr)}
.rep-kpis>div{border:1.5px solid #c9a443;border-radius:10px;padding:8px;text-align:center}.rep-kpis b{display:block;font-size:20px;color:#1c8a5c}
.rep-kpis span{font-size:11px;color:#555}.rep-find li{margin:3px 0}
.rb-row{display:grid;grid-template-columns:38% 1fr 50px;gap:6px;align-items:center;margin:3px 0}.rb-l small{display:block;color:#777;font-size:10px}
.rb-t{background:#eef0f4;border-radius:5px;height:14px;overflow:hidden}.rb-f{height:100%;border-radius:5px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rb-v{font-weight:700;text-align:left}
.rv-plot{display:flex;gap:10px;align-items:flex-end;height:170px;border-bottom:1px solid #999;padding:14px 4px 0}
.rv-g{flex:1;display:flex;flex-direction:column;height:100%}.rv-bars{flex:1;display:flex;gap:3px;align-items:flex-end;justify-content:center}
.rv-b{flex:1;max-width:34px;position:relative;border-radius:4px 4px 0 0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rv-b span{position:absolute;top:-14px;left:50%;transform:translateX(-50%);font-size:9px;white-space:nowrap}.rv-b.none{background:transparent}
.rv-x{text-align:center;font-size:10px;padding-top:3px}.rep-legend{display:flex;gap:12px;flex-wrap:wrap;margin-top:6px;font-size:11px}
.rep-legend i,.rd-leg i{display:inline-block;width:10px;height:10px;border-radius:2px;margin-left:4px;-webkit-print-color-adjust:exact;print-color-adjust:exact}
.rd{display:flex;gap:12px;align-items:center}.rd-svg{width:150px;height:150px}.rd-n{font-size:26px;font-weight:700;fill:#111}.rd-c{font-size:11px;fill:#666}
.rd-leg div{display:flex;gap:6px;align-items:center;margin:3px 0}.rd-leg b{margin-right:auto}.rd-leg small{color:#777}
.rep-tbl td,.rep-tbl th{font-size:11px}.rk1 td{background:#fff7dd}.rk2 td{background:#f2f2f2}.rk3 td{background:#f8efe7}
.rep-student .rs-head{display:flex;justify-content:space-between;align-items:center;border-bottom:3px double #c9a443;margin-bottom:10px;padding-bottom:6px}
.rs-score{text-align:center}.rs-score b{display:block;font-size:30px;color:#1c8a5c}.rep-empty{color:#888;padding:10px;text-align:center}
.rep-head,.rep-filters,.btn{display:none}`;
