/*!
 * RASFAHI — Qur'an Competition Judging System
 * Copyright (c) 2026 Ali Ibrahim Didi (AIDD) / Zaadh Holding. All rights reserved. Reg No: MED.03.IP.CR.26.EW5889
 * Unauthorised copying, hosting, modification or redistribution is prohibited.
 */
// ============================================================
//  PUBLIC REGISTRATION FORM
//  Step 1: email + full name + mobile  →  Step 2: the rest of the form opens.
//  The same three details re-open the same application (to fix and resubmit).
// ============================================================
import { initializeApp, initializeAppCheck, ReCaptchaV3Provider } from "./firebase.bundle.js";
import { LICENSE, checkLicense } from "./license.js";
import { getFirestore, doc, getDoc, setDoc, updateDoc, serverTimestamp } from "./firebase.bundle.js";
import { firebaseConfig } from "./firebase-config.js";

try { const t = localStorage.getItem("rasfahiTheme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}

checkLicense();
window.__rasfahiBoot = true;
const app = initializeApp(firebaseConfig);
if (LICENSE.appCheckSiteKey) { try { initializeAppCheck(app, { provider: new ReCaptchaV3Provider(LICENSE.appCheckSiteKey), isTokenAutoRefreshEnabled: true }); } catch (e) {} }
const db = getFirestore(app);
const root = document.getElementById("reg");
const params = new URLSearchParams(location.search);

const AGE_GROUPS = { A5_6: "5 އަހަރާއި 6 އަހަރާ ދެމެދު", U7: "7 އަހަރުން ދަށް", U8: "8 އަހަރުން ދަށް", U9: "9 އަހަރުން ދަށް", U10: "10 އަހަރުން ދަށް",
  U11: "11 އަހަރުން ދަށް", U12: "12 އަހަރުން ދަށް", U13: "13 އަހަރުން ދަށް", U14: "14 އަހަރުން ދަށް", U15: "15 އަހަރުން ދަށް", U16: "16 އަހަރުން ދަށް",
  U17: "17 އަހަރުން ދަށް", U18: "18 އަހަރުން ދަށް", A18_21: "18 އަހަރާއި 21 އަހަރާ ދެމެދު", O21: "21 އަހަރުން މަތި", O50: "ދޮށީ ޢުމުރުގެ މީހުން (50 އަހަރުން މަތި)",
  SN: "ނުކުޅެދުންތެރިކަން ހުންނަ", U6: "6 އަހަރުން ދަށް", U19: "19 އަހަރުން ދަށް", U21: "21 އަހަރުން ދަށް", GEN: "ޢާއްމު ބައި" };
const AGE_ORDER = ["A5_6", "U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19", "A18_21", "U21", "O21", "GEN", "O50", "SN"];
const AGE_LIMITS = { A5_6: [5, 7], U6: [0, 6], U7: [0, 7], U8: [0, 8], U9: [0, 9], U10: [0, 10], U11: [0, 11], U12: [0, 12], U13: [0, 13], U14: [0, 14],
  U15: [0, 15], U16: [0, 16], U17: [0, 17], U18: [0, 18], U19: [0, 19], U21: [0, 21], A18_21: [18, 22], O21: [21, 200], O50: [50, 200] };
const INST = [["School", "ސްކޫލް"], ["University", "ޔުނިވަރސިޓީ / ކޮލެޖް"], ["QuranClass", "ޤުރްއާން ކްލާސް"], ["Club", "ކްލަބް / ޖަމްޢިއްޔާ"], ["Office", "އޮފީސް"], ["Private", "އަމިއްލަ ގޮތުން"]];
const STATUS = { submitted: "ފޯމު ހުށަހެޅިއްޖެ — ބަލަމުން ދަނީ", resubmitted: "އަލުން ހުށަހެޅިއްޖެ — ބަލަމުން ދަނީ", needs_fix: "ރަނގަޅުކުރަން ޖެހޭ ކަންކަން އެބަހުއްޓެވެ", approved: "ތިޔަ ދަރިވަރު ހޮވިއްޖެ ✔", rejected: "މި ފަހަރު ހޮވިފައެއް ނުވޭ" };
const DAYS_DV = ["އާދިއްތަ", "ހޯމަ", "އަންގާރަ", "ބުދަ", "ބުރާސްފަތި", "ހުކުރު", "ހޮނިހިރު"];
const dayOf = (iso) => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? "" : DAYS_DV[d.getDay()]; };
const fmtDate = (iso) => { const d = new Date(iso + "T00:00:00"); return isNaN(d) ? (iso || "") : `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`; };

// what the applicant sees after entering email + name + phone: selection and, when ready, the day / time / place
function scheduleCard(a) {
  if (a.status === "approved") {
    const sc = a.schedule;
    if (!sc || !sc.date) return `<div class="card sched wait"><h3>📅 ހާޟިރުވާންވީ ދުވަސް</h3>
      <p>ތިޔަ ދަރިވަރު މުބާރާތަށް ހޮވިއްޖެ. ކިޔަވަން ހާޟިރުވާންވީ ދުވަހާއި ތާރީޚާއި ގަޑިއާއި ތަން ޝެޑިއުލް ހެދުމުން <b>މި ސްކްރީނުން</b> ފެންނާނެ.</p>
      <p class="big-wait">އިންތިޒާރުކޮށްލައްވާ!</p></div>`;
    const row = (k, v) => v ? `<tr><th>${k}</th><td>${v}</td></tr>` : "";
    return `<div class="card sched ok"><h3>📅 ކިޔަވަން ހާޟިރުވާންވީ</h3>
      <table class="tbl sched-tbl">
        ${row("ދުވަސް", esc(sc.day || dayOf(sc.date)))}
        ${row("ތާރީޚް", `<span class="ltr">${esc(fmtDate(sc.date))}</span>`)}
        ${row("ހާޟިރުވާންވީ ގަޑި", sc.reportTime ? `<b class="ltr">${esc(sc.reportTime)}</b>` : "")}
        ${row("ސެޝަން ފަށާ ގަޑި", `<span class="ltr">${esc(sc.time || "")}</span>`)}
        ${row("ތަން", esc(sc.venue || ""))}
        ${row("ސެޝަން", esc(sc.sessionName || ""))}
        ${row("ތަރުތީބު", sc.order ? "#" + esc(sc.order) : "")}
      </table>
      ${sc.note ? `<p class="sched-note">📌 ${esc(sc.note)}</p>` : ""}
      <p class="small muted">ބަދަލެއް އައިސްފިނަމަ މި ސްކްރީނުގައި ފެންނާނެ. ހާޟިރުވާއިރު އައިޑީ ކާޑު ގެންނަވާ.</p></div>`;
  }
  if (a.status === "submitted" || a.status === "resubmitted")
    return `<div class="card sched wait"><p>ފޯމު ބަލަމުން ދަނީ. ހޮވުނުކަމާއި ހާޟިރުވާންވީ ދުވަސް މި ސްކްރީނުން ފެންނާނެ. އިންތިޒާރުކޮށްލައްވާ!</p></div>`;
  return "";
}

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
  root.innerHTML = head() + `<div class="card"><h2>ފޯމު ހުށަހެޅުމަށް / ޙާލަތު ބެއްލެވުމަށް</h2>
    <p class="small muted">ތިރީގައިވާ 3 ކަން ޖެއްސެވުމުން އާ ފޯމެއް ހުޅުވޭނެ. ކުރިން ފޯމު ހުށަހަޅާފައިވާނަމަ، ހަމަ މި 3 ކަން ޖެއްސެވުމުން
    ފޯމުގެ ޙާލަތާއި، ހޮވުނުކަމާއި، ކިޔަވަން ހާޟިރުވާންވީ ދުވަހާއި ގަޑިއާއި ތަން ފެންނާނެ.</p>
    <div class="grid3">
      <label class="field"><span class="req">އީމެއިލް</span><input id="gEmail" class="ltr" type="email" autocomplete="email"></label>
      <label class="field"><span class="req">ދަރިވަރުގެ ފުރިހަމަ ނަން</span><input id="gName" autocomplete="name"></label>
      <label class="field"><span class="req">މޯބައިލް ނަންބަރު</span><input id="gPhone" class="ltr" type="tel" inputmode="tel" autocomplete="tel"></label>
    </div>
    <div class="row" style="gap:10px;align-items:center;flex-wrap:wrap">
      <button class="btn primary lg" id="gGo">ފޯމު ހުށަހަޅާ / ޙާލަތު ބަލާ ⟵</button>
      <span class="small muted">📅 ހޮވިފައިވާނަމަ ހާޟިރުވާންވީ ދުވަހާއި ގަޑި މިތަނުން ފެންނާނެ</span></div>
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
    ${a.status === "rejected" && a.adminNotes ? `<p>${esc(a.adminNotes)}</p>` : ""}</div>` + scheduleCard(a);
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
    <h3>އައިޑީ ކާޑު (ދެފުށް)</h3>
    <div class="grid2">
      <div><div class="id-preview" id="idFPrev">${a.idFront ? `<img src="${a.idFront}">` : "އައިޑީ ކާޑުގެ ކުރިމަތި"}</div>
        <label class="field" style="margin-top:6px"><span class="req">އައިޑީ ކާޑު — ކުރިމަތި</span><input type="file" id="fIdF" accept="image/*" capture="environment"></label></div>
      <div><div class="id-preview" id="idBPrev">${a.idBack ? `<img src="${a.idBack}">` : "އައިޑީ ކާޑުގެ ފަހަތް"}</div>
        <label class="field" style="margin-top:6px"><span class="req">އައިޑީ ކާޑު — ފަހަތް</span><input type="file" id="fIdB" accept="image/*" capture="environment"></label></div>
    </div>
    <p class="small muted">އުފަން ސެޓްފިކެޓް ނުވަތަ ޕާސްޕޯޓް ބޭނުން ކުރައްވާނަމަ އެ ލިޔުމުގެ ދެފުށް ލައްވާ.</p>
    <h3>އެޑްރެސް</h3>
    <div class="grid3">
      <label class="field"><span class="req">ދާއިމީ އެޑްރެސް (ގޭގެ ނަން)</span><input id="fPerm" value="${v("permAddress")}"></label>
      <label class="field"><span class="req">އަތޮޅާއި ރަށް</span><input id="fIsland" placeholder="މިސާލު: ކ. މާލެ" value="${v("island")}"></label>
      <label class="field"><span>މިހާރު އުޅޭ އެޑްރެސް</span><input id="fCur" value="${v("currentAddress")}"></label>
    </div>
    <h3>މުބާރާތުގެ ބައި</h3>
    <div class="grid3">
      <label class="field"><span class="req">ގޮފި</span><select id="fBranch"><option value="">— ހޮއްވަވާ —</option>
        ${["mushaf", "hifz"].map(b => { const n = cats.filter(c => c.branch === b).length;
          return `<option value="${b}" ${n ? "" : "disabled"}>${b === "hifz" ? "ނުބަލައި" : "ބަލައިގެން"}${n ? "" : " — (މި ފަހަރު ބައެއް ނެތް)"}</option>`; }).join("")}</select></label>
      <label class="field"><span>ޢުމުރު (ޑެޑްލައިނަށް)</span><div id="fAgeShow" class="age-show">—</div></label>
      <label class="field"><span class="req">ބައިވެރިވާ ޢުމުރުފުރާ</span><select id="fAgeGroup"><option value="">— ހޮއްވަވާ —</option>
        ${AGE_ORDER.filter(k => cats.some(c => c.ageGroup === k)).map(k => `<option value="${k}">${esc(AGE_GROUPS[k] || k)}</option>`).join("")}</select></label>
    </div>
    <div id="ageFit" class="age-fit"></div>
    <div class="grid3">
      <label class="field"><span class="req">ބައި</span><select id="fCat"><option value="">— ހޮއްވަވާ —</option>${cats.map(c => `<option value="${esc(c.id)}" data-g="${esc(c.gender)}" data-b="${esc(c.branch)}" data-a="${esc(c.ageGroup)}" ${a.categoryId === c.id ? "selected" : ""}>${esc(c.name)}</option>`).join("")}</select></label>
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
  let idFront = a.idFront || "", idBack = a.idBack || "";
  const idPic = (inp, prev, set) => { $(inp).onchange = async (e) => { const f = e.target.files[0]; if (!f) return;
    if (!f.type.startsWith("image/")) return toast("ފޮޓޯއެއް ހޮއްވަވާ", true);
    const v = await resize(f, 1000, 0.62); set(v); $(prev).innerHTML = `<img src="${v}">`; }; };
  idPic("fIdF", "idFPrev", v => idFront = v); idPic("fIdB", "idBPrev", v => idBack = v);
  // ---- age on the competition's deadline (age date), whether it fits the chosen age group, and the right group if not
  const ageDate = REG.ageOnDate || REG.deadline || "";
  const ageDateTxt = ageDate ? ageDate : "މިއަދު";
  const fits = (age, ag) => { const lim = AGE_LIMITS[ag]; return !lim || (age >= lim[0] && age < lim[1]); };
  const groupsHere = AGE_ORDER.filter(k => cats.some(c => c.ageGroup === k) && k !== "SN");
  // the most fitting group = the youngest group the student still fits in (e.g. age 8 → "9 އަހަރުން ދަށް" rather than "13 އަހަރުން ދަށް")
  const bestGroup = (age) => groupsHere.filter(k => fits(age, k)).sort((x, y) => (AGE_LIMITS[x] || [0, 999])[1] - (AGE_LIMITS[y] || [0, 999])[1])[0] || "";
  let ageNow = null;
  const filterCats = () => {
    const g = $("fGender").value, b = $("fBranch").value, ag = $("fAgeGroup").value;
    const sel = $("fCat");
    const shown = [...sel.options].filter(o => o.value).map(o => {
      o.hidden = !!((o.dataset.g && g && o.dataset.g !== g) || (b && o.dataset.b !== b) || (ag && o.dataset.a !== ag));
      return o;
    }).filter(o => !o.hidden);
    if (sel.value && sel.selectedOptions[0] && sel.selectedOptions[0].hidden) sel.value = "";
    if (!sel.value && shown.length === 1) sel.value = shown[0].value;          // only one category matches → choose it
  };
  const check = () => {
    const d = $("fDob").value;
    ageNow = d ? ageOn(d, ageDate || undefined) : null;
    $("fAgeShow").innerHTML = ageNow == null ? "—" : `<b>${ageNow}</b> އަހަރު <small>(${esc(ageDateTxt)} ގެ ނިޔަލަށް)</small>`;
    $("ageHint").innerHTML = ageNow == null ? "" : `ޢުމުރު ބަލަނީ މުބާރާތުގެ ޑެޑްލައިން <b>${esc(ageDateTxt)}</b> އަށް: <b>${ageNow}</b> އަހަރު`;
    const box = $("ageFit");
    if (ageNow == null) { box.innerHTML = ""; return; }
    const best = bestGroup(ageNow);
    if (!$("fAgeGroup").value && best) { $("fAgeGroup").value = best; filterCats(); }
    const ag = $("fAgeGroup").value;
    if (!ag) { box.innerHTML = best ? "" : `<div class="fit bad">⚠ ${ageNow} އަހަރުގެ ދަރިވަރުންނަށް މި މުބާރާތުގައި ޢުމުރުފުރާއެއް ނެތް.</div>`; return; }
    if (fits(ageNow, ag)) {
      box.innerHTML = `<div class="fit ok">✔ ޑެޑްލައިނަށް ${ageNow} އަހަރު — <b>${esc(AGE_GROUPS[ag] || ag)}</b> އަށް ފެތޭ` +
        (best && best !== ag ? ` <span class="fit-near">• އެންމެ ގާތް ޢުމުރުފުރާ: <b>${esc(AGE_GROUPS[best])}</b> <button type="button" class="btn sm" id="nearAge">އެއަށް ބަދަލުކުރޭ</button></span>` : "") + `</div>`;
      const nb = document.getElementById("nearAge");
      if (nb) nb.onclick = () => { $("fAgeGroup").value = best; filterCats(); check(); };
    }
    else {
      box.innerHTML = `<div class="fit bad">✖ ${ageNow} އަހަރުގެ ދަރިވަރަކަށް <b>${esc(AGE_GROUPS[ag] || ag)}</b> އަށް ނުފެތޭ.` +
        (best ? ` ފެތެނީ: <b>${esc(AGE_GROUPS[best])}</b> <button type="button" class="btn sm primary" id="fixAge">މިއަށް ބަދަލުކުރޭ</button>` : " މި މުބާރާތުގައި ފެތޭ ޢުމުރުފުރާއެއް ނެތް.") + `</div>`;
      const fx = document.getElementById("fixAge");
      if (fx) fx.onclick = () => { $("fAgeGroup").value = best; filterCats(); check(); };
    }
  };
  // choosing a category also sets its branch and age group
  $("fCat").addEventListener("change", () => {
    const o = $("fCat").selectedOptions[0];
    if (o && o.value) { $("fBranch").value = o.dataset.b || ""; $("fAgeGroup").value = o.dataset.a || ""; }
    filterCats(); check();
  });
  $("fBranch").onchange = () => { filterCats(); check(); };
  $("fAgeGroup").onchange = () => { filterCats(); check(); };
  $("fGender").onchange = () => { filterCats(); check(); };
  $("fDob").oninput = check; $("fDob").onchange = check;
  // an existing application: show its branch / age group
  { const o = $("fCat").selectedOptions[0]; if (o && o.value) { $("fBranch").value = o.dataset.b || ""; $("fAgeGroup").value = o.dataset.a || ""; } }
  filterCats(); check();
  $("fSubmit").onclick = async () => {
    const d = {
      name: $("fName").value.trim().replace(/\s+/g, " "), nameEn: $("fNameEn").value.trim(), nid: $("fNid").value.trim().toUpperCase().replace(/[^A-Z0-9]/g, ""),
      dob: $("fDob").value, gender: $("fGender").value, permAddress: $("fPerm").value.trim(), island: $("fIsland").value.trim(), currentAddress: $("fCur").value.trim(),
      categoryId: $("fCat").value, categoryName: ($("fCat").selectedOptions[0] || {}).text || "", institution: $("fInst").value.trim(), instType: $("fInstType").value,
      guardianName: $("fGName").value.trim(), guardianPhone: digits($("fGPhone").value), guardianRelation: $("fGRel").value.trim(),
      phone2: digits($("fPhone2").value), notes: $("fNotes").value.trim(), declaration: $("fDecl").checked, photo, photoThumb: thumb, idFront, idBack
    };
    const miss = [];
    if (!photo) miss.push("ފޮޓޯ"); if (!idFront) miss.push("އައިޑީ ކާޑުގެ ކުރިމަތި"); if (!idBack) miss.push("އައިޑީ ކާޑުގެ ފަހަތް"); if (d.name.length < 3) miss.push("ނަން"); if (!d.nid) miss.push("އައިޑީ ނަންބަރު"); if (!d.dob) miss.push("އުފަން ތާރީޚް");
    if (!d.gender) miss.push("ޖިންސު"); if (!d.permAddress) miss.push("ދާއިމީ އެޑްރެސް"); if (!d.island) miss.push("ރަށް"); if (!d.categoryId) miss.push("ބައި");
    if (!d.institution) miss.push("މުއައްސަސާ"); if (!d.guardianName) miss.push("ބެލެނިވެރިޔާ"); if (d.guardianPhone.length < 7) miss.push("ބެލެނިވެރިޔާގެ ފޯނު");
    if (!d.declaration) miss.push("އިޤްރާރު");
    if (!$("fBranch").value) miss.push("ގޮފި"); if (!$("fAgeGroup").value) miss.push("ޢުމުރުފުރާ");
    if (miss.length) return toast("ފުރިހަމަ ނުވާ: " + miss.join("، "), true);
    { const catO = $("fCat").selectedOptions[0]; const ag = catO && catO.dataset.a;
      if (ageNow != null && ag && !fits(ageNow, ag)) { check(); $("ageFit").scrollIntoView({ behavior: "smooth", block: "center" });
        return toast(`ޑެޑްލައިނަށް ${ageNow} އަހަރު — ހޮވި ޢުމުރުފުރާއަށް ނުފެތޭ. ފެތޭ ޢުމުރުފުރާއަށް ބަދަލުކުރައްވާ.`, true); } }
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
