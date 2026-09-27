// ============================================================
//  Super Admin: users, settings (mushaf, stars), competitions & categories, audit
// ============================================================
import {
  S, db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp,
  h, esc, toast, modal, confirmBox, field, select, spinner, empty, ROLES, roleName, audit, fmtDateTime,
  DEFAULT_RUBRIC, DEFAULT_SETTINGS, AGE_GROUPS, GENDERS, BRANCHES, loadCategories, loadSettings, cache
} from "../core.js";
import { loadQuran, surahOptions, describeSyllabus, buildCandidates, pageImageURL, pageSlotCount, slotBand } from "../quran.js";
import { THEMES, FRAMES, frameEl } from "../frames.js";

// ------------------------------------------------------------ USERS
export async function users(view) {
  const card = h("div.card", h("h2", "ޔޫޒަރުން ", h("small", "— ރޯލު ދޭނީ ސުޕަރ އެޑްމިން އެކަނި. ލޮގިން ވާނީ މީހާގެ އަމިއްލަ ގޫގުލް އީމެއިލް އިން.")));
  const tblBox = h("div", spinner());
  const fRole = select([["", "ހުރިހާ ރޯލެއް"], ...Object.entries(ROLES).map(([k, v]) => [k, v.dv])], "");
  const fText = h("input", { placeholder: "ނަމާއި އީމެއިލް ހޯދާ..." });
  card.append(h("div.filters", fText, fRole, h("button.btn.primary", { onclick: () => editUser() }, "+ އާ ޔޫޒަރެއް")), tblBox);
  view.appendChild(card);
  let list = [];
  async function load() {
    const snap = await getDocs(collection(db, "users"));
    list = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => a.role.localeCompare(b.role) || String(a.name).localeCompare(b.name));
    draw();
  }
  function draw() {
    const t = fText.value.trim().toLowerCase(), r = fRole.value;
    const rows = list.filter(u => (!r || u.role === r) && (!t || (u.name + " " + u.email).toLowerCase().includes(t)));
    tblBox.innerHTML = "";
    if (!rows.length) return tblBox.appendChild(empty("ޔޫޒަރަކު ނެތް"));
    tblBox.appendChild(h("div.tbl-wrap", h("table.tbl",
      h("thead", h("tr", ["ނަން", "އީމެއިލް", "ރޯލު", "ޙާލަތު", "ފޯނު", "ހަދާފައި", ""].map(x => h("th", x)))),
      h("tbody", rows.map(u => h("tr",
        h("td", u.name || "-"), h("td.ltr", u.email),
        h("td", h("span.tag.gold", roleName(u.role))),
        h("td", u.active ? h("span.tag.green", "އެނޭބަލް") : h("span.tag.red", "ޑިސޭބަލް")),
        h("td.ltr", u.phone || ""), h("td.small.muted", fmtDateTime(u.createdAt)),
        h("td", h("div.row",
          h("button.btn.sm", { onclick: () => editUser(u) }, "ބަދަލު"),
          u.email !== S.me.email ? h("button.btn.sm." + (u.active ? "red" : "green"), { onclick: () => toggle(u) }, u.active ? "ޑިސޭބަލް" : "އެނޭބަލް") : null,
          u.email !== S.me.email ? h("button.btn.sm.ghost", { onclick: () => del(u) }, "🗑") : null))))))));
  }
  fText.oninput = draw; fRole.onchange = draw;
  async function toggle(u) {
    await updateDoc(doc(db, "users", u.id), { active: !u.active, updatedAt: serverTimestamp(), updatedBy: S.me.email });
    audit(u.active ? "user_disable" : "user_enable", { email: u.id });
    toast(u.active ? "ޑިސޭބަލް ކުރެވިއްޖެ" : "އެނޭބަލް ކުރެވިއްޖެ"); load();
  }
  async function del(u) {
    if (!await confirmBox("ޔޫޒަރު ފޮހެލުން", `${u.name} (${u.email}) ފޮހެލަންވީތޯ؟`, "ފޮހެލާ", "red")) return;
    await deleteDoc(doc(db, "users", u.id)); audit("user_delete", { email: u.id }); load();
  }
  async function editUser(u) {
    const isNew = !u;
    const em = h("input.ltr", { value: u ? u.email : "", placeholder: "name@gmail.com", disabled: !isNew });
    const nm = h("input", { value: u ? u.name : "" });
    const ph = h("input.ltr", { value: u ? u.phone || "" : "" });
    const rl = select(Object.entries(ROLES).map(([k, v]) => [k, v.dv + " — " + v.en]), u ? u.role : "judge");
    const ac = h("input", { type: "checkbox" }); ac.checked = u ? !!u.active : true;
    const ok = await modal(isNew ? "އާ ޔޫޒަރެއް" : "ޔޫޒަރު ބަދަލުކުރުން", h("div",
      field("ގޫގުލް އީމެއިލް", em, "މިއީ ލޮގިން ވާ އީމެއިލް. (ސްކްރީން ތަކަށްވެސް ވަކި އީމެއިލެއް)"),
      field("ފުރިހަމަ ނަން", nm), field("ފޯނު ނަންބަރު", ph), field("ރޯލު", rl),
      h("label.row", ac, "އެނޭބަލް (ލޮގިން ވެވޭނެ)")),
      [{ label: "ކެންސަލް", value: false }, { label: "ސޭވް", cls: "primary", onClick: async () => {
        const email = em.value.trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { toast("އީމެއިލް ރަނގަޅެއް ނޫން", "err"); return false; }
        if (!nm.value.trim()) { toast("ނަން ލިޔުއްވާ", "err"); return false; }
        const data = { email, name: nm.value.trim(), phone: ph.value.trim(), role: rl.value, active: ac.checked,
          updatedAt: serverTimestamp(), updatedBy: S.me.email };
        if (isNew) { data.createdAt = serverTimestamp(); data.createdBy = S.me.email;
          const ex = await getDoc(doc(db, "users", email)); if (ex.exists()) { toast("މި އީމެއިލް ކުރިންވެސް އެބައޮތް", "err"); return false; } }
        await setDoc(doc(db, "users", email), data, { merge: true });
        audit(isNew ? "user_create" : "user_update", { email, role: rl.value, active: ac.checked });
        return true;
      } }]);
    if (ok) { toast("ސޭވް ކުރެވިއްޖެ"); load(); }
  }
  load();
}

