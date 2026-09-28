/*!
 * RASFAHI — Qur'an Competition Judging System
 * Copyright (c) 2026 Ali Ibrahim Didi (AIDD) / Zaadh Holding. All rights reserved.
 * Reg No: MED.03.IP.CR.26.EW5889
 * Unauthorised copying, hosting, modification or redistribution of this software, in whole or in part, is prohibited.
 */
// ---- licence: where this copy is allowed to run --------------------------------------------
// Add a new address here (and to Firebase → Authentication → Authorized domains) before hosting elsewhere.
export const LICENSE = {
  owner: "Ali Ibrahim Didi (AIDD)", company: "Zaadh Holding", reg: "MED.03.IP.CR.26.EW5889", phone: "+960 7791550",
  hosts: ["alibrahimdidi-maker.github.io", "rasfahiquran.web.app", "rasfahiquran.firebaseapp.com", "localhost", "127.0.0.1"],
  // Firebase App Check (reCAPTCHA v3) site key — when set, only this website can use the database (see instructions)
  appCheckSiteKey: ""
};
export function checkLicense() {
  const host = (location.hostname || "").toLowerCase();
  if (LICENSE.hosts.includes(host)) return true;
  const msg = `<div style="max-width:560px;margin:12vh auto;padding:26px;border-radius:16px;background:#fff;color:#1a2340;font-family:Faruma,sans-serif;direction:rtl;text-align:center;line-height:2">
    <h2 style="color:#c0392b;margin:0">⚠ ލައިސަންސް ނެތް ކޮޕީއެއް</h2>
    <p>މި ސޮފްޓްވެއަރ ހިންގުމުގެ ހުއްދަ ލިބިފައިވަނީ ރަސްމީ ސައިޓުތަކަށް އެކަނި.</p>
    <p style="direction:ltr;font-family:sans-serif;font-size:13px">RASFAHI © ${LICENSE.owner} — ${LICENSE.company}<br>Reg No: ${LICENSE.reg} • ${LICENSE.phone}<br>Unlicensed host: ${host.replace(/</g, "")}</p></div>`;
  try { window.__rasfahiBoot = true; document.body.innerHTML = msg; } catch (e) {}
  throw new Error("RASFAHI: unlicensed host " + host);
}
