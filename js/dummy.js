// ============================================================
//  RASFAHI — sample (dummy) data for testing the whole system
//  • download: 2000 students with full details, with or without 5 judges' marks (CSV, opens in Excel)
//  • template: empty import sheet (for Google Forms / Excel lists)
//  • load: put sample students (and optionally sessions, marks, results) into Firestore
//  • clean: remove everything that was loaded as sample data (dummy == true)
// ============================================================
import {
  S, db, doc, getDocs, collection, query, where, writeBatch, serverTimestamp,
  loadCategories, loadSessions, cache, starsFor, round
} from "./core.js";
import { KHAFI_GROUPS, JALI_TYPES } from "./tajweed.js";

// realistic mistakes for the sample sheets (so the report has something to show)
const KHAFI_WEIGHT = { madd: 25, ghunna: 15, sifat: 12, makhraj: 12, nun: 10, waqf: 8, haraka: 8, tafkhim: 5, mim: 3, idgham: 1, hamz: 1 };
const JUZ_FIRST_SURAH = [1, 2, 2, 2, 3, 4, 4, 5, 6, 7, 8, 9, 11, 12, 15, 17, 21, 23, 25, 27, 29, 33, 36, 39, 41, 46, 51, 58, 67, 78];
function pickWeighted(r) {
  const groups = KHAFI_GROUPS.filter(g => KHAFI_WEIGHT[g.key]);
  const tot = groups.reduce((a, g) => a + KHAFI_WEIGHT[g.key], 0);
  let x = r() * tot;
  for (const g of groups) { x -= KHAFI_WEIGHT[g.key]; if (x <= 0) return g; }
  return groups[0];
}
function sampleErrors(r, skill, qn) {
  const n = Math.max(0, Math.round((1 - skill) * 22 * (0.6 + r() * 0.8)));
  const out = [];
  for (let i = 0; i < n; i++) {
    const qIndex = Math.floor(r() * qn);
    if (r() < 0.22) { const t = JALI_TYPES[Math.floor(r() * JALI_TYPES.length)];
      out.push({ type: "jali", crit: "thilawa", ded: 1, sub: t.key, subDv: t.dv, subAr: t.ar, groupDv: "", qIndex }); }
    else { const g = pickWeighted(r), it = g.items[Math.floor(r() * g.items.length)];
      out.push({ type: "khafi", group: g.key, groupDv: g.dv, sub: it[0], subAr: it[1], subDv: it[2], crit: g.crit, ded: 0.5, qIndex }); }
  }
  return out;
}
function sampleQuestions(r, cat) {
  const syl = cat.syllabus || { type: "juz", from: 30, to: 30 };
  const a = syl.type === "juz" ? +syl.from || 30 : 30, b = syl.type === "juz" ? +syl.to || a : 30;
  return Array.from({ length: Math.max(1, cat.qCount || 2) }, () => {
    const juz = a + Math.floor(r() * (b - a + 1));
    const surah = juz === 30 ? 78 + Math.floor(r() * 37) : JUZ_FIRST_SURAH[juz - 1];
    return { juz, surah, ayahFrom: 1 + Math.floor(r() * 20), ayahTo: 0, page: 0 };
  });
}

// ---------- sample names & places (Dhivehi + English) ----------
const M_FIRST = [["ޢަލީ","Ali"],["އަޙްމަދު","Ahmed"],["މުޙައްމަދު","Mohamed"],["އިބްރާހީމް","Ibrahim"],["ޔޫސުފް","Yoosuf"],
  ["ޙަސަން","Hassan"],["ޢަބްދުﷲ","Abdulla"],["ޢުމަރު","Umar"],["މޫސާ","Moosa"],["ޢީސާ","Eesa"],["ހާރޫން","Haaroon"],
  ["ޞާލިޙް","Saalih"],["ޔަޙްޔާ","Yahya"],["އާދަމް","Adam"],["ޒަކަރިއްޔާ","Zakariyya"],["އަޔާން","Ayaan"],["އިޝާން","Ishan"],
  ["ޒައިދު","Zaid"],["ނާޝިދު","Nashid"],["ރައްޔާން","Rayyan"]];
