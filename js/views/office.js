/*!
 * RASFAHI — Qur'an Competition Judging System
 * Copyright (c) 2026 Ali Ibrahim Didi (AIDD) / Zaadh Holding. All rights reserved. Reg No: MED.03.IP.CR.26.EW5889
 * Unauthorised copying, hosting, modification or redistribution is prohibited.
 */
// ============================================================
//  Admin Secretary / Secretary: announcement & form, applications, students, sessions, prints
// ============================================================
import {
  S, db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, serverTimestamp,
  runTransaction, writeBatch, h, esc, toast, modal, confirmBox, promptBox, field, select, spinner, empty, audit,
  fmtDate, fmtDateTime, AGE_GROUPS, GENDERS, INST_TYPES, BRANCHES, ageGroupName, genderName, instTypeName, normId, digits,
  loadCategories, loadSessions, catById, cache, photoTag, resizeImage, ageOn, downloadCSV, PUBLIC_BASE_URL, sessionLabel, todayISO,
  hasScope, actsSecretary, diffOf, sha256Hex, ROLES, roleName
} from "../core.js";
import { printDoc, tableHTML, admitCardsHTML, blankSheetsHTML, sigBlock, a5JudgeSheetHTML, noticeBoardHTML, sessionJudgeTableHTML } from "../print.js";
import { downloadSampleList, downloadImportTemplate, loadSampleIntoFirestore, removeSampleData } from "../dummy.js";
import { rosterOf, dayName as dayDv } from "../roster.js";

// ---- read a .csv or .xlsx file into rows (array of arrays) ----
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = []; let row = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true;
    else if (ch === "," || ch === ";" && !text.slice(0, 2000).includes(",")) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim() !== ""));
}
async function readSheet(file) {
  if (/\.xlsx?$/i.test(file.name)) {
    const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.3/package/xlsx.mjs");
    const wb = XLSX.read(await file.arrayBuffer(), { cellDates: true });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, dateNF: "yyyy-mm-dd", defval: "" })
      .filter(r => r.some(c => String(c).trim() !== ""));
  }
  return parseCSV(await file.text());
}
// "14/05/2012", "2012-05-14", "5/14/2012" → "2012-05-14"
function toISO(v) {
  const t = String(v || "").trim(); if (!t) return "";
  let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) { let d = +m[1], mo = +m[2]; if (mo > 12) [d, mo] = [mo, d]; return `${m[3]}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`; }
  const d = new Date(t); return isNaN(d) ? t : d.toISOString().slice(0, 10);
}

const isAdm = () => ["superadmin", "adminsec"].includes(S.me.role);
const canEdit = () => isAdm() || (actsSecretary() && hasScope("students"));
const needComp = (view) => {
  if (S.settings.activeCompetitionId) return false;
  view.appendChild(h("div.card", empty("ހިނގަމުންދާ މުބާރާތެއް ހޮވާފައެއް ނުވޭ. ސުޕަރ އެޑްމިން ސެޓިންގްސް ޓެބުން ހޮއްވަވާ.")));
  return true;
};

export const APP_STATUS = {
  submitted: ["ހުށަހެޅި", "blue"], resubmitted: ["އަލުން ހުށަހެޅި", "blue"], needs_fix: ["ރަނގަޅުކުރަން ފޮނުވި", "orange"],
  approved: ["ގަބޫލުކުރެވިއްޖެ", "green"], rejected: ["ރިޖެކްޓް", "red"]
};
export const FIX_ITEMS = [
  ["photo", "ފޮޓޯ ސާފުނޫން / ރަނގަޅެއް ނޫން"], ["nid", "އައިޑީ ކާޑު ނަންބަރު"], ["name", "ފުރިހަމަ ނަން"], ["dob", "އުފަން ތާރީޚް"],
  ["permAddress", "ދާއިމީ އެޑްރެސް"], ["currentAddress", "މިހާރު އުޅޭ އެޑްރެސް"], ["institution", "މުއައްސަސާ"],
  ["categoryId", "ބައި / ޢުމުރުފުރާ ދިމާނުވޭ"], ["guardian", "ބެލެނިވެރިޔާގެ މަޢުލޫމާތު"]
];

// ------------------------------------------------------------ ANNOUNCEMENT & FORM
export async function announce(view) {
  if (needComp(view)) return;
  const snap = await getDoc(doc(db, "public", "registration"));
  const r = snap.exists() ? snap.data() : {};
  const cats = (await loadCategories(true)).filter(c => c.openForRegistration !== false);
  const open = h("input", { type: "checkbox" }); open.checked = !!r.open;
  const title = h("input", { value: r.title || "" }), sub = h("input", { value: r.subtitle || "" });
  const ann = h("textarea", { rows: 6 }, r.announcement || "");
  const dl = h("input", { type: "date", value: r.deadline || "" });
  const contact = h("input", { value: r.contact || "" });
  const ageDate = h("input", { type: "date", value: r.ageOnDate || "" });
  const link = PUBLIC_BASE_URL + "register.html";
  view.append(h("div.card", h("h2", "މުބާރާތުގެ އިޢުލާނާއި ބައިވެރިވުމުގެ ފޯމު"),
    h("div.row", { style: { marginBottom: "10px" } }, h("span", "ފޯމުގެ ލިންކް:"), h("a.ltr", { href: "register.html", target: "_blank" }, link),
      h("button.btn.sm", { onclick: () => { navigator.clipboard.writeText(link); toast("ކޮޕީ ކުރެވިއްޖެ"); } }, "ކޮޕީ")),
    h("label.row", open, h("b", "ރަޖިސްޓްރޭޝަން ހުޅުވާލާ (ފޯމު ފުރެވޭނެ)")),
    h("div.grid2", field("ސުރުޚީ", title), field("ދެވަނަ ސުރުޚީ", sub)),
    field("އިޢުލާނު / އިރުޝާދު", ann),
    h("div.grid3", field("ފޯމު ބަލައިގަންނަ ފަހު ތާރީޚް", dl), field("ޢުމުރު ބަލާނެ ތާރީޚް", ageDate), field("ގުޅޭނެ ނަންބަރު / އީމެއިލް", contact)),
    h("p.small.muted", `ފޯމުގައި ދައްކާނީ "ރަޖިސްޓްރޭޝަން ފޯމުގައި ދައްކާ" އޮން ކޮށްފައިވާ ${cats.length} ބައި.`),
    h("button.btn.primary", { onclick: async () => {
      await setDoc(doc(db, "public", "registration"), {
        open: open.checked, competitionId: S.settings.activeCompetitionId, title: title.value.trim(), subtitle: sub.value.trim(),
        announcement: ann.value, deadline: dl.value, contact: contact.value.trim(), ageOnDate: ageDate.value,
        categories: cats.map(c => ({ id: c.id, name: c.name, branch: c.branch, ageGroup: c.ageGroup, gender: c.gender || "" })),
        updatedAt: serverTimestamp(), updatedBy: S.me.email
      });
      audit("registration_save", { open: open.checked }); toast("ސޭވް ކުރެވިއްޖެ");
    } }, "💾 ސޭވް / ޕަބްލިޝް")));
}

