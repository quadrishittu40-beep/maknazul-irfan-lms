/* Live presence: signed-in users ping the server every minute.
   Admin and teachers also get a green "students online" badge. */
(function () {
  "use strict";
  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (["", "index.html", "login.html", "register.html", "forgot-password.html", "reset-password.html"].indexOf(page) !== -1) return;
  if (window.__presenceOn) return;
  window.__presenceOn = true;

  var role = null, widget = null, panel = null, timer = null;

  function ping() {
    return fetch("/api/presence/ping", { method: "POST", credentials: "include" })
      .then(function (r) { if (r.status === 401) { stop(); return null; } return r.json(); })
      .then(function (d) {
        if (!d) return;
        role = d.role || (d.data && d.data.role) || role;
        if ((role === "ADMIN" || role === "TEACHER") && !widget) buildWidget();
      }).catch(function () {});
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  function buildWidget() {
    var css = document.createElement("style");
    css.textContent =
      "@keyframes pgl{0%{box-shadow:0 0 0 0 rgba(34,197,94,.7)}70%{box-shadow:0 0 0 9px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}" +
      "#presW{position:fixed;left:14px;bottom:14px;z-index:9997;font-family:Arial,sans-serif}" +
      "#presB{background:#fff;color:#064e3b;border:2px solid #22c55e;border-radius:30px;padding:9px 15px;font-weight:bold;font-size:13px;box-shadow:0 4px 14px rgba(0,0,0,.2);cursor:pointer;display:flex;align-items:center;gap:8px}" +
      "#presB i{width:11px;height:11px;border-radius:50%;background:#22c55e;display:inline-block;animation:pgl 1.6s infinite}" +
      "#presB.off i{background:#9ca3af;animation:none}" +
      "#presP{display:none;position:absolute;left:0;bottom:46px;width:250px;max-height:300px;overflow:auto;background:#fff;border-radius:10px;box-shadow:0 6px 22px rgba(0,0,0,.25);padding:10px;font-size:13px}" +
      "#presP div{padding:7px 4px;border-bottom:1px solid #eef2ef;display:flex;gap:8px;align-items:center}" +
      "#presP div i{width:8px;height:8px;border-radius:50%;background:#22c55e;flex:none}" +
      "#presP small{color:#68756d;display:block}";
    document.head.appendChild(css);
    widget = document.createElement("div");
    widget.id = "presW";
    widget.innerHTML = '<div id="presP"></div><button id="presB" class="off" type="button"><i></i><span id="presT">Students online: 0</span></button>';
    document.body.appendChild(widget);
    panel = widget.querySelector("#presP");
    widget.querySelector("#presB").addEventListener("click", function () {
      panel.style.display = panel.style.display === "block" ? "none" : "block";
    });
    loadOnline();
    setInterval(loadOnline, 30000);
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function loadOnline() {
    fetch("/api/presence/online", { credentials: "include" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) {
        if (!d) return;
        var list = d.students || (d.data && d.data.students) || [];
        var n = list.length;
        var b = widget.querySelector("#presB");
        b.className = n ? "" : "off";
        widget.querySelector("#presT").textContent = n + (n === 1 ? " student online" : " students online");
        panel.innerHTML = n ? list.map(function (s) {
          return "<div><i></i><span><b>" + esc(s.name) + "</b><small>" + esc([s.level, s.class].filter(Boolean).join(" · ")) + "</small></span></div>";
        }).join("") : '<div style="color:#68756d">No students online right now.</div>';
      }).catch(function () {});
  }

  function start() { ping(); timer = setInterval(ping, 60000); }
  document.addEventListener("visibilitychange", function () { if (!document.hidden && timer) ping(); });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
