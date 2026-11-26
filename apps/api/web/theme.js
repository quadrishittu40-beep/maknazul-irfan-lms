/* Light / dark switch for the whole app. Remembers the choice on this device. */
(function () {
  "use strict";
  if (window.__themeOn) return;
  window.__themeOn = true;

  var KEY = "maknazul-theme";
  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  var root = document.documentElement;
  function apply(mode) {
    if (mode === "dark") root.setAttribute("data-theme", "dark");
    else root.removeAttribute("data-theme");
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", mode === "dark" ? "#0b2b22" : "#064e3b");
    var b = document.getElementById("themeBtn");
    if (b) {
      b.textContent = mode === "dark" ? "☀" : "☾";
      b.setAttribute("aria-label", mode === "dark" ? "Switch to light mode" : "Switch to dark mode");
      b.title = b.getAttribute("aria-label");
    }
  }

  var mode = get() === "dark" ? "dark" : "light";
  apply(mode);

  var css = document.createElement("style");
  css.textContent =
    'html[data-theme="dark"]{filter:invert(1) hue-rotate(180deg);background:#fff}' +
    'html[data-theme="dark"] img,html[data-theme="dark"] video,html[data-theme="dark"] iframe,html[data-theme="dark"] canvas,' +
    'html[data-theme="dark"] picture,html[data-theme="dark"] .no-invert{filter:invert(1) hue-rotate(180deg)}' +
    '#themeBtn{position:fixed;right:14px;bottom:70px;z-index:9996;width:44px;height:44px;border-radius:50%;border:2px solid #d4af37;' +
    'background:#064e3b;color:#fff;font-size:22px;line-height:1;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.3);padding:0;margin:0;display:flex;align-items:center;justify-content:center}';
  (document.head || root).appendChild(css);

  function mount() {
    if (document.getElementById("themeBtn")) return;
    var b = document.createElement("button");
    b.id = "themeBtn";
    b.type = "button";
    b.addEventListener("click", function () {
      mode = mode === "dark" ? "light" : "dark";
      set(mode);
      apply(mode);
    });
    document.body.appendChild(b);
    apply(mode);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount); else mount();
})();
