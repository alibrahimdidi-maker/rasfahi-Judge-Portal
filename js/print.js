// ============================================================
//  Print templates (A4). Every list can be filtered before printing.
// ============================================================
import { S, db, doc, getDoc, esc, fmt2, fmtDate, fmtDateTime, starsFor, ageGroupName, genderName, instTypeName, toast } from "./core.js";
import { errLabel } from "./tajweed.js";

let compCache = null;
async function comp() {
  if (compCache && compCache.id === S.settings.activeCompetitionId) return compCache;
  try {
    const s = await getDoc(doc(db, "competitions", S.settings.activeCompetitionId || "-"));
    compCache = s.exists() ? { id: s.id, ...s.data() } : { id: "", name: "ޤުރްއާން މުބާރާތް" };
  } catch (e) { compCache = { id: "", name: "ޤުރްއާން މުބާރާތް" }; }
  return compCache;
}

const BASE_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Noto+Sans+Thaana:wght@400;700&family=Amiri:wght@400;700&display=swap');
@font-face { font-family: 'KFGQPC Hafs'; src: url('${new URL("../fonts/UthmanicHafs.ttf", import.meta.url).href}'); }
@font-face { font-family: 'Faruma'; src: local('Faruma'), url('${new URL("../fonts/faruma.ttf", import.meta.url).href}'); }
* { box-sizing: border-box; }
body { font-family: 'Faruma','Noto Sans Thaana',sans-serif; direction: rtl; color: #000; margin: 0; padding: 12mm; font-size: 12px; }
@page { size: A4 PORTRAIT; margin: 8mm; }
.hdr { text-align: center; border-bottom: 3px double #000; padding-bottom: 6px; margin-bottom: 10px; }
.hdr .bs { font-family: 'KFGQPC Hafs','Amiri',serif; font-size: 20px; }
.hdr h1 { margin: 4px 0; font-size: 18px; } .hdr h2 { margin: 2px 0; font-size: 14px; font-weight: 400; }
.meta { display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; font-size: 12px; }
table { width: 100%; border-collapse: collapse; }
th, td { border: 1px solid #333; padding: 4px 5px; text-align: right; vertical-align: middle; }
th { background: #e9e9e9; }
td.num, th.num { text-align: center; }
img.ph { width: 34px; height: 40px; object-fit: cover; }
.sig { display: grid; grid-template-columns: repeat(var(--n,3), 1fr); gap: 20px; margin-top: 36px; }
.sig div { border-top: 1px solid #000; text-align: center; padding-top: 4px; }
.page { page-break-after: always; } .page:last-child { page-break-after: auto; }
.q { font-family: 'KFGQPC Hafs','Amiri',serif; font-size: 18px; }
.jali { color: #c00; font-weight: 700; } .khafi { color: #b35900; }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.card { border: 2px solid #000; border-radius: 8px; padding: 8px; display: flex; gap: 10px; page-break-inside: avoid; }
.card img { width: 80px; height: 96px; object-fit: cover; border: 1px solid #000; }
.card .nm { font-size: 15px; font-weight: 700; }
.foot { margin-top: 12px; font-size: 10px; color: #444; text-align: center; }
.stars { color: #b8860b; font-size: 14px; letter-spacing: 1px; }
.big { font-size: 22px; font-weight: 700; }
.box { border: 1px solid #000; padding: 6px; margin: 6px 0; }
.ltr { direction: ltr; unicode-bidi: embed; }
@media print { .noprint { display: none; } body { padding: 0; } }
`;

export async function printDoc(title, bodyHTML, opts = {}) {
  const c = await comp();
  const w = window.open("", "_blank");
  if (!w) return toast("ޕޮޕްއަޕް ބްލޮކް ކުރެވިފައި. ބްރައުޒަރުގައި ހުއްދަ ދެއްވާ.", "err");
  const css = BASE_CSS.replace("PORTRAIT", opts.landscape ? "landscape" : "portrait");
  w.document.write(`<!DOCTYPE html><html lang="dv" dir="rtl"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>
  <div class="noprint" style="margin-bottom:10px"><button onclick="window.print()" style="padding:8px 20px;font-size:14px">🖨️ ޕްރިންޓް</button></div>
  ${opts.noHeader ? "" : header(c, title, opts.sub)}${bodyHTML}
  <div class="foot">Rasfahi Judging System • ${esc(fmtDateTime(new Date()))} • ${esc(S.me ? S.me.name : "")}</div>
  </body></html>`);
  w.document.close();
  if (opts.autoPrint) setTimeout(() => w.print(), 900);
  return w;
}
export function header(c, title, sub) {
  return `<div class="hdr"><div class="bs">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div><h1>${esc(c.name || "")}${c.year ? " " + esc(c.year) : ""}</h1><h2>${esc(title)}</h2>${sub ? `<h2>${esc(sub)}</h2>` : ""}</div>`;
}
export const sigBlock = (labels) => `<div class="sig" style="--n:${labels.length}">${labels.map(l => `<div>${esc(l)}</div>`).join("")}</div>`;

// generic filtered list
export function tableHTML(cols, rows) {
  return `<table><thead><tr>${cols.map(c => `<th class="${c.cls || ""}">${esc(c.t)}</th>`).join("")}</tr></thead><tbody>${
    rows.map((r, i) => `<tr>${cols.map(c => `<td class="${c.cls || ""}">${c.html ? c.html(r, i) : esc(c.v(r, i))}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

// ------ admit / ID cards
export function admitCardsHTML(students, sessionsById = {}) {
  return `<div class="cards">${students.map(s => {
    const se = sessionsById[s.sessionId];
    return `<div class="card">${s.photoThumb ? `<img src="${s.photoThumb}">` : `<div style="width:80px;height:96px;border:1px solid #000"></div>`}
    <div><div class="nm">${esc(s.name)}</div><div class="ltr" style="text-align:right">${esc(s.nameEn || "")}</div>
    <div>ރެޖި: <b>${esc(s.regNo || "-")}</b> • އައިޑީ: <b>${esc(s.nid)}</b></div>
    <div>${esc(s.categoryName || "")}</div><div>${esc(s.institution || "")}</div>
    <div>${se ? `ސެޝަން: ${esc(se.name)} • ${esc(se.date)} ${esc(se.time || "")} • ${esc(se.venue || "")}` : ""}${s.order ? ` • ތަރުތީބު: ${s.order}` : ""}</div></div></div>`;
  }).join("")}</div>`;
}

// ------ blank judge mark sheet for a list of students
export function blankSheetsHTML(students, cat, session, judgeSlot) {
  const rub = (cat && cat.rubric) || [];
  return students.map(s => `<div class="page">
    <div class="meta"><div>ދަރިވަރު: <b>${esc(s.name)}</b></div><div>ރެޖި: <b>${esc(s.regNo || "")}</b> • އައިޑީ: <b>${esc(s.nid)}</b></div>
    <div>ބައި: ${esc(s.categoryName || (cat && cat.name) || "")}</div><div>ސެޝަން: ${esc(session ? session.name + " " + session.date : "")}</div>
    <div>ޖަޖު: ${judgeSlot ? "ނަންބަރު " + judgeSlot : "_____________"}</div></div>
    <table><thead><tr><th>ބައި</th><th class="num">މެކްސް</th><th class="num" style="width:90px">ލިބުނު</th><th>ނޯޓު</th></tr></thead><tbody>
    ${rub.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.max}</td><td></td><td></td></tr>`).join("")}
    <tr><th>ޖުމްލަ</th><th class="num">${rub.reduce((a, r) => a + (+r.max || 0), 0)}</th><th></th><th></th></tr></tbody></table>
    <div class="box" style="min-height:220px"><b>ކުށްތައް (ލަޙްނު ޖަލީ / ލަޙްނު ޚަފީ):</b></div>
    ${sigBlock(["ޖަޖުގެ ނަން", "ޖަޖުގެ ސޮއި", "ތާރީޚް"])}</div>`).join("");
}

// ------ filled judge sheet (from a score doc)
export function scoreSheetHTML(sc, cat) {
  const rub = sc.rubric || (cat && cat.rubric) || [];
  const errs = sc.errors || [];
  return `<div class="page">
  <div class="meta"><div>ދަރިވަރު: <b>${esc(sc.studentName)}</b></div><div>ރެޖި: <b>${esc(sc.regNo || "")}</b> • އައިޑީ: <b>${esc(sc.nid || "")}</b></div>
  <div>ބައި: ${esc(sc.categoryName || "")}</div><div>ސެޝަން: ${esc(sc.sessionName || "")} • ${esc(sc.sessionDate || "")}</div>
  <div>ޖަޖު ${esc(sc.judgeSlot || "")}: <b>${esc(sc.judgeName || "")}</b></div></div>
  <table><thead><tr><th>#</th><th>ސުވާލު</th><th>ޞަފުޙާ</th><th>ފޮޅުވަތް</th></tr></thead><tbody>
  ${(sc.questions || []).map((q, i) => `<tr><td class="num">${i + 1}</td><td class="q">${esc(q.surahName)} ${q.ayahFrom}–${q.ayahTo}</td><td class="num">${q.page}</td><td class="num">${q.lineFrom}–${q.lineTo}</td></tr>`).join("")}
  </tbody></table><br>
  <table><thead><tr><th>ބައި</th><th class="num">މެކްސް</th><th class="num">ލިބުނު</th></tr></thead><tbody>
  ${rub.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.max}</td><td class="num"><b>${fmt2((sc.criteria || {})[r.key])}</b></td></tr>`).join("")}
  <tr><th>ޖުމްލަ</th><th class="num">${rub.reduce((a, r) => a + (+r.max || 0), 0)}</th><th class="num big">${fmt2(sc.total)}</th></tr></tbody></table>
  <h3>ފާހަގަކުރެވުނު ކުށްތައް (${errs.length})</h3>
  ${errs.length ? tableHTML([
    { t: "#", cls: "num", v: (r, i) => i + 1 }, { t: "ސުވާލު", cls: "num", v: r => (r.qIndex ?? 0) + 1 },
    { t: "ކަލިމަ", html: r => `<span class="q ${r.type}">${esc(r.word)}</span>` },
    { t: "ކުށުގެ ވައްތަރު", html: r => `<span class="${r.type}">${esc(errLabel(r))}</span>` },
    { t: "ސޫރަތް : އާޔަތް", v: r => `${r.surahName || ""} ${r.ayah || ""}` }, { t: "ޞަފުޙާ / ފޮޅުވަތް", v: r => `${r.page || ""} / ${r.line || "-"}` },
    { t: "ކެނޑި", cls: "num", v: r => r.ded ? "-" + r.ded : "" }], errs) : "<p>ކުށެއް ފާހަގަ ނުކުރެ.</p>"}
  ${sc.note ? `<div class="box">ނޯޓު: ${esc(sc.note)}</div>` : ""}
  ${(sc.amendments || []).length ? `<div class="box"><b>އެމެންޑްމަންޓްތައް:</b><br>${sc.amendments.map(a => `${esc(fmtDateTime(a.at))} — ${esc(a.by)}: ${esc(a.note || "")} (${fmt2(a.oldTotal)} → ${fmt2(a.newTotal)})`).join("<br>")}</div>` : ""}
  <p>ސޭވް ކުރި ވަގުތު: ${esc(fmtDateTime(sc.savedAt))}</p>
  ${sigBlock(["ޖަޖުގެ ސޮއި", "ޗީފް ޖަޖު", "ތާރީޚް"])}</div>`;
}

// ------ full student rubric report (all judges)
export function fullReportHTML(res, scores, cat) {
  const rub = (cat && cat.rubric) || (scores[0] && scores[0].rubric) || [];
  const js = scores.slice().sort((a, b) => (a.judgeSlot || 0) - (b.judgeSlot || 0));
  return `<div class="page">
  <div class="meta"><div>ދަރިވަރު: <b>${esc(res.name)}</b></div><div>ރެޖި: <b>${esc(res.regNo || "")}</b> • އައިޑީ: <b>${esc(res.nid || "")}</b></div>
  <div>ބައި: ${esc(res.categoryName || "")}</div><div>ސެޝަން: ${esc(res.sessionName || "")} ${esc(res.sessionDate || "")}</div></div>
  <table><thead><tr><th>ބައި</th><th class="num">މެކްސް</th>${js.map(s => `<th class="num">ޖަޖު ${esc(s.judgeSlot)}</th>`).join("")}<th class="num">އެވަރެޖު</th></tr></thead><tbody>
  ${rub.map(r => `<tr><td>${esc(r.name)}</td><td class="num">${r.max}</td>${js.map(s => `<td class="num">${fmt2((s.criteria || {})[r.key])}</td>`).join("")}<td class="num"><b>${fmt2((res.criteriaAvg || {})[r.key])}</b></td></tr>`).join("")}
  <tr><th>ޖުމްލަ</th><th class="num">${rub.reduce((a, r) => a + (+r.max || 0), 0)}</th>${js.map(s => `<th class="num">${fmt2(s.total)}</th>`).join("")}<th class="num big">${fmt2(res.final)}</th></tr>
  </tbody></table>
  <p class="big">ފައިނަލް: ${fmt2(res.final)} &nbsp; <span class="stars">${"★".repeat(res.stars || 0)}${"☆".repeat(5 - (res.stars || 0))}</span></p>
  ${js.map(s => `<h3>ޖަޖު ${esc(s.judgeSlot)} — ${esc(s.judgeName)} (${(s.errors || []).length} ކުށް)</h3>
    ${(s.errors || []).length ? tableHTML([{ t: "ސުވާލު", cls: "num", v: r => (r.qIndex ?? 0) + 1 }, { t: "ކަލިމަ", html: r => `<span class="q ${r.type}">${esc(r.word)}</span>` },
      { t: "ކުށް", html: r => `<span class="${r.type}">${esc(errLabel(r))}</span>` }, { t: "ސޫރަތް/އާޔަތް", v: r => `${r.surahName || ""} ${r.ayah || ""}` },
      { t: "ޞަފުޙާ/ފޮޅުވަތް", v: r => `${r.page || ""}/${r.line || "-"}` }], s.errors) : "<p>ކުށެއް ނެތް</p>"}`).join("")}
  ${sigBlock(["ޗީފް ޖަޖު", "ސުޕަވައިޒަރ", "ތާރީޚް"])}</div>`;
}

// ------ ranked results
export function resultsHTML(rows, sigN = 3) {
  return tableHTML([
    { t: "ޤަދަރު", cls: "num", v: r => r.rank || "" }, { t: "ފޮޓޯ", cls: "num", html: r => r.photoThumb ? `<img class="ph" src="${r.photoThumb}">` : "" },
    { t: "ނަން", v: r => r.name }, { t: "ރެޖި", v: r => r.regNo || "" }, { t: "އައިޑީ", v: r => r.nid || "" },
    { t: "ބައި", v: r => r.categoryName || "" }, { t: "މުއައްސަސާ", v: r => r.institution || "" },
    { t: "މާކްސް", cls: "num", html: r => `<b>${fmt2(r.final)}</b>` },
    { t: "ތަރި", cls: "num", html: r => `<span class="stars">${"★".repeat(r.stars || 0)}</span>` }], rows)
    + sigBlock(Array.from({ length: sigN }, (_, i) => i === 0 ? "ޗީފް ޖަޖު" : i === sigN - 1 ? "ސުޕަވައިޒަރ" : "ޖަޖު " + i));
}
export { ageGroupName, genderName, instTypeName, fmtDate, starsFor };
