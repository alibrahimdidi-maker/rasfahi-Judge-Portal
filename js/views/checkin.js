// ============================================================
//  CHECK-IN (tablet staff): search students, verify identity with photo, mark arrival
// ============================================================
import { S, db, doc, getDoc, getDocs, updateDoc, collection, query, where, onSnapshot, serverTimestamp, h, toast, modal, confirmBox,
  select, empty, sub, idCard, loadSessions, sessionLabel, fmtDateTime, ageOn, audit, photoTag } from "../core.js";

export async function checkin(view) {
  const sessions = await loadSessions(true);
  const fSes = select([["", "ހުރިހާ ސެޝަނެއް"], ...sessions.filter(s => s.status !== "closed").map(s => [s.id, sessionLabel(s)])], sessionStorage.getItem("ckSes") || "");
  const fSt = select([["", "ހުރިހާ"], ["out", "ނާދޭ"], ["in", "ހާޟިރު"]], "");
  const q = h("input.ck-search", { placeholder: "🔍 ނަން، އައިޑީ ކާޑު، ރެޖި ނަންބަރު، ފޯނު...", autocomplete: "off" });
  const stats = h("div.row");
  const list = h("div.ck-list");
  view.append(h("div.card", h("h2", "ދަރިވަރުން ހޯދުމާއި ޗެކްއިން"), q, h("div.filters", { style: { marginTop: "10px" } }, fSes, fSt), stats), list);
  let studs = [];
  sub(onSnapshot(query(collection(db, "students"), where("competitionId", "==", S.settings.activeCompetitionId)), s => {
    studs = s.docs.map(d => ({ id: d.id, ...d.data() })); draw();
  }, e => toast(e.message, "err")));
  fSes.onchange = () => { sessionStorage.setItem("ckSes", fSes.value); draw(); };
  fSt.onchange = draw; q.oninput = draw;
  const sesName = (id) => { const s = sessions.find(x => x.id === id); return s ? `${s.name} • ${s.date} ${s.time || ""} • ${s.venue || ""}` : "ސެޝަނަކަށް ނުލާ"; };
  function draw() {
    const t = q.value.trim().toLowerCase();
    const base = studs.filter(s => !fSes.value || s.sessionId === fSes.value);
    const rows = base.filter(s => (!fSt.value || (fSt.value === "in" ? !!s.checkin : !s.checkin)) &&
      (!t || [s.name, s.nameEn, s.nid, s.regNo, s.phone].join(" ").toLowerCase().includes(t)))
      .sort((a, b) => (a.order || 999) - (b.order || 999) || String(a.name).localeCompare(b.name));
    stats.innerHTML = "";
    stats.append(h("span.tag.green", `ހާޟިރު: ${base.filter(s => s.checkin).length}`), h("span.tag", `ނާދޭ: ${base.filter(s => !s.checkin).length}`), h("span.tag.gold", `ޖުމްލަ: ${base.length}`));
    list.innerHTML = "";
    if (!rows.length) return list.appendChild(empty("ނުފެނުނު"));
    rows.slice(0, 120).forEach(s => list.appendChild(h("div.ck-item" + (s.checkin ? ".in" : ""), { onclick: () => open(s) },
      idCard({ ...s, age: ageOn(s.dob) }), h("div.small.muted", { style: { padding: "4px 8px" } }, (s.order ? "#" + s.order + " • " : "") + sesName(s.sessionId)))));
  }
  async function open(s) {
    let photo = "";
    try { const p = await getDoc(doc(db, "photos", s.id)); if (p.exists()) photo = p.data().photo; } catch (e) {}
    const r = await modal("ދަރިވަރުގެ މަޢުލޫމާތު", h("div",
      h("div.row", { style: { alignItems: "flex-start" } }, photoTag(photo || s.photoThumb, "idph"),
        h("div.grow", h("div", { style: { fontSize: "24px", fontWeight: 700 } }, s.name), h("div.ltr.muted", s.nameEn || ""),
          h("div", "ރެޖި: ", h("b", s.regNo), " • އައިޑީ: ", h("b", s.nid)),
          h("div", "ޢުމުރު: " + ageOn(s.dob) + " • " + (s.categoryName || "")),
          h("div", "ދާއިމީ އެޑްރެސް: " + (s.permAddress || "-") + " • " + (s.island || "")),
          h("div", "މުއައްސަސާ: " + (s.institution || "-")),
          h("div", "ސެޝަން: " + sesName(s.sessionId) + (s.order ? " • ތަރުތީބު #" + s.order : "")),
          s.checkin ? h("div.tag.green", "✔ ހާޟިރުވި: " + fmtDateTime(s.checkin.at) + " — " + (s.checkin.by || "")) : null))),
      [{ label: "ބަންދު" }, s.checkin
        ? { label: "ޗެކްއިން ބާޠިލުކުރޭ", cls: "red", value: "undo" }
        : { label: "✔ ހާޟިރު (ޗެކްއިން)", cls: "green", value: "in" }], { wide: true });
    if (r === "in") {
      await updateDoc(doc(db, "students", s.id), { checkin: { at: new Date(), by: S.me.email, sessionId: s.sessionId || "" } });
      audit("checkin", { id: s.id }); toast(s.name + " ހާޟިރު ✔");
    } else if (r === "undo") {
      if (!await confirmBox("ބާޠިލުކުރުން", "ޗެކްއިން ބާޠިލުކުރަންތޯ؟", "އާދެ", "red")) return;
      await updateDoc(doc(db, "students", s.id), { checkin: null }); audit("checkin_undo", { id: s.id });
    }
  }
}