// ------------------------------------------------------------ SETTINGS
export async function settings(view) {
  await loadSettings();
  const st = JSON.parse(JSON.stringify(S.settings));
  const comps = (await getDocs(collection(db, "competitions"))).docs.map(d => ({ id: d.id, ...d.data() }));
  const compSel = select([["", "— ނެތް —"], ...comps.map(c => [c.id, `${c.name} (${c.year || ""})`])], st.activeCompetitionId);
  const stars = st.stars.map(v => h("input", { type: "number", value: v, step: "0.5" }));
  const winI = h("input", { type: "number", value: st.noRepeatWindow, min: 1, max: 1000 });
  const gridI = h("input", { type: "number", value: st.gridSize, min: 5, max: 40 });
  const srcSel = select([["kfgqpc", "މަދީނާ މުޞްޙަފު (KFGQPC — ޞަފުޙާ އަދި ފޮޅުވަތް ހަމަ)"], ["tanzil", "Tanzil.net ޢުޘްމާނީ ޓެކްސްޓް"]], st.textSource);
  const dispSel = select([["text", "ފޮންޓުން ލިޔެފައި (ޓެކްސްޓް)"], ["image", "މުޞްޙަފުގެ PNG ޞަފުޙާ"]], st.studentDisplay);
  const methSel = select([["mean", "ހުރިހާ ޖަޖުންގެ އެވަރެޖު"], ["trimmed", "އެންމެ މަތީ އަދި ދަށު މާކްސް ދޫކޮށް އެވަރެޖު (5 ޖަޖުން ނުވަތަ އެއަށްވުރެ ގިނަނަމަ)"]], st.scoring.method);
  const m = st.mushaf;
  const mBase = h("input.ltr", { value: m.base }), mPat = h("input.ltr", { value: m.pattern });
  const cal = {};
  ["top", "bottom", "left", "right", "p12top", "p12bottom"].forEach(k => cal[k] = h("input", { type: "number", step: "0.1", value: m[k] }));

  // ---- colour theme & royal Quran frame ----
  let themeVal = st.theme || DEFAULT_SETTINGS.theme;
  let frameVal = st.qframe == null ? DEFAULT_SETTINGS.qframe : +st.qframe;
  const themeBox = h("div.theme-swatches");
  const drawThemes = () => {
    themeBox.innerHTML = "";
    THEMES.forEach(t => themeBox.appendChild(h("button.theme-sw" + (t.key === themeVal ? ".sel" : ""), { type: "button",
      onclick: () => { themeVal = t.key; document.documentElement.dataset.theme = t.key; drawThemes(); } },
      h("span.chips", t.sw.map(c => h("b", { style: { background: c } }))), t.dv)));
  };
  drawThemes();
  const sample = () => h("div.qf-sample", { html: "ٱلۡحَمۡدُ لِلَّهِ رَبِّ ٱلۡعَٰلَمِينَ<br>ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ" });
  const gal = h("div.qf-gallery");
  [{ id: 0, dv: "ބޯޑަރު ނެތް" }, ...FRAMES].forEach(f => gal.appendChild(h("button.qf-opt" + (f.id === frameVal ? ".sel" : ""), { type: "button", "data-id": f.id,
    onclick: () => { frameVal = f.id; gal.querySelectorAll(".qf-opt").forEach(x => x.classList.toggle("sel", +x.dataset.id === f.id)); } },
    f.id ? frameEl(f.id, sample()) : h("div.qf-none", h("div", { style: { background: "#fffdf5", borderRadius: "6px" } }, sample())),
    h("div.qf-label", f.id ? `${f.id}. ${f.dv}` : f.dv))));

  view.append(
    h("div.card", h("h2", "އާންމު ސެޓިންގްސް"),
      h("div.grid3",
        field("ހިނގަމުންދާ މުބާރާތް", compSel, "މުބާރާތްތައް ހަދާނީ 'މުބާރާތާއި ބައިތައް' ޓެބުން"),
        field("ސުވާލު ރިޕީޓް ނުވާ ގްރިޑް ޢަދަދު (ސެޝަނަކަށް)", winI, "މި ޢަދަދަށް ގްރިޑް ނުނެގެނީސް ސުވާލުގެ ފެށޭ / ނިމޭ ތަން ތަކުރާރު ނުވާނެ"),
        field("ގްރިޑްގެ ގޮޅި ޢަދަދު (ޑިފޯލްޓް)", gridI)),
      h("div.grid3",
        field("ޤުރްއާން ޓެކްސްޓް ސޯސް", srcSel),
        field("ދަރިވަރު ސްކްރީނުގައި ދައްކާނީ", dispSel, "ޓެކްސްޓްގައި ކުށެއް ފާހަގަވެއްޖެނަމަ PNG ވަރޝަން އޮން ކުރައްވާ"),
        field("ފައިނަލް މާކްސް ހިސާބުކުރާ ގޮތް", methSel)),
      h("h3", "ތަރި (ސްޓާރ) ދޭ މިންގަނޑު — މާކްސް މި އަދަދު ނުވަތަ މަތި"),
      h("div.grid4", stars.slice(0, 4).map((s, i) => field(`${i + 1} ތަރި`, s))), field("5 ތަރި (ވަރަށް ފުރިހަމަ)", stars[4])),
    h("div.card", h("h2", "ކުލައާއި ބޯޑަރު"),
      h("h3", "ސިސްޓަމުގެ ކުލަ"),
      h("p.small.muted", "ފިތާލުމުން މި ސްކްރީނުގައި ކުލަ ބަދަލުވާނެ. އެހެން ސްކްރީންތަކަށް ފެތޭނީ ސޭވް ކުރުމުން."), themeBox,
      h("h3", { style: { marginTop: "20px" } }, "ދަރިވަރު ސްކްރީނުގެ ޤުރްއާން ބޯޑަރު"),
      h("p.small.muted", "ޤުރްއާން ޓެކްސްޓް، PNG ޞަފުޙާ އަދި ނުބަލައި ކިޔެވުމުގެ ފެށުން ދައްކާ ތަނަށް މި ބޯޑަރު އަރާނެ."), gal),
    h("div.card", h("h2", "މުޞްޙަފުގެ PNG ޞަފުޙާތައް ", h("small", "— GitHub ރިޕޮގެ mushaf/ ފޯލްޑަރުގައި 001.png ... 604.png")),
      h("div.grid2", field("ފޯލްޑަރު / URL", mBase, "މިސާލު: mushaf/ ނުވަތަ https://.../"), field("ފައިލް ނަމުގެ ގޮތް", mPat, "{p3} = 001، {p} = 1، {p4} = 0001")),
      h("p.small.muted", "ދަރިވަރު ސްކްރީނުގައި ކިޔަވަންވީ ފޮޅުވަތްތަކުގެ ކައިރީގައި ރަތް ރޮނގެއް އަޅާނީ މި މިންތަކަށް ބަލައިގެން (% އިން). ކެލިބްރޭޓް ކުރައްވާ:"),
      h("div.grid3", field("މަތީ ހުސްބައި %", cal.top), field("ތިރީ ހުސްބައި %", cal.bottom), field("ވާތް / ކަނާތް ހުސްބައި %", cal.left)),
      h("div.grid3", field("ކަނާތް %", cal.right), field("ޞަފުޙާ 1-2 މަތި %", cal.p12top), field("ޞަފުޙާ 1-2 ތިރި %", cal.p12bottom)),
      h("button.btn.blue", { onclick: () => calibrate() }, "🔍 ކެލިބްރޭޝަން ޗެކްކުރޭ")),
    h("div.row", h("button.btn.primary.lg", { onclick: save }, "💾 ސެޓިންގްސް ސޭވްކުރޭ")));

  function collect() {
    return {
      activeCompetitionId: compSel.value, noRepeatWindow: +winI.value || 100, gridSize: +gridI.value || 20,
      textSource: srcSel.value, studentDisplay: dispSel.value, stars: stars.map(s => +s.value),
      scoring: { ...st.scoring, method: methSel.value },
      mushaf: { base: mBase.value.trim(), pattern: mPat.value.trim() || "{p3}.png",
        ...Object.fromEntries(Object.entries(cal).map(([k, v]) => [k, +v.value])) },
      liveControllers: st.liveControllers || DEFAULT_SETTINGS.liveControllers,
      theme: themeVal, qframe: frameVal
    };
  }
  async function save() {
    const d = collect();
    for (let i = 1; i < 5; i++) if (d.stars[i] < d.stars[i - 1]) return toast("ތަރީގެ މާކްސް ކުޑައިން ބޮޑަށް ލިޔުއްވާ", "err");
    await setDoc(doc(db, "settings", "app"), { ...d, updatedAt: serverTimestamp(), updatedBy: S.me.email });
    audit("settings_save", d); await loadSettings(); cache.categories = null; cache.sessions = null;
    toast("ސެޓިންގްސް ސޭވް ކުރެވިއްޖެ");
  }
  async function calibrate() {
    const d = collect().mushaf;
    const pIn = h("input", { type: "number", value: 3, min: 1, max: 604 });
    const box = h("div.center");
    const draw = () => {
      const p = Math.max(1, Math.min(604, +pIn.value || 3));
      const n = pageSlotCount(p);
      const wrap = h("div.calib", h("img", { src: pageImageURL(p, d), onerror: (e) => { e.target.replaceWith(h("div.empty", "ފައިލް ނުފެނުނު: " + pageImageURL(p, d))); } }));
      for (let s = 1; s <= n; s++) {
        const [t, ht] = slotBand(p, s, s, d);
        wrap.appendChild(h("div.ln", { style: { top: t + "%" } }, h("span", s)));
        if (s === n) wrap.appendChild(h("div.ln", { style: { top: (t + ht) + "%" } }));
      }
      box.innerHTML = ""; box.appendChild(wrap);
    };
    pIn.oninput = draw; draw();
    await modal("ކެލިބްރޭޝަން — ކޮންމެ ފޮޅުވަތެއް ދެ ރަތް ރޮނގުގެ ދެމެދުގައި ހުންނަން ވާނެ", h("div", field("ޞަފުޙާ", pIn), box), [], { wide: true });
  }
}

