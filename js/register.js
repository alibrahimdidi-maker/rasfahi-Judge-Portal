// ============================================================
//  PUBLIC REGISTRATION FORM
//  Step 1: email + full name + mobile  →  Step 2: the rest of the form opens.
//  The same three details re-open the same application (to fix and resubmit).
// ============================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js";

try { const t = localStorage.getItem("rasfahiTheme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const root = document.getElementById("reg");
const params = new URLSearchParams(location.search);

const AGE_GROUPS = { U6: "6 އަހަރުން ދަށް", U9: "9 އަހަރުން ދަށް", U11: "11 އަހަރުން ދަށް", U13: "13 އަހަރުން ދަށް", U16: "16 އަހަރުން ދަށް", U19: "19 އަހަރުން ދަށް", U21: "21 އަހަރުން ދަށް", GEN: "ޢާއްމު ބައި", SN: "ނުކުޅެދުންތެރިކަން ހުންނަ" };
const INST = [["School", "ސްކޫލް"], ["University", "ޔުނިވަރސިޓީ / ކޮލެޖް"], ["QuranClass", "ޤުރްއާން ކްލާސް"], ["Club", "ކްލަބް / ޖަމްޢިއްޔާ"], ["Office", "އޮފީސް"], ["Private", "އަމިއްލަ ގޮތުން"]];
const STATUS = { submitted: "ހުށަހެޅިއްޖެ — ބަލަމުންދަނީ", resubmitted: "އަލުން ހުށަހެޅިއްޖެ — ބަލަމުންދަނީ", needs_fix: "ރަނގަޅުކުރަން ޖެހޭ ކަންކަން އެބަހުއްޓެވެ", approved: "ގަބޫލުކުރެވިއްޖެ ✔", rejected: "ގަބޫލު ނުކުރެވުނު" };

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const digits = (s) => String(s || "").replace(/\D/g, "");
const normName = (s) => String(s || "").trim().replace(/\s+/g, " ").toLowerCase();
async function sha(t) { const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(t)); return Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, "0")).join(""); }
function ageOn(dob, on) { const d = new Date(dob), o = on ? new Date(on) : new Date(); if (isNaN(d)) return ""; let a = o.getFullYear() - d.getFullYear(); const m = o.getMonth() - d.getMonth(); if (m < 0 || (m === 0 && o.getDate() < d.getDate())) a--; return a; }
function resize(file, max, q) { return new Promise((res, rej) => { const fr = new FileReader(); fr.onerror = rej; fr.onload = () => { const im = new Image(); im.onerror = rej; im.onload = () => {
  const s = Math.min(1, max / Math.max(im.width, im.height)); const c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
  c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); res(c.toDataURL("image/jpeg", q)); }; im.src = fr.result; }; fr.readAsDataURL(file); }); }
function toast(msg, err) { const t = document.createElement("div"); t.className = "toast" + (err ? " err" : ""); t.textContent = msg;
  let b = document.getElementById("toasts"); if (!b) { b = document.createElement("div"); b.id = "toasts"; document.body.appendChild(b); } b.appendChild(t); setTimeout(() => t.remove(), 4500); }

let REG = null, APP = null, APP_ID = "", GATE = null;

async function start() {
  try { const s = await getDoc(doc(db, "public", "registration")); REG = s.exists() ? s.data() : null; }
  catch (e) { root.innerHTML = `<div class="card">ސާވަރާ ގުޅޭކަށް ނުވި. (${esc(e.code || e.message)})</div>`; return; }
  if (!REG || !REG.competitionId) { root.innerHTML = `<div class="card empty">މިހާރު ރަޖިސްޓްރޭޝަނެއް ނެތް.</div>`; return; }
  gate();
}

function head() {
  return `<div class="reg-head"><div class="bismillah">بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ</div><h1>${esc(REG.title || "ޤުރްއާން މުބާރާތް")}</h1>
  ${REG.subtitle ? `<div class="muted">${esc(REG.subtitle)}</div>` : ""}
  ${REG.deadline ? `<div class="tag gold" style="margin-top:8px">ފޯމު ބަލައިގަންނާނީ ${esc(REG.deadline)} ގެ ނިޔަލަށް</div>` : ""}</div>
  ${REG.announcement ? `<div class="card" style="white-space:pre-wrap">${esc(REG.announcement)}</div>` : ""}`;
}

