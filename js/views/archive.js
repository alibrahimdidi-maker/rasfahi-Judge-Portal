// ============================================================
//  READING ARCHIVE (ކިޔެވުމުގެ އާކައިވް)
//  Each student: paste the Google Drive link of the recording → save → the video
//  plays inside a framed card with the student's name (play / back / forward).
// ============================================================
import {
  S, db, doc, updateDoc, collection, query, where, getDocs, serverTimestamp, h, toast, modal, select, spinner, empty, audit,
  loadCategories, catById, AGE_GROUPS, ageGroupName, genderName, BRANCHES, photoTag
} from "../core.js";
import { mediaPlayer, parseMediaUrl, MEDIA_KIND_DV } from "../media.js";

const canEdit = () => ["superadmin", "adminsec", "secretary"].includes(S.me.role);

// the royal card for one student
export function recordingCard(st, onEdit) {
  const rec = st.recording;
  return h("div.rec-card",
    h("i.rc-c.tl"), h("i.rc-c.tr"), h("i.rc-c.bl"), h("i.rc-c.br"),
    h("div.rec-head", photoTag(st.photoThumb),
      h("div.grow", h("div.rec-name", st.name), h("div.small.muted", [st.regNo, st.categoryName, ageGroupName(st.ageGroup), genderName(st.gender)].filter(Boolean).join(" • "))),
      rec && rec.url ? h("span.tag.gold", MEDIA_KIND_DV[(parseMediaUrl(rec.url) || {}).kind] || "") : null),
    rec && rec.url ? mediaPlayer(rec) : h("div.rec-empty", "🎥 ރެކޯޑިންގ އަދި ނުލާ"),
    canEdit() && onEdit ? h("div.row", { style: { marginTop: "10px", justifyContent: "space-between" } },
      h("span.small.muted", rec && rec.at ? "ލެވުނީ: " + (rec.by || "") : ""),
      h("button.btn.sm", { onclick: () => onEdit(st) }, rec && rec.url ? "✎ ލިންކް ބަދަލުކުރޭ" : "+ ރެކޯޑިންގ ލިންކް")) : null);
}

// paste / change / remove the link
export async function recordingModal(st, onSaved) {
  const inp = h("input.ltr", { value: (st.recording && st.recording.url) || "", placeholder: "https://drive.google.com/file/d/…/view" });
  const pv = h("div", { style: { marginTop: "12px" } });
  const show = () => { pv.innerHTML = ""; const m = parseMediaUrl(inp.value);
    if (m) pv.append(h("div.small.muted", "ވައްތަރު: " + (MEDIA_KIND_DV[m.kind] || "")), recordingCard({ ...st, recording: { url: inp.value } })); };
  inp.oninput = () => { clearTimeout(inp._t); inp._t = setTimeout(show, 500); };
  show();
  const ok = await modal("🎥 ކިޔެވުމުގެ ރެކޯޑިންގ — " + st.name, h("div",
    h("label.field", h("span", "ގޫގުލް ޑްރައިވް ލިންކް (ނުވަތަ ޔޫޓިއުބް / ވީޑިއޯ ލިންކް)"), inp),
    h("p.small.muted", "ޑްރައިވްގައި ފައިލު ‘Share → Anyone with the link → Viewer’ ކުރައްވާ. ފައިލެއްގެ ލިންކް ލެއްވުމުން ވީޑިއޯ މިތަނުން ކުޅެވޭނެ. ފޯލްޑަރެއްގެ ލިންކް ލެއްވުމުން ފޯލްޑަރުގެ ފައިލުތައް ފެންނާނެ."),
    pv),
    [...(st.recording && st.recording.url ? [{ label: "🗑 ނަގާލާ", cls: "red", onClick: async () => {
      await updateDoc(doc(db, "students", st.id), { recording: null }); audit("recording_remove", { id: st.id }); st.recording = null; return true; } }] : []),
     { label: "ކެންސަލް" }, { label: "💾 ސޭވް", cls: "primary", onClick: async () => {
      const m = parseMediaUrl(inp.value);
      if (!m) { toast("ލިންކެއް ލައްވާ", "warn"); return false; }
      const rec = { url: inp.value.trim(), kind: m.kind, id: m.id || "", by: S.me.name || S.me.email, at: new Date().toISOString() };
      await updateDoc(doc(db, "students", st.id), { recording: rec, updatedAt: serverTimestamp() });
      st.recording = rec; audit("recording_save", { id: st.id, kind: m.kind }); toast("ސޭވްކުރެވިއްޖެ ✔"); return true; } }], { wide: true });
  if (ok && onSaved) onSaved(st);
}

