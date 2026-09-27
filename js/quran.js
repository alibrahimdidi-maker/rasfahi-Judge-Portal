// ============================================================
//  RASFAHI — Quran engine
//  • KFGQPC Madinah Mushaf text + exact page/line layout (604 pages × 15 lines)
//  • Tanzil Uthmani text (tanzil.net) as a selectable text source
//  • Question generator: whole āyāt, one sūrah, never crossing a page,
//    line-count limits, and no repeated start/end within a rolling window.
// ============================================================
export const Q = { hafs: null, tanzil: null, N: 0, lineSlots: null, tanzilWords: null };
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩";
export const arNum = (n) => String(n).replace(/\d/g, d => AR_DIGITS[d]);
export const BASMALA = "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ";
const VER = "v1";

async function fetchJSON(url) {
  const r = await fetch(url, { cache: "force-cache" });
  if (!r.ok) throw new Error("load " + url);
  return r.json();
}

export async function loadQuran(opts = {}) {
  if (!Q.hafs) {
    Q.hafs = await fetchJSON("data/quran-hafs.json?" + VER);
    Q.N = Q.hafs.words.length;
    buildLineSlots();
  }
  if (opts.tanzil && !Q.tanzil) {
    Q.tanzil = await fetchJSON("data/tanzil-uthmani.json?" + VER);
    const firsts = new Set(Q.hafs.surahs.filter(x => x.n !== 1 && x.n !== 9).map(x => x.a));
    Q.tanzilWords = Q.tanzil.ayahs.map((t, k) => {
      const w = splitTanzil(t);
      return firsts.has(k) && w.length > 4 && /^بِسْمِ/.test(w[0]) ? w.slice(4) : w;
    });
  }
  return Q;
}

// Tanzil puts waqf signs as separate space-delimited tokens — attach them to the previous word
function splitTanzil(text) {
  const raw = text.split(/\s+/).filter(Boolean);
  const out = [];
  let pre = "";
  for (const t of raw) {
    if (/^[ۖ-ۜ۩۞]+$/.test(t)) {
      if (t === "۞") { pre = t + " "; continue; }
      if (out.length) out[out.length - 1] += t; else out.push(t);
    } else { out.push(pre + t); pre = ""; }
  }
  return out;
}

// ---------- binary search helpers ----------
function bs(arr, x) { // last index i with arr[i] <= x
  let lo = 0, hi = arr.length - 1, r = 0;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m] <= x) { r = m; lo = m + 1; } else hi = m - 1; }
  return r;
}
export const ayahOfWord = (w) => bs(Q.hafs.ayahStarts, w);          // global ayah index 0..6235
export const pageOfWord = (w) => bs(Q.hafs.pageStarts, w) + 1;       // 1..604
export const lineOfWord = (w) => bs(Q.hafs.lineStarts, w);           // global line index
export const juzOfWord = (w) => bs(Q.hafs.juzStarts, w) + 1;         // 1..30
export const surahOfAyah = (k) => bs(Q.hafs.surahs.map(s => s.a), k) + 1;
export const ayahStart = (k) => Q.hafs.ayahStarts[k];
export const ayahEnd = (k) => (k + 1 < Q.hafs.ayahStarts.length ? Q.hafs.ayahStarts[k + 1] : Q.N); // exclusive
export const ayahIndex = (s, a) => Q.hafs.surahs[s - 1].a + a - 1;
export const ayahNo = (k) => k - Q.hafs.surahs[surahOfAyah(k) - 1].a + 1;
export const ayahKey = (k) => `${surahOfAyah(k)}:${ayahNo(k)}`;
export const surahName = (s) => (Q.hafs.surahs[s - 1] || {}).ar || "";
export const pageStart = (p) => Q.hafs.pageStarts[p - 1];
export const pageEnd = (p) => (p < 604 ? Q.hafs.pageStarts[p] : Q.N);
export const lineEnd = (li) => (li + 1 < Q.hafs.lineStarts.length ? Q.hafs.lineStarts[li + 1] : Q.N);

