// ============================================================
//  RASFAHI — app shell: login, role check, role-based navigation
// ============================================================
import {
  S, auth, db, doc, getDoc, setDoc, serverTimestamp, onAuthStateChanged, loginGoogle, logout, loadSettings,
  h, $, esc, roleName, clearSubs, toast, BOOTSTRAP_SUPERADMIN, emailOf, audit
} from "./core.js";

// apply the last-used colour theme before anything draws (settings load later)
try { const t = localStorage.getItem("rasfahiTheme"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}

const V = (file, fn) => async () => (await import(`./views/${file}.js?v=9`))[fn];

// Tabs for each role. Only what the super admin gave to the role is available.
const NAV = {
  superadmin: [
    ["home", "ޑޭޝްބޯޑް", V("results", "dashboard")],
    ["users", "ޔޫޒަރުން", V("admin", "users")],
    ["settings", "ސެޓިންގްސް", V("admin", "settings")],
    ["categories", "މުބާރާތާއި ބައިތައް", V("admin", "categories")],
    ["announce", "އިޢުލާނާއި ފޯމު", V("office", "announce")],
    ["applications", "އެޕްލިކޭޝަންތައް", V("office", "applications")],
    ["students", "ދަރިވަރުން", V("office", "students")],
    ["sessions", "ސެޝަނާއި ޝެޑިއުލް", V("office", "sessions")],
    ["live", "ލައިވް ކޮންޓްރޯލް", V("live", "control")],
    ["chief", "ޖަޖުންގެ މާކްސް", V("chief", "panel")],
    ["results", "ނަތީޖާ", V("results", "results")],
    ["report", "📊 ރިޕޯޓް", V("report", "report")],
    ["archive", "🎥 އާކައިވް", V("archive", "archive")],
    ["prints", "ލިސްޓާއި ޕްރިންޓް", V("office", "prints")],
    ["audit", "އޯޑިޓް", V("admin", "auditLog")]
  ],
  adminsec: [
    ["home", "ޑޭޝްބޯޑް", V("results", "dashboard")],
    ["announce", "އިޢުލާނާއި ފޯމު", V("office", "announce")],
    ["categories", "މުބާރާތާއި ބައިތައް", V("admin", "categories")],
    ["applications", "އެޕްލިކޭޝަންތައް", V("office", "applications")],
    ["students", "ދަރިވަރުން", V("office", "students")],
    ["sessions", "ސެޝަނާއި ޝެޑިއުލް", V("office", "sessions")],
    ["live", "ލައިވް ކޮންޓްރޯލް", V("live", "control")],
    ["results", "ނަތީޖާ", V("results", "results")],
    ["report", "📊 ރިޕޯޓް", V("report", "report")],
    ["archive", "🎥 އާކައިވް", V("archive", "archive")],
    ["prints", "ލިސްޓާއި ޕްރިންޓް", V("office", "prints")]
  ],
  secretary: [
    ["sessions", "ސެޝަނާއި ޝެޑިއުލް", V("office", "sessions")],
    ["live", "ލައިވް ކޮންޓްރޯލް", V("live", "control")],
    ["students", "ދަރިވަރުން", V("office", "students")],
    ["prints", "ލިސްޓާއި ޕްރިންޓް", V("office", "prints")],
    ["results", "ނަތީޖާ", V("results", "results")],
    ["archive", "🎥 އާކައިވް", V("archive", "archive")]
  ],
  chief: [
    ["chief", "ޗީފް ޖަޖު ޕެނަލް", V("chief", "panel")],
    ["live", "ލައިވް ކޮންޓްރޯލް", V("live", "control")],
    ["amend", "އެމެންޑް ރިކުއެސްޓް", V("chief", "amendments")],
    ["results", "ސެޝަން ނަތީޖާ", V("chief", "sessionResults")]
  ],
  judge: [
    ["judge", "މާކްސް ދިނުން", V("judge", "live")],
    ["bank", "މާކްސް ޝީޓް ބޭންކު", V("judge", "bank")]
  ],
  supervisor: [
    ["home", "ސެޝަންތަކުގެ ޙާލަތު", V("results", "dashboard")],
    ["results", "ފައިނަލް ނަތީޖާ", V("results", "results")],
    ["report", "📊 ރިޕޯޓް", V("report", "report")]
  ],
  consultant: [
    ["results", "ނަތީޖާ", V("results", "results")]
  ],
  checkin: [
    ["checkin", "ދަރިވަރުން ހޯދުމާއި ޗެކްއިން", V("checkin", "checkin")],
    ["admit", "ކިޔެވުމަށް ވެއްދުން", V("checkin", "admit")]
  ],
  screen_student: [["screen", "ދަރިވަރު ސްކްރީން", V("screens", "studentScreen")]],
  screen_waiting: [["screen", "ވެއިޓިންގ ރޫމް", V("screens", "waitingScreen")]]
};

const root = $("#app");

function loginView(msg) {
  window.__rasfahiBoot = true;
  root.innerHTML = "";
  // try to read comp name from localStorage (set after a successful login)
  let orgName = ""; try { orgName = localStorage.getItem("rasfahiOrg") || ""; } catch(e){}
  root.appendChild(h("div.login",
    h("div.login-card",
      // top brand block
      h("div.bismillah", "بِسۡمِ ٱللَّهِ ٱلرَّحۡمَٰنِ ٱلرَّحِيمِ"),
      orgName ? h("div.login-org", orgName) : null,
      h("div.brand", "RASFAHI"),
      h("div.brand-sub", "ޤުރްއާން މުބާރާތުގެ ޖަޖިންގ ސިސްޓަމް"),
      h("div.login-divider"),
      // auth error
      msg ? h("p.login-err", msg) : null,
      // google button
      h("button.gbtn", { onclick: async () => {
        try { await loginGoogle(); } catch (e) { toast("ލޮގިން ނުވި: " + (e.code || e.message), "err"); }
      } }, h("img", { src: "https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg", alt: "" }),
        "ގޫގުލް އިން ލޮގިން ވުމަށް"),
      // authorized-only note
      h("p.login-auth-note", "ހުއްދަ ދީފައިވާ ފަރާތްތަކަށް އެކަނި"),
      // registration form link — big button
      h("a.login-reg-btn", { href: "register.html" },
        h("span.login-reg-icon", "📝"),
        h("span", h("b", "ބައިވެރިވުމުގެ ފޯމު"),
          h("span.login-reg-sub", "ޤުރްއާން މުބާރާތަށް ބައިވެރިވުމަށް — ފޯމު ފުރުއްވާ"))),
      h("a.login-reg-btn.alt", { href: "register.html" },
        h("span.login-reg-icon", "📅"),
        h("span", h("b", "ހޮވުނުކަމާއި ކިޔަވަން ހާޟިރުވާ ދުވަސް"),
          h("span.login-reg-sub", "ފޯމުގައި ލިޔުނު އީމެއިލް، ނަމާއި ފޯނު ނަންބަރު ޖައްސަވާ"))),
      // footer
      h("p.login-note", "Intellectual property of Ali Ibrahim Didi",
        h("br"), "Qur'an: KFGQPC & Tanzil.net")
    ),
    // footer card
    h("div.login-footer-card",
      h("p.login-footer-label", "A PRODUCT OF"),
      h("div.login-footer-brand", "ZAADH HOLDING"),
      h("p.login-footer-label", { style: { marginTop: "8px" } }, "DESIGNED & DEVELOPED BY"),
      h("p.login-footer-copy", h("b", "Ali Ibrahim Didi"), " | +960 7791550",
        h("br"), "Copyright © RASFAHI · Reg No: MED.03.IP.CR.26.EW5889",
        h("br"), h("span.login-footer-note", "All rights reserved. Unauthorised copying or redistribution is prohibited."))
    )
  ));
}

function noAccess(email, why) {
  root.innerHTML = "";
  root.appendChild(h("div.login", h("div.login-card",
    h("div.brand", "RASFAHI"),
    h("h3", { style: { color: "#ff8a80" } }, why),
    h("p.muted", email),
    h("p.small.muted", "ސުޕަރ އެޑްމިނާ ގުޅުއްވާ. ތިބާގެ އީމެއިލަށް ރޯލެއް ދީފައި ނުވާނަމަ ވަދެވޭނެ ގޮތެއް ނެތް."),
    h("button.btn", { onclick: logout }, "ލޮގްއައުޓް"))));
}

async function boot(user) {
  S.user = user;
  const email = emailOf(user);
  let snap;
  try { snap = await getDoc(doc(db, "users", email)); }
  catch (e) { return noAccess(email, "ޑޭޓާބޭސް އާ ގުޅޭކަށް ނުވި: " + e.code); }
  if (!snap.exists() && email === BOOTSTRAP_SUPERADMIN.toLowerCase()) {
    await setDoc(doc(db, "users", email), { email, name: user.displayName || email, role: "superadmin", active: true,
      createdAt: serverTimestamp(), createdBy: "bootstrap" });
    snap = await getDoc(doc(db, "users", email));
  }
  if (!snap.exists()) return noAccess(email, "މި އީމެއިލަށް ހުއްދަ ދީފައެއް ނުވޭ");
  S.me = { id: snap.id, ...snap.data() };
  if (!S.me.active) return noAccess(email, "މި އެކައުންޓް ޑިސޭބަލް ކޮށްފައި");
  await loadSettings();
  audit("login", { role: S.me.role });
  try {
    const cid = S.settings.activeCompetitionId;
    if (cid) { const c = await getDoc(doc(db, "competitions", cid)); if (c.exists()) localStorage.setItem("rasfahiOrg", c.data().organizer || c.data().name || ""); }
  } catch (e) {}
  shell();
}

function shell() {
  window.__rasfahiBoot = true;
  const tabs = NAV[S.me.role] || [];
  const isScreen = S.me.role.startsWith("screen_");
  root.innerHTML = "";
  const nav = h("nav.tabs");
  const view = h("main#view" + (isScreen ? ".full" : ""));
  if (!isScreen) {
    root.appendChild(h("header.topbar",
      h("div.logo", "RASFAHI"),
      nav,
      h("div.who",
        h("span.rolebadge", roleName(S.me.role)),
        h("span", S.me.name || S.user.displayName || ""),
        S.user.photoURL ? h("img", { src: S.user.photoURL, alt: "", referrerpolicy: "no-referrer" }) : null,
        h("button.btn.sm", { onclick: () => { clearSubs(); logout(); } }, "ލޮގްއައުޓް"))));
  }
  root.appendChild(view);
  tabs.forEach(([key, label]) => nav.appendChild(h("button", { "data-k": key, onclick: () => { location.hash = key; } }, label)));

  async function route() {
    const key = (location.hash || "").slice(1) || tabs[0][0];
    const t = tabs.find(x => x[0] === key) || tabs[0];
    nav.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.k === t[0]));
    clearSubs();
    view.innerHTML = "";
    view.appendChild(h("div.loading", h("div.spin"), h("span", "ލޯޑުވަނީ...")));
    try {
      const fn = await t[2]();
      view.innerHTML = "";
      await fn(view);
    } catch (e) {
      console.error(e);
      view.innerHTML = "";
      view.appendChild(h("div.card", h("h3", "މައްސަލައެއް ދިމާވެއްޖެ"), h("pre.ltr.small", esc(e.message || e))));
    }
  }
  window.onhashchange = route;
  route();
}

onAuthStateChanged(auth, (user) => {
  window.__rasfahiBoot = true;
  clearSubs();
  if (!user) return loginView();
  if (!user.emailVerified) return loginView("ގޫގުލް އީމެއިލް ވެރިފައި ނުވޭ");
  boot(user).catch(e => { console.error(e); noAccess(emailOf(user), "މައްސަލައެއް: " + e.message); });
});