// ------------------------------------------------------------ APPLICATIONS
export async function applications(view) {
  if (needComp(view)) return;
  const cats = await loadCategories();
  const card = h("div.card", h("h2", "ބައިވެރިވުމުގެ އެޕްލިކޭޝަންތައް"));
  const fSt = select([["", "ހުރިހާ ޙާލަތެއް"], ...Object.entries(APP_STATUS).map(([k, v]) => [k, v[0]])], "");
  const fCat = select([["", "ހުރިހާ ބައެއް"], ...cats.map(c => [c.id, c.name])], "");
  const fTxt = h("input", { placeholder: "ނަން، އައިޑީ، ފޯނު، އީމެއިލް..." });
  const kpis = h("div.grid4", { style: { marginBottom: "10px" } });
  const box = h("div", spinner());
  card.append(kpis, h("div.filters", fTxt, fSt, fCat,
    h("button.btn", { onclick: () => exportCSV() }, "⬇ CSV"), h("button.btn", { onclick: () => printList() }, "🖨 ޕްރިންޓް")), box);
  view.appendChild(card);
  let list = [];
  async function load() {
    const snap = await getDocs(query(collection(db, "applications"), where("competitionId", "==", S.settings.activeCompetitionId)));
    list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.submittedAt?.seconds || 0) - (a.submittedAt?.seconds || 0));
    const cnt = (s) => list.filter(a => s.includes(a.status)).length;
    kpis.innerHTML = "";
    kpis.append(h("div.kpi", h("b", list.length), h("span", "ޖުމްލަ")), h("div.kpi", h("b", cnt(["submitted", "resubmitted"])), h("span", "ބަލަންޖެހޭ")),
      h("div.kpi", h("b", cnt(["needs_fix"])), h("span", "ރަނގަޅުކުރަން ފޮނުވި")), h("div.kpi", h("b", cnt(["approved"])), h("span", "ގަބޫލުކުރެވިފައި")));
    draw();
  }
  const filtered = () => {
    const t = fTxt.value.trim().toLowerCase();
    return list.filter(a => (!fSt.value || a.status === fSt.value) && (!fCat.value || a.categoryId === fCat.value) &&
      (!t || [a.name, a.nameEn, a.nid, a.phone, a.email, a.institution].join(" ").toLowerCase().includes(t)));
  };
  function draw() {
    const rows = filtered();
    box.innerHTML = "";
    if (!rows.length) return box.appendChild(empty("އެޕްލިކޭޝަނެއް ނެތް"));
    box.appendChild(h("div.tbl-wrap", h("table.tbl",
      h("thead", h("tr", ["", "ނަން", "އައިޑީ", "ބައި", "ފޯނު", "ޙާލަތު", "ހުށަހެޅި", ""].map(x => h("th", x)))),
      h("tbody", rows.map(a => h("tr",
        h("td", photoTag(a.photoThumb)), h("td", h("b", a.name), h("div.small.muted.ltr", a.nameEn || "")), h("td.ltr", a.nid),
        h("td", a.categoryName || ""), h("td.ltr", a.phone), h("td", h("span.tag." + (APP_STATUS[a.status] || ["", ""])[1], (APP_STATUS[a.status] || [a.status])[0])),
        h("td.small.muted", fmtDateTime(a.submittedAt)),
        h("td", h("button.btn.sm.primary", { onclick: () => review(a) }, "ބަލާ / އެޑިޓް"))))))));
  }
  [fTxt, fSt, fCat].forEach(x => x.oninput = draw);

  function exportCSV() {
    const rows = filtered();
    downloadCSV("applications.csv", [["Status", "Name", "Name (EN)", "ID", "DOB", "Gender", "Permanent address", "Island", "Current address", "Phone", "Email",
      "Institution", "Inst. type", "Category", "Guardian", "Guardian phone", "Submitted"],
      ...rows.map(a => [a.status, a.name, a.nameEn, a.nid, a.dob, a.gender, a.permAddress, a.island, a.currentAddress, a.phone, a.email,
        a.institution, a.instType, a.categoryName, a.guardianName, a.guardianPhone, fmtDateTime(a.submittedAt)])]);
  }
  function printList() {
    printDoc("ބައިވެރިވުމުގެ އެޕްލިކޭޝަން ލިސްޓު", tableHTML([
      { t: "#", cls: "num", v: (r, i) => i + 1 }, { t: "ފޮޓޯ", html: r => r.photoThumb ? `<img class="ph" src="${r.photoThumb}">` : "" },
      { t: "ނަން", v: r => r.name }, { t: "އައިޑީ", v: r => r.nid }, { t: "ބައި", v: r => r.categoryName }, { t: "ފޯނު", v: r => r.phone },
      { t: "މުއައްސަސާ", v: r => r.institution }, { t: "ޙާލަތު", v: r => (APP_STATUS[r.status] || [r.status])[0] }], filtered()), { landscape: true });
  }

  async function review(a) {
    const d = { ...a };
    const inp = (k, attrs = {}) => { const e = h("input", { value: d[k] || "", ...attrs }); e.oninput = () => d[k] = e.value; return e; };
    const sel = (k, opts) => { const e = select(opts, d[k] || ""); e.onchange = () => { d[k] = e.value; if (k === "categoryId") d.categoryName = (catById(e.value) || {}).name || ""; }; return e; };
    const ph = h("div.ph-preview", d.photo || d.photoThumb ? h("img", { src: d.photo || d.photoThumb }) : "ފޮޓޯ ނެތް");
    const phIn = h("input", { type: "file", accept: "image/*", onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      d.photo = await resizeImage(f, 480, 0.82); d.photoThumb = await resizeImage(f, 140, 0.75);
      ph.innerHTML = ""; ph.appendChild(h("img", { src: d.photo }));
    } });
    const hist = (a.history || []).map(x => h("div.small.muted", `${fmtDateTime(x.at)} — ${(APP_STATUS[x.status] || [x.status])[0]} — ${x.by || ""} ${x.note ? ": " + x.note : ""}`));
    const body = h("div",
      h("div.status-box." + a.status, h("b", "ޙާލަތު: " + (APP_STATUS[a.status] || [a.status])[0]),
        a.adminNotes ? h("div", "ނޯޓު: " + a.adminNotes) : null, a.studentId ? h("div", "ދަރިވަރު ID: " + a.studentId) : null),
      h("div.row", { style: { alignItems: "flex-start" } }, h("div", ph, phIn),
        h("div.grow", h("div.grid2", field("ފުރިހަމަ ނަން (ދިވެހިން)", inp("name")), field("ފުރިހަމަ ނަން (އިނގިރޭސިން)", inp("nameEn", { class: "ltr" }))),
          h("div.grid3", field("އައިޑީ ކާޑު ނަންބަރު", inp("nid", { class: "ltr" })), field("އުފަން ތާރީޚް", inp("dob", { type: "date" })), field("ޖިންސު", sel("gender", GENDERS))))),
      h("div.grid3", field("ދާއިމީ އެޑްރެސް", inp("permAddress")), field("އަތޮޅާއި ރަށް", inp("island")), field("މިހާރު އުޅޭ އެޑްރެސް", inp("currentAddress"))),
      h("div.grid3", field("މޯބައިލް (ލޮގިން)", h("input.ltr", { value: a.phone, disabled: true })), field("އީމެއިލް (ލޮގިން)", h("input.ltr", { value: a.email, disabled: true })), field("އިތުރު ފޯނު", inp("phone2", { class: "ltr" }))),
      h("div.grid3", field("މުއައްސަސާ", inp("institution")), field("މުއައްސަސާގެ ވައްތަރު", sel("instType", INST_TYPES)), field("ބައި", sel("categoryId", cats.map(c => [c.id, c.name])))),
      h("div.grid3", field("ބެލެނިވެރިޔާ", inp("guardianName")), field("ބެލެނިވެރިޔާގެ ފޯނު", inp("guardianPhone", { class: "ltr" })), field("ގުޅުން", inp("guardianRelation"))),
      (a.idFront || a.idBack) ? h("div", h("h3", "އައިޑީ ކާޑު (ދެފުށް)"), h("div.grid2",
        ...[["ކުރިމަތި", a.idFront], ["ފަހަތް", a.idBack]].map(([t, src]) => h("div", h("div.small.muted", t),
          src ? h("a", { href: "#", onclick: (e) => { e.preventDefault(); const w = window.open(""); if (w) w.document.write(`<img src="${src}" style="max-width:100%">`); } },
            h("img", { src, style: { width: "100%", borderRadius: "10px", border: "1px solid var(--line2)" } })) : h("div.empty", "ނެތް"))))) : h("p.tag.orange", "އައިޑީ ކާޑުގެ ފޮޓޯ ލާފައެއް ނުވޭ"),
      field("ނޯޓު (ހުށަހެޅި ފަރާތުން)", h("input", { value: a.notes || "", disabled: true })),
      d.dob ? h("p.small.muted", "ޢުމުރު: " + ageOn(d.dob) + " އަހަރު") : null,
      hist.length ? h("div", h("h3", "ތާރީޚު"), hist) : null);
    const saveEdits = async (extra = {}) => {
      const upd = {};
      ["name", "nameEn", "nid", "dob", "gender", "permAddress", "island", "currentAddress", "phone2", "institution", "instType", "categoryId", "categoryName",
        "guardianName", "guardianPhone", "guardianRelation", "photo", "photoThumb"].forEach(k => { if (d[k] !== a[k]) upd[k] = d[k] ?? ""; });
      upd.nid = normId(d.nid);
      await updateDoc(doc(db, "applications", a.id), { ...upd, ...extra, updatedAt: serverTimestamp(), editedBy: S.me.email });
      audit("application_edit", { id: a.id, keys: Object.keys(upd) });
    };
    const res = await modal("އެޕްލިކޭޝަން — " + a.name, body, [
      { label: "ރިޖެކްޓް", cls: "red", onClick: async () => {
        const why = await promptBox("ރިޖެކްޓް ކުރާ ސަބަބު", "ސަބަބު", "", true); if (!why) return false;
        await saveEdits({ status: "rejected", adminNotes: why, history: [...(a.history || []), { status: "rejected", at: new Date(), by: S.me.email, note: why }] });
        await sendMail(a, "rejected", why); return "x";
      } },
      { label: "ރަނގަޅުކުރަން ފޮނުވާ", cls: "orange", onClick: async () => {
        const r = await askFix(a); if (!r) return false;
        await saveEdits({ status: "needs_fix", adminNotes: r.note, fixItems: r.items,
          history: [...(a.history || []), { status: "needs_fix", at: new Date(), by: S.me.email, note: r.note }] });
        await sendMail(a, "needs_fix", r.note, r.items); return "x";
      } },
      { label: "ބަދަލު ސޭވް", onClick: async () => { await saveEdits(); toast("ސޭވް ކުރެވިއްޖެ"); return "x"; } },
      { label: a.status === "approved" ? "ދަރިވަރު އަޕްޑޭޓް" : "✔ ގަބޫލުކޮށް ދަރިވަރަކަށް ހަދާ", cls: "green", onClick: async () => {
        if (!d.nid || !d.name || !d.categoryId) { toast("ނަމާއި، އައިޑީ ނަންބަރާއި، ބައި ހަމަ ކުރައްވާ", "err"); return false; }
        await saveEdits();
        const ok = await approve({ ...a, ...d, nid: normId(d.nid) }); return ok ? "x" : false;
      } }
    ], { wide: true });
    if (res) load();
  }
  async function askFix(a) {
    const checks = FIX_ITEMS.map(([k, t]) => { const c = h("input", { type: "checkbox", value: k }); return [c, t]; });
    const note = h("textarea", { rows: 3 });
    const r = await modal("ރަނގަޅުކުރަންޖެހޭ ކަންކަން", h("div", h("p.small.muted", a.email + " އަށް މެއިލެއް ދާނެ. ފޯމު ހުޅުވޭނީ ކުރިން ފޮނުވި ލިންކުން."),
      checks.map(([c, t]) => h("label.row", c, t)), field("އިތުރު ނޯޓު", note)),
      [{ label: "ކެންސަލް" }, { label: "ފޮނުވާ", cls: "orange", onClick: () => {
        const items = checks.filter(([c]) => c.checked).map(([c, t]) => t);
        if (!items.length && !note.value.trim()) { toast("އެއްވެސް ކަމެއް ހޮއްވަވާ", "err"); return false; }
        return { items, note: note.value.trim() };
      } }]);
    return r;
  }
  async function sendMail(a, kind, note, items = []) {
    const url = PUBLIC_BASE_URL + "register.html?app=" + encodeURIComponent(a.id);
    const subject = kind === "needs_fix" ? "ޤުރްއާން މުބާރާތް — ފޯމު ރަނގަޅުކުރަން ޖެހޭ" : kind === "approved" ? "ޤުރްއާން މުބާރާތް — ފޯމު ގަބޫލުކުރެވިއްޖެ" : "ޤުރްއާން މުބާރާތް — ފޯމު";
    const lines = [
      `އައްސަލާމު ޢަލައިކުމް ${a.name}،`, "",
      kind === "needs_fix" ? "ތިޔަ ފޮނުއްވި ފޯމުގައި ތިރީގައިވާ ކަންކަން ރަނގަޅުކުރަން ޖެހެއެވެ:" : kind === "approved" ? "ތިޔަ ފޯމު ގަބޫލުކުރެވިއްޖެއެވެ." : "ތިޔަ ފޯމާ ބެހޭގޮތުން:",
      ...items.map(i => "• " + i), note ? "\n" + note : "", "",
      kind === "needs_fix" ? "ފޯމު ހުޅުވުމަށް ތިރީގައިވާ ލިންކަށް ގޮސް، ކުރިން ލިޔުނު އީމެއިލާއި ނަމާއި މޯބައިލް ނަންބަރު ޖައްސަވާ:" : "ފޯމު ބެއްލެވުމަށް:",
      url, "", "ޝުކުރިއްޔާ"
    ];
    const text = lines.join("\n");
    try {
      await addDoc(collection(db, "mail"), { to: a.email, message: { subject, text, html: text.replace(/\n/g, "<br>").replace(url, `<a href="${url}">${url}</a>`) },
        applicationId: a.id, kind, createdAt: serverTimestamp(), by: S.me.email });
    } catch (e) { console.warn(e); }
    await modal("މެއިލް", h("div", h("p", "މެއިލް ކިއުގައި ލެވިއްޖެ (Firebase 'Trigger Email' އެކްސްޓެންޝަން ހަރުލާފައިވާނަމަ އޮޓޯ ފޮނުވޭނެ)."),
      h("p.small.muted", "ނޫނީ ތިރީ ބަޓަނުން ތިބާގެ މެއިލް އެޕުން ފޮނުއްވާ:"),
      h("a.btn.primary", { href: `mailto:${a.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`, target: "_blank" }, "✉ މެއިލް އެޕުން ފޮނުވާ"),
      h("pre.small", { style: { whiteSpace: "pre-wrap", background: "#0a1118", padding: "10px", borderRadius: "8px" } }, text)), [{ label: "ނިމުނީ", cls: "primary" }]);
  }
  async function approve(a) {
    const cid = S.settings.activeCompetitionId;
    const sid = `${cid}__${a.nid}`;
    const cat = catById(a.categoryId);
    try {
      const regNo = await runTransaction(db, async (tx) => {
        const stRef = doc(db, "students", sid), cRef = doc(db, "competitions", cid);
        const [st, c] = await Promise.all([tx.get(stRef), tx.get(cRef)]);
        if (st.exists() && st.data().applicationId && st.data().applicationId !== a.id) throw new Error("މި އައިޑީ ނަންބަރުގައި އެހެން ދަރިވަރެއް ކުރިން ރަޖިސްޓަރީ ވެފައި: " + st.data().name);
        let reg = st.exists() ? st.data().regNo : null;
        if (!reg) {
          const n = ((c.exists() && c.data().regCounter) || 0) + 1;
          reg = `R${String((c.exists() && c.data().year) || new Date().getFullYear()).slice(-2)}-${String(n).padStart(4, "0")}`;
          tx.set(cRef, { regCounter: n }, { merge: true });
        }
        tx.set(stRef, {
          competitionId: cid, nid: a.nid, regNo: reg, name: a.name, nameEn: a.nameEn || "", dob: a.dob || "", gender: a.gender || "",
          permAddress: a.permAddress || "", island: a.island || "", currentAddress: a.currentAddress || "", phone: a.phone, phone2: a.phone2 || "",
          email: a.email, institution: a.institution || "", instType: a.instType || "", categoryId: a.categoryId, categoryName: cat ? cat.name : a.categoryName || "",
          branch: cat ? cat.branch : "", ageGroup: cat ? cat.ageGroup : "", guardianName: a.guardianName || "", guardianPhone: a.guardianPhone || "",
          photoThumb: a.photoThumb || "", applicationId: a.id, status: "active", updatedAt: serverTimestamp(),
          ...(st.exists() ? {} : { createdAt: serverTimestamp(), sessionId: "", order: 0, checkin: null })
        }, { merge: true });
        tx.set(doc(db, "photos", sid), { photo: a.photo || a.photoThumb || "", updatedAt: serverTimestamp() });
        tx.update(doc(db, "applications", a.id), { status: "approved", studentId: sid, regNo: reg,
          history: [...(a.history || []), { status: "approved", at: new Date(), by: S.me.email }] });
        return reg;
      });
      audit("application_approve", { id: a.id, studentId: sid, regNo });
      toast("ގަބޫލުކުރެވިއްޖެ — ރެޖި: " + regNo);
      if (a.status !== "approved") await sendMail(a, "approved", "ރަޖިސްޓްރޭޝަން ނަންބަރު: " + regNo);
      return true;
    } catch (e) { toast(e.message, "err", 6000); return false; }
  }
  load();
}

