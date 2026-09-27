// ============================================================
//  Admin Secretary / Secretary: announcement & form, applications, students, sessions, prints
// ============================================================
import {
  S, db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, addDoc, collection, query, where, serverTimestamp,
  runTransaction, writeBatch, h, esc, toast, modal, confirmBox, promptBox, field, select, spinner, empty, audit,
  fmtDate, fmtDateTime, AGE_GROUPS, GENDERS, INST_TYPES, BRANCHES, ageGroupName, genderName, instTypeName, normId, digits,
  loadCategories, loadSessions, catById, cache, photoTag, resizeImage, ageOn, downloadCSV, PUBLIC_BASE_URL, sessionLabel, todayISO
} from "../core.js";
import { printDoc, tableHTML, admitCardsHTML, blankSheetsHTML, sigBlock, a5JudgeSheetHTML, noticeBoardHTML, sessionJudgeTableHTML } from "../print.js";

const canEdit = () => ["superadmin", "adminsec"].includes(S.me.role);
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
    canEdit() ? h("button.btn.primary", { onclick: () => edit() }, "+ ދަރިވަރެއް") : null,
    canEdit() ? h("button.btn.orange", { onclick: () => importCSV() }, "📥 CSV ތެރެ ކިޔެވުން") : null,
    h("button.btn", { onclick: () => exportCSV() }, "⬇ CSV"), h("button.btn", { onclick: () => printList() }, "🖨 ލިސްޓް"),
    h("button.btn", { onclick: () => printDoc("ދަރިވަރު ކާޑު", admitCardsHTML(filtered(), Object.fromEntries(sessions.map(s => [s.id, s])))) }, "🪪 ކާޑު"),
    // Dummy download panel toggle
    h("button.btn.orange", { title:"ޑަމީ — ސިސްޓަމް ޓެސްޓް", onclick: () => { const p=card.querySelector(".dummy-panel"); if(p){p.remove();}else{card.appendChild(dummyPanel());} } }, "🧪 ﺩَﻣِّﻲ")), box);
  view.appendChild(card);
  let list = [];
  // ---------------------------------------------------------------- DUMMY PANEL
  function dummyPanel() {
    const wrap = h("div.dummy-panel", { style: "border:2px dashed var(--gold);border-radius:12px;padding:16px;margin-top:14px;background:rgba(201,164,67,.06)" });
    wrap.appendChild(h("h3", { style: "margin:0 0 6px" }, "🧪 ﭨِﺴْﭨِﻴﻨْﮒ & ﺩَﻣِّﻲ ﺩَﺍﺋِﻤِﻲ"));
    wrap.appendChild(h("p.small.muted", { style:"margin:0 0 12px" },
      "2000 ދަރިވަރު، 8 ކެޓަގަރީ، 5 ޖަޖުންގެ ސިސްޓަމް ޓެސްޓް ފައިލް ޑައުންލޯޑްކޮށް ތިން ގޮތަށް ބޭނުންކުރެވޭ:"));
    wrap.appendChild(h("div.grid3", { style: "gap:10px;margin-bottom:14px" },
      h("div", { style: "border:1px solid var(--line2);border-radius:10px;padding:12px" },
        h("div", { style: "font-size:13px;font-weight:700;margin-bottom:6px;color:var(--gold2)" }, "⬇ CSV — މާކްސް ހިމެނޭ"),
        h("p.small.muted", { style:"margin:0 0 8px" }, "2000 ދަރިވަރު + 5 ޖަޖުންގެ މާކްސް ހިމެނޭ — ނަތީޖާ ހަދާ ގޮތް ބެލެން"),
        h("button.btn.primary", { onclick: () => makeBigDummyCSV(true) }, "⬇ ޑައުންލޯޑް (މާކްސް ހިމެނޭ)")),
      h("div", { style: "border:1px solid var(--line2);border-radius:10px;padding:12px" },
        h("div", { style: "font-size:13px;font-weight:700;margin-bottom:6px;color:var(--gold2)" }, "⬇ CSV — ހުސް ގޮޅި"),
        h("p.small.muted", { style:"margin:0 0 8px" }, "2000 ދަރިވަރު + ހުސް ގޮޅި — ނަތީޖާ ލިޔެ ނިންމި ގޮތް ދެނެގަންނަން"),
        h("button.btn", { onclick: () => makeBigDummyCSV(false) }, "⬇ ޑައުންލޯޑް (ހުސް ގޮޅި)")),
      h("div", { style: "border:1px solid var(--line2);border-radius:10px;padding:12px" },
        h("div", { style: "font-size:13px;font-weight:700;margin-bottom:6px;color:var(--gold2)" }, "📥 Google Forms / Excel"),
        h("p.small.muted", { style:"margin:0 0 8px" }, "ލޯކަލް CSV/Excel ފައިލަކުން ދަރިވަރުން ވެއްދޭ ← ތިރީ CSV ތެރެ"),
        h("button.btn.orange", { onclick: () => importCSV() }, "📥 CSV ތެރެ ލޯޑްކުރޭ")),
    ));
    wrap.appendChild(h("div.row", { style: "gap:10px;flex-wrap:wrap" },
      h("button.btn.red.sm", { onclick: async () => {
        const cid = S.settings.activeCompetitionId; if(!cid) return toast("ހިނގަމުންދާ ތ ތ ތ ތ", "warn");
        const ok = await confirmBox("Firestore ތެރެ ވެއްދުން", "ދ ދ ދ ދ ދ ދ — ދ ދ ދ ދ ދ ދ ދ ދ ދ ދ ދ ދ", "ވެއްދޭ","red"); if(!ok) return;
        await importDummyToFirestore(cid, false);
      } }, "🔥 Firestore — ހުސް ގޮޅި"),
      h("button.btn.red.sm", { onclick: async () => {
        const cid = S.settings.activeCompetitionId; if(!cid) return toast("ހިނގަމުންދާ ތ ތ ތ ތ ތ", "warn");
        const ok = await confirmBox("Firestore ތެރެ ވެއްދުން", "ދ ދ ދ ދ ދ ދ — ދ ދ ދ ދ ދ ދ ދ ދ ދ ދ ދ ދ", "ވެއްދޭ","red"); if(!ok) return;
        await importDummyToFirestore(cid, true);
      } }, "🔥 Firestore — މާކްސް ހިމެނޭ"),
    ));
    return wrap;
  }
  // --- shared dummy data generator ---
  const DUMMY_ISLANDS=["Male","Hulhumale","Addu","Fuvahmulah","Naifaru","Eydhafushi","Maamigili","Mahibadhoo","Velidhoo","Kulhudhuffushi","Felidhoo","Gan","Thinadhoo","Hithadhoo","Dharavandhoo"];
  const DUMMY_SCHOOLS=["Aminiyya School","Iskandhar School","Ghiyaasuddin Int'l","Billabong High","Ameer Ahmed School","IUM","Fiyavathi School","Maafannu Middle","Hiriya School","Dharumavantha School","Rehendhi School","Haamidh School","Thaajudhdeen School","Kenereege School","Arabiyya School"];
  const DUMMY_ISOTYPES=["School","University","QuranClass","Private","Club","Office"];
  const DUMMY_FNAMES_M=["ﻋَﻠِﻲّ","ﺃَﺣْﻤَﺪ","ﻣُﺤَﻤَّﺪ","ﺇِﺑْﺮَﺍﻫِﻴﻢ","ﻳُﻮﺳُﻒ","ﺣَﺴَﻦ","ﻋَﺒْﺪُﺍﻟﻠَّﻪ","ﻋُﻤَﺮ","ﻣُﻮﺳَﻰ","ﻋِﻴﺴَﻰ","ﻫَﺎﺭُﻭﻥ","ﺻَﺎﻟِﺢ","ﻳَﺤْﻴَﻰ","ﺃَﺑُﻮﺑَﻜْﺮ","ﺃَﻧَﺲ"];
  const DUMMY_FNAMES_F=["ﻓَﺎﻃِﻤَﺔ","ﺃَﺋِﺸَﺔ","ﺧَﺪِﻳﺠَﺔ","ﻣَﺮْﻳَﻢ","ﺯَﻳْﻨَﺐ","ﺃَﻣِﻴﻨَﺔ","ﻫَﺎﺟَﺮ","ﺭُﻗَﻴَّﺔ","ﺃَﺳِﻴﺮَﺓ","ﻧَﻔِﻴﺴَﺔ","ﺃَﻣَﻞ","ﻧُﻮﺭ","ﺣَﻔِﻴﻈَﺔ","ﺷَﻬِﻴﺪَﺓ","ﺳُﻮﺩَﺓ"];
  const DUMMY_LNAMES=["ﺃَﺣْﻤَﺪ","ﻋَﻠِﻲّ","ﻣُﺤَﻤَّﺪ","ﺣَﺴَﻦ","ﺇِﺑْﺮَﺍﻫِﻴﻢ","ﺳَﻌِﻴﺪ","ﻋَﺒْﺪُﺍﻟﻠَّﻪ","ﻣُﻮﺳَﻰ","ﺭَﺷِﻴﺪ","ﻧَﺎﺻِﺮ","ﻣُﺤَﻤَّﺪ","ﻭَﺣِﻴﺪ","ﻟَﻄِﻴﻒ","ﺷَﺎﻓِﻲ","ﻓَﺮِﻳﺪ"];
  const DUMMY_CATS2=[
    {id:"dc_u8_b",  name:"U8 ﺑَﻠَﺎﺉ",  ag:"U8",  br:"balaigen",  rub:[{k:"thilawa",max:40},{k:"tajweed",max:30},{k:"maqamat",max:20},{k:"fasaha",max:10}]},
    {id:"dc_u8_nb", name:"U8 ﻧُﺒَﻠَﺎﺉ", ag:"U8",  br:"nubalaigen",rub:[{k:"thilawa",max:40},{k:"tajweed",max:30},{k:"maqamat",max:20},{k:"fasaha",max:10}]},
    {id:"dc_u13_b", name:"U13 ﺑَﻠَﺎﺉ", ag:"U13", br:"balaigen",  rub:[{k:"thilawa",max:30},{k:"tajweed",max:25},{k:"maqamat",max:25},{k:"fasaha",max:10},{k:"talaffuz",max:10}]},
    {id:"dc_u13_nb",name:"U13 ﻧُﺒَﻠَﺎﺉ",ag:"U13", br:"nubalaigen",rub:[{k:"thilawa",max:30},{k:"tajweed",max:25},{k:"maqamat",max:25},{k:"fasaha",max:10},{k:"talaffuz",max:10}]},
    {id:"dc_u18_b", name:"U18 ﺑَﻠَﺎﺉ", ag:"U18", br:"balaigen",  rub:[{k:"thilawa",max:25},{k:"tajweed",max:25},{k:"maqamat",max:20},{k:"sifa",max:20},{k:"fasaha",max:10}]},
    {id:"dc_u18_nb",name:"U18 ﻧُﺒَﻠَﺎﺉ",ag:"U18", br:"nubalaigen",rub:[{k:"thilawa",max:25},{k:"tajweed",max:25},{k:"maqamat",max:20},{k:"sifa",max:20},{k:"fasaha",max:10}]},
    {id:"dc_hifz",  name:"ﺣِﻔْﻆ ﺍﻟْﻘُﺮْﺁﻥ",ag:"Open",br:"hifz",     rub:[{k:"hifz",max:50},{k:"tajweed",max:30},{k:"maqamat",max:20}]},
    {id:"dc_open",  name:"ﺍﻟﻔَﺘَﺢ",     ag:"Open",br:"balaigen",  rub:[{k:"thilawa",max:35},{k:"tajweed",max:30},{k:"maqamat",max:25},{k:"fasaha",max:10}]},
  ];
  const JUDGE_NAMES2=["ﺃَﺑُﻮﺑَﻜْﺮ ﺳَﻌِﻴﺪ","ﻋَﻠِﻲّ ﺣَﺴَﻦ","ﻫَﺎﺭُﻭﻥ ﻋَﺒْﺪُﺍﻟﻠَّﻪ","ﻓَﻮْﺯَﺓ ﻣُﺤَﻤَّﺪ","ﺷَﺎﻓِﻲ ﺇِﺑْﺮَﺍﻫِﻴﻢ"];
  const SCORE_BASES=[0.96,0.91,0.87,0.82,0.93,0.88,0.95,0.84,0.90,0.86];

  function makeDummyRows(withScores, count=2000) {
    const rows=[]; const yr=new Date().getFullYear();
    const mnF=DUMMY_FNAMES_M, fnF=DUMMY_FNAMES_F, ln=DUMMY_LNAMES, is=DUMMY_ISLANDS, sc=DUMMY_SCHOOLS, it=DUMMY_ISOTYPES;
    for(let i=0;i<count;i++){
      const ci=i%DUMMY_CATS2.length, c=DUMMY_CATS2[ci];
      const isMale=(i%3)!==0;
      const fn=(isMale?mnF:fnF)[i%15]; const lname=ln[i%15];
      const name=`${fn} ${lname}`; const nameEn=`${fn.split(/\s/)[0]}_En ${lname.split(/\s/)[0]}_En`;
      const age={U8:2018,U13:2013,U18:2008,Open:2000}[c.ag];
      const dob=`${age-Math.floor(i/count*4)}-${String((i%12)+1).padStart(2,"0")}-${String((i%28)+1).padStart(2,"0")}`;
      const island=is[i%is.length]; const inst=sc[i%sc.length]; const instType=it[Math.floor(i/count*it.length*2)%it.length];
      const nid=`A${200000+i+1}`;
      const reg=`R${String(yr).slice(-2)}-${String(i+1).padStart(4,"0")}`;
      const row={regNo:reg,nid,name,nameEn,dob,gender:isMale?"M":"F",permAddress:`ﺩ.ﺩَﺍﺭُﻝﺃَﻣَﻞ، ${island}`,island,currentAddress:`ﻙ.ﻣَﺎﻟِﻲ`,
        phone:`7${String(700000+i+1)}`,email:`${nid.toLowerCase()}@mail.mv`,categoryId:c.id,categoryName:c.name,branch:c.br,ageGroup:c.ag,
        institution:inst,instType,guardianName:`ﻭَﻟِﻲّ ${lname}`,guardianPhone:`9${String(900000+i+1)}`};
      if(withScores){
        const base=SCORE_BASES[i%SCORE_BASES.length];
        JUDGE_NAMES2.forEach((jn,j)=>{
          const v=0.95+0.05*(j%3)/2;
          c.rub.forEach(r=>{ row[`j${j+1}_${r.k}`]=Math.round(r.max*base*v*100)/100; });
          row[`j${j+1}_total`]=c.rub.reduce((a,r)=>a+Math.round(r.max*base*v*100)/100,0);
          row[`j${j+1}_name`]=jn;
        });
        const tots=JUDGE_NAMES2.map((_,j)=>row[`j${j+1}_total`]);
        const sorted=[...tots].sort((a,b)=>a-b); row.final_score=Math.round(sorted.slice(1,4).reduce((a,v)=>a+v,0)/3*100)/100;
        const mx=c.rub.reduce((a,r)=>a+r.max,0); const pct=row.final_score/mx;
        row.stars=pct>=0.95?5:pct>=0.9?4:pct>=0.85?3:pct>=0.75?2:1;
      }
      rows.push(row);
    }
    return rows;
  }

  function makeBigDummyCSV(withScores) {
    const rows=makeDummyRows(withScores);
    const baseHdr=["regNo","nid","name","nameEn","dob","gender","permAddress","island","currentAddress","phone","email","categoryId","categoryName","branch","ageGroup","institution","instType","guardianName","guardianPhone"];
    const scoreHdr=withScores?JUDGE_NAMES2.flatMap((_,j)=>DUMMY_CATS2[0].rub.map(r=>`j${j+1}_${r.k}`).concat([`j${j+1}_total`,`j${j+1}_name`])).concat(["final_score","stars"]):[];
    const hdr=[...baseHdr,...scoreHdr];
    const lines=[hdr.join(","),...rows.map(r=>hdr.map(k=>{const v=r[k]??"";return (typeof v==="string"&&v.includes(","))?`"${v}"`:v;}).join(","))];
    const url="data:text/csv;charset=utf-8,﻿"+encodeURIComponent(lines.join("\n"));
    const a=document.createElement("a"); a.href=url; a.download=`rasfahi_dummy_2000_${withScores?"with":"no"}_scores.csv`; a.click();
    toast(`✔ ${rows.length} ދަރިވަރު — CSV ޑައުންލޯޑްވިއްޖެ`);
  }

  async function importDummyToFirestore(cid, withScores) {
    toast("ލޯޑުވަނީ...");
    const rows=makeDummyRows(withScores);
    for(let i=0;i<rows.length;i+=20){
      const b=writeBatch(db);
      rows.slice(i,i+20).forEach((r,j)=>{
        const id=`${cid}__${r.nid}`;
        b.set(doc(db,"students",id),{...r,competitionId:cid,status:"active",sessionId:"",order:i+j+1,checkin:null,photoThumb:"",createdAt:serverTimestamp()});
      });
      await b.commit();
    }
    toast(`✔ ${rows.length} ދަރިވަރު Firestore ތެރެ ވެދިއްޖެ`);
    load();
  }
  // ----------------------------------------------------------------
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
        h("td", canEdit() ? h("button.btn.sm", { onclick: () => edit(s) }, "އެޑިޓް") : null)))))));
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
      [...(s0 ? [{ label: "🗑 ފޮހެލާ", cls: "red", onClick: async () => {
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
        if (photo) await setDoc(doc(db, "photos", id), { photo, updatedAt: serverTimestamp() });
        audit(s0 ? "student_update" : "student_create", { id }); return true;
      } }], { wide: true });
    if (ok) { toast("ސޭވް ކުރެވިއްޖެ"); load(); }
  }
  // ---------------------------------------------------------------- CSV IMPORT
  async function importCSV() {
    const TPL_COLS = ["nid","name","nameEn","dob","gender","permAddress","island","currentAddress","phone","email","categoryId","institution","instType","guardianName","guardianPhone"];
    const input = h("input", { type: "file", accept: ".csv,text/csv", style: { display: "none" } });
    const preview = h("div", { style: { marginTop: "10px", maxHeight: "320px", overflowY: "auto" } });
    const errBox = h("div");
    let parsed = [];
    const catMap = Object.fromEntries(cats.map(c => [c.id, c]));
    const catByName = Object.fromEntries(cats.map(c => [c.name.trim().toLowerCase(), c]));
    function parseFile(file) {
      const r = new FileReader();
      r.onload = e => {
        const lines = e.target.result.split(/\r?\n/).filter(l => l.trim());
        if (!lines.length) return;
        const hdr = lines[0].split(",").map(h2 => h2.trim().replace(/^"|"$/g,"").toLowerCase());
        const rows = lines.slice(1).map(line => {
          const vals = []; let cur = "", inq = false;
          for (const ch of line) { if (ch==='"') { inq=!inq; } else if (ch===","&&!inq) { vals.push(cur.trim()); cur=""; } else cur+=ch; }
          vals.push(cur.trim());
          const obj = {};
          hdr.forEach((k,i) => { obj[k] = (vals[i]||"").replace(/^"|"$/g,""); });
          return obj;
        }).filter(r2 => r2.nid || r2["id"] || r2["national id"]);
        // normalise key aliases
        parsed = rows.map(r2 => {
          const nid2 = normId(r2.nid || r2["id"] || r2["national id"] || r2["id no"] || "");
          const name2 = r2.name || r2["full name"] || r2["ދިވެހި ނަން"] || "";
          const cid2 = (catByName[(r2.categoryid||r2.category||r2["ބައި"]||"").toLowerCase()] || {}).id || r2.categoryid || "";
          return { nid: nid2, name: name2, nameEn: r2.nameen||r2["name en"]||r2["english name"]||"", dob: r2.dob||r2["date of birth"]||"",
            gender: (r2.gender||r2["ޖިންސް"]||"M").trim().toUpperCase().startsWith("F")?"F":"M",
            permAddress: r2.permaddress||r2["permanent address"]||r2["ދާއިމީ"]||"",
            island: r2.island||r2["ރަށް"]||"", currentAddress: r2.currentaddress||r2["current address"]||"",
            phone: r2.phone||r2["mobile"]||r2["ފޯނު"]||"", email: r2.email||r2["Email Address"]||"",
            categoryId: cid2, institution: r2.institution||r2["school"]||r2["ސްކޫލް"]||"",
            instType: r2.insttype||r2["institution type"]||"", guardianName: r2.guardianname||r2["guardian"]||"",
            guardianPhone: r2.guardianphone||r2["guardian phone"]||"" };
        });
        errBox.innerHTML = "";
        preview.innerHTML = "";
        const tbl = h("table.tbl");
        const thead = h("thead", h("tr", ["#","ID","ނަން","DOB","ޖިންސް","ބައި","ފޯނު","Status"].map(x=>h("th",x))));
        const tbody = h("tbody");
        parsed.forEach((r2, i) => {
          const cat2 = catMap[r2.categoryId];
          const issues = [!r2.nid&&"ID ނެތް", !r2.name&&"ނަން ނެތް", !cat2&&"ބައި ދިމާނުވި"].filter(Boolean);
          tbody.appendChild(h("tr", { style: { color: issues.length?"#ffa0a0":"" } },
            h("td",i+1), h("td",r2.nid), h("td",r2.name), h("td",r2.dob), h("td",r2.gender==="F"?"A":"F"),
            h("td", cat2?cat2.name:(r2.categoryId||"-")), h("td",r2.phone),
            h("td", issues.length?h("span.tag.red",issues.join(", ")):h("span.tag.green","✔"))));
        });
        tbl.append(thead, tbody);
        preview.appendChild(h("p.small.muted", `${parsed.length} ލައިން ކިޔެވިއްޖެ • ކުރިއަށް ދިޔުމުން ރަޖިސްޓަރީ ނަންބަރ ދޭ ދަރިވަރުންތައް ${S.settings.activeCompetitionId} ގެ ތެރެ ވައްދޭ.`));
        preview.appendChild(tbl);
      };
      r.readAsText(file, "UTF-8");
    }
    input.onchange = e => { if (e.target.files[0]) parseFile(e.target.files[0]); };
    const ok = await modal("📥 CSV ތެރެ ދަރިވަރުން ވެއްދުން",
      h("div",
        h("p.small.muted", "ކޮލަމްތައް (ތަރުތީބު ދޫ): nid, name, nameEn, dob, gender (M/F), permAddress, island, currentAddress, phone, email, categoryId, institution, instType, guardianName, guardianPhone"),
        h("div.row", h("button.btn.primary", { onclick: () => input.click() }, "📂 ފައިލް ހޮވާ"),
          h("button.btn.sm", { onclick: () => {
            const url = "data:text/csv;charset=utf-8,%EF%BB%BFnid,name,nameEn,dob,gender,permAddress,island,currentAddress,phone,email,categoryId,institution,instType,guardianName,guardianPhone\nA123456,ﭔَﺎﻟِﺢَ ﻣُﺤَﻤَّﺪُ,Salih Mohamed,2008-05-14,M,ﻣَﺎﻟِﻴ,Male,ﻣَﺎﻟِﻴ,7777001,s@mail.mv,," + (cats[0]?cats[0].name:"") + ",ﻣُﺪَﺭَّﺳَﺔ,School,ﻭَﻟِﻲّ ﺍﻷَﻣْﺮ,7777000";
            const a = document.createElement("a"); a.href=url; a.download="students_template.csv"; a.click();
          } }, "⬇ ޓެމްޕްލޭޓް ކޮޕީ")),
        input, errBox, preview),
      [{ label: "ކެންސަލް" }, { label: "ވައްދާ", cls: "primary", onClick: async () => {
        if (!parsed.length) { toast("ދަރިވަރެއް ނެތް", "warn"); return false; }
        const cid = S.settings.activeCompetitionId;
        let ok2 = 0, skip = 0;
        for (const r2 of parsed) {
          if (!r2.nid || !r2.name) { skip++; continue; }
          const id = `${cid}__${r2.nid}`;
          const ex = await getDoc(doc(db, "students", id));
          if (ex.exists()) { skip++; continue; }
          const cat2 = catMap[r2.categoryId] || cats[0];
          const regNo = await runTransaction(db, async (tx) => {
            const cRef = doc(db, "competitions", cid); const c = await tx.get(cRef);
            const n = ((c.exists() && c.data().regCounter) || 0) + 1; tx.set(cRef, { regCounter: n }, { merge: true });
            return `R${String((c.exists() && c.data().year) || new Date().getFullYear()).slice(-2)}-${String(n).padStart(4,"0")}`;
          });
          await setDoc(doc(db, "students", id), { competitionId: cid, regNo, nid: r2.nid, name: r2.name, nameEn: r2.nameEn, dob: r2.dob, gender: r2.gender,
            permAddress: r2.permAddress, island: r2.island, currentAddress: r2.currentAddress, phone: r2.phone, email: r2.email,
            categoryId: cat2?cat2.id:"", categoryName: cat2?cat2.name:"", branch: cat2?cat2.branch:"", ageGroup: cat2?cat2.ageGroup:"",
            institution: r2.institution, instType: r2.instType, guardianName: r2.guardianName, photoThumb: "",
            status: "active", sessionId: "", order: 0, checkin: null, createdAt: serverTimestamp() });
          ok2++;
        }
        toast(`✔ ${ok2} ދަރިވަރުން ވެއްދިއްޖެ${skip?" • "+skip+" ދޫކޮށްލި":""}`); return true;
      } }], { wide: true });
    if (ok) load();
  }
  load();
}