const F_FIRST = [["ފާޠިމަތު","Fathimath"],["ޢާއިޝަތު","Aishath"],["ޚަދީޖާ","Khadeeja"],["މަރްޔަމް","Mariyam"],["ޒައިނަބު","Zainab"],
  ["އާމިނަތު","Aminath"],["ހާޖަރާ","Haajara"],["ރުޤައްޔާ","Rugiyya"],["ހައުވާ","Hawwa"],["ނަފީސާ","Nafeesa"],["ޝަހުޒާ","Shahuza"],
  ["އާމާ","Aama"],["ޔުސްރާ","Yusra"],["ޙަފްޞާ","Hafsa"],["ލީނާ","Leena"],["މަޔާ","Maya"],["ޒާރާ","Zaara"],["ސާރާ","Saara"],
  ["އައިހާ","Aiha"],["ޝިފާ","Shifa"]];
const LAST = [["އަޙްމަދު","Ahmed"],["ޢަލީ","Ali"],["މުޙައްމަދު","Mohamed"],["ޙަސަން","Hassan"],["އިބްރާހީމް","Ibrahim"],
  ["ޝާފިޢު","Shaafiu"],["ރަޝީދު","Rasheed"],["ނާޞިރު","Naasir"],["ވަޙީދު","Waheed"],["ލަޠީފް","Latheef"],["ސަޢީދު","Saeed"],
  ["ފަރީދު","Fareed"],["ޝަރީފް","Shareef"],["ޖަމީލް","Jameel"],["ޙަލީމް","Haleem"],["ޢަބްދުﷲ","Abdulla"],["މޫސާ","Moosa"]];
const ISLANDS = [["މާލެ","Male'"],["ހުޅުމާލެ","Hulhumale'"],["ސ. ހިތަދޫ","S. Hithadhoo"],["ގން. ފުވައްމުލައް","Gn. Fuvahmulah"],
  ["ހދ. ކުޅުދުއްފުށި","HDh. Kulhudhuffushi"],["ލ. ގަން","L. Gan"],["ބ. އޭދަފުށި","B. Eydhafushi"],["ރ. އުނގޫފާރު","R. Ungoofaaru"],
  ["ދ. ކުޑަހުވަދޫ","Dh. Kudahuvadhoo"],["ށ. ފުނަދޫ","Sh. Funadhoo"],["ނ. ވެލިދޫ","N. Velidhoo"],["ގދ. ތިނަދޫ","GDh. Thinadhoo"],
  ["އދ. މަހިބަދޫ","ADh. Mahibadhoo"],["ކ. ކާށިދޫ","K. Kaashidhoo"],["ހއ. ދިއްދޫ","HA. Dhidhdhoo"]];
const HOUSES = ["ނޫރާނީވިލާ","ގުލްފާމްގެ","ސޯސަންގެ","ފިނިފެންމާގެ","ބަހާރުގެ","ރަންމަލިގެ","ހިރިލިލީގެ","ނިޔަމާގެ","ސީބްރީޒް","ފެހިވިލާ",
  "ދިލްބަހާރުގެ","ގުލިސްތާން","އަސުރުމާގެ","ވައިމަތީގެ","މާފަތިގެ"];
const INSTITUTIONS = {
  School: ["މަޖީދިއްޔާ ސްކޫލް","އަމީނިއްޔާ ސްކޫލް","ޖަމާލުއްދީން ސްކޫލް","ހިރިޔާ ސްކޫލް","އިސްކަންދަރު ސްކޫލް","ޣިޔާޘުއްދީން ސްކޫލް","ތާޖުއްދީން ސްކޫލް","އަރަބިއްޔާ ސްކޫލް"],
  University: ["އިސްލާމިކް ޔުނިވަރސިޓީ އޮފް މޯލްޑިވްސް","މޯލްޑިވްސް ނޭޝަނަލް ޔުނިވަރސިޓީ","ވިލާ ކޮލެޖް"],
  QuranClass: ["ދާރުލް ޤުރްއާން","ޤުރްއާން ކްލާސް — ހެނވޭރު"],
  Club: ["ޖަމްޢިއްޔަތުލް ޤުރްއާން","ދީނީ ޖަމްޢިއްޔާ"],
  Office: ["އިސްލާމިކް މިނިސްޓްރީ"],
  Private: ["އަމިއްލަ ގޮތުން"]
};
const INST_CYCLE = ["School","School","School","University","QuranClass","Club","Private","School","Office","School"];
const JUDGES = [["ޖަޖު 1 — ޝައިޚް އަޙްމަދު ޝާފިޢު","judge1"],["ޖަޖު 2 — ޝައިޚް މުޙައްމަދު ރަޝީދު","judge2"],
  ["ޖަޖު 3 — ޝައިޚް އިބްރާހީމް ނާޞިރު","judge3"],["ޖަޖު 4 — ޝައިޚާ ފާޠިމަތު ސަޢީދު","judge4"],["ޖަޖު 5 — ޝައިޚް ޔޫސުފް ވަޙީދު","judge5"]];