function gate() {
  root.innerHTML = head() + `<div class="card"><h2>ފޯމު ހުޅުވުމަށް</h2>
    <p class="small muted">ފޯމު ހުޅުވޭނީ ތިރީގައިވާ 3 ކަން ޖެއްސެވުމުން. ފަހުން ފޯމު ބެއްލެވުމަށް ނުވަތަ ރަނގަޅުކުރުމަށް ހަމަ މި 3 ކަން ޖައްސަވާ.</p>
    <div class="grid3">
      <label class="field"><span class="req">އީމެއިލް</span><input id="gEmail" class="ltr" type="email" autocomplete="email"></label>
      <label class="field"><span class="req">ދަރިވަރުގެ ފުރިހަމަ ނަން</span><input id="gName" autocomplete="name"></label>
      <label class="field"><span class="req">މޯބައިލް ނަންބަރު</span><input id="gPhone" class="ltr" type="tel" inputmode="tel" autocomplete="tel"></label>
    </div>
    <button class="btn primary lg" id="gGo">ކުރިއަށް ⟵</button>
    ${REG.open ? "" : `<p class="tag red" style="margin-top:10px">ރަޖިސްޓްރޭޝަން މިހާރު ބަންދު. ކުރިން ފޮނުވި ފޯމު ބެއްލެވޭނެ.</p>`}
    ${REG.contact ? `<p class="small muted">ސުވާލެއް އޮތްނަމަ: ${esc(REG.contact)}</p>` : ""}</div>`;
  const go = async () => {
    const email = document.getElementById("gEmail").value.trim().toLowerCase();
    const name = document.getElementById("gName").value.trim().replace(/\s+/g, " ");
    const phone = digits(document.getElementById("gPhone").value);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return toast("އީމެއިލް ރަނގަޅަށް ޖައްސަވާ", true);
    if (name.length < 3) return toast("ފުރިހަމަ ނަން ޖައްސަވާ", true);
    if (phone.length < 7) return toast("މޯބައިލް ނަންބަރު ރަނގަޅަށް ޖައްސަވާ", true);
    GATE = { email, name, phone };
    APP_ID = (await sha(`${REG.competitionId}|${email}|${phone}`)).slice(0, 40);
    if (params.get("app") && params.get("app") !== APP_ID) toast("ލިންކާ މި މަޢުލޫމާތު ދިމާނުވޭ — ކުރިން ލިޔުނު އީމެއިލާއި ނަންބަރު ޖައްސަވާ", true);
    try { const s = await getDoc(doc(db, "applications", APP_ID)); APP = s.exists() ? s.data() : null; }
    catch (e) { return toast("މައްސަލައެއް: " + (e.code || e.message), true); }
    if (APP && normName(APP.name) !== normName(name) && APP.status !== "needs_fix") return toast("ނަން ދިމާނުވޭ — ފޯމުގައި ލިޔުނު ނަން ހަމަ އެގޮތަށް ޖައްސަވާ", true);
    if (!APP && !REG.open) return toast("ރަޖިސްޓްރޭޝަން ބަންދު", true);
    APP ? showExisting() : form({});
  };
  document.getElementById("gGo").onclick = go;
  root.querySelectorAll("input").forEach(i => i.addEventListener("keydown", e => { if (e.key === "Enter") go(); }));
}

function showExisting() {
  const a = APP;
  let html = head() + `<div class="status-box ${a.status}"><h2 style="margin:0 0 6px">${esc(STATUS[a.status] || a.status)}</h2>
    <div>${esc(a.name)} • ${esc(a.nid || "")} • ${esc(a.categoryName || "")}</div>
    ${a.regNo ? `<div class="tag gold" style="margin-top:6px">ރަޖިސްޓްރޭޝަން ނަންބަރު: ${esc(a.regNo)}</div>` : ""}
    ${a.status === "needs_fix" ? `<div style="margin-top:10px"><b>ރަނގަޅުކުރަންޖެހޭ ކަންކަން:</b><ul>${(a.fixItems || []).map(i => `<li>${esc(i)}</li>`).join("")}</ul>${a.adminNotes ? `<p>${esc(a.adminNotes)}</p>` : ""}</div>` : ""}
    ${a.status === "rejected" && a.adminNotes ? `<p>${esc(a.adminNotes)}</p>` : ""}</div>`;
  root.innerHTML = html + `<div id="formBox"></div>`;
  if (a.status === "needs_fix") form(a, true);
  else root.insertAdjacentHTML("beforeend", `<div class="card">${summary(a)}</div><button class="btn" onclick="location.href='register.html'">⟵ ފަހަތަށް</button>`);
}

function summary(a) {
  const row = (k, v) => `<tr><th style="width:35%">${k}</th><td>${esc(v || "-")}</td></tr>`;
  return `<div class="row" style="align-items:flex-start">${a.photoThumb ? `<img src="${a.photoThumb}" style="width:110px;border-radius:8px">` : ""}
  <table class="tbl" style="flex:1">${row("ނަން", a.name)}${row("އައިޑީ", a.nid)}${row("އުފަން ތާރީޚް", a.dob)}${row("ދާއިމީ އެޑްރެސް", a.permAddress)}${row("ރަށް", a.island)}
  ${row("މުއައްސަސާ", a.institution)}${row("ބައި", a.categoryName)}${row("ބެލެނިވެރިޔާ", a.guardianName)}</table></div>`;
}