// ------------------------------------------------------------ SESSIONS & SCHEDULE
export async function sessions(view) {
  if (needComp(view)) return;
  const cats = await loadCategories();
  const users = (await getDocs(collection(db, "users"))).docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active);
  const chiefs = users.filter(u => u.role === "chief"), judges = users.filter(u => u.role === "judge");
  const card = h("div.card", h("h2", "ސެޝަންތަކާއި ޝެޑިއުލް"));
  const box = h("div", spinner());
  card.append(h("div.row", h("button.btn.primary", { onclick: () => edit() }, "+ އާ ސެޝަނެއް"),
    h("button.btn.blue", { onclick: () => autoSchedule() }, "⚡ އޮޓޯ ޝެޑިއުލް")), h("div", { style: { height: "10px" } }), box);
  view.appendChild(card);
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
      h("thead", h("tr", ["ސެޝަން", "ތާރީޚް", "ވަގުތު", "ތަން", "ބައިތައް", "ޗީފް ޖަޖު", "ޖަޖުން", "ދަރިވަރުން", "ޙާލަތު", ""].map(x => h("th", x)))),
      h("tbody", list.map(s => h("tr",
        h("td", h("b", s.name)), h("td.ltr", s.date), h("td.ltr", s.time || ""), h("td", s.venue || ""),
        h("td.small", (s.categoryIds || []).map(id => (catById(id) || {}).name).join("، ")),
        h("td", s.chiefName || s.chiefEmail || "-"), h("td.small", (s.judges || []).map(j => j.slot + ". " + j.name).join("، ")),
        h("td", (s.order || []).length), h("td", h("span.tag." + (ST[s.status] || ST.planned)[1], (ST[s.status] || ST.planned)[0])),
        h("td", h("div.row",
          h("button.btn.sm", { onclick: () => edit(s) }, "އެޑިޓް"),
          h("button.btn.sm.blue", { onclick: () => assign(s) }, "ދަރިވަރުން / ތަރުތީބު"),
          s.status === "closed" ? h("button.btn.sm", { onclick: () => setStatus(s, "planned") }, "އަލުން ހުޅުވާ") : null))))))));
  }
  async function setStatus(s, st) {
    await updateDoc(doc(db, "sessions", s.id), { status: st }); audit("session_status", { id: s.id, st }); load();
  }
  async function edit(s0) {
    const s = s0 ? JSON.parse(JSON.stringify(s0)) : { name: "", date: todayISO(), time: "09:00", venue: "", categoryIds: [], judges: [], chiefEmail: "", status: "planned" };
    const nm = h("input", { value: s.name }), dt = h("input", { type: "date", value: s.date }), tm = h("input", { type: "time", value: s.time || "" });
    const vn = h("input", { value: s.venue || "" });
    const catChecks = cats.map(c => { const cb = h("input", { type: "checkbox", value: c.id }); cb.checked = (s.categoryIds || []).includes(c.id); return h("label.row", cb, c.name); });
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
      h("div.grid2", field("ތާރީޚް", dt), field("ފަށާ ވަގުތު", tm)),
      h("h3", "ބައިތައް"), h("div.grid3", catChecks),
      h("div.grid2", field("ޗީފް ޖަޖު", ch), h("div", h("h3", "ޖަޖުން (ތަރުތީބުން)"), jBox))),
      [...(s0 ? [{ label: "🗑", cls: "red", onClick: async () => {
        if (!await confirmBox("ސެޝަން ފޮހެލުން", "ފޮހެލަންވީތޯ؟", "ފޮހެލާ", "red")) return false;
        await deleteDoc(doc(db, "sessions", s0.id)); audit("session_delete", { id: s0.id }); return true; } }] : []),
      { label: "ކެންސަލް" }, { label: "ސޭވް", cls: "primary", onClick: async () => {
        const catIds = catChecks.map(l => l.querySelector("input")).filter(c => c.checked).map(c => c.value);
        if (!nm.value.trim() || !dt.value || !catIds.length) { toast("ނަމާއި ތާރީޚާއި ބައި ހޮއްވަވާ", "err"); return false; }
        if (!ch.value) { toast("ޗީފް ޖަޖު ހޮއްވަވާ", "err"); return false; }
        if (!jSel.length) { toast("މަދުވެގެން އެއް ޖަޖަކު ހޮއްވަވާ", "err"); return false; }
        const chief = chiefs.find(u => u.email === ch.value);
        const data = { competitionId: S.settings.activeCompetitionId, name: nm.value.trim(), date: dt.value, time: tm.value, venue: vn.value.trim(),
          categoryIds: catIds, chiefEmail: ch.value, chiefName: chief ? chief.name : "", judges: jSel, judgeEmails: jSel.map(j => j.email),
          updatedAt: serverTimestamp() };
        if (!s0) Object.assign(data, { status: "planned", order: [], createdAt: serverTimestamp() });
        const id = s0 ? s0.id : "S" + dt.value.replace(/-/g, "") + "_" + Math.random().toString(36).slice(2, 6);
        await setDoc(doc(db, "sessions", id), data, { merge: true });
        audit("session_save", { id }); return true;
      } }], { wide: true });
    if (ok) { cache.sessions = null; load(); }
  }
  async function assign(s) {
    const eligible = studs.filter(st => (s.categoryIds || []).includes(st.categoryId) && st.status !== "withdrawn");
    let order = (s.order || []).filter(id => eligible.find(e => e.id === id));
    const listBox = h("div"), poolBox = h("div");
    const byId = (id) => studs.find(x => x.id === id) || {};
    const other = (st) => st.sessionId && st.sessionId !== s.id ? (list.find(x => x.id === st.sessionId) || {}).name : "";
    const draw2 = () => {
      listBox.innerHTML = ""; poolBox.innerHTML = "";
      listBox.appendChild(h("h3", `ތަރުތީބު (${order.length})`));
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
    const ok = await modal("ދަރިވަރުން — " + s.name, h("div",
      h("div.row", h("button.btn.sm", { onclick: () => { order.sort((a, b) => String(byId(a).regNo).localeCompare(String(byId(b).regNo))); draw2(); } }, "ރެޖި އަށް ތަރުތީބު"),
        h("button.btn.sm", { onclick: () => { const r = new Uint32Array(order.length); crypto.getRandomValues(r);
          for (let i = order.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [order[i], order[j]] = [order[j], order[i]]; } draw2(); } }, "🎲 ރެންޑަމް ތަރުތީބު"),
        h("button.btn.sm", { onclick: () => { order.sort((a, b) => String(byId(a).categoryName).localeCompare(String(byId(b).categoryName))); draw2(); } }, "ބައި އަށް")),
      h("div.grid2", listBox, poolBox)),
      [{ label: "ކެންސަލް" }, { label: "ސޭވް", cls: "primary", onClick: async () => {
        const b = writeBatch(db);
        b.update(doc(db, "sessions", s.id), { order });
        order.forEach((id, i) => b.update(doc(db, "students", id), { sessionId: s.id, order: i + 1 }));
        (s.order || []).filter(id => !order.includes(id)).forEach(id => { if (byId(id).sessionId === s.id) b.update(doc(db, "students", id), { sessionId: "", order: 0 }); });
        await b.commit(); audit("session_assign", { id: s.id, n: order.length }); return true;
      } }], { wide: true });
    if (ok) { toast("ސޭވް ކުރެވިއްޖެ"); load(); }
  }
  async function autoSchedule() {
    const catSel = select(cats.map(c => [c.id, c.name]), cats[0] && cats[0].id);
    const dt = h("input", { type: "date", value: todayISO() }), tm = h("input", { type: "time", value: "09:00" });
    const cap = h("input", { type: "number", value: 25, min: 1 }), vn = h("input", { placeholder: "ހޯލް" });
    const ch = select([["", "— ޗީފް ޖަޖު —"], ...chiefs.map(u => [u.email, u.name])], "");
    const jChecks = judges.map(u => { const c = h("input", { type: "checkbox", value: u.email }); return h("label.row", c, u.name); });
    const ok = await modal("އޮޓޯ ޝެޑިއުލް — ސެޝަނަކަށް ނުލެވޭ ދަރިވަރުން ބަހާލާ", h("div",
      field("ބައި", catSel), h("div.grid3", field("ފަށާ ތާރީޚް", dt), field("ވަގުތު", tm), field("ސެޝަނަކަށް ދަރިވަރުން", cap)),
      h("div.grid2", field("ތަން", vn), field("ޗީފް ޖަޖު", ch)), h("h3", "ޖަޖުން"), h("div.grid3", jChecks),
      h("p.small.muted", "ކޮންމެ ދުވަހަކަށް އެއް ސެޝަން. ދަރިވަރުން ރެންޑަމް ތަރުތީބަކަށް.")),
      [{ label: "ކެންސަލް" }, { label: "ހަދާ", cls: "primary", onClick: async () => {
        const js = jChecks.map(l => l.querySelector("input")).filter(c => c.checked).map((c, i) => { const u = judges.find(x => x.email === c.value); return { email: u.email, name: u.name, slot: i + 1 }; });
        if (!ch.value || !js.length) { toast("ޗީފް ޖަޖާއި ޖަޖުން ހޮއްވަވާ", "err"); return false; }
        const pool = studs.filter(s => s.categoryId === catSel.value && !s.sessionId);
        if (!pool.length) { toast("ސެޝަނަކަށް ނުލެވޭ ދަރިވަރަކު ނެތް", "warn"); return false; }
        const r = new Uint32Array(pool.length); crypto.getRandomValues(r);
        for (let i = pool.length - 1; i > 0; i--) { const j = r[i] % (i + 1); [pool[i], pool[j]] = [pool[j], pool[i]]; }
        const n = Math.max(1, +cap.value || 25), cat = catById(catSel.value), chief = chiefs.find(u => u.email === ch.value);
        const d0 = new Date(dt.value);
        for (let k = 0; k * n < pool.length; k++) {
          const part = pool.slice(k * n, k * n + n);
          const d = new Date(d0.getTime() + k * 86400000).toISOString().slice(0, 10);
          const id = "S" + d.replace(/-/g, "") + "_" + Math.random().toString(36).slice(2, 6);
          const b = writeBatch(db);
          b.set(doc(db, "sessions", id), { competitionId: S.settings.activeCompetitionId, name: `${cat.name} — ${k + 1}`, date: d, time: tm.value, venue: vn.value,
            categoryIds: [cat.id], chiefEmail: chief.email, chiefName: chief.name, judges: js, judgeEmails: js.map(j => j.email), status: "planned",
            order: part.map(p => p.id), createdAt: serverTimestamp() });
          part.forEach((p, i) => b.update(doc(db, "students", p.id), { sessionId: id, order: i + 1 }));
          await b.commit();
        }
        audit("auto_schedule", { cat: cat.id, n: pool.length }); return true;
      } }], { wide: true });
    if (ok) { toast("ޝެޑިއުލް ހެދިއްޖެ"); cache.sessions = null; load(); }
  }
  load();
}

