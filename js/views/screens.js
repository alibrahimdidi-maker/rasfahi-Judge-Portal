// ============================================================
//  TV SCREENS: student reading screen & waiting-room screen
// ============================================================
import { S, db, doc, getDoc, getDocs, collection, query, where, onSnapshot, h, esc, select, empty, sub, logout, starsHtml, beep, loadSessions, sessionLabel } from "../core.js";
import { loadQuran, renderPage, openingWords, pageImageURL, slotBand, arNum, qLabel } from "../quran.js";
import { frameEl } from "../frames.js";

// royal frame around the Quran (Settings → frames). 0 = no frame.
const framed = (node, fill) => (+S.settings.qframe ? frameEl(S.settings.qframe, node, { fill }) : node);

const GRADE = ["", "ހެޔޮ", "ރަނގަޅު", "ވަރަށް ރަނގަޅު", "މޮޅު", "ވަރަށް ފުރިހަމަ"];
const photoCache = {};
async function fullPhoto(st) {
  if (!st || !st.id) return "";
  if (photoCache[st.id] !== undefined) return photoCache[st.id];
  try { const p = await getDoc(doc(db, "photos", st.id)); photoCache[st.id] = p.exists() ? p.data().photo || "" : ""; }
  catch (e) { photoCache[st.id] = ""; }
  return photoCache[st.id];
}

async function chooseSession(view, key, onPick) {
  const sessions = (await loadSessions(true)).filter(s => s.status !== "closed");
  const saved = localStorage.getItem(key);
  if (saved && sessions.find(s => s.id === saved)) return onPick(saved);
  const sel = select([["", "— ސެޝަން ހޮވާ —"], ...sessions.map(s => [s.id, sessionLabel(s)])], "");
  view.appendChild(h("div.login", h("div.login-card", h("div.brand", "RASFAHI"), h("p", "ސްކްރީން ދައްކާނެ ސެޝަން ހޮއްވަވާ"), sel,
    h("button.btn.primary", { style: { marginTop: "12px" }, onclick: () => { if (!sel.value) return; try { localStorage.setItem(key, sel.value); } catch (e) {} onPick(sel.value); } }, "ފަށާ"),
    h("div", { style: { marginTop: "14px" } }, h("button.btn.sm.ghost", { onclick: logout }, "ލޮގްއައުޓް")))));
}
function screenMenu(view, key) {
  // small hidden controls: double-click top-left corner
  const m = h("div.fs-hint", "F11 = ފުލް ސްކްރީން  •  ސެޝަން ބަދަލުކުރުމަށް މިތަނަށް ޑަބަލްކްލިކް");
  m.ondblclick = () => { try { localStorage.removeItem(key); } catch (e) {} location.reload(); };
  view.appendChild(m);
  document.documentElement.requestFullscreen && view.addEventListener("click", () => { if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {}); }, { once: true });
}