// ------------------------------------------------------------ COMPETITIONS & CATEGORIES
export async function categories(view) {
  await loadQuran();
  const compCard = h("div.card");
  const catCard = h("div.card");
  view.append(compCard, catCard);

  async function drawComps() {
    const comps = (await getDocs(collection(db, "competitions"))).docs.map(d => ({ id: d.id, ...d.data() }));
    compCard.innerHTML = "";
    compCard.append(h("h2", "މުބާރާތްތައް"),
      h("div.row", h("button.btn.primary", { onclick: () => editComp() }, "+ އާ މުބާރާތެއް"),
        h("span.small.muted", "ހިނގަމުންދާ މުބާރާތް: " + ((comps.find(c => c.id === S.settings.activeCompetitionId) || {}).name || "ނެތް — ސެޓިންގްސް ޓެބުން ހޮވާ"))),
      comps.length ? h("div.tbl-wrap", { style: { marginTop: "10px" } }, h("table.tbl",
        h("thead", h("tr", ["ނަން", "އަހަރު", "ތަން", "ID", ""].map(x => h("th", x)))),
        h("tbody", comps.map(c => h("tr", h("td", c.name), h("td", c.year || ""), h("td", c.venue || ""), h("td.ltr.small.muted", c.id),
          h("td", h("button.btn.sm", { onclick: () => editComp(c) }, "ބަދަލު"))))))) : empty("މުބާރާތެއް ނެތް"));
  }
  async function editComp(c) {
    const nm = h("input", { value: c ? c.name : "" }), yr = h("input", { type: "number", value: c ? c.year : new Date().getFullYear() });
    const vn = h("input", { value: c ? c.venue || "" : "" }), org = h("input", { value: c ? c.organizer || "" : "" });
    const ok = await modal("މުބާރާތް", h("div", field("މުބާރާތުގެ ނަން", nm), field("އަހަރު", yr), field("ބާއްވާ ތަން", vn), field("ބާއްވާ ފަރާތް", org)),
      [{ label: "ކެންސަލް" }, { label: "ސޭވް", cls: "primary", onClick: async () => {
        if (!nm.value.trim()) return false;
        const id = c ? c.id : "C" + yr.value + "_" + Math.random().toString(36).slice(2, 6);
        await setDoc(doc(db, "competitions", id), { name: nm.value.trim(), year: +yr.value, venue: vn.value.trim(), organizer: org.value.trim(),
          updatedAt: serverTimestamp() }, { merge: true });
        if (!S.settings.activeCompetitionId && S.me.role === "superadmin") {
          await setDoc(doc(db, "settings", "app"), { activeCompetitionId: id }, { merge: true }); await loadSettings();
        }
        audit("competition_save", { id }); return true;
      } }]);
    if (ok) drawComps();
  }

  async function drawCats() {
    catCard.innerHTML = "";
    catCard.append(h("h2", "ބައިތައް (ކެޓަގަރީ) — މުޤައްރަރު، ސުވާލު ޢަދަދު، ފޮޅުވަތް، ރުބްރިކް"));
    if (!S.settings.activeCompetitionId) return catCard.appendChild(empty("ފުރަތަމަ މުބާރާތެއް ހަދާ، ސެޓިންގްސް ޓެބުން ހިނގަމުންދާ މުބާރާތް ހޮއްވަވާ."));
    const cats = await loadCategories(true);
    catCard.append(h("button.btn.primary", { onclick: () => editCat() }, "+ އާ ބައެއް"),
      cats.length ? h("div.tbl-wrap", { style: { marginTop: "10px" } }, h("table.tbl",
        h("thead", h("tr", ["#", "ބައި", "ގޮފި", "ޢުމުރު", "ޖިންސު", "މުޤައްރަރު", "ސުވާލު", "ފޮޅުވަތް", "ރުބްރިކް", ""].map(x => h("th", x)))),
        h("tbody", cats.map(c => h("tr", h("td", c.order || ""), h("td", h("b", c.name)), h("td", BRANCHES[c.branch] || c.branch),
          h("td", (AGE_GROUPS.find(a => a[0] === c.ageGroup) || [0, c.ageGroup || "-"])[1]),
          h("td", c.gender === "M" ? "ފިރިހެން" : c.gender === "F" ? "އަންހެން" : "ދެބައި"),
          h("td.small", describeSyllabus(c.syllabus)), h("td", c.qCount), h("td", `${c.minLines}–${c.maxLines}`),
          h("td", (c.rubric || []).reduce((a, r) => a + (+r.max || 0), 0)),
          h("td", h("div.row", h("button.btn.sm", { onclick: () => editCat(c) }, "ބަދަލު"),
            h("button.btn.sm", { onclick: () => editCat({ ...c, id: null, name: c.name + " (ކޮޕީ)" }) }, "ކޮޕީ"))))))))
        : empty("ބައެއް ނެތް"));
  }

  async function editCat(c0) {
    const c = c0 || { name: "", branch: "mushaf", ageGroup: "U13", gender: "", order: 1, syllabus: { type: "juz", from: 1, to: 1 },
      qCount: 3, minLines: 3, maxLines: 7, gridSize: S.settings.gridSize, rubric: JSON.parse(JSON.stringify(DEFAULT_RUBRIC)),
      jaliDed: 1, khafiDed: 0.5, autoDeduct: true, hifzHintWords: 3, deductSteps: [0.25, 0.5, 1], openForRegistration: true };
    const nm = h("input", { value: c.name }), ord = h("input", { type: "number", value: c.order || 1 });
    const br = select(Object.entries(BRANCHES), c.branch);
    const ag = select(AGE_GROUPS, c.ageGroup), gd = select([["", "ދެބައި"], ...GENDERS], c.gender || "");
    const sType = select([["juz", "ފޮތް (ޖުޒު) ވަކިން"], ["surah", "ސޫރަތް ވަކިން"], ["page", "ޞަފުޙާ ވަކިން"]], c.syllabus.type);
    const fromBox = h("div"), toBox = h("div");
    let sFrom, sTo;
    const drawSyl = () => {
      const t = sType.value;
      const opts = t === "surah" ? surahOptions() : t === "juz" ? Array.from({ length: 30 }, (_, i) => [i + 1, "ފޮތް " + (i + 1)]) : null;
      sFrom = opts ? select(opts, c.syllabus.type === t ? c.syllabus.from : 1) : h("input", { type: "number", min: 1, max: 604, value: c.syllabus.type === t ? c.syllabus.from : 1 });
      sTo = opts ? select(opts, c.syllabus.type === t ? c.syllabus.to : 1) : h("input", { type: "number", min: 1, max: 604, value: c.syllabus.type === t ? c.syllabus.to : 1 });
      fromBox.innerHTML = ""; toBox.innerHTML = "";
      fromBox.appendChild(field("ފަށާ", sFrom)); toBox.appendChild(field("ނިމޭ", sTo));
      [sFrom, sTo].forEach(x => x.onchange = preview);
      preview();
    };
    const qc = h("input", { type: "number", min: 1, max: 100, value: c.qCount });
    const mnL = h("input", { type: "number", min: 1, max: 15, value: c.minLines }), mxL = h("input", { type: "number", min: 1, max: 15, value: c.maxLines });
    const gs = h("input", { type: "number", min: 5, max: 40, value: c.gridSize || S.settings.gridSize });
    const hint = h("input", { type: "number", min: 0, max: 10, value: c.hifzHintWords ?? 3 });
    const jd = h("input", { type: "number", step: "0.25", value: c.jaliDed }), kd = h("input", { type: "number", step: "0.25", value: c.khafiDed });
    const ad = h("input", { type: "checkbox" }); ad.checked = c.autoDeduct !== false;
    const steps = h("input.ltr", { value: (c.deductSteps || [0.25, 0.5, 1]).join(", ") });
    const openReg = h("input", { type: "checkbox" }); openReg.checked = c.openForRegistration !== false;
    const prev = h("div.small.muted");
    [mnL, mxL].forEach(x => x.oninput = preview);
    function preview() {
      try {
        const n = buildCandidates({ type: sType.value, from: +sFrom.value, to: +sTo.value }, +mnL.value, +mxL.value).length;
        prev.innerHTML = `މި މުޤައްރަރުން ${n} ސުވާލު ހެދެއެވެ (ހުރިހާ ސުވާލެއް އެއް ޞަފުޙާއެއްގެ ތެރޭގައި، މުޅި އާޔަތްތަކުން).` +
          (n < 60 ? ` <b style="color:#ffb74d">ސުވާލު މަދު — ފޮޅުވަތުގެ އަދަދު ކުޑަކުރުން ނުވަތަ މުޤައްރަރު ބޮޑުކުރުން ރަނގަޅު.</b>` : "");
      } catch (e) { prev.textContent = ""; }
    }
    const rub = (c.rubric || []).map(r => ({ ...r }));
    const rubBox = h("div");
    const drawRub = () => {
      rubBox.innerHTML = "";
      rub.forEach((r, i) => rubBox.appendChild(h("div.row", { style: { marginBottom: "6px" } },
        h("input", { value: r.name, style: { flex: 2 }, oninput: (e) => r.name = e.target.value }),
        h("input.ltr", { value: r.key, style: { flex: 1 }, title: "key", oninput: (e) => r.key = e.target.value.trim() }),
        h("input", { type: "number", value: r.max, style: { width: "80px" }, oninput: (e) => { r.max = +e.target.value; tot(); } }),
        h("button.btn.sm.red", { onclick: () => { rub.splice(i, 1); drawRub(); } }, "✕"))));
      rubBox.appendChild(h("div.row", h("button.btn.sm", { onclick: () => { rub.push({ key: "k" + Date.now().toString(36), name: "", max: 5 }); drawRub(); } }, "+ ބައެއް"), totEl));
      tot();
    };
    const totEl = h("b");
    const tot = () => { const s = rub.reduce((a, r) => a + (+r.max || 0), 0); totEl.textContent = "ޖުމްލަ: " + s; totEl.style.color = s === 100 ? "#00e676" : "#ffb74d"; };
    sType.onchange = drawSyl;
    drawRub(); drawSyl();
    const ok = await modal(c.id ? "ބައި ބަދަލުކުރުން" : "އާ ބައެއް", h("div",
      h("div.grid3", field("ބައިގެ ނަން", nm), field("ތަރުތީބު", ord), field("ގޮފި", br)),
      h("div.grid3", field("ޢުމުރުފުރާ", ag), field("ޖިންސު", gd), h("label.row", openReg, "ރަޖިސްޓްރޭޝަން ފޯމުގައި ދައްކާ")),
      h("h3", "މުޤައްރަރު"),
      h("div.grid3", field("ހޮވާ ގޮތް", sType), fromBox, toBox), prev,
      h("h3", "ސުވާލު"),
      h("div.grid4", field("ދަރިވަރަކަށް ސުވާލު ޢަދަދު (1–100)", qc), field("އެންމެ މަދު ފޮޅުވަތް", mnL), field("އެންމެ ގިނަ ފޮޅުވަތް", mxL), field("ގްރިޑް ގޮޅި", gs)),
      field("ނުބަލައި ގޮފީގައި ދަރިވަރަށް ދައްކާ ފެށުމުގެ ކަލިމަ ޢަދަދު", hint),
      h("h3", "ރުބްރިކް (ނަން • key • މެކްސް)"), rubBox,
      h("h3", "ކުށުން މާކްސް ކެނޑުން"),
      h("div.grid4", h("label.row", ad, "އޮޓޯ ކަނޑާ"), field("ލަޙްނު ޖަލީ އަކަށް", jd), field("ލަޙްނު ޚަފީ އަކަށް", kd), field("މެނުއަލް ބަޓަން (, ން ވަކިކޮށް)", steps))),
      [{ label: "ކެންސަލް" }, { label: "ސޭވް", cls: "primary", onClick: async () => {
        if (!nm.value.trim()) { toast("ނަން ލިޔުއްވާ", "err"); return false; }
        if (!rub.length || rub.some(r => !r.key || !r.name)) { toast("ރުބްރިކް ފުރިހަމަކުރައްވާ", "err"); return false; }
        const keys = new Set(rub.map(r => r.key)); if (keys.size !== rub.length) { toast("ރުބްރިކް key ތަކުރާރުވެއްޖެ", "err"); return false; }
        const data = {
          competitionId: S.settings.activeCompetitionId, name: nm.value.trim(), order: +ord.value || 0, branch: br.value,
          ageGroup: ag.value, gender: gd.value, syllabus: { type: sType.value, from: +sFrom.value, to: +sTo.value },
          qCount: Math.max(1, Math.min(100, +qc.value || 3)), minLines: +mnL.value || 3, maxLines: Math.max(+mnL.value, +mxL.value || 7),
          gridSize: +gs.value || 20, hifzHintWords: +hint.value, rubric: rub, jaliDed: +jd.value, khafiDed: +kd.value,
          autoDeduct: ad.checked, deductSteps: steps.value.split(/[,\s]+/).map(Number).filter(x => x > 0),
          openForRegistration: openReg.checked, updatedAt: serverTimestamp()
        };
        const id = c.id || "cat_" + Math.random().toString(36).slice(2, 9);
        await setDoc(doc(db, "categories", id), data, { merge: true });
        audit("category_save", { id, name: data.name }); return true;
      } }], { wide: true });
    if (ok) { toast("ސޭވް ކުރެވިއްޖެ"); drawCats(); }
  }
  drawComps(); drawCats();
}

// ------------------------------------------------------------ AUDIT
export async function auditLog(view) {
  const card = h("div.card", h("h2", "އޯޑިޓް ލޮގް (އެންމެ ފަހުގެ 300)"), spinner());
  view.appendChild(card);
  const snap = await getDocs(collection(db, "audit"));
  const rows = snap.docs.map(d => d.data()).sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0)).slice(0, 300);
  card.lastChild.remove();
  card.appendChild(h("div.tbl-wrap", h("table.tbl", h("thead", h("tr", ["ވަގުތު", "ފަރާތް", "ޢަމަލު", "ތަފްޞީލު"].map(x => h("th", x)))),
    h("tbody", rows.map(r => h("tr", h("td.small.ltr", fmtDateTime(r.at)), h("td.ltr.small", r.by), h("td", r.action),
      h("td.ltr.small", { style: { maxWidth: "500px", overflow: "hidden", textOverflow: "ellipsis" } }, JSON.stringify(r.data || {}).slice(0, 200))))))));
}