// ============================================================
//  ADMIT (tablet at the door of the hall): when the judges' table presses ✔ ނިމުނު,
//  the staff sends the next student in → the judges see the name, the student screen shows the grid.
// ============================================================
export async function admit(view) {
  const { admitStudent, PHASE_DV } = await import("../liveops.js");
  const { loadCategories, catById } = await import("../core.js");
  await loadCategories();
  const sessions = (await loadSessions(true)).filter(s => s.status !== "closed");
  const pick = select([["", "— ސެޝަން ހޮވާ —"], ...sessions.map(s => [s.id, sessionLabel(s)])], sessionStorage.getItem("admSes") || "");
  const body = h("div");
  view.append(h("div.card", h("h2", "ކިޔެވުމަށް ވެއްދުން"), pick), body);
  let stop = [];
  pick.onchange = () => { sessionStorage.setItem("admSes", pick.value); run(); };
  run();
  function run() {
    stop.forEach(u => u()); stop = [];
    body.innerHTML = "";
    const ses = sessions.find(s => s.id === pick.value);
    if (!ses) return body.appendChild(empty(sessions.length ? "ސެޝަނެއް ހޮއްވަވާ" : "ހުޅުވިފައިވާ ސެޝަނެއް ނެތް"));
    let L = null, studs = [];
    stop.push(sub(onSnapshot(doc(db, "live", ses.id), s => { L = s.exists() ? s.data() : null; draw(); }, e => toast(e.message, "err"))));
    stop.push(sub(onSnapshot(query(collection(db, "students"), where("sessionId", "==", ses.id)), s => {
      studs = s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.order || 0) - (b.order || 0)); draw();
    }, e => toast(e.message, "err"))));
    const busy = () => L && L.studentId && ["grid", "reading", "scoring"].includes(L.phase);
    async function go(st) {
      if (!st.checkin && !await confirmBox("ޗެކްއިން ނުވޭ", st.name + " ޗެކްއިން ކޮށްފައި ނުވޭ. އެހެންނަމަވެސް ވައްދަންތޯ؟", "ވައްދާ", "orange")) return;
      if (busy() && !await confirmBox("ކިޔަވަމުން ދަނީ", `${L.student.name} ގެ ކިޔެވުން އަދި ނުނިމޭ. ${st.name} ވައްދަންތޯ؟`, "ވައްދާ", "red")) return;
      const d = new Set((L && L.done) || []);
      await admitStudent(ses, st, L, studs.filter(x => !d.has(x.id) && x.id !== st.id));
    }
    function draw() {
      body.innerHTML = "";
      const d = new Set((L && L.done) || []);
      const rest = studs.filter(x => !d.has(x.id) && !(L && L.studentId === x.id));
      const nx = rest.find(x => x.checkin) || rest[0];
      const state = !L || !L.studentId ? { t: "ހޯލު ހުސް — ދެން ދަރިވަރު ވައްދާ", c: "green" }
        : L.phase === "scoring" || L.phase === "final" ? { t: `${L.student.name} ނިމުނީ — ދެން ދަރިވަރު ވައްދާ`, c: "green" }
        : { t: `${L.student.name} — ${PHASE_DV[L.phase] || L.phase}`, c: "orange" };
      body.appendChild(h("div.card", { style: { borderColor: state.c === "green" ? "var(--green)" : "var(--orange)" } },
        h("div", { style: { fontSize: "20px", fontWeight: 700, color: state.c === "green" ? "var(--green2)" : "#ffc062" } }, state.t),
        nx ? h("div", { style: { marginTop: "12px" } }, h("div.small.muted", "ދެން:"), idCard(nx),
          h("button.btn.green.lg", { style: { width: "100%", marginTop: "12px", fontSize: "20px", padding: "16px" }, onclick: () => go(nx) }, "▶ ކިޔެވުމަށް ވެއްދި"))
          : h("div.empty", { style: { marginTop: "10px" } }, "ބާކީ ދަރިވަރެއް ނެތް")));
      if (rest.length > 1) body.appendChild(h("div.card", h("h3", `ބާކީ ދަރިވަރުން (${rest.length})`),
        rest.map(x => h("div.queue-item", { onclick: () => go(x) }, h("b", x.order || ""), photoTag(x.photoThumb),
          h("div.grow", x.name, h("div.small.muted", `${x.regNo} • ${x.categoryName || ""}`)),
          x.checkin ? h("span.tag.green", "ހާޟިރު") : h("span.tag", "ނާދޭ")))));
    }
  }
}