// ------------------------------------------------------------ STUDENT SCREEN
//  off (black) when no one is reading • number grid (touch) • the question
//  ނުބަލައި: blank screen — no information about the passage
//  small red / green box in the corner: green = judges pressed ▶ ފަށާ
export async function studentScreen(view) {
  await loadQuran({ tanzil: S.settings.textSource === "tanzil" });
  const { pickQuestion } = await import("../liveops.js");
  const { portion } = await import("../quran.js");
  await chooseSession(view, "scrStudentSes", (sid) => {
    view.innerHTML = "";
    const scr = h("div.screen.student");
    const title = h("div.scr-title", "RASFAHI"), who = h("div.grow");
    const top = h("div.scr-top", who, title);
    const bodyEl = h("div.scr-body");
    const lamp = h("div.corner-lamp.stop", { title: "" });
    const standbyMsg = h("div.sb-msg", "ދަރިވަރަކަށް އިންތިޒާރުކުރަނީ");
    const standby = h("div.standby", h("div.sb-logo", "RASFAHI"), h("div.sb-ses"), standbyMsg);
    scr.append(top, bodyEl, lamp, standby);
    view.appendChild(scr);
    screenMenu(view, "scrStudentSes");
    let prevLight = null, busy = false;
    sub(onSnapshot(doc(db, "live", sid), s => {
      const L = s.exists() ? s.data() : null;
      const on = !!(L && L.studentId && L.student && (L.phase === "grid" || L.phase === "reading"));
      standby.querySelector(".sb-ses").textContent = (L && L.sessionName) || "";
      standbyMsg.textContent = L && L.phase === "closed" ? "ސެޝަން ނިމިއްޖެ" : L && L.phase === "scoring" ? "ޖަޒާކަﷲ ޚައިރާ" : "ދަރިވަރަކަށް އިންތިޒާރުކުރަނީ";
      standbyMsg.classList.remove("err");
      scr.classList.toggle("off", !on);
      lamp.className = "corner-lamp " + (L && L.light === "go" ? "go" : "stop");
      lamp.style.display = on && L.phase === "reading" ? "" : "none";
      if (L && prevLight && L.light !== prevLight && on) beep(L.light === "go" ? 988 : 440, 250);
      prevLight = L && L.light;
      who.innerHTML = "";
      if (on) who.appendChild(h("div", { style: { fontSize: "2vw", fontWeight: 700 } }, L.student.name,
        h("span", { style: { fontSize: "1.2vw", color: "var(--muted)" } }, "  •  " + (L.categoryName || ""))));
      try { render(on ? L : null); } catch (e) { scr.classList.add("off"); standbyMsg.textContent = "⚠ " + e.message; standbyMsg.classList.add("err"); }
    }, e => { scr.classList.add("off"); standbyMsg.textContent = "⚠ ލައިވް ނުލިބުނު: " + (e.code || e.message); standbyMsg.classList.add("err"); }));
    async function tap(n, L, btn) {
      if (busy || L.phase !== "grid") return;
      busy = true;
      btn.classList.add("picking");                      // the chosen number lights up at once
      bodyEl.querySelectorAll(".scr-grid > button").forEach(b => { if (b !== btn) b.classList.add("dim"); });
      beep(740, 120);
      await new Promise(r => setTimeout(r, 700));
      const r = await pickQuestion(sid, n);
      busy = false;
      if (r !== "ok") { btn.classList.remove("picking"); bodyEl.querySelectorAll(".scr-grid > button.dim").forEach(b => b.classList.remove("dim")); }
    }
    function render(L) {
      bodyEl.innerHTML = "";
      if (!L) return;                                   // screen off
      const qs = L.questions || [], qn = L.qCount || 1;
      if (L.phase === "grid") {
        const picks = L.picks || [];
        bodyEl.appendChild(h("div.center",
          h("div", { style: { fontSize: "2.4vw", marginBottom: "2.4vh", color: "var(--gold2)" } },
            qs.length ? `ސުވާލު ${qs.length + 1} — ނަންބަރެއް ހޮއްވަވާ` : "ނަންބަރެއް ހޮއްވަވާ",
            h("span", { style: { color: "var(--muted)", fontSize: "1.6vw" } }, `   (${picks.length} / ${qn})`)),
          h("div.scr-grid.pickable", (L.grid || []).map(g => {
            const i = picks.indexOf(g.n);
            const b = h("button" + (i >= 0 ? ".taken" : ""), { disabled: i >= 0 }, g.n, i >= 0 ? h("small", "ސުވާލު " + (i + 1)) : null);
            if (i < 0) b.onclick = () => tap(g.n, L, b);
            return b;
          }))));
        return;
      }
      const q = qs[L.qIndex] || qs[qs.length - 1];
      if (!q) return;
      const hifz = L.branch === "hifz";
      if (hifz) {
        bodyEl.appendChild(h("div.center.hifz-blank",
          h("div", { style: { fontSize: "4.2vw", color: "var(--gold2)", fontWeight: 700 } }, "ނުބަލައި ކިޔެވުމުގެ ގޮފި"),
          h("div", { style: { fontSize: "2.2vw", color: "var(--muted)", marginTop: "2vh" } }, `ސުވާލު ${L.qIndex + 1} / ${qn}`)));
        return;
      }
      const p = portion(q);
      const mainEl = h("div.scr-main");
      mainEl.appendChild(h("div.scr-banner",
        h("span", "ސޫރަތް: ", h("b", { style: { fontFamily: "var(--quran)" } }, p.surahAr), ` (${p.surahNo})`),
        h("span", "ފޮތް: ", h("b", p.juz)),
        h("span", "އާޔަތް: ", h("b", p.from === p.to ? p.from : `${p.from} – ${p.to}`)),
        h("span", `ސުވާލު ${L.qIndex + 1} / ${qn}`)));
      const txt = h("div.scr-text");
      mainEl.appendChild(txt);
      bodyEl.appendChild(h("div.scr-read.single", mainEl));
      if ((L.display || S.settings.studentDisplay) === "image") {
        const m = S.settings.mushaf;
        const [tp, hgt] = slotBand(q.page, q.lineFrom, q.lineTo, m);
        const wrap = h("div.scr-img", h("img", { src: pageImageURL(q.page, m), onerror: () => { wrap.innerHTML = ""; wrap.appendChild(textPage(q)); } }));
        wrap.appendChild(h("div.band", { style: { top: tp + "%", height: hgt + "%", left: m.left + "%", right: m.right + "%" } }));
        wrap.appendChild(h("div.rog", { style: { top: tp + "%", height: hgt + "%", right: `calc(${m.right}% - 1.4vw)` } }));
        wrap.appendChild(h("div.arrow", { style: { top: `calc(${tp}% - 1.3vw)`, right: `calc(${m.right}% - 3.2vw)` } }, "◀"));
        txt.appendChild(framed(wrap, true));
        return;
      }
      txt.appendChild(framed(textPage(q), false));
    }
  });
}
// only the lines of the question, laid out exactly as on the Madinah page, auto-sized
function textPage(q) {
  const box = h("div", { html: renderPage(q.page, { range: [q.wStart, q.wEnd], source: S.settings.textSource }) });
  const pg = box.firstChild;
  pg.querySelectorAll(".qline.dim, .sura-head, .qline.basmala").forEach(e => {
    // keep sura headers/basmala only if they sit inside the question block
    const slot = +(e.dataset.slot || 0);
    if (e.classList.contains("dim") || !slot) e.remove();
  });
  const n = pg.querySelectorAll(".qline").length || 1;
  const size = Math.min((+S.settings.qframe ? 58 : 80) / (n * 2.15), 7);
  pg.style.setProperty("--qsize", `min(${size}vh, ${94 / 26}vw)`);
  pg.style.fontSize = `min(${size}vh, 3.7vw)`;
  pg.style.width = "fit-content"; pg.style.margin = "0 auto";
  return box;
}

