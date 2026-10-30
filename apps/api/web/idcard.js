/* Shows the signed-in user's identity card on their profile, with a PDF download. */
(function () {
  "use strict";

  function el(tag, css, text) {
    var e = document.createElement(tag);
    if (css) e.style.cssText = css;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function build(mount, card) {
    mount.innerHTML = "";
    mount.style.cssText = "margin:0 0 18px";

    var heading = el("div", "font-weight:bold;color:#064e3b;margin:0 0 8px;font-size:16px", "My ID Card");
    mount.appendChild(heading);

    var wrap = el("div", "max-width:380px;background:#fbf6e6;border:2px solid #064e3b;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.12)");

    var head = el("div", "background:#064e3b;color:#fff;padding:10px 12px;display:flex;align-items:center;gap:10px");
    var logo = document.createElement("img");
    logo.src = "/assets/logo.png";
    logo.alt = "";
    logo.style.cssText = "width:38px;height:38px;background:#fff;border-radius:50%;padding:2px;object-fit:contain";
    var ht = el("div");
    ht.appendChild(el("div", "font-weight:bold;font-size:14px;letter-spacing:.3px", "MAKNAZUL IRFAN ACADEMY"));
    ht.appendChild(el("div", "color:#e6c85a;font-size:11px;font-weight:bold;margin-top:2px", card.title));
    head.appendChild(logo);
    head.appendChild(ht);
    wrap.appendChild(head);

    var body = el("div", "display:flex;gap:12px;padding:12px;align-items:flex-start");

    var photoBox = el("div", "width:84px;height:100px;flex:none;border:2px solid #064e3b;background:#e8efe9;display:flex;align-items:center;justify-content:center;overflow:hidden;color:#064e3b;font-weight:bold;font-size:28px");
    var initials = card.name.split(/\s+/).map(function (p) { return p.charAt(0); }).join("").slice(0, 2).toUpperCase();
    photoBox.textContent = initials;
    var photo = new Image();
    photo.onload = function () {
      photoBox.textContent = "";
      photo.style.cssText = "width:100%;height:100%;object-fit:cover";
      photoBox.appendChild(photo);
    };
    photo.src = "/api/avatar/me?t=" + Date.now();
    body.appendChild(photoBox);

    var info = el("div", "min-width:0;flex:1");
    function field(label, value, big) {
      var f = el("div", "margin-bottom:6px");
      f.appendChild(el("div", "font-size:10px;color:#6b7280;font-weight:bold", label));
      f.appendChild(el("div", "color:#111;font-weight:bold;word-break:break-word;font-size:" + (big ? "16px" : "12px"), value));
      info.appendChild(f);
    }
    field("FULL NAME", card.name, true);
    field("ID NUMBER", card.idNumber);
    card.details.slice(0, 3).forEach(function (d) { field(d[0], d[1]); });
    body.appendChild(info);
    wrap.appendChild(body);

    wrap.appendChild(el("div", "background:#064e3b;color:#e6c85a;text-align:center;font-size:10px;font-weight:bold;padding:5px", "KNOWLEDGE • FAITH • EXCELLENCE"));
    mount.appendChild(wrap);

    var a = document.createElement("a");
    a.href = "/api/pdf/idcard";
    a.textContent = "Download ID Card (PDF)";
    a.style.cssText = "display:inline-block;margin-top:10px;background:#d4af37;color:#1a1a1a;text-decoration:none;font-weight:bold;padding:10px 16px;border-radius:7px;font-size:14px";
    mount.appendChild(a);
  }

  function start() {
    var mount = document.getElementById("idCardMount");
    if (!mount) return;
    fetch("/api/pdf/idcard-data", { credentials: "include" })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, d: d }; }); })
      .then(function (res) {
        if (res.ok && res.d.card) build(mount, res.d.card);
      })
      .catch(function () { /* the profile still works without the card */ });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
