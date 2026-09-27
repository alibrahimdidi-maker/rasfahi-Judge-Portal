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