// ------------------------------------------------------------ STUDENTS
export async function students(view) {
  if (needComp(view)) return;
  const [cats, sessions] = await Promise.all([loadCategories(), loadSessions(true)]);
  const card = h("div.card", h("h2", "ދަރިވަރުން"));
  const fTxt = h("input", { placeholder: "ނަން، އައިޑީ، ރެޖި، ފޯނު..." });
  const fCat = select([["", "ހުރިހާ ބައެއް"], ...cats.map(c => [c.id, c.name])], "");
  const fGen = select([["", "ދެ ޖިންސު"], ...GENDERS], "");
  const fInst = select([["", "ހުރިހާ މުއައްސަސާ"], ...INST_TYPES], "");
  const fSes = select([["", "ހުރިހާ ސެޝަނެއް"], ["-", "ސެޝަނަކަށް ނުލާ"], ...sessions.map(s => [s.id, sessionLabel(s)])], "");
  const fCk = select([["", "ޗެކްއިން: ހުރިހާ"], ["in", "ޗެކްއިން ވެއްޖެ"], ["out", "ޗެކްއިން ނުވާ"]], "");
  const box = h("div", spinner());
  card.append(h("div.filters", fTxt, fCat, fGen, fInst, fSes, fCk,
    isAdm() ? h("button.btn.primary", { onclick: () => edit() }, "+ ދަރިވަރެއް") : null,
    h("button.btn", { onclick: () => exportCSV() }, "⬇ CSV"), h("button.btn", { onclick: () => printList() }, "🖨 ލިސްޓް"),
    h("button.btn", { onclick: () => printDoc("ދަރިވަރު ކާޑު", admitCardsHTML(filtered(), Object.fromEntries(sessions.map(s => [s.id, s])))) }, "🪪 ކާޑު")), box);
  if (isAdm()) view.appendChild(sampleCard());
  view.appendChild(card);

  // ---------------------------------------------------------------- SAMPLE LISTS, TEST DATA & IMPORT
  function sampleCard() {
    const status = h("div.small.muted", { style: { marginTop: "8px" } });
    const busy = (on, msg) => { status.textContent = msg || ""; c.querySelectorAll("button").forEach(b => b.disabled = on); };
    const run = async (msg, fn) => { busy(true, msg); try { await fn(); } catch (e) { toast(e.message || String(e), "err", 7000); } finally { busy(false, status.textContent); } };
    const cnt = select([["100", "100 ދަރިވަރުން"], ["300", "300 ދަރިވަރުން"], ["1000", "1000 ދަރިވަރުން"], ["2000", "2000 ދަރިވަރުން"]], "300");
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const dFrom = h("input", { type: "date", value: iso(new Date(Date.now() + 86400000)) });
    const dTo = h("input", { type: "date", value: iso(new Date(Date.now() + 32 * 86400000)) });
    const perDay = select([["1", "ދުވަހަކު 1 ސެޝަން"], ["2", "ދުވަހަކު 2 ސެޝަން"], ["3", "ދުވަހަކު 3 ސެޝަން"], ["4", "ދުވަހަކު 4 ސެޝަން"]], "3");
    const allAges = h("input", { type: "checkbox" }); allAges.checked = true;
    const box = (title, text, ...btns) => h("div", { style: { border: "1px solid var(--line2)", borderRadius: "12px", padding: "14px", background: "var(--panel2)" } },
      h("div", { style: { fontWeight: 700, color: "var(--gold2)", marginBottom: "6px", fontSize: "15px" } }, title),
      h("p.small.muted", { style: { margin: "0 0 10px", lineHeight: 1.8 } }, text), h("div.row", ...btns));
    const load2 = (withMarks) => run("ލޯޑުވަނީ...", async () => {
      const n = +cnt.value;
      const ok = await confirmBox("ޓެސްޓަށް ނަމޫނާ ޑޭޓާ ލޯޑުކުރުން",
        `${n} ނަމޫނާ ދަރިވަރުން${withMarks ? "، 5 ޖަޖުންގެ މާކްސް އަދި ނަތީޖާ" : " (މާކްސް ނެތި)"} ހިނގަމުންދާ މުބާރާތަށް ވައްދާނެ. ` +
        `${dFrom.value} އިން ${dTo.value} އަށް، ދުވަހަކު ${perDay.value} ސެޝަނަށް ބަހާލާނެ. ` +
        (allAges.checked ? "ހުރިހާ ޢުމުރުފުރާއެއް × ދެ ގޮފީގެ ނަމޫނާ ބައިތައް ހަދާނެ. " : "") +
        "ޖަޖު / ޗީފް ޖަޖުގެ އެކައުންޓެއް ނެތްނަމަ ތިބާ ޖަޖު 1 އާއި ޗީފް ޖަޖު ކަމުގައި ލާނެ (🔀 ރޯލް ބަދަލުކޮށް ޓެސްޓް ކުރެވޭނެ). ފަހުން '🗑 ނަމޫނާ ޑޭޓާ ފޮހެލާ' އިން މުޅިން ފޮހެލެވޭނެ.", "ލޯޑުކުރޭ", "primary");
      if (!ok) return;
      const r = await loadSampleIntoFirestore({ count: n, withMarks, startDate: dFrom.value, endDate: dTo.value, perDay: +perDay.value, allAges: allAges.checked,
        onProgress: (d, t) => status.textContent = `ލޯޑުވަނީ... ${d} / ${t}` });
      status.textContent = `✔ ${r.students} ދަރިވަރުން، ${r.sessions} ސެޝަން` + (r.categories ? `، ${r.categories} ބައި` : "") +
        (withMarks ? `، ${r.results} ނަތީޖާ، ${r.scores} ޖަޖު ޝީޓް` : "") + " ލޯޑުވެއްޖެ.";
      if (r.scoreError) toast("ނަތީޖާ ލޯޑުވެއްޖެ، ނަމަވެސް ޖަޖު ޝީޓްތައް ނުވަދެއެވެ. އާ firestore.rules ޕަބްލިޝް ކުރައްވާ.", "warn", 9000);
      else toast("ނަމޫނާ ޑޭޓާ ލޯޑުވެއްޖެ ✔");
      load();
    });
    const c = h("div.card", { style: { border: "2px dashed var(--gold)" } },
      h("h2", "🧪 ނަމޫނާ ލިސްޓާއި ސިސްޓަމް ޓެސްޓް"),
      h("div.grid3", { style: { gap: "12px" } },
        box("⬇ ނަމޫނާ ލިސްޓު ޑައުންލޯޑް (Excel)",
          "2000 ދަރިވަރުންގެ ފުރިހަމަ މަޢުލޫމާތު: ނަން، އައިޑީ، ރެޖި ނަންބަރު، ދާއިމީ އެޑްރެސް، ބައި، ގޮފި، ޢުމުރުފުރާ، މުއައްސަސާ. " +
          "'މާކްސް އާއެކު' ފައިލުގައި 5 ޖަޖުންގެ މާކްސް، ފައިނަލް، ތަރި އަދި ވަނަ ހުންނާނެ. 'މާކްސް ހުސް' ފައިލުގައި މާކްސް ލިޔުމުން Excel އިން ޖުމްލަ، ފައިނަލް އަދި ތަރި ހިސާބުކުރާނެ.",
          h("button.btn.primary", { onclick: () => run("ފައިލު ހަދަނީ...", async () => { const n = await downloadSampleList(true, 2000, allAges.checked); status.textContent = `✔ ${n} ދަރިވަރުންގެ ފައިލު ޑައުންލޯޑުވެއްޖެ (މާކްސް އާއެކު)`; }) }, "⬇ މާކްސް އާއެކު"),
          h("button.btn", { onclick: () => run("ފައިލު ހަދަނީ...", async () => { const n = await downloadSampleList(false, 2000, allAges.checked); status.textContent = `✔ ${n} ދަރިވަރުންގެ ފައިލު ޑައުންލޯޑުވެއްޖެ (މާކްސް ހުސްކޮށް)`; }) }, "⬇ މާކްސް ހުސްކޮށް")),
        box("▶ ސޮފްޓްވެއަރ ޓެސްޓަށް ލޯޑުކުރުން",
          "ނަމޫނާ ދަރިވަރުން ސިސްޓަމަށް ވައްދާ. 'މާކްސް އާއެކު' ލޯޑުކުރުމުން ނަތީޖާ، ވަނަ، ޖަލްސާގެ ޕްރިންޓް ފަދަ ހުރިހާ ތަނެއް ބަލާލެވޭނެ. " +
          "'މާކްސް ނެތި' ލޯޑުކުރުމުން ސެޝަން ހުޅުވައި، ލައިވް ކޮންޓްރޯލާއި ޖަޖުން މާކްސް ދޭ ގޮތް ޓެސްޓްކުރެވޭނެ.",
          h("div", { style: { width: "100%" } },
            h("div.grid2", h("label.field", h("span", "ފަށާ ތާރީޚް"), dFrom), h("label.field", h("span", "ނިމޭ ތާރީޚް"), dTo)),
            h("div.grid2", cnt, perDay),
            h("label.row", { style: { margin: "6px 0" } }, allAges, "ހުރިހާ ޢުމުރުފުރާއެއް × ބަލައިގެން / ނުބަލައި (+ މުޅި ޤުރްއާން) — 32 ނަމޫނާ ބައި")),
          h("button.btn.green", { onclick: () => load2(true) }, "▶ މާކްސް އާއެކު"),
          h("button.btn", { onclick: () => load2(false) }, "▶ މާކްސް ނެތި"),
          h("button.btn.red.sm", { onclick: () => run("ފޮހެލަނީ...", async () => {
            if (!await confirmBox("ނަމޫނާ ޑޭޓާ ފޮހެލުން", "ނަމޫނާ ގޮތުގައި ލޯޑުކުރި ހުރިހާ ދަރިވަރުން، ސެޝަން، މާކްސް އަދި ނަތީޖާ ފޮހެލާނެ. އަސްލު ޑޭޓާއަށް އަސަރެއް ނުކުރާނެ.", "ފޮހެލާ", "red")) return;
            const n = await removeSampleData((col, k) => status.textContent = `ފޮހެލަނީ... ${col}: ${k}`);
            status.textContent = `✔ ${n} ނަމޫނާ ރެކޯޑު ފޮހެލައިފި`; load();
          }) }, "🗑 ނަމޫނާ ޑޭޓާ ފޮހެލާ")),
        box("📥 Excel / ގޫގުލް ފޯމް ލިސްޓް ވައްދާ",
          "ސޮފްޓްވެއަރ ފޯމު ބޭނުންނުކުރެވޭ ޙާލަތުގައި ގޫގުލް ފޯމުން ނުވަތަ Excel ޝީޓަކުން ލިބޭ ލިސްޓް މިތަނުން ވައްދާ. " +
          "ފުރަތަމަ ހުސް ޓެމްޕްލޭޓް ޑައުންލޯޑްކޮށް، ކޮލަމްތައް އެގޮތަށް ފުރުއްވާ. (.xlsx ނުވަތަ .csv)",
          h("button.btn.orange", { onclick: () => importStudents() }, "📥 ފައިލު ހޮވާ"),
          h("button.btn.sm", { onclick: () => run("ފައިލު ހަދަނީ...", async () => { await downloadImportTemplate(); status.textContent = "✔ ހުސް ޓެމްޕްލޭޓް ޑައުންލޯޑުވެއްޖެ"; }) }, "⬇ ހުސް ޓެމްޕްލޭޓް"))),
      status);
    return c;
  }
  let list = [];
  async function load() {
    const snap = await getDocs(query(collection(db, "students"), where("competitionId", "==", S.settings.activeCompetitionId)));
    list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => String(a.regNo).localeCompare(String(b.regNo)));
    draw();
  }
  const filtered = () => {
    const t = fTxt.value.trim().toLowerCase();
    return list.filter(s => (!fCat.value || s.categoryId === fCat.value) && (!fGen.value || s.gender === fGen.value) &&
      (!fInst.value || s.instType === fInst.value) && (!fSes.value || (fSes.value === "-" ? !s.sessionId : s.sessionId === fSes.value)) &&
      (!fCk.value || (fCk.value === "in" ? !!s.checkin : !s.checkin)) &&
      (!t || [s.name, s.nameEn, s.nid, s.regNo, s.phone, s.institution].join(" ").toLowerCase().includes(t)));
  };
  const sesName = (id) => { const s = sessions.find(x => x.id === id); return s ? s.name + " " + (s.date || "") : "-"; };
  function draw() {
    const rows = filtered();
    box.innerHTML = "";
    box.appendChild(h("p.small.muted", `${rows.length} / ${list.length} ދަރިވަރުން`));
    if (!rows.length) return box.appendChild(empty("ދަރިވަރަކު ނެތް"));
    box.appendChild(h("div.tbl-wrap", h("table.tbl",
      h("thead", h("tr", ["", "ރެޖި", "އައިޑީ", "ނަން", "ބައި", "ޢުމުރު", "މުއައްސަސާ", "ރަށް", "ފޯނު", "ސެޝަން", "ޗެކްއިން", ""].map(x => h("th", x)))),
      h("tbody", rows.map(s => h("tr",
        h("td", photoTag(s.photoThumb)), h("td", h("b", s.regNo)), h("td.ltr", s.nid), h("td", s.name, h("div.small.muted.ltr", s.nameEn || "")),
        h("td", s.categoryName), h("td", ageOn(s.dob)), h("td", s.institution), h("td", s.island), h("td.ltr", s.phone),
        h("td.small", sesName(s.sessionId) + (s.order ? " #" + s.order : "")),
        h("td", s.checkin ? h("span.tag.green", "✔") : ""),
        h("td", h("div.row", { style: { gap: "4px", flexWrap: "nowrap" } },
          canEdit() ? h("button.btn.sm", { onclick: () => edit(s) }, "އެޑިޓް") : null,
          h("button.btn.sm" + (s.recording && s.recording.url ? ".green" : ""), { title: "ކިޔެވުމުގެ ރެކޯޑިންގ",
            onclick: async () => { const m = await import("./archive.js"); m.recordingModal(s, () => draw()); } }, "🎥")))))))));
  }
  [fTxt, fCat, fGen, fInst, fSes, fCk].forEach(x => x.oninput = draw);
  function exportCSV() {
    downloadCSV("students.csv", [["Reg No", "ID", "Name", "Name EN", "DOB", "Age", "Gender", "Category", "Permanent address", "Island", "Current address",
      "Phone", "Email", "Institution", "Inst type", "Guardian", "Guardian phone", "Session", "Order", "Checked in"],
      ...filtered().map(s => [s.regNo, s.nid, s.name, s.nameEn, s.dob, ageOn(s.dob), s.gender, s.categoryName, s.permAddress, s.island, s.currentAddress,
        s.phone, s.email, s.institution, s.instType, s.guardianName, s.guardianPhone, sesName(s.sessionId), s.order, s.checkin ? "Yes" : ""])]);
  }
  function printList() {
    const f = [fCat.value && (catById(fCat.value) || {}).name, fGen.value && genderName(fGen.value), fInst.value && instTypeName(fInst.value),
      fSes.value && fSes.value !== "-" && sesName(fSes.value)].filter(Boolean).join(" • ");
    printDoc("ދަރިވަރުންގެ ލިސްޓު", tableHTML([
      { t: "#", cls: "num", v: (r, i) => i + 1 }, { t: "ފޮޓޯ", cls: "num", html: r => r.photoThumb ? `<img class="ph" src="${r.photoThumb}">` : "" },
      { t: "ރެޖި", v: r => r.regNo }, { t: "އައިޑީ", v: r => r.nid }, { t: "ނަން", v: r => r.name }, { t: "ބައި", v: r => r.categoryName },
      { t: "ޢުމުރު", cls: "num", v: r => ageOn(r.dob) }, { t: "މުއައްސަސާ", v: r => r.institution }, { t: "ރަށް", v: r => r.island }, { t: "ފޯނު", v: r => r.phone }], filtered()),
      { landscape: true, sub: f });
  }
  async function edit(s0) {
    const s = s0 ? { ...s0 } : { gender: "M", categoryId: cats[0] ? cats[0].id : "" };
    let photo = null, thumb = s.photoThumb || "";
    const inp = (k, a = {}) => { const e = h("input", { value: s[k] || "", ...a }); e.oninput = () => s[k] = e.value; return e; };
    const sel = (k, o) => { const e = select(o, s[k] || ""); e.onchange = () => s[k] = e.value; return e; };
    const ph = h("div.ph-preview", thumb ? h("img", { src: thumb }) : "ފޮޓޯ");
    if (s0) getDoc(doc(db, "photos", s0.id)).then(p => { if (p.exists() && p.data().photo) { ph.innerHTML = ""; ph.appendChild(h("img", { src: p.data().photo })); } }).catch(() => {});
    const phIn = h("input", { type: "file", accept: "image/*", onchange: async (e) => {
      const f = e.target.files[0]; if (!f) return;
      photo = await resizeImage(f, 480); thumb = await resizeImage(f, 140, 0.75); ph.innerHTML = ""; ph.appendChild(h("img", { src: photo }));
    } });
    const nidI = inp("nid", { class: "ltr", disabled: !!s0 });
    const ok = await modal(s0 ? "ދަރިވަރު — " + s.name : "އާ ދަރިވަރެއް", h("div",
      h("div.row", { style: { alignItems: "flex-start" } }, h("div", ph, phIn), h("div.grow",
        h("div.grid2", field("ނަން", inp("name")), field("ނަން (އިނގިރޭސި)", inp("nameEn", { class: "ltr" }))),
        h("div.grid3", field("އައިޑީ ކާޑު", nidI), field("އުފަން ތާރީޚް", inp("dob", { type: "date" })), field("ޖިންސު", sel("gender", GENDERS))))),
      h("div.grid3", field("ދާއިމީ އެޑްރެސް", inp("permAddress")), field("އަތޮޅާއި ރަށް", inp("island")), field("މިހާރު އުޅޭ އެޑްރެސް", inp("currentAddress"))),
      h("div.grid3", field("ފޯނު", inp("phone", { class: "ltr" })), field("އީމެއިލް", inp("email", { class: "ltr" })), field("ބައި", sel("categoryId", cats.map(c => [c.id, c.name])))),
      h("div.grid3", field("މުއައްސަސާ", inp("institution")), field("ވައްތަރު", sel("instType", INST_TYPES)), field("ބެލެނިވެރިޔާ / ފޯނު", inp("guardianName")))),
      [...(s0 && isAdm() ? [{ label: "🗑 ފޮހެލާ", cls: "red", onClick: async () => {
        if (!await confirmBox("ފޮހެލުން", s.name + " ފޮހެލަންވީތޯ؟ (މާކްސް ޝީޓްތައް ނުފޮހެވޭ)", "ފޮހެލާ", "red")) return false;
        await deleteDoc(doc(db, "students", s0.id)); audit("student_delete", { id: s0.id }); return true;
      } }] : []),
      { label: "ކެންސަލް" }, { label: "ސޭވް", cls: "primary", onClick: async () => {
        const nid = normId(s.nid);
        if (!nid || !s.name || !s.categoryId) { toast("ނަމާއި، އައިޑީއާއި، ބައި ބޭނުންވޭ", "err"); return false; }
        const cid = S.settings.activeCompetitionId, id = s0 ? s0.id : `${cid}__${nid}`;
        const cat = catById(s.categoryId);
        const data = { competitionId: cid, nid, name: s.name, nameEn: s.nameEn || "", dob: s.dob || "", gender: s.gender || "", permAddress: s.permAddress || "",
          island: s.island || "", currentAddress: s.currentAddress || "", phone: s.phone || "", email: s.email || "", categoryId: s.categoryId,
          categoryName: cat ? cat.name : "", branch: cat ? cat.branch : "", ageGroup: cat ? cat.ageGroup : "", institution: s.institution || "",
          instType: s.instType || "", guardianName: s.guardianName || "", photoThumb: thumb || "", updatedAt: serverTimestamp() };
        if (!s0) {
          const ex = await getDoc(doc(db, "students", id)); if (ex.exists()) { toast("މި އައިޑީ ކުރިންވެސް އެބައޮތް", "err"); return false; }
          data.regNo = await runTransaction(db, async (tx) => {
            const cRef = doc(db, "competitions", cid); const c = await tx.get(cRef);
            const n = ((c.exists() && c.data().regCounter) || 0) + 1; tx.set(cRef, { regCounter: n }, { merge: true });
            return `R${String((c.exists() && c.data().year) || new Date().getFullYear()).slice(-2)}-${String(n).padStart(4, "0")}`;
          });
          Object.assign(data, { createdAt: serverTimestamp(), status: "active", sessionId: "", order: 0, checkin: null });
        }
        await setDoc(doc(db, "students", id), data, { merge: true });
        if (photo && isAdm()) await setDoc(doc(db, "photos", id), { photo, updatedAt: serverTimestamp() });
        audit(s0 ? "student_update" : "student_create", { id, name: data.name || (s0 && s0.name) || "", changes: diffOf(s0 || {}, data) }); return true;
      } }], { wide: true });
    if (ok) { toast("ސޭވް ކުރެވިއްޖެ"); load(); }
  }
  // ---------------------------------------------------------------- IMPORT (Excel .xlsx / .csv)
  async function importStudents() {
    const file = await new Promise(res => { const i = h("input", { type: "file", accept: ".csv,.xlsx,.xls,text/csv" }); i.onchange = () => res(i.files[0]); i.click(); });
    if (!file) return;
    let rows;
    try { rows = await readSheet(file); } catch (e) { return toast("ފައިލު ކިޔޭކަށް ނުވި: " + e.message, "err", 7000); }
    if (!rows.length) return toast("ފައިލުގައި ލިސްޓެއް ނެތް", "warn");
    // header aliases (English keys from the template, Dhivehi labels, common Google Forms titles)
    const ALIAS = {
      nid: ["nid", "id", "national id", "id card", "id no", "އައިޑީ", "އައިޑީ ކާޑު ނަންބަރު", "އައިޑީ ކާޑު"],
      name: ["name", "full name", "ނަން", "ފުރިހަމަ ނަން"], nameEn: ["nameen", "name en", "english name", "ނަން (އިނގިރޭސިން)"],
      dob: ["dob", "date of birth", "birth date", "އުފަން ތާރީޚް", "އުފަން ތާރީޚް (yyyy-mm-dd)"], gender: ["gender", "sex", "ޖިންސު", "ޖިންސު (m/f)"],
      permAddress: ["permaddress", "permanent address", "ދާއިމީ އެޑްރެސް"], island: ["island", "atoll and island", "އަތޮޅާއި ރަށް", "ރަށް"],
      currentAddress: ["currentaddress", "current address", "މިހާރު އުޅޭ އެޑްރެސް"], phone: ["phone", "mobile", "contact", "ފޯނު"],
      email: ["email", "email address", "އީމެއިލް"], category: ["category", "categoryid", "categoryname", "ބައި", "ބައިވެރިވާ ބައި"],
      institution: ["institution", "school", "މުއައްސަސާ"], instType: ["insttype", "institution type", "މުއައްސަސާގެ ވައްތަރު"],
      guardianName: ["guardianname", "guardian", "ބެލެނިވެރިޔާ"], guardianPhone: ["guardianphone", "guardian phone", "ބެލެނިވެރިޔާގެ ފޯނު"]
    };
    const norm = (t) => String(t || "").trim().toLowerCase().replace(/\s+/g, " ");
    const hdr = rows[0].map(norm);
    const col = {};
    Object.entries(ALIAS).forEach(([k, al]) => { const i = hdr.findIndex(x => al.includes(x)); if (i >= 0) col[k] = i; });
    // the template has a second header row in Dhivehi — skip it
    let body = rows.slice(1);
    if (body.length && col.nid != null && norm(body[0][col.nid]).includes("އައިޑީ")) body = body.slice(1);
    const catBy = (v) => { const t = norm(v); return cats.find(c => c.id === v || norm(c.name) === t) || cats.find(c => t && norm(c.name).includes(t)); };
    const instKey = (v) => { const t = norm(v); const f = INST_TYPES.find(([k, dv]) => norm(k) === t || norm(dv) === t); return f ? f[0] : (v ? "Private" : ""); };
    const parsed = body.map(r => {
      const g = (k) => (col[k] != null ? String(r[col[k]] ?? "").trim() : "");
      const cat = catBy(g("category"));
      const gen = norm(g("gender"));
      return { nid: normId(g("nid")), name: g("name"), nameEn: g("nameEn"), dob: toISO(g("dob")),
        gender: /^(f|female|އަންހެން)/.test(gen) ? "F" : gen ? "M" : "", permAddress: g("permAddress"), island: g("island"),
        currentAddress: g("currentAddress"), phone: g("phone"), email: g("email"), cat, catText: g("category"),
        institution: g("institution"), instType: instKey(g("instType")), guardianName: g("guardianName"), guardianPhone: g("guardianPhone") };
    }).filter(r => r.nid || r.name);
    const bad = (r) => [!r.nid && "އައިޑީ ނެތް", !r.name && "ނަން ނެތް", !r.cat && "ބައި ނުފެނުނު"].filter(Boolean);
    const good = parsed.filter(r => !bad(r).length);
    const missing = ["nid", "name", "category"].filter(k => col[k] == null);
    const ok = await modal("📥 ދަރިވަރުން ވެއްދުން — " + file.name, h("div",
      missing.length ? h("p", { style: { color: "var(--red2)" } }, "މި ކޮލަމްތައް ނުފެނުނު: " + missing.join("، ") + " — ޓެމްޕްލޭޓުގައިވާ ކޮލަމް ނަންތައް ބޭނުންކުރައްވާ.") : null,
      h("p.small.muted", `${parsed.length} ލައިން ކިޔުނު • ${good.length} ވައްދަން ތައްޔާރު • ${parsed.length - good.length} ގައި މައްސަލަ. ކުރިން ހުރި އައިޑީތައް ދޫކޮށްލާނެ.`),
      h("div.tbl-wrap", { style: { maxHeight: "360px", overflow: "auto" } }, h("table.tbl",
        h("thead", h("tr", ["#", "އައިޑީ", "ނަން", "އުފަން ތާރީޚް", "ޖިންސު", "ބައި", "ފޯނު", ""].map(x => h("th", x)))),
        h("tbody", parsed.slice(0, 300).map((r, i) => { const b = bad(r); return h("tr",
          h("td", i + 1), h("td.ltr", r.nid), h("td", r.name), h("td.ltr", r.dob), h("td", r.gender ? genderName(r.gender) : ""),
          h("td", r.cat ? r.cat.name : r.catText), h("td.ltr", r.phone),
          h("td", b.length ? h("span.tag.red", b.join("، ")) : h("span.tag.green", "✔"))); })))),
      parsed.length > 300 ? h("p.small.muted", "ފުރަތަމަ 300 ލައިން ދައްކަނީ.") : null),
      [{ label: "ކެންސަލް" }, { label: `ވައްދާ (${good.length})`, cls: "primary", onClick: async () => {
        if (!good.length) { toast("ވައްދަން ތައްޔާރު ލައިނެއް ނެތް", "warn"); return false; }
        const cid = S.settings.activeCompetitionId;
        const existing = new Set(list.map(s => s.nid));
        const todo = good.filter(r => !existing.has(r.nid));
        if (!todo.length) { toast("ހުރިހާ އައިޑީއެއް ކުރިންވެސް ލިސްޓުގައި އެބައޮތް", "warn"); return false; }
        const start = await runTransaction(db, async (tx) => {
          const cRef = doc(db, "competitions", cid); const c = await tx.get(cRef);
          const n = (c.exists() && c.data().regCounter) || 0; tx.set(cRef, { regCounter: n + todo.length }, { merge: true });
          return { n, yy: String((c.exists() && c.data().year) || new Date().getFullYear()).slice(-2) };
        });
        for (let i = 0; i < todo.length; i += 400) {
          const b = writeBatch(db);
          todo.slice(i, i + 400).forEach((r, j) => {
            const k = start.n + i + j + 1;
            b.set(doc(db, "students", `${cid}__${r.nid}`), { competitionId: cid, regNo: `R${start.yy}-${String(k).padStart(4, "0")}`,
              nid: r.nid, name: r.name, nameEn: r.nameEn, dob: r.dob, gender: r.gender, permAddress: r.permAddress, island: r.island,
              currentAddress: r.currentAddress, phone: r.phone, email: r.email, categoryId: r.cat.id, categoryName: r.cat.name,
              branch: r.cat.branch || "", ageGroup: r.cat.ageGroup || "", institution: r.institution, instType: r.instType,
              guardianName: r.guardianName, guardianPhone: r.guardianPhone, photoThumb: "", status: "active", sessionId: "", order: 0,
              checkin: null, source: "import", createdAt: serverTimestamp() });
          });
          await b.commit();
        }
        audit("students_import", { count: todo.length, file: file.name });
        toast(`✔ ${todo.length} ދަރިވަރުން ވެއްދިއްޖެ` + (good.length - todo.length ? ` • ${good.length - todo.length} ކުރިން ހުރި` : ""));
        return true;
      } }], { wide: true });
    if (ok) load();
  }
  load();
}

