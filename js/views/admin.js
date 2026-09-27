// ============================================================
//  Super Admin: users, settings (mushaf, stars), competitions & categories, audit
// ============================================================
import {
  S, db, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, collection, query, where, serverTimestamp, writeBatch, runTransaction,
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
    h("div.row", h("button.btn.primary.lg", { onclick: save }, "💾 ސެޓިންގްސް ސޭވްކުރޭ")),
    h("div.card", { style: { border: "2px dashed var(--gold)", marginTop: "18px" } },
      h("h2", "🧪 ޓެސްޓިންގ — ޑަމީ ޑޭޓާ"),
      h("p.small.muted", "ސިސްޓަމް ޓެސްޓްކުރަން 40 ދަރިވަރު، 4 ކެޓަގަރީ، 5 ޖަޖުންގެ ނަތީޖާ ހިމެނޭ ސެމްޕަލް ޑޭޓާ ވައްދެވިދާނެ. " +
        "ހަދާ ފައިލް ވަކިން ޑައުންލޯޑްވެސް ކުރެވޭ. ﺗَﺤْﺬِﻳﺮ: ﺩَﺍﺋِﻤِﻲ ﺩَﺍﺋِﻤِﻲ ﺩَﺍﺋِﻤِﻲ ﻟِﻴ — ﻛُﺮِﻭَﻓِﻲ ﺍِﺿَﺎﻓَﺔ ﺩَﺍﺋِﻤِﻲ ﺩَﺍﺋِﻤِﻲ ﺩَﺍﺋِﻤِﻲ — ﻓَﺎﻳَِﻲ ﻛُﺮِﻭَﻓِﻲ Firestore ﮬَﺪَﻓِﻲ ﺩَﺍﺋِﻤِﻲ ﻧِﻤِﻲ ﻻ — ﺗَﺤْﺬِﻳﺮ: ﺍَﺣْﺘِﻴَﺎﻁ ﺍِﺭِﻩَﻝَﺍﺕِﻲ ﺩَﺍﺋِﻤِﻲ." +
        " ﻭِﺍِﻱ ﻭَﻛِﻲ ﺳَﺎﺩَﺍ ﻣُﺒَﺎﺭَﺍﺓ ﺎَﻟِﺲ ﻛِﺎﻡ ﻛُﺮَﻓِﻲ."),
      h("div.row",
        h("button.btn.orange", { onclick: () => downloadDummy() }, "⬇ JSON ޑައުންލޯޑް"),
        h("button.btn.red", { onclick: () => importDummy() }, "🔥 Firestore ތެރެ ވައްދާ (ﺩَﺍﺋِﻤِﻲ)"))));

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
  // ---------------------------------------------------------------- DUMMY DATA
  const DUMMY_CATS = [
    { id:"dcat_u8_balaigen",   name:"ދަށް ތިލަ ފޮޅުވަތް — U8",   ageGroup:"U8",  branch:"balaigen", gender:"",
      rubric:[{key:"thilawa",name:"ތިލާވަތު",max:40},{key:"tajweed",name:"ތަޖްވީދު",max:30},{key:"maqamat",name:"ތަރިހި",max:20},{key:"fasaha",name:"ފަޞާޙަތް",max:10}], order:1 },
    { id:"dcat_u13_balaigen",  name:"ދެ ތިލަ ފޮޅުވަތް — U13",  ageGroup:"U13", branch:"balaigen", gender:"",
      rubric:[{key:"thilawa",name:"ތިލާވަތު",max:30},{key:"tajweed",name:"ތަޖްވީދު",max:25},{key:"maqamat",name:"ތަރިހި",max:25},{key:"fasaha",name:"ފަޞާޙަތް",max:10},{key:"talaffuz",name:"ތަލައްފުޒު",max:10}], order:2 },
    { id:"dcat_u18_nubalaigen",name:"ނުބަލައި — U18",             ageGroup:"U18", branch:"nubalaigen",gender:"",
      rubric:[{key:"thilawa",name:"ތިލާވަތު",max:25},{key:"tajweed",name:"ތަޖްވީދު",max:25},{key:"maqamat",name:"ތަރިހި",max:20},{key:"sifa",name:"ﺻِﻔَﺔ",max:20},{key:"fasaha",name:"ފަޞާޙަތް",max:10}], order:3 },
    { id:"dcat_hifz_open",     name:"ﺣِﻔْﻆ ﺍﻟْﻘُﺮْﺁﻥ — ﺍﻟﻔَﺘَﺢ", ageGroup:"Open",branch:"hifz",     gender:"",
      rubric:[{key:"hifz",name:"ﺣِﻔْﻆ",max:50},{key:"tajweed",name:"ތަޖްވީދު",max:30},{key:"maqamat",name:"ﻣَﻘَﺎﻣَﺎﺕ",max:20}], order:4 }
  ];
  const DUMMY_NAMES = [
    ["ﺁﻳِﺸَﺔ ﺃَﺣْﻤَﺪ","Aisha Ahmed","A110001","F","2018-03-12","Male","Aminiyya School","School","+9607770001"],
    ["ﻓَﺎﻃِﻤَﺔ ﻋَﻠِﻲّ","Fathima Ali","A110002","F","2018-07-20","Hulhumale","Iskandhar School","School","+9607770002"],
    ["ﻣُﻮﺳَﻰ ﻣُﺤَﻤَّﺪ","Moosa Mohamed","A110003","M","2017-11-05","Addu City","Ghiyaasuddin Int'l","School","+9607770003"],
    ["ﺃَﺣْﻤَﺪ ﺳَﻌِﻴﺪ","Ahmed Saeed","A110004","M","2017-01-28","Male","Billabong High","School","+9607770004"],
    ["ﻋَﺎﺋِﺸَﺔ ﻣُﺤَﻤَّﺪ","Aisha Mohamed","A110005","F","2016-09-14","Naifaru","Maafannu Middle","School","+9607770005"],
    ["ﺃَﻣِﻴﻨَﺔ ﺣَﺴَﻦ","Aminath Hassan","A110006","F","2013-04-03","Male","Aminiyya School","School","+9607770006"],
    ["ﻋَﺒْﺪُﺍﻟﻠَّﻪ ﻣُﺤَﻤَّﺪ","Abdulla Mohamed","A110007","M","2013-08-19","Hulhumale","Iskandhar School","School","+9607770007"],
    ["ﺣَﺴَﻦ ﺃَﺣْﻤَﺪ","Hassan Ahmed","A110008","M","2012-12-25","Fuvahmulah","Ameer Ahmed School","School","+9607770008"],
    ["ﻣَﺮْﻳَﻢ ﻋَﻠِﻲّ","Mariyam Ali","A110009","F","2013-02-07","Male","IUM","University","+9607770009"],
    ["ﺇِﺑْﺮَﺍﻫِﻴﻢ ﺣَﺴَﻦ","Ibrahim Hassan","A110010","M","2012-06-15","Kulhudhuffushi","Fiyavathi School","School","+9607770010"],
    ["ﺯَﻳْﻨَﺐ ﻣُﺤَﻤَّﺪ","Zainab Mohamed","A110011","F","2008-03-22","Male","Aminiyya School","School","+9607770011"],
    ["ﻫَﺎﺟَﺮ ﺇِﺑْﺮَﺍﻫِﻴﻢ","Hajar Ibrahim","A110012","F","2008-09-11","Addu City","Ghiyaasuddin Int'l","School","+9607770012"],
    ["ﻳُﻮﺳُﻒ ﻋَﻠِﻲّ","Yoosuf Ali","A110013","M","2007-07-04","Hulhumale","Iskandhar School","School","+9607770013"],
    ["ﺧَﺪِﻳﺠَﺔ ﺃَﺣْﻤَﺪ","Khadheeja Ahmed","A110014","F","2007-11-18","Male","Maafannu Middle","School","+9607770014"],
    ["ﻋُﻤَﺮ ﻣُﺤَﻤَّﺪ","Umar Mohamed","A110015","M","2006-01-30","Naifaru","IUM","University","+9607770015"],
    ["ﺻَﺎﻟِﺢ ﺇِﺑْﺮَﺍﻫِﻴﻢ","Salih Ibrahim","A110016","M","2006-05-09","Maamigili","QuranClass Maamigili","QuranClass","+9607770016"],
    ["ﻧَﻔِﻴﺴَﺔ ﺣَﺴَﻦ","Nafeesa Hassan","A110017","F","2007-08-27","Eydhafushi","Ameer Ahmed School","School","+9607770017"],
    ["ﻋُﺜْﻤَﺎﻥ ﻋَﺒْﺪُﺍﻟﻠَّﻪ","Uthman Abdulla","A110018","M","2005-04-16","Male","Aminiyya School","School","+9607770018"],
    ["ﺳُﻮﺩَﺓ ﻣُﻮﺳَﻰ","Sooda Moosa","A110019","F","2005-10-02","Fuvahmulah","Fiyavathi School","School","+9607770019"],
    ["ﻋَﻠِﻲّ ﻣُﺤَﻤَّﺪ","Ali Mohamed","A110020","M","1998-02-14","Male","IUM","University","+9607770020"],
    ["ﻓَﺮِﻳﺪَﺓ ﻋَﻠِﻲّ","Fareeda Ali","A110021","F","1995-06-30","Hulhumale","Private","Private","+9607770021"],
    ["ﻣُﺤَﻤَّﺪ ﺃَﺣْﻤَﺪ","Mohamed Ahmed","A110022","M","2001-09-08","Male","IUM","University","+9607770022"],
    ["ﺃَﺣْﻤَﺪ ﺭَﺷِﻴﺪ","Ahmed Rasheed","A110023","M","1999-12-03","Addu City","QuranClass Addu","QuranClass","+9607770023"],
    ["ﺷَﻬِﻴﺪَﺓ ﺣَﺴَﻦ","Shaheeda Hassan","A110024","F","2000-03-17","Male","Aminiyya School","School","+9607770024"],
    ["ﻳُﻮﺳُﻒ ﻣُﺤَﻤَّﺪ","Yoosuf Mohamed","A110025","M","1997-07-22","Naifaru","Private","Private","+9607770025"],
    ["ﻫُﺒَﻴْﺶَﺓ ﻋَﻠِﻲّ","Hubaisha Ali","A110026","F","2018-05-11","Male","Maafannu Middle","School","+9607770026"],
    ["ﻋِﻴﺴَﻰ ﺃَﺣْﻤَﺪ","Eesa Ahmed","A110027","M","2017-08-03","Hulhumale","Iskandhar School","School","+9607770027"],
    ["ﻓَﺪْﻭَﻯ ﻣُﺤَﻤَّﺪ","Fadwa Mohamed","A110028","F","2018-01-19","Male","Aminiyya School","School","+9607770028"],
    ["ﻋَﺒْﺪُﺍﻟﻌَﺰِﻳﺰ ﻋَﻠِﻲّ","Abdulaziz Ali","A110029","M","2016-11-07","Fuvahmulah","Ameer Ahmed School","School","+9607770029"],
    ["ﺃَﻣَﻞ ﺣَﺴَﻦ","Amal Hassan","A110030","F","2017-04-25","Addu City","Ghiyaasuddin Int'l","School","+9607770030"],
    ["ﺳَﻌِﻴﺪ ﻣُﺤَﻤَّﺪ","Saeed Mohamed","A110031","M","2012-10-13","Male","Maafannu Middle","School","+9607770031"],
    ["ﺳَﻠِﻴﻤَﺔ ﻋَﻠِﻲّ","Saleema Ali","A110032","F","2013-03-28","Hulhumale","IUM","University","+9607770032"],
    ["ﺃَﺑُﻮﺑَﻜْﺮ ﺃَﺣْﻤَﺪ","Aboobakuru Ahmed","A110033","M","2012-07-06","Eydhafushi","Fiyavathi School","School","+9607770033"],
    ["ﺃَﺳِﻴﺮَﺓ ﻣُﺤَﻤَّﺪ","Aseera Mohamed","A110034","F","2013-12-21","Male","Aminiyya School","School","+9607770034"],
    ["ﺷَﻬِﻴﺪ ﻋَﻠِﻲّ","Shaheed Ali","A110035","M","2011-09-10","Naifaru","Iskandhar School","School","+9607770035"],
    ["ﺭُﻗَﻴَّﺔ ﺃَﺣْﻤَﺪ","Rugiyya Ahmed","A110036","F","2007-02-14","Male","Ghiyaasuddin Int'l","School","+9607770036"],
    ["ﻋُﺒَﻴْﺪِﺍﻟﻠَّﻪ ﺣَﺴَﻦ","Ubaidulla Hassan","A110037","M","2006-06-30","Addu City","QuranClass Addu","QuranClass","+9607770037"],
    ["ﺧَﺎﻟِﺪَﺓ ﻣُﺤَﻤَّﺪ","Khaleeda Mohamed","A110038","F","2008-10-05","Male","Aminiyya School","School","+9607770038"],
    ["ﻳَﺤْﻴَﻰ ﻋَﻠِﻲّ","Yahya Ali","A110039","M","2005-01-23","Hulhumale","IUM","University","+9607770039"],
    ["ﺣَﻔِﻴﻈَﺔ ﺣَﺴَﻦ","Hafeeza Hassan","A110040","F","2000-08-18","Male","Private","Private","+9607770040"]
  ];
  const CAT_IDX = [0,0,0,0,0,0,0,0,0,0, 1,1,1,1,1,1,1,1,1,1, 2,2,2,2,2,2,2,2,2,2, 3,3,3,3,3,3,3,3,3,3];
  const JUDGE_NAMES = ["ﺃَﺑُﻮﺑَﻜْﺮ ﺳَﻌِﻴﺪ","ﻋَﻠِﻲّ ﺣَﺴَﻦ","ﻫَﺎﺭُﻭﻥ ﻋَﺒْﺪُﺍﻟﻠَّﻪ","ﻓَﻮْﺯَﺓ ﻣُﺤَﻤَّﺪ","ﺷَﺎﻓِﻲ ﺇِﺑْﺮَﺍﻫِﻴﻢ"];
  const ISLAND_ADDR = n => ["ﻙ.ﻣَﺎﻟِﻲ","ﻩ.ﮬُﻠُﻬُﻤَﺎﻟِﻲ","ﺍَﺩُﻭ ﺳِﻴﺘِﻲ","ﻓُﻮﺍﻫِﻤُﻠَﻪ","ﻧَﻴﻔَﺎﺭُ"][n%5];
  const SCORES = [0.96,0.93,0.90,0.87,0.85,0.92,0.89,0.86,0.94,0.88,0.91,0.84,0.95,0.88,0.87,0.90,0.83,0.92,0.86,0.94,0.89,0.85,0.91,0.88,0.93,0.84,0.90,0.87,0.92,0.86,0.93,0.88,0.95,0.84,0.89,0.91,0.86,0.93,0.88,0.90];
  const JVAR  = [[0.98,0.97,1.0,0.98,0.97],[0.95,0.99,0.97,0.96,0.98],[1.0,0.96,0.98,0.97,0.99],[0.97,0.98,0.96,1.0,0.95]];

  function buildDummy(compId, year) {
    const sessions = DUMMY_CATS.map((c,i) => ({
      id: `dses_${c.id}`, competitionId: compId, name: `ﺟَﻠْﺴَﺔ ${i+1} — ${c.name}`,
      date: `${year}-11-0${i+2}`, time: "09:00", venue: `Hall ${i+1}, Islamic Centre`,
      categoryId: c.id, status: "closed", order: [],
      judges: JUDGE_NAMES.map((jn,j) => ({ slot:j+1, name:jn, email:`judge${j+1}@ium.edu.mv` })), chiefs: []
    }));
    const students = [], results = [], scores = [];
    DUMMY_NAMES.forEach(([name,nameEn,nid,gender,dob,island,inst,itype,phone], idx) => {
      const ci = CAT_IDX[idx]; const c = DUMMY_CATS[ci]; const ses = sessions[ci];
      const id = `${compId}__${nid}`; const reg = `R${String(year).slice(-2)}-${String(idx+1).padStart(4,"0")}`;
      const stu = { id, competitionId:compId, regNo:reg, nid, name, nameEn, dob, gender,
        permAddress:`${ISLAND_ADDR(idx)}، ﺩ.ﺍَﻣُﻮﻭ ﺭ`, island, currentAddress:`ﻙ.ﻣَﺎﻟِﻲ`, phone, email:`${nid.toLowerCase()}@mail.mv`,
        categoryId:c.id, categoryName:c.name, branch:c.branch, ageGroup:c.ageGroup,
        institution:inst, instType:itype, guardianName:`ﻭَﻟِﻲّ ${nameEn.split(" ")[1]}`, guardianPhone:phone,
        photoThumb:"", status:"active", sessionId:ses.id, order:idx%10+1, checkin:true };
      students.push(stu);
      ses.order.push(id);
      const base = SCORES[idx];
      const jTotals = JUDGE_NAMES.map((_,j) => {
        const jv = JVAR[ci][j]; const tot = c.rubric.reduce((a,r) => a + Math.round(r.max*base*jv*100)/100, 0);
        const sc = { id:`${compId}_${ses.id}_${nid}_j${j+1}`, competitionId:compId, sessionId:ses.id,
          studentId:id, studentName:name, regNo:reg, nid, categoryId:c.id, categoryName:c.name,
          judgeSlot:j+1, judgeName:JUDGE_NAMES[j],
          criteria:Object.fromEntries(c.rubric.map(r=>[r.key, Math.round(r.max*base*jv*100)/100])),
          rubric:c.rubric, total:Math.round(tot*100)/100, errors:[], note:"", savedAt:new Date().toISOString() };
        scores.push(sc); return sc.total;
      });
      const sorted = [...jTotals].sort((a,b)=>a-b);
      const final = Math.round(sorted.slice(1,4).reduce((a,v)=>a+v,0)/3*100)/100;
      const maxTotal = c.rubric.reduce((a,r)=>a+r.max,0);
      const pct = final/maxTotal;
      const stars = pct>=0.95?5:pct>=0.9?4:pct>=0.85?3:pct>=0.75?2:1;
      results.push({ id:`${compId}_${ses.id}_${nid}`, competitionId:compId, sessionId:ses.id, studentId:id,
        name, nameEn, regNo:reg, nid, gender, ageGroup:c.ageGroup, island, institution:inst,
        categoryId:c.id, categoryName:c.name, final, stars, published:true,
        sessionName:ses.name, sessionDate:ses.date,
        judges:scores.filter(sc=>sc.studentId===id) });
    });
    return { categories:DUMMY_CATS, sessions, students, results, scores };
  }

  function downloadDummy() {
    const cid = compSel.value || "demo_comp_2026";
    const year = 2026;
    const { categories, sessions, students, results, scores } = buildDummy(cid, year);
    const out = JSON.stringify({ _meta:{ note:"RASFAHI Dummy Data", generated:new Date().toISOString() },
      competition:{ id:cid, name:"ﺭَﺍﺳْﻔَﻬِﻲ ﻣُﺒَﺎﺭَﺍﺓ 2026", year, venue:"Islamic Centre, Male'", organizer:"IUM" },
      categories, sessions, students, results, scores }, null, 2);
    const a = document.createElement("a");
    a.href = "data:application/json;charset=utf-8," + encodeURIComponent(out);
    a.download = "rasfahi_dummy_data.json"; a.click();
    toast("✔ rasfahi_dummy_data.json ޑައުންލޯޑް ފެށިއްޖެ");
  }

  async function importDummy() {
    const cid = compSel.value;
    if (!cid) return toast("ފުރަތަމަ ހިނގަމުންދާ މުބާރާތެއް ހޮވާ", "warn");
    const year = (comps.find(c=>c.id===cid)||{}).year || 2026;
    const ok = await confirmBox("ޑަމީ ޑޭޓާ ވެއްދުން",
      `'${cid}' ތެރެ 40 ދަރިވަރު، 4 ކެޓަގަރީ، 5 ޖަޖުންގެ ނަތީޖާ ވައްދާ. ﻫَﺎﻻَﺕِ ﮬِﻲ ﺩَﺍﺋِﻤِﻲ ﻻ ﺍِﻣْﻜَﺎﻥ ﺩِﻴ ﺩَﺍﺋِﻤِﻲ ﺩَﺍﺋِﻤِﻲ ﺩَﺍﺋِﻤِﻲ — ﻛُﺮِﻭَﻓِﻲ ﺍِﺿَﺎﻓَﺔ.`,
      "ވެއްދޭ", "red");
    if (!ok) return;
    toast("ލޯޑުވަނީ...");
    const { categories, sessions, students, results, scores } = buildDummy(cid, year);
    const batch = writeBatch(db);
    categories.forEach(c => batch.set(doc(db,"categories",c.id),{...c,competitionId:cid,createdAt:serverTimestamp()}));
    await batch.commit();
    const b2 = writeBatch(db);
    sessions.forEach(ses => b2.set(doc(db,"sessions",ses.id),{...ses,createdAt:serverTimestamp()}));
    await b2.commit();
    let done = 0;
    for (let i=0; i<students.length; i+=10) {
      const b3 = writeBatch(db);
      students.slice(i,i+10).forEach(s => { const {id,...d}=s; b3.set(doc(db,"students",id),{...d,createdAt:serverTimestamp()}); });
      await b3.commit(); done+=Math.min(10,students.length-i);
    }
    for (let i=0; i<scores.length; i+=20) {
      const b4 = writeBatch(db);
      scores.slice(i,i+20).forEach(sc => { const {id,...d}=sc; b4.set(doc(db,"scores",id),d); });
      await b4.commit();
    }
    for (let i=0; i<results.length; i+=10) {
      const b5 = writeBatch(db);
      results.slice(i,i+10).forEach(r => { const {id,...d}=r; b5.set(doc(db,"results",id),{...d,createdAt:serverTimestamp()}); });
      await b5.commit();
    }
    audit("dummy_import",{cid,count:students.length});
    toast(`✔ ${students.length} ދަރިވަރު، ${results.length} ނަތީޖާ، ${scores.length} ސްކޯ Firestore ތެރެ ވެދިއްޖެ`);
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