// ---------- page layout: slot number (1..15) of every text line ----------
function buildLineSlots() {
  const H = Q.hafs, slots = new Int16Array(H.lineStarts.length);
  const surahAt = new Map(H.surahStarts.map((w, i) => [w, i + 1]));
  Q.pageLayout = [];
  for (let p = 1; p <= 604; p++) {
    const a = pageStart(p), b = pageEnd(p);
    const layout = [];
    for (let li = bs(H.lineStarts, a); li < H.lineStarts.length && H.lineStarts[li] < b; li++) {
      if (H.lineStarts[li] < a) continue;
      const s = surahAt.get(H.lineStarts[li]);
      if (s) {
        layout.push({ t: "h", s });
        if (s !== 1 && s !== 9) layout.push({ t: "b", s });
      }
      layout.push({ t: "l", li });
      slots[li] = layout.length;
    }
    Q.pageLayout[p] = layout;
  }
  Q.lineSlots = slots;
}
export const slotOfLine = (li) => Q.lineSlots[li];
export const pageSlotCount = (p) => (p <= 2 ? 8 : 15);

// ---------- syllabus -> ayah range(s) ----------
// syl: { type:'juz'|'surah'|'page', from, to }
export function syllabusAyahRange(syl) {
  const H = Q.hafs;
  const from = Number(syl.from) || 1, to = Number(syl.to) || from;
  if (syl.type === "surah") {
    const a = H.surahs[Math.min(from, to) - 1].a, lastS = H.surahs[Math.max(from, to) - 1];
    return [a, lastS.a + lastS.c - 1];
  }
  if (syl.type === "page") {
    return [ayahOfWord(pageStart(Math.min(from, to))), ayahOfWord(pageEnd(Math.max(from, to)) - 1)];
  }
  const j0 = Math.min(from, to), j1 = Math.max(from, to);
  const a = ayahOfWord(H.juzStarts[j0 - 1]);
  const b = j1 < 30 ? ayahOfWord(H.juzStarts[j1]) - 1 : 6235;
  return [a, b];
}
export function describeSyllabus(syl) {
  if (!syl) return "-";
  if (syl.type === "surah") return `ސޫރަތް: ${surahName(syl.from)} — ${surahName(syl.to)}`;
  if (syl.type === "page") return `ޞަފުޙާ ${syl.from} — ${syl.to}`;
  return `ފޮތް (ޖުޒު) ${syl.from} — ${syl.to}`;
}

// ---------- question candidates ----------
// Each candidate: whole āyāt, same sūrah, all words on ONE page, line count within [minL, maxL]
export function buildCandidates(syl, minL = 3, maxL = 7) {
  const [A0, A1] = syllabusAyahRange(syl);
  const out = [];
  const onOnePage = (k) => pageOfWord(ayahStart(k)) === pageOfWord(ayahEnd(k) - 1);
  for (let i = A0; i <= A1; i++) {
    if (!onOnePage(i)) continue;
    const s = surahOfAyah(i), p = pageOfWord(ayahStart(i));
    const l0 = lineOfWord(ayahStart(i));
    let chosen = -1;
    for (let j = i; j <= A1; j++) {
      if (surahOfAyah(j) !== s || !onOnePage(j) || pageOfWord(ayahStart(j)) !== p) break;
      const lines = lineOfWord(ayahEnd(j) - 1) - l0 + 1;
      if (lines > maxL) { if (j === i && lines <= maxL + 4) chosen = j; break; }
      if (lines >= minL) { chosen = j; break; }
    }
    if (chosen < 0) continue;
    const ws = ayahStart(i), we = ayahEnd(chosen);
    const li0 = lineOfWord(ws), li1 = lineOfWord(we - 1);
    out.push({
      id: `${ayahKey(i)}-${ayahKey(chosen)}`, surah: s, surahName: surahName(s),
      ayahFrom: ayahNo(i), ayahTo: ayahNo(chosen), page: p, juz: juzOfWord(ws),
      lineFrom: slotOfLine(li0), lineTo: slotOfLine(li1), lines: li1 - li0 + 1,
      wStart: ws, wEnd: we, startKey: ayahKey(i), endKey: ayahKey(chosen)
    });
  }
  return out;
}