// ------------------------------------------------------------ SESSIONS & SCHEDULE
// ---- filters shared by sessions, schedule and prints
const isFullQuran = (c) => !!c && c.syllabus && ((c.syllabus.type === "juz" && +c.syllabus.from <= 1 && +c.syllabus.to >= 30) || c.syllabus.type === "all");
const BRANCH_OPTS = [["", "ހުރިހާ ގޮފި"], ["mushaf", "ބަލައިގެން"], ["hifz", "ނުބަލައި"], ["full", "މުޅި ޤުރްއާން"]];
const catMatch = (c, f) => !!c && (!f.branch || (f.branch === "full" ? isFullQuran(c) : c.branch === f.branch)) && (!f.age || c.ageGroup === f.age);
const studMatch = (st, f) => (!f.gender || st.gender === f.gender) && (!f.instType || st.instType === f.instType) &&
  (!f.institution || String(st.institution || "").trim() === f.institution) && (!f.age || st.ageGroup === f.age) &&
  (!f.branch || catMatch(catById(st.categoryId), { branch: f.branch }));
function filterBar(studs, init = {}, onChange = () => {}) {
  const insts = [...new Set(studs.map(x => String(x.institution || "").trim()).filter(Boolean))].sort();
  const ages = [...new Set(studs.map(x => x.ageGroup).filter(Boolean))];
  const f = {
    branch: select(BRANCH_OPTS, init.branch || ""),
    age: select([["", "ހުރިހާ ޢުމުރުފުރާ"], ...AGE_GROUPS.filter(a => ages.includes(a[0]) || a[0] === init.age)], init.age || ""),
    gender: select([["", "ދެ ޖިންސު"], ...GENDERS], init.gender || ""),
    instType: select([["", "ހުރިހާ ވައްތަރެއްގެ މުއައްސަސާ"], ...INST_TYPES], init.instType || ""),
    institution: select([["", "ހުރިހާ މުއައްސަސާއެއް"], ...insts.map(i => [i, i])], init.institution || "")
  };
  Object.values(f).forEach(x => x.onchange = onChange);
  return { el: h("div.filters.sched-filters", ...Object.values(f)), val: () => Object.fromEntries(Object.entries(f).map(([k, x]) => [k, x.value])) };
}
const filterText = (f) => [f.branch && BRANCH_OPTS.find(b => b[0] === f.branch)[1], f.age && ageGroupName(f.age), f.gender && genderName(f.gender),
  f.instType && instTypeName(f.instType), f.institution].filter(Boolean).join(" • ");

