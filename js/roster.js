// ============================================================
//  SESSION ROSTER — the ONE ordered list of a session
//  • the same order numbers as every printed sheet (notice board, attendance, judges' sheets)
//  • stored on the session (roster) so judges can see it too
//  • attendance: the door tablet ticks ✔ — only the chief judge (or admin) can remove a tick
//  • comments / reschedule requests: visible to the chief judge and the judges;
//    the chief judge forwards a reschedule to the secretariat
// ============================================================
import {
  S, db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, onSnapshot, serverTimestamp,
  h, esc, toast, modal, confirmBox, select, empty, audit, catById, fmtDateTime, photoTag
} from "./core.js";

const DAYS_DV = ["އާދިއްތަ", "ހޯމަ", "އަންގާރަ", "ބުދަ", "ބުރާސްފަތި", "ހުކުރު", "ހޮނިހިރު"];
export const dayName = (iso) => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? "" : DAYS_DV[d.getDay()]; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
export const NOTE_KIND = { note: ["💬 ނޯޓު", ""], reschedule: ["📅 ރިޝެޑިއުލަށް އެދުން", "orange"], untick: ["✖ ހާޟިރީ ފާހަގަ އޮޅިގެން", "red"], mark: ["✎ މާކްސް މެނުއަލް", "blue"] };