// Grid generation with no repeated start/end keys from `recent` (array of {s,e})
export function makeGrid(cands, size, recent = []) {
  const usedS = new Set(recent.map(r => r.s)), usedE = new Set(recent.map(r => r.e));
  let pool = cands.filter(c => !usedS.has(c.startKey) && !usedE.has(c.endKey));
  let relaxed = false;
  if (pool.length < size) { relaxed = pool.length === 0; if (!pool.length) pool = cands.slice(); }
  const rnd = new Uint32Array(pool.length + 1);
  crypto.getRandomValues(rnd);
  const arr = pool.slice();
  for (let i = arr.length - 1; i > 0; i--) { const j = rnd[i] % (i + 1); [arr[i], arr[j]] = [arr[j], arr[i]]; }
  // avoid two boxes sharing a start or end, and prefer different pages
  const pick = [], s = new Set(), e = new Set(), pages = new Set();
  for (const pass of [true, false]) {
    for (const c of arr) {
      if (pick.length >= size) break;
      if (s.has(c.startKey) || e.has(c.endKey) || pick.includes(c)) continue;
      if (pass && pages.has(c.page)) continue;
      pick.push(c); s.add(c.startKey); e.add(c.endKey); pages.add(c.page);
    }
  }
  return { grid: pick.map((c, i) => ({ n: i + 1, q: slimQ(c) })), available: pool.length, relaxed };
}
export const slimQ = (c) => ({
  id: c.id, surah: c.surah, surahName: c.surahName, ayahFrom: c.ayahFrom, ayahTo: c.ayahTo, page: c.page,
  juz: c.juz, lineFrom: c.lineFrom, lineTo: c.lineTo, lines: c.lines, wStart: c.wStart, wEnd: c.wEnd,
  startKey: c.startKey, endKey: c.endKey
});

// ---------- rendering ----------
export function ayahMarkHTML(n) {
  return `<span class="am"><span class="orn">۝</span><span class="num">${arNum(n)}</span></span>`;
}
// Render a full Madinah page as 15 justified lines.
// opts: { range:[ws,we], clickable, dim, marks: {wordIdx: 'jali'|'khafi'}, source:'kfgqpc'|'tanzil', hideOutside }
function tanzilAt(k, j) {
  const tw = Q.tanzilWords[k] || [], m = ayahEnd(k) - ayahStart(k), n = tw.length;
  const out = [];
  if (n === m) { if (tw[j] != null) out.push([`t${k}_${j}`, tw[j]]); return out; }
  for (let i = 0; i < n; i++) if ((n > 1 ? Math.round(i * (m - 1) / (n - 1)) : m - 1) === j) out.push([`t${k}_${i}`, tw[i]]);
  return out;
}
// "ސޫރަތުލް ބަޤަރާ (2) • ފޮތް 1 • އާޔަތް 6 – 16" style information about a question
export function portion(q) {
  if (!q) return null;
  const s = Q.hafs.surahs[q.surah - 1] || {};
  return { surahNo: q.surah, surahAr: s.ar || q.surahName, juz: q.juz, page: q.page, from: q.ayahFrom, to: q.ayahTo, lineFrom: q.lineFrom, lineTo: q.lineTo };
}
export function renderPage(p, opts = {}) {
  const H = Q.hafs, layout = Q.pageLayout[p] || [];
  const [ws, we] = opts.range || [-1, -1];
  const marks = opts.marks || {};
  const tz = opts.source === "tanzil" && !!Q.tanzilWords;
  let html = `<div class="mushaf-page ${p <= 2 ? "p12" : ""}${tz ? " tz" : ""}" data-page="${p}">`;
  for (const row of layout) {
    if (row.t === "h") { html += `<div class="sura-head"><span>سُورَةُ ${esc(surahName(row.s))}</span></div>`; continue; }
    if (row.t === "b") { html += `<div class="qline basmala">${BASMALA}</div>`; continue; }
    const a = H.lineStarts[row.li], b = lineEnd(row.li);
    const inAny = b > ws && a < we;
    let line = "";
    for (let w = a; w < b; w++) {
      const inR = w >= ws && w < we;
      const cls = ["w"];
      if (inR) cls.push("in"); else if (opts.range) cls.push("out");
      if (tz) {
        // the Tanzil word(s) that sit at this mushaf position
        const k = ayahOfWord(w), toks = tanzilAt(k, w - ayahStart(k));
        toks.forEach(([id, t], ti) => {
          const c2 = marks[id] ? [...cls, "err-" + marks[id]] : cls;
          line += `<span class="${c2.join(" ")}" data-w="${id}">${(opts.hideOutside && !inR) ? "" : t}</span>` + (ti < toks.length - 1 ? " " : "");
        });
      } else {
      if (marks[w]) cls.push("err-" + marks[w]);
      const txt = (opts.hideOutside && !inR) ? "" : H.words[w];
      line += `<span class="${cls.join(" ")}" data-w="${w}">${txt}</span>`;
      }
      const k = ayahOfWord(w);
      if (ayahEnd(k) === w + 1) line += `<span class="${inR ? "in" : (opts.range ? "out" : "")}">${ayahMarkHTML(ayahNo(k))}</span>`;
      line += " ";
    }
    html += `<div class="qline ${inAny ? "has-in" : ""} ${opts.range && !inAny ? "dim" : ""}" data-slot="${slotOfLine(row.li)}">${line}</div>`;
  }
  return html + "</div>";
}