function form(a, isFix = false) {
  const cats = (REG.categories || []);
  const v = (k) => esc(a[k] || "");
  const box = isFix ? document.getElementById("formBox") : root;
  const html = `
  <div class="card"><h2>${isFix ? "ފޯމު ރަނގަޅުކޮށް އަލުން ހުށަހަޅުއްވާ" : "ބައިވެރިވުމުގެ ފޯމު"}</h2>
    <div class="row small muted">📧 ${esc(GATE.email)} • 📱 ${esc(GATE.phone)}</div>
    <div class="row" style="align-items:flex-start;margin-top:12px">
      <div><div class="ph-preview" id="phPrev">${a.photo || a.photoThumb ? `<img src="${a.photo || a.photoThumb}">` : "ފޮޓޯ"}</div>
        <label class="field" style="margin-top:6px"><span class="req">ފޮޓޯ (ސާފު، މޫނު ފެންނަ)</span><input type="file" id="fPhoto" accept="image/*" capture="user"></label></div>
      <div class="grow">
        <div class="grid2">
          <label class="field"><span class="req">ފުރިހަމަ ނަން (ދިވެހިން)</span><input id="fName" value="${esc(a.name || GATE.name)}"></label>
          <label class="field"><span>ފުރިހަމަ ނަން (އިނގިރޭސިން)</span><input id="fNameEn" class="ltr" value="${v("nameEn")}"></label>
        </div>
        <div class="grid3">
          <label class="field"><span class="req">އައިޑީ ކާޑު ނަންބަރު</span><input id="fNid" class="ltr" placeholder="A123456" value="${v("nid")}"></label>
          <label class="field"><span class="req">އުފަން ތާރީޚް</span><input id="fDob" type="date" value="${v("dob")}"></label>
          <label class="field"><span class="req">ޖިންސު</span><select id="fGender"><option value="">—</option><option value="M" ${a.gender === "M" ? "selected" : ""}>ފިރިހެން</option><option value="F" ${a.gender === "F" ? "selected" : ""}>އަންހެން</option></select></label>
        </div>
        <div id="ageHint" class="small muted"></div>
      </div>
    </div>
    <h3>އެޑްރެސް</h3>
    <div class="grid3">
      <label class="field"><span class="req">ދާއިމީ އެޑްރެސް (ގޭގެ ނަން)</span><input id="fPerm" value="${v("permAddress")}"></label>
      <label class="field"><span class="req">އަތޮޅާއި ރަށް</span><input id="fIsland" placeholder="މިސާލު: ކ. މާލެ" value="${v("island")}"></label>
      <label class="field"><span>މިހާރު އުޅޭ އެޑްރެސް</span><input id="fCur" value="${v("currentAddress")}"></label>
    </div>
    <h3>މުބާރާތުގެ ބައި</h3>
    <div class="grid3">
      <label class="field"><span class="req">ބައި</span><select id="fCat"><option value="">— ހޮއްވަވާ —</option>${cats.map(c => `<option value="${esc(c.id)}" data-g="${esc(c.gender)}" ${a.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
      <label class="field"><span class="req">މުއައްސަސާ / ސްކޫލް</span><input id="fInst" value="${v("institution")}"></label>
      <label class="field"><span>މުއައްސަސާގެ ވައްތަރު</span><select id="fInstType"><option value="">—</option>${INST.map(([k, t]) => `<option value="${k}" ${a.instType === k ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    </div>
    <h3>ބެލެނިވެރިޔާ</h3>
    <div class="grid3">
      <label class="field"><span class="req">ބެލެނިވެރިޔާގެ ނަން</span><input id="fGName" value="${v("guardianName")}"></label>
      <label class="field"><span class="req">ބެލެނިވެރިޔާގެ ފޯނު</span><input id="fGPhone" class="ltr" type="tel" value="${v("guardianPhone")}"></label>
      <label class="field"><span>ގުޅުން</span><input id="fGRel" placeholder="ބައްޕަ / މަންމަ / ..." value="${v("guardianRelation")}"></label>
    </div>
    <div class="grid2">
      <label class="field"><span>އިތުރު ފޯނު ނަންބަރެއް</span><input id="fPhone2" class="ltr" type="tel" value="${v("phone2")}"></label>
      <label class="field"><span>ނޯޓު</span><input id="fNotes" value="${v("notes")}"></label>
    </div>
    <label class="row" style="margin:12px 0"><input type="checkbox" id="fDecl" ${a.declaration ? "checked" : ""}> <span class="req">މި ފޯމުގައިވާ މަޢުލޫމާތަކީ ތެދު މަޢުލޫމާތެވެ. މުބާރާތުގެ ޤަވާޢިދުތަކަށް ތަބާވާނަމެވެ.</span></label>
    <button class="btn green lg" id="fSubmit">${isFix ? "✔ އަލުން ހުށަހަޅާ" : "✔ ފޯމު ހުށަހަޅާ"}</button>
  </div>`;
  if (isFix) box.innerHTML = html; else root.innerHTML = head() + html;
  let photo = a.photo || "", thumb = a.photoThumb || "";
  const $ = (id) => document.getElementById(id);
  $("fPhoto").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    if (!f.type.startsWith("image/")) return toast("ފޮޓޯއެއް ހޮއްވަވާ", true);
    photo = await resize(f, 480, 0.8); thumb = await resize(f, 140, 0.72);
    $("phPrev").innerHTML = `<img src="${photo}">`;
  };
  const hint = () => { const d = $("fDob").value; $("ageHint").textContent = d ? `ޢުމުރު (${REG.ageOnDate || "މިއަދު"}): ${ageOn(d, REG.ageOnDate)} އަހަރު` : ""; };
  $("fDob").oninput = hint; hint();
  const filterCats = () => { const g = $("fGender").value; [...$("fCat").options].forEach(o => { if (o.value) o.hidden = !!(o.dataset.g && g && o.dataset.g !== g); }); };
  $("fGender").onchange = filterCats; filterCats();
  $("fSubmit").onclick = async () => {
    const d = {
      name: $("fName").value.trim().replace(/\s+/g, " "), nameEn: $("fNameEn").value.trim(), nid: $("fNid").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""),
      dob: $("fDob").value, gender: $("fGender").value, permAddress: $("fPerm").value.trim(), island: $("fIsland").value.trim(), currentAddress: $("fCur").value.trim(),
      categoryId: $("fCat").value, categoryName: ($("fCat").selectedOptions[0] || {}).text || "", institution: $("fInst").value.trim(), instType: $("fInstType").value,
      guardianName: $("fGName").value.trim(), guardianPhone: digits($("fGPhone").value), guardianRelation: $("fGRel").value.trim(),
      phone2: digits($("fPhone2").value), notes: $("fNotes").value.trim(), declaration: $("fDecl").checked, photo, photoThumb: thumb
    };
    const miss = [];
    if (!photo) miss.push("ފޮޓޯ"); if (d.name.length < 3) miss.push("ނަން"); if (!d.nid) miss.push("އައިޑީ ނަންބަރު"); if (!d.dob) miss.push("އުފަން ތާރީޚް");
    if (!d.gender) miss.push("ޖިންސު"); if (!d.permAddress) miss.push("ދާއިމީ އެޑްރެސް"); if (!d.island) miss.push("ރަށް"); if (!d.categoryId) miss.push("ބައި");
    if (!d.institution) miss.push("މުއައްސަސާ"); if (!d.guardianName) miss.push("ބެލެނިވެރިޔާ"); if (d.guardianPhone.length < 7) miss.push("ބެލެނިވެރިޔާގެ ފޯނު");
    if (!d.declaration) miss.push("އިޤްރާރު");
    if (miss.length) return toast("ފުރިހަމަ ނުވާ: " + miss.join("، "), true);
    if (!/^A\d{6}$/.test(d.nid) && !confirm("އައިޑީ ނަންބަރު (A123456) ގޮތަކަށް ނޫން. ކުރިއަށް ދާންތޯ؟")) return;
    $("fSubmit").disabled = true;
    try {
      if (isFix) {
        await updateDoc(doc(db, "applications", APP_ID), { ...d, status: "resubmitted", updatedAt: serverTimestamp(), resubmittedAt: serverTimestamp() });
      } else {
        await setDoc(doc(db, "applications", APP_ID), { ...d, competitionId: REG.competitionId, email: GATE.email, phone: GATE.phone, status: "submitted",
          submittedAt: serverTimestamp(), updatedAt: serverTimestamp(), history: [{ status: "submitted", at: new Date() }] });
      }
      root.innerHTML = head() + `<div class="status-box submitted"><h2>✔ ޝުކުރިއްޔާ! ފޯމު ހުށަހެޅިއްޖެ.</h2>
        <p>ފޯމު ބަލާފައި ${esc(GATE.email)} އަށް މެއިލެއް ފޮނުވާނެ. ފޯމު ބެއްލެވުމަށް މި ސަފުޙާއަށް އައިސް ހަމަ އެ 3 ކަން ޖައްސަވާ.</p></div>`;
    } catch (e) {
      $("fSubmit").disabled = false;
      toast(e.code === "permission-denied" ? "ހުށަހެޅޭކަށް ނުވި — ރަޖިސްޓްރޭޝަން ބަންދު ނުވަތަ ފޮޓޯ ބޮޑުވެގެން" : "މައްސަލައެއް: " + (e.code || e.message), true);
    }
  };
}
start();
