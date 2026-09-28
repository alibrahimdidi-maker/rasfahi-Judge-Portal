/*!
 * RASFAHI — Qur'an Competition Judging System
 * Copyright (c) 2026 Ali Ibrahim Didi (AIDD) / Zaadh Holding. All rights reserved. Reg No: MED.03.IP.CR.26.EW5889
 * Unauthorised copying, hosting, modification or redistribution is prohibited.
 */
// Start-up check (plain script, runs before the program): if the program does not start,
// show the reason on screen instead of a blank "loading" page.
(function () {
  var shown = false;
  function esc(t) { return String(t).replace(/[&<>]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]; }); }
  function show(msg) {
    if (shown || window.__rasfahiBoot) return; shown = true;
    var ua = navigator.userAgent, edge = /Edg\//.test(ua);
    var el = document.getElementById("app") || document.getElementById("reg") || document.body;
    el.innerHTML = '<div style="max-width:620px;margin:8vh auto;padding:24px;border-radius:16px;background:#fff;color:#1a2340;' +
      'font-family:Faruma,\'Noto Sans Thaana\',sans-serif;line-height:1.9;direction:rtl;box-shadow:0 8px 30px rgba(0,0,0,.3)">' +
      '<h2 style="margin:0 0 8px;color:#c0392b">ސޮފްޓްވެއަރ ލޯޑް ނުވި</h2>' +
      '<div style="direction:ltr;text-align:left;background:#f4f6fa;border-radius:8px;padding:8px 10px;font:12px monospace;color:#b00020;white-space:pre-wrap">' + esc(msg) + '</div>' +
      '<p style="margin:12px 0 4px"><b>ކުރެވޭނެ ކަންތައް:</b></p><ol style="margin:0;padding-right:20px">' +
      '<li><b>Ctrl + Shift + R</b> ކުރައްވާ.</li>' +
      (edge ? '<li>Edge ގެ <b>Settings → Privacy, search, and services → Tracking prevention</b> ގައި <b>Balanced</b> ހޮއްވަވާ، ނުވަތަ މި ސައިޓު <b>Exceptions</b> ގައި ލައްވާ.</li>' +
              '<li>Edge ގެ <b>Settings → About Microsoft Edge</b> އިން އަޕްޑޭޓް ކުރައްވާ.</li>'
            : '<li>ބްރައުޒަރު އަޕްޑޭޓް ކުރައްވާ.</li>') +
      '<li>InPrivate / Incognito ނޫން ވިންޑޯއެއްގައި ހުޅުއްވާ.</li></ol>' +
      '<p style="font-size:12px;color:#667;direction:ltr;text-align:left">' + esc(ua) + '</p></div>';
  }
  window.__rasfahiBootFail = show;
  window.addEventListener("error", function (e) {
    if (!window.__rasfahiBoot && e && e.message) show(e.message + (e.filename ? "\n" + e.filename + ":" + e.lineno : ""));
  });
  window.addEventListener("unhandledrejection", function (e) {
    if (!window.__rasfahiBoot) show((e.reason && (e.reason.stack || e.reason.message)) || String(e.reason));
  });
  setTimeout(function () {
    if (!window.__rasfahiBoot) show("12 ސިކުންތު ފަހުންވެސް ސޮފްޓްވެއަރ ނުފެށުނު (timeout).\nބްރައުޒަރުން ފައިލެއް ބްލޮކް ކުރަނީ ކަމަށް ވެދާނެ.");
  }, 12000);
})();