// ------------------------------------------------------------ WAITING ROOM
export async function waitingScreen(view) {
  await chooseSession(view, "scrWaitSes", (sid) => {
    view.innerHTML = "";
    const scr = h("div.screen.waiting");
    const clock = h("div.clock"), sesName = h("div", { style: { fontSize: "1.8vw" } });
    const body = h("div.scr-body");
    scr.append(h("div.scr-top", h("div.scr-title", "RASFAHI"), sesName, clock), body);
    view.appendChild(scr);
    screenMenu(view, "scrWaitSes");
    const tick = () => { clock.textContent = new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" }); };
    tick(); const iv = setInterval(tick, 1000); sub(() => clearInterval(iv));
    sub(onSnapshot(doc(db, "live", sid), async s => {
      const L = s.exists() ? s.data() : {};
      sesName.textContent = L.sessionName || "";
      const nowSt = L.studentId ? L.student : null;
      const [nowPh] = await Promise.all([fullPhoto(nowSt)]);
      body.innerHTML = "";
      const card = (st, big, ph) => st ? h("div.idcard" + (big ? ".big" : ""),
        (ph || st.photoThumb) ? h("img.idph", { src: ph || st.photoThumb }) : h("div.idph", "👤"),
        h("div.idinfo", h("div.idname", st.name), st.nameEn ? h("div.idname-en", st.nameEn) : null,
          h("div.idrow", h("span.tag.gold", "ރެޖި: " + (st.regNo || "")), h("span.tag", "އައިޑީ: " + (st.nid || ""))),
          h("div.idrow", h("span", st.categoryName || "")), h("div.idrow.muted", [st.institution, st.island].filter(Boolean).join(" • ")))) : h("div.muted", { style: { fontSize: "1.6vw" } }, "—");
      const nowBox = h("div.wr-box.wr-now", h("h2", "🎙 މިހާރު ކިޔަވަނީ"), nowSt ? card(nowSt, true, nowPh) : h("div.center.muted", { style: { fontSize: "2.4vw", marginTop: "20vh" } }, "ދަރިވަރަކަށް އިންތިޒާރުކުރަނީ..."),
        nowSt && L.phase === "reading" ? h("div.center", { style: { fontSize: "1.6vw", color: "var(--muted)" } }, `ސުވާލު ${L.qIndex + 1} / ${(L.questions || []).length}`) : null);
      const nxt = (L.next || []).filter(x => !nowSt || x.id !== nowSt.id);
      const nextBox = h("div.wr-box", h("h2", "⏭ ދެން ކިޔަވާނީ"), nxt.length ? card(nxt[0]) : h("div.muted", "—"),
        nxt.slice(1, 3).map(x => h("div", { style: { fontSize: "1.3vw", color: "var(--muted)" } }, "• " + x.name + " — " + (x.regNo || ""))));
      const lr = L.lastResult;
      const prevBox = h("div.wr-box", h("h2", "✔ ކުރިން ކިޔެވީ"),
        lr && lr.student ? h("div", card(lr.student), h("div.wr-stars.center", { html: starsHtml(lr.stars) }), h("div.wr-grade", lr.stars ? GRADE[lr.stars] : "")) : h("div.muted", "—"));
      body.appendChild(h("div.wr-grid", nowBox, nextBox, prevBox));
    }));
  });
}