// ------------------------------------------------------------ ARCHIVE VIEW
export async function archive(view) {
  if (!S.settings.activeCompetitionId) return view.appendChild(h("div.card", empty("ހިނގަމުންދާ މުބާރާތެއް ނެތް")));
  const cats = await loadCategories();
  const box = h("div", spinner());
  let list = [];
  const q = h("input", { placeholder: "ނަން / ރެޖި / އައިޑީ ހޯދާ" });
  const fHas = select([["", "ހުރިހާ ދަރިވަރުން"], ["yes", "ރެކޯޑިންގ ހުރި"], ["no", "ރެކޯޑިންގ ނެތް"]], "yes");
  const fBr = select([["", "ހުރިހާ ގޮފި"], ["mushaf", "ބަލައިގެން"], ["hifz", "ނުބަލައި"]], "");
  const fAge = select([["", "ހުރިހާ ޢުމުރުފުރާ"], ...AGE_GROUPS], "");
  const fGen = select([["", "ދެ ޖިންސު"], ["M", "ފިރިހެން"], ["F", "އަންހެން"]], "");
  const fCat = select([["", "ހުރިހާ ބައެއް"], ...cats.map(c => [c.id, c.name])], "");
  [fHas, fBr, fAge, fGen, fCat].forEach(x => x.onchange = draw);
  q.oninput = () => { clearTimeout(q._t); q._t = setTimeout(draw, 250); };
  view.append(h("div.card.rec-top", h("h2", "🎥 ކިޔެވުމުގެ އާކައިވް"),
    h("p.small.muted", "ކޮންމެ ދަރިވަރެއްގެ ކިޔެވުމުގެ ރެކޯޑިންގ (ގޫގުލް ޑްރައިވް) ލިންކް ލައްވައި ސޭވްކުރެއްވުމުން ވީޑިއޯ މިތަނުން ކުޅެވޭނެ."),
    h("div.filters", q, fHas, fBr, fAge, fGen, fCat)), box);
  const snap = await getDocs(query(collection(db, "students"), where("competitionId", "==", S.settings.activeCompetitionId)));
  list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.regNo).localeCompare(String(b.regNo)));
  draw();
  function draw() {
    const t = q.value.trim().toLowerCase();
    const rows = list.filter(s => (!fHas.value || (fHas.value === "yes" ? !!(s.recording && s.recording.url) : !(s.recording && s.recording.url))) &&
      (!fBr.value || (catById(s.categoryId) || {}).branch === fBr.value) && (!fAge.value || s.ageGroup === fAge.value) &&
      (!fGen.value || s.gender === fGen.value) && (!fCat.value || s.categoryId === fCat.value) &&
      (!t || [s.name, s.nameEn, s.regNo, s.nid].some(x => String(x || "").toLowerCase().includes(t))));
    box.innerHTML = "";
    const n = list.filter(s => s.recording && s.recording.url).length;
    box.appendChild(h("div.small.muted", { style: { margin: "6px 0 10px" } }, `ރެކޯޑިންގ ހުރި: ${n} / ${list.length} • މި ފިލްޓަރަށް: ${rows.length}`));
    if (!rows.length) return box.appendChild(h("div.card", empty(fHas.value === "yes" ? "ރެކޯޑިންގ ލާފައިވާ ދަރިވަރަކު ނެތް — 'ރެކޯޑިންގ ނެތް' ހޮއްވަވައި ލިންކް ލައްވާ" : "ދަރިވަރަކު ނުފެނުނު")));
    const grid = h("div.rec-grid");
    rows.slice(0, 120).forEach(st => grid.appendChild(recordingCard(st, (s) => recordingModal(s, () => draw()))));
    box.appendChild(grid);
    if (rows.length > 120) box.appendChild(h("p.small.muted", "ފުރަތަމަ 120 ދައްކަނީ — ފިލްޓަރުން ކުޑަކުރައްވާ."));
  }
}
