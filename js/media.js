/*!
 * RASFAHI — Qur'an Competition Judging System
 * Copyright (c) 2026 Ali Ibrahim Didi (AIDD) / Zaadh Holding. All rights reserved. Reg No: MED.03.IP.CR.26.EW5889
 * Unauthorised copying, hosting, modification or redistribution is prohibited.
 */
// ============================================================
//  RASFAHI — recording player (Google Drive file / folder, YouTube, direct video)
//  Drive files play in our own player (▶ ⏸ ⏪ ⏩ speed, full screen); if Drive refuses
//  direct playback, the Drive player is shown instead (it has its own controls).
//  The file / folder must be shared as "Anyone with the link – Viewer".
// ============================================================
import { h } from "./core.js";

export function parseMediaUrl(url) {
  const u = String(url || "").trim();
  if (!u) return null;
  let m;
  if ((m = u.match(/drive\.google\.com\/(?:drive\/(?:u\/\d+\/)?)?folders\/([\w-]{10,})/))) return { kind: "folder", id: m[1], url: u };
  if ((m = u.match(/drive\.google\.com\/file\/d\/([\w-]{10,})/)) || (m = u.match(/drive\.google\.com\/(?:open|uc)\?(?:.*&)?id=([\w-]{10,})/)) ||
      (m = u.match(/docs\.google\.com\/(?:file\/d\/|uc\?(?:.*&)?id=)([\w-]{10,})/))) return { kind: "drive", id: m[1], url: u };
  if ((m = u.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{6,})/))) return { kind: "youtube", id: m[1], url: u };
  if (/^https?:\/\/.+\.(mp4|webm|ogg|m4v|mov|mp3|m4a|wav)(\?.*)?$/i.test(u)) return { kind: "video", id: "", url: u };
  return { kind: "link", id: "", url: u };
}
export const MEDIA_KIND_DV = { drive: "ގޫގުލް ޑްރައިވް ފައިލް", folder: "ގޫގުލް ޑްރައިވް ފޯލްޑަރު", youtube: "ޔޫޓިއުބް", video: "ވީޑިއޯ ފައިލް", link: "ލިންކް" };

const fmtT = (t) => { t = Math.max(0, Math.floor(t || 0)); const m = Math.floor(t / 60), s = t % 60; return `${m}:${String(s).padStart(2, "0")}`; };

// our own controls around a <video>
function ownPlayer(src, onFail) {
  const v = h("video", { src, preload: "metadata", playsinline: "" });
  const playBtn = h("button.pl-btn.main", { title: "ޕްލޭ / ޕޯޒް" }, "▶");
  const time = h("span.pl-time", "0:00 / 0:00");
  const seek = h("input.pl-seek", { type: "range", min: 0, max: 1000, value: 0 });
  const rate = h("select.pl-rate", ...[0.75, 1, 1.25, 1.5].map(r => h("option", { value: r, selected: r === 1 }, r + "×")));
  const jump = (d) => { v.currentTime = Math.max(0, Math.min((v.duration || 0), v.currentTime + d)); };
  const toggle = () => (v.paused ? v.play() : v.pause());
  playBtn.onclick = toggle; v.onclick = toggle;
  v.onplay = () => playBtn.textContent = "⏸"; v.onpause = () => playBtn.textContent = "▶";
  v.ontimeupdate = () => { time.textContent = `${fmtT(v.currentTime)} / ${fmtT(v.duration)}`; if (v.duration) seek.value = Math.round(v.currentTime / v.duration * 1000); };
  seek.oninput = () => { if (v.duration) v.currentTime = seek.value / 1000 * v.duration; };
  rate.onchange = () => v.playbackRate = +rate.value;
  v.onerror = () => onFail && onFail();
  const bar = h("div.pl-bar",
    h("button.pl-btn", { title: "10 ސިކުންތު ފަހަތަށް", onclick: () => jump(-10) }, "⏪ 10"),
    playBtn,
    h("button.pl-btn", { title: "10 ސިކުންތު ކުރިއަށް", onclick: () => jump(10) }, "10 ⏩"),
    seek, time, rate,
    h("button.pl-btn", { title: "ފުލް ސްކްރީން", onclick: () => { const el = v.closest(".rec-frame") || v; (el.requestFullscreen || el.webkitRequestFullscreen || (() => {})).call(el); } }, "⛶"));
  return h("div.pl", h("div.pl-screen", v), bar);
}
const frameIframe = (src, note) => h("div.pl", h("div.pl-screen", h("iframe", { src, allow: "autoplay; fullscreen; encrypted-media", allowfullscreen: "", loading: "lazy", referrerpolicy: "no-referrer" })),
  note ? h("div.pl-note", note) : null);

// the framed player for a stored recording ({ url }) or a raw link
export function mediaPlayer(rec) {
  const m = parseMediaUrl(rec && rec.url);
  if (!m) return h("div.rec-empty", "ރެކޯޑިންގއެއް ނެތް");
  const box = h("div.rec-frame");
  const drivePreview = () => frameIframe(`https://drive.google.com/file/d/${m.id}/preview`, "ގޫގުލް ޑްރައިވްގެ ޕްލޭޔަރ — ކޮންޓްރޯލްތައް ވީޑިއޯގެ ތެރޭގައި");
  if (m.kind === "drive") box.appendChild(ownPlayer(`https://drive.google.com/uc?export=download&id=${m.id}`, () => { box.innerHTML = ""; box.appendChild(drivePreview()); }));
  else if (m.kind === "folder") box.appendChild(frameIframe(`https://drive.google.com/embeddedfolderview?id=${m.id}#grid`, "ފޯލްޑަރުގެ ފައިލުތައް — ވީޑިއޯއަކަށް ފިތާލުމުން ހުޅުވޭނެ. ދަރިވަރެއްގެ ވީޑިއޯ ކާޑަށް އެ ފައިލުގެ ލިންކް ލައްވާ."));
  else if (m.kind === "youtube") box.appendChild(frameIframe(`https://www.youtube-nocookie.com/embed/${m.id}?rel=0&modestbranding=1`));
  else if (m.kind === "video") box.appendChild(ownPlayer(m.url));
  else box.appendChild(h("div.rec-empty", h("a", { href: m.url, target: "_blank", rel: "noopener" }, "🔗 ލިންކް ހުޅުވާ")));
  return box;
}