// the marking categories the user asked for (used when a competition has no categories yet)
export const SAMPLE_RUBRIC = [
  { key: "qiraa",    name: "ކިޔެވުން",       max: 30 },
  { key: "tajweed",  name: "ތަޖްވީދު",        max: 25 },
  { key: "sawt",     name: "އަޑާއި ރާގު",     max: 15 },
  { key: "adaa",     name: "އަލްއަދާއު",      max: 10 },
  { key: "talaffuz", name: "އައްތަލައްފުޡު",  max: 10 },
  { key: "fasaha",   name: "ފަޞާޙަތް",       max: 10 }
];
const SAMPLE_CATS = [
  ["ބަލައިގެން — 9 އަހަރުން ދަށް",  "mushaf", "U9",  { type: "juz", from: 30, to: 30 }],
  ["ނުބަލައި — 9 އަހަރުން ދަށް",    "hifz",   "U9",  { type: "juz", from: 30, to: 30 }],
  ["ބަލައިގެން — 13 އަހަރުން ދަށް", "mushaf", "U13", { type: "juz", from: 28, to: 30 }],
  ["ނުބަލައި — 13 އަހަރުން ދަށް",   "hifz",   "U13", { type: "juz", from: 29, to: 30 }],
  ["ބަލައިގެން — 16 އަހަރުން ދަށް", "mushaf", "U16", { type: "juz", from: 21, to: 30 }],
  ["ނުބަލައި — 16 އަހަރުން ދަށް",   "hifz",   "U16", { type: "juz", from: 26, to: 30 }],
  ["ބަލައިގެން — ޢާއްމު",           "mushaf", "GEN", { type: "juz", from: 1,  to: 30 }],
  ["މުޅި ޤުރްއާން — ނުބަލައި",       "hifz",   "GEN", { type: "juz", from: 1,  to: 30 }]
];
const AGE_YEARS = { U6: 5, U9: 8, U11: 10, U13: 12, U16: 15, U19: 18, U21: 20, GEN: 26, SN: 14 };

// deterministic pseudo-random, so the same file is produced every time
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const pick = (arr, r) => arr[Math.floor(r() * arr.length)];

function sampleCategories() {
  return SAMPLE_CATS.map(([name, branch, ageGroup, syllabus], i) => ({
    id: "dummycat_" + (i + 1), name, branch, ageGroup, gender: "", order: i + 1, syllabus,
    qCount: 3, minLines: 3, maxLines: 7, gridSize: 20, rubric: SAMPLE_RUBRIC.map(r => ({ ...r })),
    jaliDed: 1, khafiDed: 0.5, autoDeduct: true, hifzHintWords: 3, deductSteps: [0.25, 0.5, 1], openForRegistration: true
  }));
}

// the competition's own categories, plus sample ones for any branch it lacks,
// so a test always covers both ބަލައިގެން (mushaf) and ނުބަލައި (hifz)
function withBothBranches(real) {
  const sample = sampleCategories();
  if (!real.length) return sample;
  const out = [...real];
  ["mushaf", "hifz"].forEach(b => { if (!real.some(c => c.branch === b)) out.push(...sample.filter(c => c.branch === b)); });
  return out;
}

