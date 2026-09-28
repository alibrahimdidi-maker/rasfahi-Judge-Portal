/*!
 * RASFAHI — Qur'an Competition Judging System
 * Copyright (c) 2026 Ali Ibrahim Didi (AIDD) / Zaadh Holding. All rights reserved. Reg No: MED.03.IP.CR.26.EW5889
 * Unauthorised copying, hosting, modification or redistribution is prohibited.
 */
// ============================================================
//  RASFAHI — Royal Quran frames (50 styles) & app colour themes
//  A frame = one of 10 designs × one of 5 palettes. The shapes live in css/app.css
//  (".qframe" + ".qk-<design>"); this file only picks the design and sets colours.
// ============================================================

// ---------- app colour themes (css: [data-theme="key"]) ----------
export const THEMES = [
  { key: "presidential", dv: "ރިޔާސީ (ފެހި، ނޫ، ވައިލެޓް)", sw: ["#0d4f38", "#0f1d40", "#4a2c8a"] },
  { key: "emerald",      dv: "ޒުމުރުދު ދަރުބާރު",        sw: ["#0c4a35", "#0a3326", "#4a2c8a"] },
  { key: "royal",        dv: "ރޯޔަލް ނޫ",                sw: ["#2b1757", "#111a45", "#13704c"] },
  { key: "purple",       dv: "ބަނަފްސަޖީ",               sw: ["#3b1f73", "#20133f", "#13704c"] },
  { key: "navy",         dv: "ލާޖުވަރުދު",                sw: ["#0f2d66", "#0d1f47", "#13704c"] },
  { key: "maroon",       dv: "ޢުޘްމާނީ ޔާޤޫތު",          sw: ["#5a1422", "#321019", "#13704c"] },
  { key: "turquoise",    dv: "ފިރޯޒާ",                   sw: ["#0b4d55", "#083139", "#1f3f8f"] },
  { key: "blackgold",    dv: "ކަޅު ރަން",                 sw: ["#151a1f", "#101418", "#b38e2c"] }
];
export const DEFAULT_THEME = "presidential";

export function applyTheme(key) {
  const k = THEMES.some(t => t.key === key) ? key : DEFAULT_THEME;
  document.documentElement.dataset.theme = k;
  try { localStorage.setItem("rasfahiTheme", k); } catch (e) {}
  return k;
}

// ---------- frame palettes ----------
const GOLD = { g0: "#7d5f18", g1: "#c9a443", g2: "#f7e59a" };
export const PALETTES = [
  { key: "zumurrud", dv: "ޒުމުރުދު", fb: "#0f5e40", fd: "#083826", fp: "#fffdf5" },
  { key: "banafsaj", dv: "ބަނަފްސަޖީ", fb: "#4a2c8a", fd: "#26134f", fp: "#fffdf7" },
  { key: "lajward",  dv: "ލާޖުވަރުދު", fb: "#1f3f8f", fd: "#0d1d52", fp: "#fdfbf3" },
  { key: "yaqut",    dv: "ޔާޤޫތު",   fb: "#7a1f2b", fd: "#450d17", fp: "#fff8ea" },
  { key: "firoz",    dv: "ފިރޯޒާ",   fb: "#0f7d86", fd: "#08474e", fp: "#fffdf5" }
];

// ---------- frame designs ----------
export const DESIGNS = [
  { key: "mushaf",    dv: "މުޞްޙަފު ބޯޑަރު" },
  { key: "stars",     dv: "ތަރި ފަށަލަ" },
  { key: "cartouche", dv: "މެޑަލިއަން" },
  { key: "lattice",   dv: "ހަންދަސީ ޖާޅި" },
  { key: "pearls",    dv: "މުތީ ދާނާ" },
  { key: "rope",      dv: "ރަން ވާގަނޑު" },
  { key: "rings",     dv: "ރިޔާސީ ވަޅުތައް" },
  { key: "arabesque", dv: "އަރަބެސްކް ކޮޅުތައް" },
  { key: "tazhib",    dv: "ތަޒްހީބު މާ" },
  { key: "mihrab",    dv: "މިޙްރާބު ތާޖު" }
];

// 1..50 : design-major (1–5 = first design in the 5 palettes, 6–10 = second design, ...)
export const FRAMES = DESIGNS.flatMap((d, di) => PALETTES.map((p, pi) => ({
  id: di * PALETTES.length + pi + 1, design: d.key, palette: p.key, dv: `${d.dv} — ${p.dv}`
})));
export const frameName = (id) => { const f = FRAMES.find(x => x.id === +id); return f ? `${f.id}. ${f.dv}` : "ބޯޑަރު ނެތް"; };

// Wrap a node in frame `id`. opts.fill = stretch to the parent's height (used for the PNG page).
export function frameEl(id, content, opts = {}) {
  const f = FRAMES.find(x => x.id === +id);
  if (!f) return content;
  const p = PALETTES.find(x => x.key === f.palette);
  const el = document.createElement("div");
  el.className = "qframe qk-" + f.design + (opts.fill ? " fill" : "") + (opts.cls ? " " + opts.cls : "");
  const vars = { ...GOLD, fb: p.fb, fd: p.fd, fp: p.fp };
  for (const k in vars) el.style.setProperty("--" + k, vars[k]);
  el.innerHTML = '<i class="qf-pat"></i><i class="qf-c tl"></i><i class="qf-c tr"></i><i class="qf-c bl"></i><i class="qf-c br"></i><i class="qf-m t"></i><i class="qf-m b"></i>';
  const inner = document.createElement("div");
  inner.className = "qf-in";
  if (content) inner.appendChild(content);
  el.insertBefore(inner, el.children[1]);
  return el;
}