// Words of a question in the chosen source. Returns [{w, text, ayahK, tanzil?:bool}]
export function questionWords(q, source = "kfgqpc") {
  const out = [];
  if (source === "tanzil" && Q.tanzilWords) {
    const k0 = ayahOfWord(q.wStart), k1 = ayahOfWord(q.wEnd - 1);
    for (let k = k0; k <= k1; k++) {
      const tw = Q.tanzilWords[k];
      tw.forEach((t, i) => out.push({ w: `t${k}_${i}`, text: t, k, last: i === tw.length - 1 }));
    }
    return out;
  }
  for (let w = q.wStart; w < q.wEnd; w++) {
    const k = ayahOfWord(w);
    out.push({ w, text: Q.hafs.words[w], k, last: ayahEnd(k) === w + 1 });
  }
  return out;
}
// Flowing text of a question (for Tanzil mode / student text screen)
export function renderFlow(q, opts = {}) {
  const src = opts.source || "kfgqpc";
  const marks = opts.marks || {};
  return questionWords(q, src).map(o => {
    const m = marks[o.w] ? " err-" + marks[o.w] : "";
    return `<span class="w in${m}" data-w="${o.w}">${o.text}</span>${o.last ? ayahMarkHTML(ayahNo(o.k)) : ""}`;
  }).join(" ");
}
// info about a word (global index or tanzil token id)
export function wordInfo(w) {
  if (typeof w === "string" && w.startsWith("t")) {
    const [k, i] = w.slice(1).split("_").map(Number);
    const s = surahOfAyah(k);
    const text = Q.tanzilWords ? Q.tanzilWords[k][i] : "";
    const p = pageOfWord(ayahStart(k));
    return { w, text, surah: s, surahName: surahName(s), ayah: ayahNo(k), page: p, line: null, source: "tanzil" };
  }
  const k = ayahOfWord(w), s = surahOfAyah(k);
  return {
    w, text: Q.hafs.words[w], surah: s, surahName: surahName(s), ayah: ayahNo(k), page: pageOfWord(w),
    line: slotOfLine(lineOfWord(w)), source: "kfgqpc"
  };
}
export function openingWords(q, n = 3) {
  return Q.hafs.words.slice(q.wStart, Math.min(q.wEnd, q.wStart + n)).join(" ");
}
export const qLabel = (q) => q ? `${q.surahName} ${arNum(q.ayahFrom)}${q.ayahTo !== q.ayahFrom ? " - " + arNum(q.ayahTo) : ""}` : "";
export const qLabelDv = (q) => q ? `${q.surahName} (${q.ayahFrom}${q.ayahTo !== q.ayahFrom ? "–" + q.ayahTo : ""}) • ޞަފުޙާ ${q.page} • ފޮޅުވަތް ${q.lineFrom}–${q.lineTo}` : "";

function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

// ---------- mushaf PNG ----------
export function pageImageURL(p, m) {
  const p3 = String(p).padStart(3, "0");
  return (m.base || "") + (m.pattern || "{p3}.png").replace("{p3}", p3).replace("{p}", p).replace("{p4}", String(p).padStart(4, "0"));
}
// returns [topPct, heightPct] for a range of slots on a page image
export function slotBand(p, slotFrom, slotTo, m) {
  const slots = pageSlotCount(p);
  const top = p <= 2 ? Number(m.p12top) : Number(m.top);
  const bottom = p <= 2 ? Number(m.p12bottom) : Number(m.bottom);
  const hgt = (100 - top - bottom) / slots;
  return [top + (slotFrom - 1) * hgt, (slotTo - slotFrom + 1) * hgt];
}
export const surahOptions = () => Q.hafs.surahs.map(s => [s.n, `${s.n}. ${s.ar}`]);