// ---------- build N students (+ optional marks) ----------
export function buildStudents(count, cats, withMarks, rubOverride) {
  const r = rng(20261101);
  const year = new Date().getFullYear();
  const out = [];
  for (let i = 0; i < count; i++) {
    const cat = cats[i % cats.length];
    const female = r() < 0.45;
    const [fDv, fEn] = pick(female ? F_FIRST : M_FIRST, r), [lDv, lEn] = pick(LAST, r);
    const [isDv, isEn] = pick(ISLANDS, r), [cuDv] = pick(ISLANDS, r);
    const instType = INST_CYCLE[i % INST_CYCLE.length];
    const age = (AGE_YEARS[cat.ageGroup] || 14) - Math.floor(r() * 3);
    const dob = `${year - age}-${String(1 + Math.floor(r() * 12)).padStart(2, "0")}-${String(1 + Math.floor(r() * 28)).padStart(2, "0")}`;
    const n = i + 1;
    const s = {
      regNo: `D${String(year).slice(-2)}-${String(n).padStart(4, "0")}`,
      nid: "A" + String(300000 + n),
      name: `${fDv} ${lDv}`, nameEn: `${fEn} ${lEn}`, dob, gender: female ? "F" : "M",
      permAddress: `${pick(HOUSES, r)}، ${isDv}`, island: isDv, currentAddress: `${pick(HOUSES, r)}، ${cuDv}`,
      phone: String(7000000 + ((n * 7919) % 2999999)), email: `${fEn.toLowerCase()}.${lEn.toLowerCase()}${n}@example.mv`,
      categoryId: cat.id, categoryName: cat.name, branch: cat.branch, ageGroup: cat.ageGroup,
      institution: pick(INSTITUTIONS[instType], r), instType,
      guardianName: `${pick(M_FIRST, r)[0]} ${lDv}`, guardianPhone: String(9000000 + ((n * 6151) % 999999))
    };
    if (withMarks) {
      const rub = rubOverride || (cat.rubric && cat.rubric.length ? cat.rubric : SAMPLE_RUBRIC);
      // how good this reciter is (small differences by gender / age / branch so the report shows something)
      const skill = Math.min(0.98, 0.62 + r() * 0.32 + (female ? 0.015 : 0) + (["U16", "U19", "U21", "GEN"].includes(cat.ageGroup) ? 0.02 : 0) - (cat.branch === "hifz" ? 0.02 : 0));
      s.questions = sampleQuestions(r, cat);
      const base = sampleErrors(r, skill, s.questions.length);
      s.judges = JUDGES.map(([jName], j) => {
        const errors = base.filter(() => r() < 0.8).concat(r() < 0.3 ? sampleErrors(r, 0.95, s.questions.length).slice(0, 1) : []);
        const criteria = {};
        rub.forEach(k => { const v = Math.min(1, Math.max(0.3, skill + (r() - 0.5) * 0.12)); criteria[k.key] = Math.round(k.max * v * 4) / 4; });
        const total = round(Object.values(criteria).reduce((a, b) => a + b, 0), 2);
        return { slot: j + 1, name: jName, criteria, total, errors };
      });
      const t = s.judges.map(j => j.total).sort((a, b) => a - b);
      const use = S.settings.scoring.method === "trimmed" && t.length >= 5 ? t.slice(1, -1) : t;
      s.final = round(use.reduce((a, b) => a + b, 0) / use.length, S.settings.scoring.decimals ?? 2);
      s.stars = starsFor(s.final);
    }
    out.push(s);
  }
  // rank inside each category
  if (withMarks) {
    const byCat = {};
    out.forEach(s => (byCat[s.categoryId] = byCat[s.categoryId] || []).push(s));
    Object.values(byCat).forEach(list => {
      list.sort((a, b) => b.final - a.final);
      let prev = null, rank = 0;
      list.forEach((s, i) => { if (s.final !== prev) rank = i + 1; prev = s.final; s.rank = rank; });
    });
  }
  return out;
}

