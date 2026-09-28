// ============================================================
//  NUMBER GRID for the judges' table / judges' panel
//  • tap one number → that question opens
//  • the student said several numbers (e.g. 3, 5, 8): tap them in that order → ✔ ހުޅުވާ
//    → 3 opens now; 5 and 8 open one after another when the next question starts
// ============================================================
import { h, toast } from "./core.js";
import { queuePicks } from "./liveops.js";

export function gridPicker(L, sid, opts = {}) {
  const picks = L.picks || [], queue = L.pickQueue || [];
  const qs = L.questions || [], qn = L.qCount || 1;
  const offset = qs.length - picks.length;            // questions read before a grid refresh
  const remaining = Math.max(0, qn - qs.length);
  let sel = [];
  const wrap = h("div.gp");
  const info = h("div.gp-info");
  const openBtn = h("button.btn.primary.lg", { disabled: true, onclick: () => go() }, "✔ ހުޅުވާ");
  const clearBtn = h("button.btn.ghost", { onclick: () => { sel = []; paint(); } }, "✖ ހޮވުން ފޮހެލާ");
  const cols = (L.grid || []).length > 30 ? 8 : (L.grid || []).length > 20 ? 6 : 5;
  const grid = h("div.gp-grid", { style: { gridTemplateColumns: `repeat(${cols}, 1fr)` } });
  const btns = (L.grid || []).map(g => {
    const b = h("button.gp-n", { onclick: () => tap(g.n) }, h("span.gp-num", g.n), h("span.gp-sub"));
    b.dataset.n = g.n; grid.appendChild(b); return b;
  });
  let busy = false;
  async function go() {
    if (busy || !sel.length) return;
    busy = true; openBtn.disabled = true;
    const r = await queuePicks(sid, sel);
    busy = false;
    if (r === "taken") toast("އެ ނަންބަރު ހޮވިފައި", "warn");
    else if (r === "full") toast("ސުވާލުގެ ޢަދަދު ހަމަވެއްޖެ", "warn");
    else if (r !== "ok") toast("ނުހުޅުވުނު", "warn");
    sel = []; paint();
  }
  function tap(n) {
    if (picks.includes(n) || busy) return;
    if (remaining <= 1) { sel = [n]; paint(); go(); return; }       // one question left → opens at once
    const i = sel.indexOf(n);
    if (i >= 0) sel.splice(i, 1);
    else if (sel.length < remaining) sel.push(n);
    else toast(`ހޮވޭނީ ${remaining} ނަންބަރު`, "warn");
    paint();
  }
  function paint() {
    btns.forEach(b => {
      const n = +b.dataset.n, pi = picks.indexOf(n), si = sel.indexOf(n), qi = queue.indexOf(n);
      b.className = "gp-n" + (pi >= 0 ? " taken" : si >= 0 ? " sel" : qi >= 0 ? " queued" : "");
      b.disabled = pi >= 0;
      b.querySelector(".gp-sub").textContent = pi >= 0 ? `ސުވާލު ${offset + pi + 1}` : si >= 0 ? `${qs.length + si + 1} ވަނަ` : qi >= 0 ? "ދެން" : "";
    });
    openBtn.disabled = !sel.length;
    openBtn.textContent = sel.length ? `✔ ހުޅުވާ (${sel.join(" ← ")})` : "✔ ހުޅުވާ";
    info.textContent = remaining > 1
      ? `ދަރިވަރު ބުނާ ނަންބަރުތައް ބުނި ތަރުތީބުން ފިއްތާލާފައި 'ހުޅުވާ' — ހޮވޭނީ ${remaining} ނަންބަރު (${qs.length} / ${qn} ކިޔެވިއްޖެ)`
      : remaining === 1 ? "ނަންބަރަށް ފިތާލުމާއެކު ސުވާލު ހުޅުވޭނެ" : "ސުވާލުގެ ޢަދަދު ހަމަވެއްޖެ";
  }
  paint();
  [info, grid, remaining > 1 ? h("div.row.gp-act", openBtn, clearBtn) : null, opts.extra].forEach(x => { if (x) wrap.appendChild(x); });
  return wrap;
}