// ---- Dhivehi day names and number dropdowns
const DAYS_DV = ["އާދިއްތަ", "ހޯމަ", "އަންގާރަ", "ބުދަ", "ބުރާސްފަތި", "ހުކުރު", "ހޮނިހިރު"];
export const dayName = (iso) => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? "" : DAYS_DV[d.getDay()]; };
const numOpts = (from, to, label = "") => Array.from({ length: to - from + 1 }, (_, i) => [String(from + i), `${from + i}${label}`]);
const addMinutes = (hhmm, m) => { if (!hhmm) return ""; const [H, M] = hhmm.split(":").map(Number); const t = (H * 60 + M + m + 1440) % 1440;
  return String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0"); };

// Copies each student's session (day, date, time, reporting time, place, order) onto his application,
// so the student sees it on the registration page with email + name + phone.
async function publishSchedule(studentsList, sessionsList) {
  const sesById = Object.fromEntries(sessionsList.map(x => [x.id, x]));
  const withApp = studentsList.filter(st => st.applicationId);
  let n = 0;
  for (let i = 0; i < withApp.length; i += 400) {
    const b = writeBatch(db);
    withApp.slice(i, i + 400).forEach(st => {
      const se = sesById[st.sessionId];
      b.update(doc(db, "applications", st.applicationId), { updatedAt: serverTimestamp(), schedule: se ? {
        sessionName: se.name, date: se.date, day: dayName(se.date), time: se.time || "", reportTime: se.reportTime || "",
        venue: se.venue || "", order: st.order || 0, note: se.publicNote || "" } : null });
    });
    try { await b.commit(); n += Math.min(400, withApp.length - i); } catch (e) { console.warn("publishSchedule", e); }
  }
  return n;
}

// ---- the secretariat edits the schedule only with a time-limited access (given in 🔐 ހުއްދަ)
async function schedState() {
  const adm = isAdm();
  const can = adm || (actsSecretary() && hasScope("schedule"));
  return { locked: !adm, until: S.grant && S.grant.until, canEdit: can, isAdm: adm, pending: !!(S.grant && !S.grant.active && !S.grant.expired) };
}

export async function sessions(view) {
  if (needComp(view)) return;
  const cats = await loadCategories();
  const users = (await getDocs(collection(db, "users"))).docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active);
  const chiefs = users.filter(u => (u.role === "chief" || u.role === "superadmin")), judges = users.filter(u => (u.role === "judge" || u.role === "superadmin"));
  const card = h("div.card", h("h2", "ސެޝަންތަކާއި ޝެޑިއުލް"));
  const box = h("div", spinner());
  const SS = await schedState();
  const banner = SS.isAdm ? null : h("div.status-box." + (SS.canEdit ? "approved" : "needs_fix"),
    SS.canEdit ? `🔓 ޝެޑިއުލް ބަދަލުކުރުމުގެ ހުއްދަ ހުޅުވިފައި — ${SS.until ? fmtDateTime(SS.until) + " އާ ހަމައަށް" : ""}`
      : SS.pending ? "🔐 ހުއްދައެއް ލިބިފައި — މަތީގައިވާ 'ހުޅުވާ' އިން ކޯޑާއި ގޫގުލް ލޮގިން ދީގެން ހުޅުއްވާ."
      : "🔒 ޝެޑިއުލް ބަލާލެވޭނެ، ބަދަލެއް ނުކުރެވޭނެ. ބަދަލެއް ގެނައުމަށް އެޑްމިން ނުވަތަ ހެޑް ސުޕަވައިޒަރ ވަގުތީ ހުއްދަ ދޭން ޖެހޭ.");
  const lockedOut = !SS.canEdit;
  card.append(banner, h("div.row", h("button.btn.primary", { onclick: () => edit(), disabled: lockedOut }, "+ އާ ސެޝަނެއް"),
    h("button.btn.blue", { onclick: () => autoSchedule(), disabled: lockedOut }, "⚡ އޮޓޯ ޝެޑިއުލް")), h("div", { style: { height: "10px" } }), box);
  view.appendChild(card);
  // reschedule requests forwarded by chief judges
  const reqBox = h("div.card", { style: { display: "none" } });
  view.appendChild(reqBox);
  (async () => {
    try {
      const ns = (await getDocs(query(collection(db, "notes"), where("competitionId", "==", S.settings.activeCompetitionId)))).docs
        .map(d => ({ id: d.id, ...d.data() })).filter(n => n.kind === "reschedule" && n.status === "forwarded");
      if (!ns.length) return;
      reqBox.style.display = "";
      reqBox.append(h("h3", `📅 ރިޝެޑިއުލަށް ޗީފް ޖަޖުން ފޮނުވި އެދުންތައް (${ns.length})`),
        ...ns.map(n => h("div.note-item.orange", h("b", `${n.studentName} — #${n.order} • ${n.sessionName} (${n.sessionDate})`), n.text ? h("div", n.text) : null,
          h("div.small.muted", `${n.byName} • ފޮނުވީ: ${n.forwardedBy || ""}`),
          h("button.btn.sm", { style: { marginTop: "6px" }, onclick: async (e) => { await updateDoc(doc(db, "notes", n.id), { status: "done", doneBy: S.me.email, doneAt: serverTimestamp() });
            e.target.closest(".note-item").remove(); toast("ނިމުނީ ✔"); } }, "✔ ރިޝެޑިއުލް ކުރެވިއްޖެ"))));
    } catch (e) {}
  })();
  let list = [], studs = [];
  async function load() {
    list = await loadSessions(true);
    studs = (await getDocs(query(collection(db, "students"), where("competitionId", "==", S.settings.activeCompetitionId)))).docs.map(d => ({ id: d.id, ...d.data() }));
    draw();
  }
  const ST = { planned: ["ރޭވިފައި", "blue"], live: ["ހިނގަމުންދަނީ", "green"], closed: ["ނިމިފައި", "gold"] };
  function draw() {
    box.innerHTML = "";
    if (!list.length) return box.appendChild(empty("ސެޝަނެއް ނެތް"));
    box.appendChild(h("div.tbl-wrap", h("table.tbl",
      h("thead", h("tr", ["ސެޝަން", "ދުވަސް / ތާރީޚް", "ހާޟިރުވާ / ފަށާ", "ތަން", "ބައިތައް", "ޗީފް ޖަޖު", "ޖަޖުން", "ދަރިވަރުން", "ޙާލަތު", ""].map(x => h("th", x)))),
      h("tbody", list.map(s => h("tr",
        h("td", h("b", s.name)), h("td", dayName(s.date) + " ", h("span.ltr", s.date)),
        h("td.ltr", (s.reportTime ? s.reportTime + " / " : "") + (s.time || "")), h("td", s.venue || ""),
        h("td.small", (s.categoryIds || []).map(id => (catById(id) || {}).name).join("، ")),
        h("td", s.chiefName || s.chiefEmail || "-"), h("td.small", (s.judges || []).map(j => j.slot + ". " + j.name).join("، ")),
        h("td", h("span" + ((s.order || []).length > (s.capacity || 1e9) ? ".tag.red" : ""), `${(s.order || []).length}${s.capacity ? " / " + s.capacity : ""}`)),
        h("td", h("span.tag." + (ST[s.status] || ST.planned)[1], (ST[s.status] || ST.planned)[0])),
        h("td", h("div.row",
          h("button.btn.sm", { onclick: () => edit(s), disabled: lockedOut }, "އެޑިޓް"),
          h("button.btn.sm.blue", { onclick: () => assign(s), disabled: lockedOut }, "ދަރިވަރުން / ތަރުތީބު"),
          h("button.btn.sm.gold", { onclick: () => sessionPackage(s, studs) }, "📦 ސެޝަން ފައިލު"),
          s.status === "closed" ? h("button.btn.sm", { onclick: () => setStatus(s, "planned") }, "އަލުން ހުޅުވާ") : null))))))));
  }
  async function setStatus(s, st) {
    await updateDoc(doc(db, "sessions", s.id), { status: st }); audit("session_status", { id: s.id, st }); load();
  }
  async function edit(s0) {
    const s = s0 ? JSON.parse(JSON.stringify(s0)) : { name: "", date: todayISO(), time: "09:00", venue: "", categoryIds: [], judges: [], chiefEmail: "", status: "planned" };
    const nm = h("input", { value: s.name }), dt = h("input", { type: "date", value: s.date }), tm = h("input", { type: "time", value: s.time || "" });
    const vn = h("input", { value: s.venue || "" });
    const rp = select([["", "—"], ...[15, 30, 45, 60, 90, 120].map(m => [String(m), `ފެށުމުގެ ${m} މިނިޓު ކުރިން`])],
      s.reportBefore != null ? String(s.reportBefore) : "30");
    const capSel = select(numOpts(1, 200, " ދަރިވަރުން"), String(s.capacity || 25));
    const pNote = h("input", { value: s.publicNote || "", placeholder: "މިސާލު: އައިޑީ ކާޑު ގެންނަވާ" });
    const catChecks = cats.map(c => { const cb = h("input", { type: "checkbox", value: c.id }); cb.checked = (s.categoryIds || []).includes(c.id);
      const l = h("label.row", cb, c.name, h("span.small.muted", `  (${BRANCHES[c.branch] || ""}${isFullQuran(c) ? " • މުޅި ޤުރްއާން" : ""})`)); l.dataset.cat = c.id; return l; });
    const fb = filterBar(studs, s.studentFilter || {}, () => {
      const v = fb.val();
      catChecks.forEach(l => { const c = catById(l.dataset.cat); l.style.display = catMatch(c, v) || l.querySelector("input").checked ? "" : "none"; });
      cnt.textContent = `މި ފިލްޓަރަށް ދިމާވާ ދަރިވަރުން: ${studs.filter(st => studMatch(st, v) && catMatch(catById(st.categoryId), v)).length}`;
    });
    const cnt = h("div.small.muted");
    const ch = select([["", "— ހޮވާ —"], ...chiefs.map(u => [u.email, u.name])], s.chiefEmail);
    const jBox = h("div");
    const jSel = (s.judges || []).slice().sort((a, b) => a.slot - b.slot);
    const drawJ = () => {
      jBox.innerHTML = "";
      jSel.forEach((j, i) => { j.slot = i + 1; jBox.appendChild(h("div.row", { style: { marginBottom: "4px" } }, h("span.tag.gold", "ޖަޖު " + j.slot), h("span.grow", j.name),
        h("button.btn.sm", { onclick: () => { if (i) { [jSel[i - 1], jSel[i]] = [jSel[i], jSel[i - 1]]; drawJ(); } } }, "▲"),
        h("button.btn.sm.red", { onclick: () => { jSel.splice(i, 1); drawJ(); } }, "✕"))); });
      const avail = judges.filter(u => !jSel.find(j => j.email === u.email));
      if (avail.length) { const add = select([["", "+ ޖަޖަކު އިތުރުކުރޭ"], ...avail.map(u => [u.email, u.name])], "");
        add.onchange = () => { const u = judges.find(x => x.email === add.value); if (u) { jSel.push({ email: u.email, name: u.name, slot: jSel.length + 1 }); drawJ(); } };
        jBox.appendChild(add); }
    };
    drawJ();
    const ok = await modal(s0 ? "ސެޝަން އެޑިޓް" : "އާ ސެޝަނެއް", h("div",
      h("div.grid2", field("ސެޝަނުގެ ނަން (މިސާލު: ހެނދުނު ދަންފަޅި 1)", nm), field("ތަން / ހޯލް", vn)),
      h("div.grid3", field("ތާރީޚް", dt), field("ފަށާ ވަގުތު", tm), field("ދަރިވަރުން ހާޟިރުވާންވީ", rp)),
      h("div.grid2", field("ސެޝަނަކަށް ދަރިވަރުން (އެންމެ ގިނަވެގެން)", capSel), field("ދަރިވަރުންނަށް ނޯޓު (ފޯމުގެ ސްކްރީނުގައި ފެންނާނެ)", pNote)),
      h("h3", "ދަރިވަރުން ފިލްޓަރު (ގޮފި • ޢުމުރުފުރާ • ޖިންސު • މުއައްސަސާ)"), fb.el, cnt,
      h("h3", "ބައިތައް"), h("div.grid3", catChecks),
      h("div.grid2", field("ޗީފް ޖަޖު", ch), h("div", h("h3", "ޖަޖުން (ތަރުތީބުން)"), jBox))),
      [...(s0 ? [{ label: "🗑", cls: "red", onClick: async () => {
        if (!await confirmBox("ސެޝަން ފޮހެލުން", "ފޮހެލަންވީތޯ؟", "ފޮހެލާ", "red")) return false;
        await deleteDoc(doc(db, "sessions", s0.id));
        const gone = studs.filter(st => st.sessionId === s0.id);
        if (gone.length) { const b = writeBatch(db); gone.forEach(st => b.update(doc(db, "students", st.id), { sessionId: "", order: 0 })); await b.commit();
          await publishSchedule(gone.map(st => ({ ...st, sessionId: "" })), []); }
        audit("session_delete", { id: s0.id }); return true; } }] : []),
      { label: "ކެންސަލް" }, { label: "ސޭވް", cls: "primary", onClick: async () => {
        const catIds = catChecks.map(l => l.querySelector("input")).filter(c => c.checked).map(c => c.value);
        if (!nm.value.trim() || !dt.value || !catIds.length) { toast("ނަމާއި ތާރީޚާއި ބައި ހޮއްވަވާ", "err"); return false; }
        if (!ch.value) { toast("ޗީފް ޖަޖު ހޮއްވަވާ", "err"); return false; }
        if (!jSel.length) { toast("މަދުވެގެން އެއް ޖަޖަކު ހޮއްވަވާ", "err"); return false; }
        const chief = chiefs.find(u => u.email === ch.value);
        const data = { competitionId: S.settings.activeCompetitionId, name: nm.value.trim(), date: dt.value, time: tm.value, venue: vn.value.trim(),
          categoryIds: catIds, chiefEmail: ch.value, chiefName: chief ? chief.name : "", judges: jSel, judgeEmails: jSel.map(j => j.email),
          reportBefore: rp.value === "" ? null : +rp.value, reportTime: rp.value === "" ? "" : addMinutes(tm.value, -(+rp.value)),
          capacity: +capSel.value, publicNote: pNote.value.trim(), studentFilter: fb.val(), updatedAt: serverTimestamp() };
        if (!s0) Object.assign(data, { status: "planned", order: [], createdAt: serverTimestamp() });
        const id = s0 ? s0.id : "S" + dt.value.replace(/-/g, "") + "_" + Math.random().toString(36).slice(2, 6);
        await setDoc(doc(db, "sessions", id), data, { merge: true });
        if (s0) await publishSchedule(studs.filter(st => st.sessionId === id), [{ ...s0, ...data, id }]);   // date / time / place changed
        audit(s0 ? "session_update" : "session_create", { id, name: data.name, changes: diffOf(s0 || {}, { ...data, judges: (data.judges || []).map(j => j.name) }) }); return true;
      } }], { wide: true });
    if (ok) { cache.sessions = null; load(); }
  }
  async function assign(s) {
    const eligibleAll = studs.filter(st => (s.categoryIds || []).includes(st.categoryId) && st.status !== "withdrawn");
    let eligible = eligibleAll.filter(st => studMatch(st, s.studentFilter || {}));
    const afb = filterBar(eligibleAll, s.studentFilter || {}, () => { eligible = eligibleAll.filter(st => studMatch(st, afb.val())); draw2(); });
    let order = (s.order || []).filter(id => eligibleAll.find(e => e.id === id));
    const listBox = h("div"), poolBox = h("div");
    const byId = (id) => studs.find(x => x.id === id) || {};
    const other = (st) => st.sessionId && st.sessionId !== s.id ? (list.find(x => x.id === st.sessionId) || {}).name : "";
    const draw2 = () => {
      listBox.innerHTML = ""; poolBox.innerHTML = "";
      listBox.appendChild(h("h3", `ތަރުތީބު (${order.length}${s.capacity ? " / " + s.capacity : ""})`,
        s.capacity && order.length > s.capacity ? h("span.tag.red", { style: { marginInlineStart: "8px" } }, "ޖާގައަށްވުރެ ގިނަ") : null));
      order.forEach((id, i) => { const st = byId(id);
        listBox.appendChild(h("div.queue-item", h("b", i + 1), photoTag(st.photoThumb), h("div.grow", st.name, h("div.small.muted", st.regNo + " • " + st.categoryName)),
          h("button.btn.sm", { onclick: () => { if (i) { [order[i - 1], order[i]] = [order[i], order[i - 1]]; draw2(); } } }, "▲"),
          h("button.btn.sm", { onclick: () => { if (i < order.length - 1) { [order[i + 1], order[i]] = [order[i], order[i + 1]]; draw2(); } } }, "▼"),
          h("button.btn.sm.red", { onclick: () => { order.splice(i, 1); draw2(); } }, "✕"))); });
      const pool = eligible.filter(st => !order.includes(st.id));
      poolBox.appendChild(h("h3", `ބައިވެރިވެވޭނެ ދަރިވަރުން (${pool.length})`));
      poolBox.appendChild(h("div.row", h("button.btn.sm", { onclick: () => { order.push(...pool.filter(p => !other(p)).map(p => p.id)); draw2(); } }, "ސެޝަނެއް ނެތް ހުރިހާ މީހުން ލާ")));
      pool.forEach(st => poolBox.appendChild(h("div.queue-item", { onclick: () => { order.push(st.id); draw2(); } }, photoTag(st.photoThumb),
        h("div.grow", st.name, h("div.small.muted", st.regNo + " • " + st.categoryName + (other(st) ? " • ⚠ " + other(st) : ""))), h("span", "+"))));
    };
    draw2();
    const ok = await modal("ދަރިވަރުން — " + s.name, h("div", afb.el,
      h("div.row", h("button.btn.sm", { onclick: () => { order.sort((a, b) => String(byId(a).regNo).localeCompare(String(byId(b).regNo))); draw2(); } }, "ރެޖި އަށް ތަރުތީބު"),
        h("button.btn.sm", { onclick: () => { const r = new Uint32Array(order.length); crypto.getRandomValues(r);
          for (let i = order.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [order[i], order[j]] = [order[j], order[i]]; } draw2(); } }, "🎲 ރެންޑަމް ތަރުތީބު"),
        h("button.btn.sm", { onclick: () => { order.sort((a, b) => String(byId(a).categoryName).localeCompare(String(byId(b).categoryName))); draw2(); } }, "ބައި އަށް")),
      h("div.grid2", listBox, poolBox)),
      [{ label: "ކެންސަލް" }, { label: "ސޭވް", cls: "primary", onClick: async () => {
        const b = writeBatch(db);
        b.update(doc(db, "sessions", s.id), { order, roster: rosterOf(order, Object.fromEntries(studs.map(x => [x.id, x]))), rosterAt: serverTimestamp() });
        order.forEach((id, i) => b.update(doc(db, "students", id), { sessionId: s.id, order: i + 1 }));
        (s.order || []).filter(id => !order.includes(id)).forEach(id => { if (byId(id).sessionId === s.id) b.update(doc(db, "students", id), { sessionId: "", order: 0 }); });
        await b.commit();
        const touched = studs.filter(st => order.includes(st.id) || (s.order || []).includes(st.id))
          .map(st => ({ ...st, sessionId: order.includes(st.id) ? s.id : (st.sessionId === s.id ? "" : st.sessionId), order: order.includes(st.id) ? order.indexOf(st.id) + 1 : st.order }));
        await publishSchedule(touched, [s, ...list]);
        audit("session_assign", { id: s.id, n: order.length }); return true;
      } }], { wide: true });
    if (ok) { toast("ސޭވް ކުރެވިއްޖެ"); load(); }
  }
  async function autoSchedule() {
    const catSel = select([["*", "ހުރިހާ ބައެއް (ކޮންމެ ބައެއް ވަކިވަކި)"], ...cats.map(c => [c.id, c.name])], "*");
    const sfb = filterBar(studs, {}, () => showPrev());
    const dt = h("input", { type: "date", value: todayISO() }), tm = h("input", { type: "time", value: "09:00" });
    const cap = select(numOpts(1, 200, " ދަރިވަރުން"), "25");
    const perDay = select(numOpts(1, 6, " ސެޝަން"), "1");
    const gap = select([["60", "1 ގަޑިއިރު"], ["90", "1.5 ގަޑިއިރު"], ["120", "2 ގަޑިއިރު"], ["150", "2.5 ގަޑިއިރު"], ["180", "3 ގަޑިއިރު"], ["240", "4 ގަޑިއިރު"]], "180");
    const rp = select([["", "—"], ...[15, 30, 45, 60, 90, 120].map(m => [String(m), `ފެށުމުގެ ${m} މިނިޓު ކުރިން`])], "30");
    const vn = h("input", { placeholder: "ހޯލް / ތަން" }), pNote = h("input", { placeholder: "މިސާލު: އައިޑީ ކާޑު ގެންނަވާ" });
    const skipFri = h("input", { type: "checkbox" }); skipFri.checked = true;
    const orderBy = select([["random", "🎲 ރެންޑަމް"], ["reg", "ރެޖިސްޓްރޭޝަން ނަންބަރަށް"], ["name", "ނަމަށް"]], "random");
    const ch = select([["", "— ޗީފް ޖަޖު —"], ...chiefs.map(u => [u.email, u.name])], "");
    const jChecks = judges.map(u => { const c = h("input", { type: "checkbox", value: u.email }); return h("label.row", c, u.name); });
    const prev = h("div.small.muted", { style: { marginTop: "8px" } });
    const pools = () => { const v = sfb.val();
      return (catSel.value === "*" ? cats : cats.filter(c => c.id === catSel.value)).filter(c => catMatch(c, v))
        .map(c => ({ cat: c, pool: studs.filter(st => st.categoryId === c.id && !st.sessionId && st.status !== "withdrawn" && studMatch(st, v)) })).filter(x => x.pool.length); };
    const showPrev = () => {
      const ps = pools(), n = +cap.value;
      const total = ps.reduce((a, x) => a + x.pool.length, 0), sesN = ps.reduce((a, x) => a + Math.ceil(x.pool.length / n), 0);
      prev.textContent = total ? `ސެޝަނަކަށް ނުލެވޭ ${total} ދަރިވަރުން → ${sesN} ސެޝަން • ${Math.ceil(sesN / +perDay.value)} ދުވަސް` : "ސެޝަނަކަށް ނުލެވޭ ދަރިވަރަކު ނެތް";
    };
    [catSel, cap, perDay].forEach(x => x.onchange = showPrev); showPrev();
    const ok = await modal("⚡ އޮޓޯ ޝެޑިއުލް — ސެޝަނަކަށް ނުލެވޭ ދަރިވަރުން ބަހާލާ", h("div",
      h("div.grid2", field("ބައި", catSel), field("ސެޝަނަކަށް ދަރިވަރުން", cap)),
      h("div.small.muted", "ފިލްޓަރު (ގޮފި، މުޅި ޤުރްއާން، ޢުމުރުފުރާ، ޖިންސު، މުއައްސަސާ):"), sfb.el,
      h("div.grid3", field("ފަށާ ތާރީޚް", dt), field("ފުރަތަމަ ސެޝަން ފަށާ ގަޑި", tm), field("ދަރިވަރުން ހާޟިރުވާންވީ", rp)),
      h("div.grid3", field("ދުވަހަކަށް ސެޝަން", perDay), field("ސެޝަންތަކުގެ ދެމެދު", gap), field("ތަރުތީބު", orderBy)),
      h("div.grid2", field("ތަން", vn), field("ދަރިވަރުންނަށް ނޯޓު", pNote)),
      h("label.row", skipFri, "ހުކުރު ދުވަސް ދޫކޮށްލާ"),
      h("div.grid2", field("ޗީފް ޖަޖު", ch), h("div", h("h3", "ޖަޖުން (ތަރުތީބުން)"), h("div.grid2", jChecks))), prev,
      h("p.small.muted", "ޝެޑިއުލް ހެދުމާއެކު ކޮންމެ ދަރިވަރަކަށް ހާޟިރުވާންވީ ދުވަހާއި ގަޑިއާއި ތަން ރަޖިސްޓްރޭޝަން ފޯމުގެ ސްކްރީނުން ފެންނާނެ.")),
      [{ label: "ކެންސަލް" }, { label: "ހަދާ", cls: "primary", onClick: async () => {
        const js = jChecks.map(l => l.querySelector("input")).filter(c => c.checked).map((c, i) => { const u = judges.find(x => x.email === c.value); return { email: u.email, name: u.name, slot: i + 1 }; });
        if (!ch.value || !js.length) { toast("ޗީފް ޖަޖާއި ޖަޖުން ހޮއްވަވާ", "err"); return false; }
        const ps = pools();
        if (!ps.length) { toast("ސެޝަނަކަށް ނުލެވޭ ދަރިވަރަކު ނެތް", "warn"); return false; }
        const n = +cap.value, per = +perDay.value, chief = chiefs.find(u => u.email === ch.value);
        let day = new Date(dt.value + "T00:00:00"), slot = 0;
        const nextSlot = () => {
          if (slot >= per) { slot = 0; day = new Date(day.getTime() + 86400000); }
          while (skipFri.checked && day.getDay() === 5) day = new Date(day.getTime() + 86400000);
          const time = addMinutes(tm.value, slot * +gap.value); slot++;
          const iso = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, "0")}-${String(day.getDate()).padStart(2, "0")}`;
          return { date: iso, time };
        };
        const made = [], moved = [];
        for (const { cat, pool } of ps) {
          if (orderBy.value === "reg") pool.sort((a, b) => String(a.regNo).localeCompare(String(b.regNo)));
          else if (orderBy.value === "name") pool.sort((a, b) => String(a.name).localeCompare(String(b.name)));
          else { const r = new Uint32Array(pool.length); crypto.getRandomValues(r); for (let i = pool.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; } }
          for (let k = 0; k * n < pool.length; k++) {
            const part = pool.slice(k * n, k * n + n), when = nextSlot();
            const id = "S" + when.date.replace(/-/g, "") + "_" + when.time.replace(":", "") + "_" + Math.random().toString(36).slice(2, 6);
            const ft = filterText(sfb.val());
            const data = { competitionId: S.settings.activeCompetitionId, name: `${cat.name}${ft ? " (" + ft + ")" : ""} — ${k + 1}`, date: when.date, time: when.time, studentFilter: sfb.val(),
              reportBefore: rp.value === "" ? null : +rp.value, reportTime: rp.value === "" ? "" : addMinutes(when.time, -(+rp.value)),
              venue: vn.value.trim(), publicNote: pNote.value.trim(), capacity: n,
              categoryIds: [cat.id], chiefEmail: chief.email, chiefName: chief.name, judges: js, judgeEmails: js.map(j => j.email), status: "planned",
              order: part.map(p => p.id), roster: rosterOf(part.map(p => p.id), Object.fromEntries(part.map(p => [p.id, p]))), createdAt: serverTimestamp() };
            const b = writeBatch(db);
            b.set(doc(db, "sessions", id), data);
            part.forEach((p, i) => { b.update(doc(db, "students", p.id), { sessionId: id, order: i + 1 }); moved.push({ ...p, sessionId: id, order: i + 1 }); });
            await b.commit();
            made.push({ id, ...data });
          }
        }
        await publishSchedule(moved, made);
        audit("auto_schedule", { sessions: made.length, n: moved.length });
        toast(`✔ ${made.length} ސެޝަން • ${moved.length} ދަރިވަރުން`); return true;
      } }], { wide: true });
    if (ok) { cache.sessions = null; load(); }
  }
  load();
}

// ------------------------------------------------------------ SESSION PACKAGE
// Every sheet of one session in ONE order (the session's order numbers): notice board, attendance,
// each judge's session table, and the A5 hand-marking sheets — so the screens and the papers line up.
async function sessionPackage(s, studs) {
  const byId = Object.fromEntries(studs.map(x => [x.id, x]));
  const rows = (s.order || []).map(id => byId[id]).filter(Boolean).map((st, i) => ({ ...st, order: i + 1 }));
  if (!rows.length) return toast("މި ސެޝަނަށް ދަރިވަރުން ލާފައެއް ނުވޭ", "warn");
  const parts = [["notice", "📌 ނޯޓިސް ބޯޑު (ހޯލުގެ ބޭރު)"], ["attend", "✍ ހާޟިރީ ޝީޓު"], ["judges", "📑 ޖަޖުންގެ ސެޝަން ޖަދުވަލު (ކޮންމެ ޖަޖަކަށް)"], ["a5", "📝 A5 ޖަޖު ޝީޓު (މެނުއަލް މާކްސް)"]];
  const checks = parts.map(([k, t]) => { const c = h("input", { type: "checkbox", value: k }); c.checked = k !== "a5"; return h("label.row", c, t); });
  const ok = await modal("📦 ސެޝަން ފައިލު — " + s.name, h("div",
    h("p.small.muted", `${rows.length} ދަރިވަރުން • ހުރިހާ ޝީޓެއްގައި ހަމަ އެއް ތަރުތީބު ނަންބަރު (#1 … #${rows.length})`), ...checks), [{ label: "ކެންސަލް" }, { label: "🖨 ޕްރިންޓް", cls: "primary", value: true }]);
  if (!ok) return;
  const want = new Set(checks.map(l => l.querySelector("input")).filter(c => c.checked).map(c => c.value));
  const head = sessHeadHTML(s);
  const pb = `<div style="page-break-after:always"></div>`;
  const out = [];
  if (want.has("notice")) out.push(`<h2 style="text-align:center">ނޯޓިސް ބޯޑު</h2>` + head + tableHTML([
    { t: "#", cls: "num", v: r => r.order }, { t: "ނަން", v: r => r.name }, { t: "ރެޖި", v: r => r.regNo }, { t: "ބައި", v: r => r.categoryName },
    { t: "ޢުމުރުފުރާ", v: r => ageGroupName(r.ageGroup) }, { t: "މުއައްސަސާ", v: r => r.institution || "" }], rows) +
    (s.publicNote ? `<p class="box">📌 ${esc(s.publicNote)}</p>` : ""));
  if (want.has("attend")) out.push(`<h2 style="text-align:center">ހާޟިރީ ޝީޓު</h2>` + head + tableHTML([
    { t: "#", cls: "num", v: r => r.order }, { t: "ފޮޓޯ", cls: "num", html: r => r.photoThumb ? `<img class="ph" src="${r.photoThumb}">` : "" },
    { t: "ނަން", v: r => r.name }, { t: "ރެޖި", v: r => r.regNo }, { t: "އައިޑީ", v: r => r.nid }, { t: "ބައި", v: r => r.categoryName },
    { t: "ހާޟިރު ✔", html: () => "<div style='width:40px;height:22px'></div>" }, { t: "ގަޑި", html: () => "<div style='width:50px'></div>" },
    { t: "ސޮއި", html: () => "<div style='width:90px;height:22px'></div>" }], rows) + sigBlock(["ހާޟިރީ ބެލި މުވައްޒަފު", "ޗީފް ޖަޖު"]));
  const byCat = {}; rows.forEach(r => (byCat[r.categoryId] = byCat[r.categoryId] || []).push(r));
  const judges = (s.judges || []).length ? s.judges : [{ slot: "", name: "" }];
  if (want.has("judges")) judges.forEach(j => out.push(sessionJudgeTableHTML(rows, mainCat(rows), s, j)));
  if (want.has("a5")) judges.forEach(j => out.push(rows.map(r => a5JudgeSheetHTML([r], catById(r.categoryId), s, [j])).join("")));
  printDoc("ސެޝަން ފައިލު — " + s.name, `<style>.sess-head{border:2px solid #000;border-radius:6px;padding:6px 10px;margin:6px 0 10px;text-align:center;line-height:1.8}</style>` + out.join(pb), { landscape: true });
}

// ------------------------------------------------------------ ACCESS (admin / head supervisor)
// Secretaries, judges and chief judges cannot edit or delete information by default.
// A time-limited access is given here; the person opens it with the 6-digit code (given by phone)
// + a fresh Google sign-in. It ends by itself and must be renewed. Everything is kept in the history.
const SCOPE_DV = { students: "ދަރިވަރުންގެ މަޢުލޫމާތު", schedule: "ޝެޑިއުލް / ސެޝަން", marks: "ޖަޖުންގެ މާކްސް ވެއްދުން (ޕްލޭން B)" };
export async function scheduleAccess(view) {
  const users = (await getDocs(collection(db, "users"))).docs.map(d => ({ id: d.id, ...d.data() }))
    .filter(u => u.active && ["secretary", "chief", "adminsec", "supervisor", "judge", "checkin"].includes(u.role));
  const card = h("div.card"); view.appendChild(card);
  async function draw() {
    const gs = (await getDocs(collection(db, "grants"))).docs.map(d => ({ id: d.id, ...d.data() }))
      .map(g => ({ ...g, untilD: g.until && g.until.toDate ? g.until.toDate() : null }))
      .filter(g => g.id !== "schedule");
    card.innerHTML = "";
    card.append(h("h2", "🔐 ބަދަލުކުރުމުގެ ވަގުތީ ހުއްދަ"),
      h("p.small.muted", "ސެކްރެޓަރީ، ޖަޖު އަދި ޗީފް ޖަޖަކަށް ޑިފޯލްޓްކޮށް އެއްވެސް މަޢުލޫމާތެއް ބަދަލެއް ނުވަތަ ފޮހެލުމެއް ނުކުރެވޭނެ. " +
        "ހުއްދަ ދިނުމުން ދައްކާ 6 ނަންބަރުގެ ކޯޑު ފޯނުން ދެއްވާ. އޭނާ އެ ކޯޑާއި ގޫގުލް އިން އަލުން ލޮގިން ވެގެން (ދެވަނަ ވެރިފިކޭޝަން) ހުއްދަ ހުޅުވާނެ. " +
        "ވަގުތު ހަމަވުމުން ހުއްދަ ނިމޭނެ — ރިނިއު ކުރަން ޖެހޭނެ. ހުރިހާ ބަދަލެއް 📜 ހިސްޓްރީގައި ފެންނާނެ."));
    const who = select([["", "— މީހަކު ހޮވާ —"], ...users.map(u => [u.id, `${u.name || u.id} — ${roleName(u.role)}`])], "");
    const asSec = h("input", { type: "checkbox" });
    const scopes = Object.entries(SCOPE_DV).map(([k, t]) => { const c = h("input", { type: "checkbox", value: k }); c.checked = true; return h("label.row", c, t); });
    const hrs = select([["1", "1 ގަޑިއިރު"], ["2", "2 ގަޑިއިރު"], ["4", "4 ގަޑިއިރު"], ["8", "8 ގަޑިއިރު"], ["12", "12 ގަޑިއިރު"], ["24", "1 ދުވަސް"]], "2");
    const why = h("input", { placeholder: "ސަބަބު (މިސާލު: ރިޝެޑިއުލް، ދަރިވަރެއްގެ ނަން ރަނގަޅުކުރުން)" });
    const out = h("div");
    who.onchange = () => { const u = users.find(x => x.id === who.value); asSec.checked = !!(u && u.role !== "secretary"); };
    card.append(h("h3", "+ އާ ހުއްދައެއް"),
      h("div.grid3", field("މީހާ", who), field("މުއްދަތު", hrs), field("ސަބަބު", why)),
      h("div.row", ...scopes, h("label.row", asSec, "ސެކްރެޓަރީގެ ރޯލް ދޭ (ސެކްރެޓަރީ ނެތް ހާލަތުގައި — މިސާލު ޗީފް ޖަޖަށް)")),
      h("button.btn.green", { onclick: async () => {
        if (!who.value) return toast("މީހަކު ހޮއްވަވާ", "warn");
        const sc = scopes.map(l => l.querySelector("input")).filter(c => c.checked).map(c => c.value);
        if (!sc.length) return toast("ހުއްދަ ދޭ ބައެއް ހޮއްވަވާ", "warn");
        const code = String(Math.floor(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000)));
        const u = users.find(x => x.id === who.value);
        await setDoc(doc(db, "grants", who.value), { email: who.value, name: u.name || "", userRole: u.role, role: asSec.checked ? "secretary" : u.role,
          scopes: sc, until: new Date(Date.now() + +hrs.value * 3600000), codeHash: await sha256Hex(code), activatedAt: null, code: "",
          reason: why.value.trim(), by: S.me.email, byName: S.me.name || "", at: serverTimestamp() });
        audit("grant_give", { to: who.value, hours: +hrs.value, scopes: sc, asSecretary: asSec.checked, reason: why.value.trim() });
        out.innerHTML = "";
        out.appendChild(h("div.grant-code", h("div", `${u.name || u.id} އަށް ދޭ ކޯޑު:`), h("b.ltr", code),
          h("div.small.muted", "މި ކޯޑު ދެން ނުފެންނާނެ — ފޯނުން ދެއްވާ.")));
        draw2();
      } }, "✔ ހުއްދަ ދީ ކޯޑު ހަދާ"), out);
    const list = h("div"); card.append(h("h3", "ހުއްދަތައް"), list);
    function draw2() { getDocs(collection(db, "grants")).then(snap => {
      const now = new Date();
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(g => g.id !== "schedule")
        .map(g => ({ ...g, untilD: g.until && g.until.toDate ? g.until.toDate() : null }))
        .sort((a, b) => (b.untilD || 0) - (a.untilD || 0));
      list.innerHTML = "";
      if (!rows.length) return list.appendChild(empty("ހުއްދައެއް ނެތް"));
      list.appendChild(h("div.tbl-wrap", h("table.tbl", h("thead", h("tr", ["މީހާ", "ރޯލް", "ހުއްދަ", "ހަމަވާ", "ޙާލަތު", "ދިނީ", ""].map(x => h("th", x)))),
        h("tbody", rows.map(g => { const live = g.untilD && g.untilD > now;
          return h("tr", h("td", h("b", g.name || g.id), h("div.small.muted.ltr", g.id)), h("td", roleName(g.role) + (g.role !== g.userRole ? " (ވަގުތީ)" : "")),
            h("td.small", (g.scopes || []).map(x => SCOPE_DV[x] || x).join("، ")), h("td.small", g.untilD ? fmtDateTime(g.untilD) : "-"),
            h("td", !live ? h("span.tag", "ހަމަވެއްޖެ") : g.activatedAt ? h("span.tag.green", "🔓 ހުޅުވާފައި") : h("span.tag.orange", "🔐 ކޯޑަށް އިންތިޒާރު")),
            h("td.small", g.byName || g.by || ""),
            h("td", h("div.row", { style: { gap: "4px" } },
              h("button.btn.sm", { onclick: async () => { const n = new Date(Math.max(now, g.untilD || now).valueOf() + 2 * 3600000);
                await updateDoc(doc(db, "grants", g.id), { until: n, renewedBy: S.me.email, renewedAt: serverTimestamp() });
                audit("grant_renew", { to: g.id, until: n.toISOString() }); toast("2 ގަޑިއިރަށް ރިނިއު ކުރެވިއްޖެ"); draw2(); } }, "⟳ +2 ގަޑި"),
              live ? h("button.btn.sm.red", { onclick: async () => { await updateDoc(doc(db, "grants", g.id), { until: new Date(0), revokedBy: S.me.email, revokedAt: serverTimestamp() });
                audit("grant_revoke", { to: g.id }); toast("ހުއްދަ ނިންމާލެވިއްޖެ"); draw2(); } }, "✖ ނިންމާ") : null))); })))));
    }); }
    draw2();
  }
  draw();
}

// session header used on every printed sheet (same as the 📦 session package)
const SESS_CSS = `<style>.sess-head{border:2px solid #000;border-radius:6px;padding:6px 10px;margin:6px 0 10px;text-align:center;line-height:1.8}</style>`;
// public sheets (notice board, lists, attendance) never show the judges
function sessHeadHTML(s) {
  if (!s) return `<div class="sess-head"><b>ސެޝަނަކަށް ނުލާ ދަރިވަރުން</b></div>`;
  return `<div class="sess-head"><div><b><bdi>${esc(s.name)}</bdi></b></div><div>${esc(dayDv(s.date))} <bdi>${esc(s.date || "")}</bdi> • ފަށާ ގަޑި: <b>${esc(s.time || "")}</b>${s.reportTime ? ` • ހާޟިރުވާ ގަޑި: <b>${esc(s.reportTime)}</b>` : ""}${s.venue ? " • " + esc(s.venue) : ""}</div></div>`;
}
// the category whose rubric the session's judges' table uses (the most common one in the session)
function mainCat(list) { const c = {}; list.forEach(r => c[r.categoryId] = (c[r.categoryId] || 0) + 1); return catById(Object.keys(c).sort((a, b) => c[b] - c[a])[0]); }

export async function prints(view) {
  if (needComp(view)) return;
  const [cats, sess] = await Promise.all([loadCategories(), loadSessions(true)]);
  const studs = (await getDocs(query(collection(db, "students"), where("competitionId", "==", S.settings.activeCompetitionId)))).docs.map(d => ({ id: d.id, ...d.data() }));
  const sesById = Object.fromEntries(sess.map(s => [s.id, s]));
  const today = todayISO();
  const dates = [...new Set(sess.map(s => s.date).filter(Boolean))].sort();

  // ---- filters (all combine)
  const fDate = select([["", "ހުރިހާ ދުވަހެއް"], ...dates.map(d => [d, `${dayDv(d)} ${d}${d === today ? " (މިއަދު)" : ""}`])], "");
  const fSes = select([["", "ހުރިހާ ސެޝަނެއް"]], "");
  const fillSes = () => {
    const keep = fSes.value;
    const list = sess.filter(s => !fDate.value || s.date === fDate.value).sort((a, b) => String(a.date + a.time).localeCompare(String(b.date + b.time)));
    fSes.innerHTML = "";
    fSes.appendChild(h("option", { value: "" }, fDate.value ? `ހުރިހާ ސެޝަނެއް (${list.length})` : "ހުރިހާ ސެޝަނެއް"));
    fSes.appendChild(h("option", { value: "__none" }, "ސެޝަނަކަށް ނުލާ ދަރިވަރުން"));
    list.forEach(s => fSes.appendChild(h("option", { value: s.id }, `${s.time || ""} • ${s.name}${s.venue ? " • " + s.venue : ""}${fDate.value ? "" : " • " + s.date}`)));
    fSes.value = [...fSes.options].some(o => o.value === keep) ? keep : "";
  };
  fillSes();
  const fCat = select([["", "ހުރިހާ ބައެއް"], ...cats.map(c => [c.id, c.name])], "");
  const fBr = select(BRANCH_OPTS, "");
  const agesP = [...new Set(studs.map(x => x.ageGroup).filter(Boolean))];
  const fAge = select([["", "ހުރިހާ ޢުމުރުފުރާ"], ...AGE_GROUPS.filter(a => agesP.includes(a[0]))], "");
  const fGen = select([["", "ދެ ޖިންސު"], ...GENDERS], "");
  const fInst = select([["", "ހުރިހާ ވައްތަރެއް"], ...INST_TYPES], "");
  const fInstName = select([["", "ހުރިހާ މުއައްސަސާއެއް"], ...[...new Set(studs.map(x => String(x.institution || "").trim()).filter(Boolean))].sort().map(i => [i, i])], "");
  const fCk = select([["", "ހުރިހާ"], ["in", "ހާޟިރުވި"], ["out", "ނާދޭ"]], "");
  const sigN = select([["3", "3 ސޮއި"], ["5", "5 ސޮއި"], ["7", "7 ސޮއި"]], "3");
  const count = h("div.print-count");

  const byReg = (a, b) => String(a.regNo).localeCompare(String(b.regNo));
  const pick = () => studs.filter(s => {
    const se = sesById[s.sessionId];
    if (fDate.value && !(se && se.date === fDate.value)) return false;
    if (fSes.value === "__none") { if (s.sessionId && se) return false; }
    else if (fSes.value && s.sessionId !== fSes.value) return false;
    return (!fCat.value || s.categoryId === fCat.value) && (!fGen.value || s.gender === fGen.value) && (!fInst.value || s.instType === fInst.value) &&
      (!fCk.value || (fCk.value === "in" ? !!s.checkin : !s.checkin)) && studMatch(s, { branch: fBr.value, age: fAge.value, institution: fInstName.value });
  });
  // every session its own section, in the session's own order (the same numbers as the screens)
  const groupsOf = (rows) => {
    const g = {}; rows.forEach(r => { const k = sesById[r.sessionId] ? r.sessionId : ""; (g[k] = g[k] || []).push(r); });
    return Object.entries(g).map(([sid, list]) => ({ s: sesById[sid] || null, list: sid ? list.sort((a, b) => (a.order || 0) - (b.order || 0)) : list.sort(byReg) }))
      .sort((a, b) => !a.s ? 1 : !b.s ? -1 : String(a.s.date + a.s.time).localeCompare(String(b.s.date + b.s.time)));
  };
  const sub = () => [fDate.value && `${dayDv(fDate.value)} ${fDate.value}`, fSes.value === "__none" ? "ސެޝަނަކަށް ނުލާ" : fSes.value && sesById[fSes.value] && sesById[fSes.value].name,
    fCat.value && (catById(fCat.value) || {}).name, fBr.value && BRANCH_OPTS.find(b => b[0] === fBr.value)[1], fAge.value && ageGroupName(fAge.value),
    fGen.value && genderName(fGen.value), fInst.value && instTypeName(fInst.value), fInstName.value, fCk.value && (fCk.value === "in" ? "ހާޟިރުވި" : "ނާދޭ")]
    .filter(Boolean).join(" • ");
  const refresh = () => { const rows = pick(), gs = groupsOf(rows);
    count.innerHTML = ""; count.append(h("b", rows.length), " ދަރިވަރުން • ", h("b", gs.filter(x => x.s).length), " ސެޝަން", gs.some(x => !x.s) ? " • ސެޝަނަށް ނުލާ ދަރިވަރުން ހިމެނޭ" : ""); };
  fDate.onchange = () => { fillSes(); refresh(); };
  [fSes, fCat, fBr, fAge, fGen, fInst, fInstName, fCk].forEach(x => x.onchange = refresh);
  const PB = `<div style="page-break-after:always"></div>`;
  const run = (title, build, opts = {}) => {
    const rows = pick();
    if (!rows.length) return toast("ލިސްޓުގައި ދަރިވަރަކު ނެތް", "warn");
    const html = opts.flat ? build(rows.sort((a, b) => String((sesById[a.sessionId] || {}).date || "z").localeCompare(String((sesById[b.sessionId] || {}).date || "z")) || (a.order || 0) - (b.order || 0) || byReg(a, b)), null)
      : groupsOf(rows).map(({ s, list }) => (opts.noHead ? "" : sessHeadHTML(s)) + build(list.map((r, i) => ({ ...r, order: s ? r.order || i + 1 : i + 1 })), s)).join(PB);
    printDoc(title, SESS_CSS + html, { sub: sub(), landscape: !!opts.landscape });
  };
  const signers = () => Array.from({ length: +sigN.value }, (_, i) => i === 0 ? "ޗީފް ޖަޖު" : "ޖަޖު " + i);
  const byCatBuild = (list, fn) => { const bc = {}; list.forEach(r => (bc[r.categoryId] = bc[r.categoryId] || []).push(r)); return Object.entries(bc).map(([cid, l]) => fn(l, catById(cid))).join(""); };
  const B = (t, fn) => h("button.btn.lg", { onclick: fn }, t);
  const lab = (t, el) => h("label.field", h("span", t), el);

  view.append(h("div.card", h("div.row.between", h("h2", { style: { margin: 0 } }, "ލިސްޓާއި ޕްރިންޓް — ފިލްޓަރ ކޮށްގެން"),
      h("button.btn.sm", { onclick: () => { [fDate, fCat, fBr, fAge, fGen, fInst, fInstName, fCk].forEach(x => x.value = ""); fillSes(); refresh(); } }, "✖ ފިލްޓަރު ފޮހެލާ")),
    h("div.print-filters",
      lab("📅 ދުވަސް / ތާރީޚް", fDate), lab("ސެޝަން", fSes), lab("ބައި", fCat), lab("ގޮފި", fBr), lab("ޢުމުރުފުރާ", fAge),
      lab("ޖިންސު", fGen), lab("މުއައްސަސާގެ ވައްތަރު", fInst), lab("މުއައްސަސާ", fInstName), lab("ހާޟިރީ", fCk), lab("ސޮއި ލައިން", sigN)),
    count,
    h("p.small.muted", "ކޮންމެ ސެޝަނެއް ވަކި ޞަފުޙާއަކުން، ސެޝަނުގެ ދުވަސް، ގަޑި، ތަނާއި ޖަޖުންނާއެކު، ސެޝަނުގެ ތަރުތީބު ނަންބަރުން ޕްރިންޓްވާނެ — ސްކްރީނުގެ ލިސްޓާ ހަމަ އެއްގޮތަށް."),
    h("div.grid3",
      B("📋 ސެޝަން ލިސްޓު", () => run("ސެޝަން ލިސްޓު", (list) => tableHTML([
        { t: "#", cls: "num", v: r => r.order }, { t: "ފޮޓޯ", cls: "num", html: r => r.photoThumb ? `<img class="ph" src="${r.photoThumb}">` : "" },
        { t: "ނަން", v: r => r.name }, { t: "ރެޖި", v: r => r.regNo }, { t: "އައިޑީ", v: r => r.nid }, { t: "ޢުމުރުފުރާ", v: r => ageGroupName(r.ageGroup) },
        { t: "ބައި / ގޮފި", v: r => r.categoryName }, { t: "މުއައްސަސާ", v: r => r.institution }], list), { landscape: true })),
      B("✍ ޙާޟިރީ ޝީޓް", () => run("ޙާޟިރީ ޝީޓް", (list) => tableHTML([
        { t: "#", cls: "num", v: r => r.order }, { t: "ފޮޓޯ", cls: "num", html: r => r.photoThumb ? `<img class="ph" src="${r.photoThumb}">` : "" },
        { t: "ނަން", v: r => r.name }, { t: "އައިޑީ", v: r => r.nid }, { t: "ރެޖި", v: r => r.regNo }, { t: "ފޯނު", v: r => r.phone },
        { t: "ހާޟިރު ✔", html: () => "<div style='width:40px;height:22px'></div>" }, { t: "ގަޑި", html: () => "<div style='width:50px'></div>" },
        { t: "ސޮއި", html: () => "<div style='width:90px;height:22px'></div>" }], list) + sigBlock(["ހާޟިރީ ބެލި މުވައްޒަފު", "ޗީފް ޖަޖު"]))),
      B("📌 ނޯޓިސް ބޯޑު", () => run("ނޯޓިސް ބޯޑު", (list, s) => tableHTML([
        { t: "#", cls: "num", v: r => r.order }, { t: "ނަން", v: r => r.name }, { t: "ރެޖި", v: r => r.regNo }, { t: "ބައި", v: r => r.categoryName },
        { t: "ޢުމުރުފުރާ", v: r => ageGroupName(r.ageGroup) }, { t: "މުއައްސަސާ", v: r => r.institution || "" }], list) + (s && s.publicNote ? `<p class="box">📌 ${esc(s.publicNote)}</p>` : ""), { landscape: true })),
      B("🪪 ދަރިވަރު ކާޑު", () => run("ދަރިވަރު ކާޑު", (list) => admitCardsHTML(list, sesById), { flat: true })),
      B("📝 ޖަޖުގެ ޝީޓް (A5)", () => run("ޖަޖުގެ މާކްސް ޝީޓް", (list, s) => {
        const judges = s && (s.judges || []).length ? s.judges : [{ slot: "", name: "" }];
        return judges.map(j => list.map(r => a5JudgeSheetHTML([r], catById(r.categoryId), s, [j])).join("")).join("");
      }, { noHead: true })),
      B("📑 ޖަޖުގެ ސެޝަން ޖަދުވަލު", () => run("ޖަޖުގެ ސެޝަން ޖަދުވަލު", (list, s) => {
        const judges = s && (s.judges || []).length ? s.judges : [{ slot: "1", name: "" }];
        return judges.map(j => sessionJudgeTableHTML(list, mainCat(list), s, j)).join(PB);
      }, { landscape: true, noHead: true }))),
    h("p.small.muted", "ނަތީޖާގެ ޝީޓްތައް (ވަނަތައް، ޖަލްސާގެ ޕްރިންޓް، ރުބްރިކް ރިޕޯޓް) ޕްރިންޓްކުރެވޭނީ 'ނަތީޖާ' ޓެބުން.")));
  // default: today's sessions if there are any
  if (dates.includes(today)) { fDate.value = today; fillSes(); }
  refresh();
}