// the list stored on the session (order, name, reg no, category)
export const rosterOf = (orderIds, studsById) => orderIds.map((id, i) => {
  const st = studsById[id] || {};
  return { id, order: i + 1, name: st.name || "", regNo: st.regNo || "", nid: st.nid || "", categoryName: st.categoryName || "", gender: st.gender || "", photoThumb: st.photoThumb || "" };
});
// refresh the stored list from the students (controllers only)
export async function syncRoster(ses) {
  try {
    const snap = await getDocs(query(collection(db, "students"), where("sessionId", "==", ses.id)));
    const byId = Object.fromEntries(snap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    const ids = (ses.order && ses.order.length ? ses.order : Object.values(byId).sort((a, b) => (a.order || 0) - (b.order || 0)).map(x => x.id)).filter(id => byId[id]);
    const roster = rosterOf(ids, byId);
    await updateDoc(doc(db, "sessions", ses.id), { roster, rosterAt: serverTimestamp() });
    ses.roster = roster;
    return roster;
  } catch (e) { return ses.roster || []; }
}

// ---------- date → session picker (same on every screen) ----------
export function datedSessionPicker(sessions, key, onChange) {
  const dates = [...new Set(sessions.map(s => s.date).filter(Boolean))].sort();
  const t = today();
  // a session that is running now wins; then the one chosen last time; then today / the next day
  const liveSes = sessions.filter(s => s.status === "live").sort((a, b) => String(b.date + b.time).localeCompare(String(a.date + a.time)))[0];
  const savedSes = sessions.find(s => s.id === sessionStorage.getItem(key));
  if (liveSes && (!savedSes || savedSes.status !== "live")) sessionStorage.setItem(key, liveSes.id);
  const pickSes = liveSes && (!savedSes || savedSes.status !== "live") ? liveSes : savedSes;
  const defDate = pickSes ? pickSes.date : dates.includes(t) ? t : (dates.find(d => d >= t) || dates[dates.length - 1] || "");
  const dSel = select(dates.map(d => [d, `${dayName(d)} ${d}${d === t ? " (މިއަދު)" : ""}`]), defDate);
  const sSel = select([["", "— ސެޝަން ހޮވާ —"]], "");
  const fill = () => {
    const list = sessions.filter(s => s.date === dSel.value).sort((a, b) => String(a.time).localeCompare(String(b.time)));
    sSel.innerHTML = "";
    sSel.appendChild(h("option", { value: "" }, list.length ? "— ސެޝަން ހޮވާ —" : "މި ދުވަހު ސެޝަނެއް ނެތް"));
    list.forEach(s => sSel.appendChild(h("option", { value: s.id }, `${s.status === "live" ? "🔴 ލައިވް • " : ""}${s.time || ""} • ${s.name}${s.venue ? " • " + s.venue : ""}`)));
    const keep = list.find(s => s.id === sessionStorage.getItem(key)) || (list.length === 1 ? list[0] : null);
    sSel.value = keep ? keep.id : "";
  };
  fill();
  dSel.onchange = () => { fill(); sSel.onchange(); };
  sSel.onchange = () => { sessionStorage.setItem(key, sSel.value); onChange(sessions.find(s => s.id === sSel.value) || null); };
  return { el: h("div.dsp", h("label.field", h("span", "📅 ދުވަސް / ތާރީޚް"), dSel), h("label.field", h("span", "ސެޝަން"), sSel)),
    current: () => sessions.find(s => s.id === sSel.value) || null };
}

// ---------- notes ----------
export async function addNote(ses, st, kind = "note", presetText = "") {
  const kSel = select(Object.entries(NOTE_KIND).map(([k, v]) => [k, v[0]]), kind);
  const txt = h("textarea", { rows: 3, placeholder: "ލިޔުއްވާ..." }); txt.value = presetText;
  const ok = await modal(`💬 ${st.name} (#${st.order || ""})`, h("div", h("label.field", h("span", "ވައްތަރު"), kSel), h("label.field", h("span", "ކޮމެންޓް"), txt),
    h("p.small.muted", "ޗީފް ޖަޖަށާއި ޖަޖުންނަށް ފެންނާނެ. ރިޝެޑިއުލަށް އެދުން ޗީފް ޖަޖު ސެކްރެޓޭރިއެޓަށް ފޮނުވާނެ.")),
    [{ label: "ކެންސަލް" }, { label: "ފޮނުވާ", cls: "primary", onClick: async () => {
      if (!txt.value.trim() && kSel.value === "note") { toast("ކޮމެންޓެއް ލިޔުއްވާ", "warn"); return false; }
      await addDoc(collection(db, "notes"), { competitionId: S.settings.activeCompetitionId, sessionId: ses.id, sessionName: ses.name, sessionDate: ses.date || "",
        studentId: st.id, studentName: st.name, order: st.order || 0, kind: kSel.value, text: txt.value.trim(), status: "open",
        byEmail: S.me.email, byName: S.me.name || S.me.email, byRole: S.me.role, at: serverTimestamp() });
      audit("note_add", { sid: ses.id, st: st.id, kind: kSel.value }); toast("ފޮނުވިއްޖެ ✔"); return true; } }]);
  return ok;
}

// ---------- attendance ----------
const attId = (sid, stId) => `${sid}__${stId}`;
export async function markPresent(ses, st) {
  await setDoc(doc(db, "attendance", attId(ses.id, st.id)), { competitionId: S.settings.activeCompetitionId, sessionId: ses.id, studentId: st.id,
    order: st.order || 0, name: st.name, by: S.me.email, byName: S.me.name || "", at: serverTimestamp() });
  try { await updateDoc(doc(db, "students", st.id), { checkin: { at: new Date(), by: S.me.email, sessionId: ses.id } }); } catch (e) {}
  audit("attendance", { sid: ses.id, st: st.id }); toast(st.name + " ✔ ހާޟިރު");
}
export async function removePresent(ses, st, reason) {
  await deleteDoc(doc(db, "attendance", attId(ses.id, st.id)));
  try { await updateDoc(doc(db, "students", st.id), { checkin: null }); } catch (e) {}
  audit("attendance_remove", { sid: ses.id, st: st.id, reason: reason || "" }); toast("ހާޟިރީ ފާހަގަ ނަގާލެވިއްޖެ");
}

// ---------- the roster panel ----------
// opts: { tick: bool (door tablet), untick: bool (chief), comment: bool, live: live-doc getter, compact: bool, onPick(st) }
export function rosterPanel(ses, opts = {}) {
  const box = h("div.roster");
  let att = {}, notes = [], unsub = [];
  const roster = () => ses.roster || [];
  unsub.push(onSnapshot(query(collection(db, "attendance"), where("sessionId", "==", ses.id)),
    s => { att = Object.fromEntries(s.docs.map(d => [d.data().studentId, d.data()])); draw(); }, () => {}));
  unsub.push(onSnapshot(query(collection(db, "notes"), where("sessionId", "==", ses.id)),
    s => { notes = s.docs.map(d => ({ id: d.id, ...d.data() })); draw(); }, () => {}));
  unsub.push(onSnapshot(doc(db, "sessions", ses.id), s => { if (s.exists()) { const d = s.data(); ses.roster = d.roster || ses.roster; ses.order = d.order || ses.order; draw(); } }, () => {}));
  box._stop = () => unsub.forEach(u => u());
  const q = h("input", { placeholder: "🔍 ނަން / ރެޖި / #", style: { marginBottom: "8px" } });
  q.oninput = () => draw();
  function draw() {
    const L = opts.live ? opts.live() : null;
    const done = new Set((L && L.done) || []), cur = L && L.studentId;
    const t = q.value.trim().toLowerCase();
    const list = roster();
    const present = list.filter(r => att[r.id]).length;
    box.innerHTML = "";
    box.append(h("div.roster-head",
      h("div", h("b", ses.name), h("div.small.muted", `${dayName(ses.date)} ${ses.date || ""} • ${ses.time || ""}${ses.reportTime ? " (ހާޟިރުވާ " + ses.reportTime + ")" : ""} • ${ses.venue || ""}`)),
      h("div.row", h("span.tag.green", `ހާޟިރު ${present}`), h("span.tag", `ނާދޭ ${list.length - present}`), h("span.tag.gold", `ޖުމްލަ ${list.length}`))));
    if (!list.length) { box.appendChild(empty("މި ސެޝަނުގެ ލިސްޓު ނެތް")); return; }
    if (!opts.compact) box.appendChild(q);
    const rows = list.filter(r => !t || [r.name, r.regNo, String(r.order), r.nid].join(" ").toLowerCase().includes(t));
    rows.forEach(r => {
      const a = att[r.id], ns = notes.filter(n => n.studentId === r.id);
      const open = ns.filter(n => n.status !== "done");
      const row = h("div.roster-row" + (a ? ".in" : "") + (cur === r.id ? ".cur" : "") + (done.has(r.id) ? ".done" : ""),
        h("div.rr-no", r.order),
        opts.compact ? null : photoTag(r.photoThumb),
        h("div.rr-main", h("div.rr-name", r.name), h("div.small.muted", `${r.regNo} • ${r.categoryName}`),
          open.length ? h("div.rr-notes", open.slice(-2).map(n => h("div.rr-note." + (NOTE_KIND[n.kind] || ["", ""])[1], `${(NOTE_KIND[n.kind] || [""])[0]}: ${n.text || ""} — ${n.byName || ""}${n.status === "forwarded" ? " • 📨 ސެކްރެޓޭރިއެޓަށް" : ""}`))) : null),
        h("div.rr-state", cur === r.id ? h("span.tag.blue", "▶ މިހާރު") : done.has(r.id) ? h("span.tag.gold", "ނިމުނު") : null,
          a ? h("span.rr-tick", { title: `${a.byName || a.by || ""}` }, "✔") : h("span.rr-tick.off", "—")),
        h("div.rr-act",
          opts.tick && !a ? h("button.btn.green", { onclick: async (e) => { e.stopPropagation(); await markPresent(ses, r); } }, "✔ ހާޟިރު") : null,
          opts.untick && a ? h("button.btn.sm.red", { title: "ހާޟިރީ ފާހަގަ ނަގާލާ (ޗީފް ޖަޖު)", onclick: async (e) => { e.stopPropagation();
            if (await confirmBox("ހާޟިރީ ފާހަގަ ނަގާލުން", r.name + " ގެ ހާޟިރީ ފާހަގަ ނަގާލަންތޯ؟", "ނަގާލާ", "red")) {
              await removePresent(ses, r, "chief"); open.filter(n => n.kind === "untick").forEach(n => updateDoc(doc(db, "notes", n.id), { status: "done", doneBy: S.me.email, doneAt: serverTimestamp() })); } } }, "✖") : null,
          opts.comment ? h("button.btn.sm", { title: "ކޮމެންޓް", onclick: (e) => { e.stopPropagation(); addNote(ses, r, a && opts.tick ? "untick" : "note"); } }, "💬" + (ns.length ? " " + ns.length : "")) : null,
          opts.onPick ? h("button.btn.sm.primary", { onclick: (e) => { e.stopPropagation(); opts.onPick(r); } }, "▶") : null));
      box.appendChild(row);
    });
  }
  draw();
  return box;
}

// chief judge: open requests for his session, forward reschedules to the secretariat
export function notesPanel(ses, canForward) {
  const box = h("div.notes-panel");
  const un = onSnapshot(query(collection(db, "notes"), where("sessionId", "==", ses.id)), s => {
    const ns = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(n => n.status !== "done").sort((a, b) => (a.order || 0) - (b.order || 0));
    box.innerHTML = "";
    box.appendChild(h("h3", `💬 ކޮމެންޓާއި އެދުންތައް (${ns.length})`));
    if (!ns.length) { box.appendChild(h("div.small.muted", "އެދުމެއް ނެތް")); return; }
    ns.forEach(n => box.appendChild(h("div.note-item." + ((NOTE_KIND[n.kind] || ["", ""])[1] || "plain"),
      h("div", h("b", `#${n.order} ${n.studentName}`), " — ", (NOTE_KIND[n.kind] || [""])[0], n.status === "forwarded" ? h("span.tag.orange", " 📨 ސެކްރެޓޭރިއެޓަށް ފޮނުވިއްޖެ") : null),
      n.text ? h("div", n.text) : null,
      h("div.small.muted", `${n.byName || n.byEmail} • ${n.at && n.at.toDate ? fmtDateTime(n.at.toDate()) : ""}`),
      canForward ? h("div.row", { style: { marginTop: "6px" } },
        n.kind === "reschedule" && n.status === "open" ? h("button.btn.sm.orange", { onclick: async () => {
          await updateDoc(doc(db, "notes", n.id), { status: "forwarded", forwardedBy: S.me.email, forwardedAt: serverTimestamp() });
          audit("reschedule_forward", { id: n.id }); toast("ސެކްރެޓޭރިއެޓަށް ފޮނުވިއްޖެ"); } }, "📨 ރިޝެޑިއުލަށް ސެކްރެޓޭރިއެޓަށް") : null,
        h("button.btn.sm", { onclick: async () => { await updateDoc(doc(db, "notes", n.id), { status: "done", doneBy: S.me.email, doneAt: serverTimestamp() }); } }, "✔ ނިމުނީ")) : null)));
  }, () => {});
  box._stop = un;
  return box;
}