// ---------- CSV helpers ----------
const csvCell = (v) => { const t = String(v ?? ""); return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
function saveCSV(name, rows) {
  const text = "\uFEFF" + rows.map(r => r.map(csvCell).join(",")).join("\r\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
// Excel (.xlsx) download. Formula cells are given as { f, v } so the file opens with values
// already shown and Excel keeps recalculating them when marks are typed in.
const SHEETJS = "https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs";
async function saveXLSX(name, rows, opts = {}) {
  let XLSX;
  try { XLSX = await import(SHEETJS); }
  catch (e) { saveCSV(name.replace(/\.xlsx$/, ".csv"), rows.map(r => r.map(c => (c && typeof c === "object" ? "=" + c.f : c)))); return "csv"; }
  const aoa = rows.map(r => r.map(c => {
    if (c && typeof c === "object") return c.v === "" || c.v == null ? { t: "s", v: "", f: c.f } : { t: "n", v: c.v, f: c.f };
    return c;
  }));
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws["!cols"] = (opts.widths || []).map(w => ({ wch: w }));
  if (opts.headerRows) ws["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: opts.headerRows - 1, c: 0 }, e: { r: rows.length - 1, c: rows[0].length - 1 } }) };
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };               // right-to-left sheet for Dhivehi
  XLSX.utils.book_append_sheet(wb, ws, opts.sheet || "Students");
  if (opts.notes) { const ns = XLSX.utils.aoa_to_sheet(opts.notes); ns["!cols"] = [{ wch: 28 }, { wch: 90 }]; XLSX.utils.book_append_sheet(wb, ns, "Notes"); }
  XLSX.writeFile(wb, name, { compression: true });
  return "xlsx";
}
const colLetter = (n) => { let s = ""; n++; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };

// Student columns — the SAME column names the importer reads, so a filled file can be imported back.
export const STUDENT_COLS = [
  ["regNo", "ރެޖިސްޓްރޭޝަން ނަންބަރު"], ["nid", "އައިޑީ ކާޑު ނަންބަރު"], ["name", "ފުރިހަމަ ނަން"], ["nameEn", "ނަން (އިނގިރޭސިން)"],
  ["dob", "އުފަން ތާރީޚް (YYYY-MM-DD)"], ["gender", "ޖިންސު (M/F)"], ["permAddress", "ދާއިމީ އެޑްރެސް"], ["island", "އަތޮޅާއި ރަށް"],
  ["currentAddress", "މިހާރު އުޅޭ އެޑްރެސް"], ["phone", "ފޯނު"], ["email", "އީމެއިލް"], ["category", "ބައިވެރިވާ ބައި"],
  ["branch", "ގޮފި"], ["ageGroup", "ޢުމުރުފުރާ"], ["institution", "މުއައްސަސާ"], ["instType", "މުއައްސަސާގެ ވައްތަރު"],
  ["guardianName", "ބެލެނިވެރިޔާ"], ["guardianPhone", "ބެލެނިވެރިޔާގެ ފޯނު"]
];
const branchName = (b) => (b === "hifz" ? "ނުބަލައި" : "ބަލައިގެން");
const studentCells = (s) => [s.regNo, s.nid, s.name, s.nameEn, s.dob, s.gender, s.permAddress, s.island, s.currentAddress,
  s.phone, s.email, s.categoryName, branchName(s.branch), s.ageGroup, s.institution, s.instType, s.guardianName, s.guardianPhone];

// Sample list download. withMarks=false leaves the marks empty but keeps Excel formulas,
// so typing marks into the sheet immediately shows how totals, final score and stars are worked out.
export async function downloadSampleList(withMarks, count = 2000) {
  const cats = withBothBranches(await loadCategories());
  const rub = cats[0].rubric && cats[0].rubric.length ? cats[0].rubric : SAMPLE_RUBRIC;
  // one rubric layout per file: if categories use different rubrics, use the default sample rubric columns
  const sameRub = cats.every(c => JSON.stringify((c.rubric || []).map(r => r.key)) === JSON.stringify(rub.map(r => r.key)));
  const R = sameRub ? rub : SAMPLE_RUBRIC;
  const list = buildStudents(count, cats, true, sameRub ? null : R);
  const head1 = STUDENT_COLS.map(c => c[0]), head2 = STUDENT_COLS.map(c => c[1]);
  const base = head1.length;
  JUDGES.forEach((_, j) => {
    R.forEach(k => { head1.push(`j${j + 1}_${k.key}`); head2.push(`ޖަޖު ${j + 1} — ${k.name} (${k.max})`); });
    head1.push(`j${j + 1}_total`); head2.push(`ޖަޖު ${j + 1} — ޖުމްލަ`);
  });
  head1.push("final", "stars", "rank"); head2.push("ފައިނަލް މާކްސް", "ތަރި", "ވަނަ");
  const per = R.length + 1;
  const trimmed = S.settings.scoring.method === "trimmed";
  const th = S.settings.stars && S.settings.stars.length === 5 ? S.settings.stars : [75, 80, 85, 90, 95];
  const rows = [head1, head2];
  list.forEach((s, i) => {
    const excelRow = i + 3;                                   // two header rows
    const cells = studentCells(s);
    const totRefs = [];
    JUDGES.forEach((_, j) => {
      const start = base + j * per;
      const jd = (s.judges || [])[j];
      R.forEach(k => cells.push(withMarks && jd ? (jd.criteria[k.key] ?? "") : ""));
      const a = colLetter(start) + excelRow, b = colLetter(start + R.length - 1) + excelRow;
      cells.push({ f: `IF(COUNT(${a}:${b})=0,"",SUM(${a}:${b}))`, v: withMarks && jd ? jd.total : "" });
      totRefs.push(colLetter(start + R.length) + excelRow);
    });
    const tr = totRefs.join(",");
    const fin = { f: trimmed
      ? `IF(COUNT(${tr})=0,"",IF(COUNT(${tr})>=5,ROUND((SUM(${tr})-MAX(${tr})-MIN(${tr}))/(COUNT(${tr})-2),2),ROUND(AVERAGE(${tr}),2)))`
      : `IF(COUNT(${tr})=0,"",ROUND(AVERAGE(${tr}),2))`, v: withMarks ? s.final : "" };
    const F = colLetter(base + JUDGES.length * per) + excelRow;
    cells.push(fin, { f: `IF(${F}="","",IF(${F}>=${th[4]},5,IF(${F}>=${th[3]},4,IF(${F}>=${th[2]},3,IF(${F}>=${th[1]},2,IF(${F}>=${th[0]},1,0))))))`, v: withMarks ? s.stars : "" },
      withMarks ? s.rank : "");
    rows.push(cells);
  });
  const widths = [11, 11, 24, 22, 13, 8, 30, 20, 30, 11, 30, 30, 12, 10, 34, 12, 24, 13, ...Array(JUDGES.length * per).fill(9), 11, 7, 7];
  const notes = [
    ["RASFAHI", withMarks ? "ނަމޫނާ ލިސްޓު — 5 ޖަޖުންގެ މާކްސް އާއެކު" : "ނަމޫނާ ލިސްޓު — މާކްސް ހުސްކޮށް"],
    ["ދަރިވަރުން", String(list.length)],
    ["މާކްސް ދޭ ބައިތައް", R.map(k => `${k.name} (${k.max})`).join("، ")],
    ["ފައިނަލް", trimmed ? "5 ޖަޖުން ނުވަތަ އެއަށްވުރެ ގިނަނަމަ އެންމެ މަތީ އަދި އެންމެ ދަށު މާކްސް ދޫކޮށް އެވަރެޖު" : "ހުރިހާ ޖަޖުންގެ އެވަރެޖު"],
    ["ތަރި", `1★ ${th[0]}+ • 2★ ${th[1]}+ • 3★ ${th[2]}+ • 4★ ${th[3]}+ • 5★ ${th[4]}+`],
    ["ބޭނުންކުރާ ގޮތް", withMarks ? "ނަތީޖާ ހެދޭ ގޮތް ބަލާލުމަށް. ޖުމްލަ، ފައިނަލް އަދި ތަރި ހިސާބުކުރަނީ ފޯމިއުލާއިން." : "ޖަޖުންގެ ގޮޅިތަކުގައި މާކްސް ލިޔުއްވުމުން ޖުމްލަ، ފައިނަލް އަދި ތަރި ފެންނާނެ."],
    ["ސޮފްޓްވެއަރަށް ވެއްދުން", "މި ފައިލު 'ދަރިވަރުން' ޓެބުގެ '📥 ފައިލު ހޮވާ' އިން ވެއްދެވޭނެ (ދަރިވަރުންގެ މަޢުލޫމާތު)."]
  ];
  await saveXLSX(withMarks ? `rasfahi_sample_${count}_with_marks.xlsx` : `rasfahi_sample_${count}_marks_empty.xlsx`, rows,
    { widths, headerRows: 2, sheet: "Students", notes });
  return list.length;
}

// Empty sheet for Google Forms / Excel lists (only the student columns + one example row)
export async function downloadImportTemplate() {
  await saveXLSX("rasfahi_students_import_template.xlsx", [
    STUDENT_COLS.map(c => c[0]), STUDENT_COLS.map(c => c[1]),
    ["", "A123456", "ޢަލީ އަޙްމަދު", "Ali Ahmed", "2012-05-14", "M", "ނޫރާނީވިލާ، ގން. ފުވައްމުލައް", "ގން. ފުވައްމުލައް",
      "ބަހާރުގެ، މާލެ", "7771234", "ali@example.mv", "ބަލައިގެން — 13 އަހަރުން ދަށް", "ބަލައިގެން", "U13",
      "މަޖީދިއްޔާ ސްކޫލް", "School", "އަޙްމަދު ޢަލީ", "9771234"]
  ], { widths: [11, 11, 24, 22, 13, 8, 30, 20, 30, 11, 30, 30, 12, 10, 34, 12, 24, 13], sheet: "Students",
    notes: [["ކޮލަމްތައް", "ފުރަތަމަ ދެ ލައިން ނުފޮހެލާ. ތިންވަނަ ލައިނުން ފެށިގެން ކޮންމެ ދަރިވަރަކަށް އެއް ލައިން."],
      ["category", "ސޮފްޓްވެއަރުގައި ހުރި ބައިގެ ނަން ހަމަ އެގޮތަށް ލިޔުއްވާ."],
      ["gender", "M = ފިރިހެން، F = އަންހެން"], ["dob", "YYYY-MM-DD (މިސާލު 2012-05-14)"],
      ["instType", "School / University / QuranClass / Club / Office / Private"]] });
}

// ---------- load sample data into Firestore ----------
async function commitAll(ops, onProgress) {
  let done = 0;
  for (let i = 0; i < ops.length; i += 400) {
    const b = writeBatch(db);
    ops.slice(i, i + 400).forEach(([ref, data]) => b.set(ref, data));
    await b.commit();
    done = Math.min(ops.length, i + 400);
    onProgress && onProgress(done, ops.length);
  }
}

export async function loadSampleIntoFirestore({ count = 300, withMarks = false, onProgress } = {}) {
  const cid = S.settings.activeCompetitionId;
  if (!cid) throw new Error("ފުރަތަމަ ސެޓިންގްސް އިން ހިނގަމުންދާ މުބާރާތެއް ހޮއްވަވާ");
  const report = { categories: 0, sessions: 0, students: 0, scores: 0, results: 0, scoreError: "" };

  // 1) categories — use the competition's own; create the 8 sample ones if there are none
  const real = await loadCategories(true);
  const merged = withBothBranches(real);
  const added = merged.filter(c => !real.includes(c));        // sample categories this competition was missing
  if (added.length) {
    await commitAll(added.map(({ id, ...c }) => [doc(db, "categories", `${cid}__${id}`), { ...c, competitionId: cid, dummy: true, updatedAt: serverTimestamp() }]));
    report.categories = added.length; cache.categories = null;
  }
  const cats = merged.map(c => (real.includes(c) ? c : { ...c, id: `${cid}__${c.id}` }));

  // 2) judges & chief — real users if they exist (so they can log in and mark), otherwise placeholders
  const users = (await getDocs(collection(db, "users"))).docs.map(d => ({ email: d.id, ...d.data() })).filter(u => u.active);
  const realJudges = users.filter(u => u.role === "judge").slice(0, 5);
  const judges = JUDGES.map(([name, key], i) => realJudges[i]
    ? { slot: i + 1, email: realJudges[i].email, name: realJudges[i].name || name }
    : { slot: i + 1, email: `${key}@example.mv`, name });
  const chief = users.find(u => u.role === "chief");
  const chiefEmail = chief ? chief.email : "", chiefName = chief ? chief.name : "";

  // 3) students + one session per category
  const list = buildStudents(count, cats, withMarks);
  const today = new Date();
  const sessions = cats.map((c, i) => {
    const d = new Date(today.getTime() + i * 86400000).toISOString().slice(0, 10);
    return { id: `${cid}__dummyses_${i + 1}`, competitionId: cid, name: `ނަމޫނާ ސެޝަން ${i + 1} — ${c.name}`, date: d,
      time: "09:00", venue: `ހޯލް ${i + 1}`, categoryIds: [c.id], chiefEmail, chiefName, judges, judgeEmails: judges.map(j => j.email),
      status: withMarks ? "closed" : "planned", order: [], dummy: true, createdAt: serverTimestamp() };
  });
  const sesByCat = Object.fromEntries(sessions.map((s, i) => [cats[i].id, s]));
  const stOps = [], scOps = [], rsOps = [];
  list.forEach((s) => {
    const id = `${cid}__${s.nid}`;
    const ses = sesByCat[s.categoryId];
    ses.order.push(id);
    const { judges: jm, final, stars, rank, questions, ...info } = s;
    stOps.push([doc(db, "students", id), { ...info, competitionId: cid, status: "active", sessionId: ses.id, order: ses.order.length,
      checkin: withMarks ? { at: new Date().toISOString(), by: S.me.email } : null, photoThumb: "", dummy: true, createdAt: serverTimestamp() }]);
    if (withMarks) {
      const cat = cats.find(c => c.id === s.categoryId) || {};
      const rub = cat.rubric && cat.rubric.length ? cat.rubric : SAMPLE_RUBRIC;
      jm.forEach((j, k) => {
        const jd = judges[k];
        scOps.push([doc(db, "scores", `${ses.id}__${id}__${jd.email}`), {
          competitionId: cid, sessionId: ses.id, sessionName: ses.name, sessionDate: ses.date, studentId: id, studentName: s.name,
          regNo: s.regNo, nid: s.nid, categoryId: s.categoryId, categoryName: s.categoryName, judgeEmail: jd.email, judgeName: jd.name,
          judgeSlot: jd.slot, chiefEmail, criteria: j.criteria, rubric: rub, total: j.total, errors: j.errors || [], questions: s.questions || [], note: "",
          locked: true, amendments: [], savedAt: new Date().toISOString(), dummy: true, createdAt: serverTimestamp() }]);
      });
      const criteriaAvg = {};
      rub.forEach(r => criteriaAvg[r.key] = round(jm.reduce((a, j) => a + (+j.criteria[r.key] || 0), 0) / jm.length, 2));
      rsOps.push([doc(db, "results", `${ses.id}__${id}`), {
        competitionId: cid, sessionId: ses.id, sessionName: ses.name, sessionDate: ses.date, chiefEmail, studentId: id,
        nid: s.nid, regNo: s.regNo, name: s.name, nameEn: s.nameEn, photoThumb: "", institution: s.institution, gender: s.gender,
        ageGroup: s.ageGroup, island: s.island, categoryId: s.categoryId, categoryName: s.categoryName,
        judges: jm.map((j, k) => ({ slot: judges[k].slot, name: judges[k].name, email: judges[k].email, total: j.total, criteria: j.criteria,
          jali: (j.errors || []).filter(e => e.type === "jali").length, khafi: (j.errors || []).filter(e => e.type === "khafi").length })),
        criteriaAvg, final, stars, method: S.settings.scoring.method, rubric: rub, published: true, dummy: true,
        finalizedBy: S.me.email, finalizedAt: serverTimestamp() }]);
    }
  });

  const all = stOps.length + sessions.length + scOps.length + rsOps.length;
  let base = 0;
  const prog = (d) => onProgress && onProgress(base + d, all);
  await commitAll(sessions.map(s => [doc(db, "sessions", s.id), (({ id, ...x }) => x)(s)]), prog); base += sessions.length; report.sessions = sessions.length;
  await commitAll(stOps, prog); base += stOps.length; report.students = stOps.length;
  if (withMarks) {
    await commitAll(rsOps, prog); base += rsOps.length; report.results = rsOps.length;
    try { await commitAll(scOps, prog); report.scores = scOps.length; }
    catch (e) { report.scoreError = e.code || e.message; }   // older rules: only judges may create score sheets
  }
  cache.sessions = null; cache.categories = null;
  await loadSessions(true);
  return report;
}

// ---------- remove all sample data ----------
export async function removeSampleData(onProgress) {
  const cid = S.settings.activeCompetitionId;
  if (!cid) throw new Error("ހިނގަމުންދާ މުބާރާތެއް ނެތް");
  let removed = 0;
  for (const col of ["scores", "results", "students", "sessions", "categories"]) {
    const snap = await getDocs(query(collection(db, col), where("competitionId", "==", cid), where("dummy", "==", true)));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const b = writeBatch(db);
      snap.docs.slice(i, i + 400).forEach(d => b.delete(d.ref));
      await b.commit();
    }
    removed += snap.docs.length;
    onProgress && onProgress(col, snap.docs.length);
  }
  cache.sessions = null; cache.categories = null;
  return removed;
}