// ------------------------------------------------------------ PRINT CENTRE
export async function prints(view) {
  if (needComp(view)) return;
  const [cats, sess] = await Promise.all([loadCategories(), loadSessions(true)]);
  const studs = (await getDocs(query(collection(db, "students"), where("competitionId", "==", S.settings.activeCompetitionId)))).docs.map(d => ({ id: d.id, ...d.data() }));
  const fSes = select([["", "ހުރިހާ ސެޝަނެއް"], ...sess.map(s => [s.id, sessionLabel(s)])], "");
  const fCat = select([["", "ހުރިހާ ބައެއް"], ...cats.map(c => [c.id, c.name])], "");
  const fGen = select([["", "ދެ ޖިންސު"], ...GENDERS], "");
  const fInst = select([["", "ހުރިހާ މުއައްސަސާ"], ...INST_TYPES], "");
  const fCk = select([["", "ޗެކްއިން: ހުރިހާ"], ["in", "ޗެކްއިން ވެއްޖެ"], ["out", "ޗެކްއިން ނުވާ"]], "");
  const sigN = select([["3", "3 ސޮއި"], ["5", "5 ސޮއި"], ["7", "7 ސޮއި"]], "3");
  const pick = () => studs.filter(s => (!fSes.value || s.sessionId === fSes.value) && (!fCat.value || s.categoryId === fCat.value) &&
    (!fGen.value || s.gender === fGen.value) && (!fInst.value || s.instType === fInst.value) && (!fCk.value || (fCk.value === "in" ? !!s.checkin : !s.checkin)))
    .sort((a, b) => fSes.value ? (a.order || 0) - (b.order || 0) : String(a.regNo).localeCompare(String(b.regNo)));
  const sub = () => [fSes.value && sessionLabel(sess.find(s => s.id === fSes.value)), fCat.value && catById(fCat.value).name, fGen.value && genderName(fGen.value),
    fInst.value && instTypeName(fInst.value)].filter(Boolean).join(" • ");
  const sesById = Object.fromEntries(sess.map(s => [s.id, s]));
  const btn = (t, fn) => h("button.btn.lg", { onclick: () => { const rows = pick(); if (!rows.length) return toast("ލިސްޓުގައި ދަރިވަރަކު ނެތް", "warn"); fn(rows); } }, t);
  const signers = () => Array.from({ length: +sigN.value }, (_, i) => i === 0 ? "ޗީފް ޖަޖު" : "ޖަޖު " + i);
  view.append(h("div.card", h("h2", "ލިސްޓާއި ޕްރިންޓް — ފިލްޓަރ ކޮށްގެން"),
    h("div.filters", fSes, fCat, fGen, fInst, fCk, sigN),
    h("div.grid3",
      btn("📋 ސެޝަން ލިސްޓު", rows => printDoc("ސެޝަން ލިސްޓު", tableHTML([
        { t: "#", cls: "num", v: (r, i) => r.order || i + 1 },
        { t: "ފޮޓޯ", cls: "num", html: r => r.photoThumb ? `<img class="ph" src="${r.photoThumb}">` : "" },
        { t: "ނަން", v: r => r.name }, { t: "ރެޖި", v: r => r.regNo }, { t: "ID", v: r => r.nid },
        { t: "ﻋُﻤُﺮ", v: r => r.ageGroup || "" }, { t: "ﺑَﺎﺉ / ﮔﻮﻓِﻲ", v: r => r.categoryName }, { t: "ﻣُﻌَﺎﺳَّﺴَﺎ", v: r => r.institution }], rows), { sub: sub(), landscape: true })),
      btn("✍ ﺣُﻀُﻮﺭِﻱ ﺷِﻴﺖ", rows => printDoc("ﺣُﻀُﻮﺭِﻱ ﺷِﻴﺖ", tableHTML([
        { t: "#", cls: "num", v: (r, i) => r.order || i + 1 },
        { t: "ފޮޓޯ", cls: "num", html: r => r.photoThumb ? `<img class="ph" src="${r.photoThumb}">` : "" },
        { t: "ﻧَﻢ", v: r => r.name }, { t: "ID", v: r => r.nid }, { t: "ﺭَﺟِﻲ", v: r => r.regNo },
        { t: "ﻓُﻮﻧُﻮ", v: r => r.phone }, { t: "ﺣَﺎﺿِﺮُ", v: () => "" },
        { t: "ﺳﻮﺋِﻲ", html: () => "<div style='width:90px;height:22px'></div>" }], rows)
        + sigBlock(["ﺳِﻜْﺮِﻳﺘَﺎﺭِﻱ", "ﺳُﻮﭙَﻭَﺍﻳﺰَﺭ"]), { sub: sub() })),
      btn("📌 ﻧﻮﺗِﻴﺲ ﺑﻮﺭﺩ", async rows => {
        const c = await import("../print.js").then(m => m); // already imported above
        printDoc("ﻧﻮﺗِﻴﺲ ﺑﻮﺭﺩ", noticeBoardHTML(rows, sesById), { landscape: true, sub: sub() });
      }),
      btn("🪪 ދަރިވަރު ކާޑު", rows => printDoc("ދަރިވަރު ކާޑު", admitCardsHTML(rows, sesById))),
      btn("📝 A5 ﺟَﺎﺝ ﺷِﻴﺖ (A5)", rows => {
        const s = sesById[fSes.value];
        const judges = s && s.judges ? s.judges : [];
        const byCat = {};
        rows.forEach(r => (byCat[r.categoryId] = byCat[r.categoryId] || []).push(r));
        const html = judges.length
          ? judges.map(j => Object.entries(byCat).map(([cid, list]) => a5JudgeSheetHTML(list, catById(cid), s, [j])).join("")).join("")
          : Object.entries(byCat).map(([cid, list]) => a5JudgeSheetHTML(list, catById(cid), s)).join("");
        printDoc("ﺟَﺎﺝ ﻣَﺎﻛُﺲ ﺷِﻴﺖ", html, { noHeader: false, sub: sub() + (s ? " • " + s.name : "") });
      }),
      btn("📑 ﺟَﺎﺝ ﺳِﻴﺴَﻦ ﺟَﺪَﻭَﻝ", rows => {
        const s = sesById[fSes.value]; const cat = catById(fCat.value || (rows[0] && rows[0].categoryId));
        const judges = s && s.judges ? s.judges : [{ slot: "1" }];
        const html = judges.map(j => sessionJudgeTableHTML(rows, cat, s, j.slot)).join("<div style='page-break-after:always'></div>");
        printDoc("ﺟَﺎﺝ ﺳِﻴﺴَﻦ ﺷِﻴﺖ", html, { landscape: true, sub: sub() + (s ? " • " + s.name : "") });
      })),
    h("p.small.muted", "ﻧَﺘَﺎﺋِﺞ ﭘْﺮِﻳﻨْﺖ ﻛুﺮﻋّﭼ 'ﻧَﺘَﺎﺋِﺞ' ﭨَﺒُﻦ."),
    h("div.row", h("span.small.muted", "ﺳﻮﺋِﻲ ﻟَﺎﻳِﻦ: "), h("span.small", signers().join("، ")))));
  sigN.onchange = () => view.querySelector(".row:last-child span.small:last-child").textContent = signers().join("، ");
}
