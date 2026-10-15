(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {});
    });
  }

  var deferred = null;
  var standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true;
  if (standalone) return;

  function makeButton(label, onClick) {
    if (document.getElementById("installAppBtn")) return;
    var b = document.createElement("button");
    b.id = "installAppBtn";
    b.textContent = label;
    b.style.cssText =
      "position:fixed;right:14px;bottom:14px;z-index:9998;background:#064e3b;" +
      "color:#fff;border:2px solid #d4af37;border-radius:30px;padding:11px 18px;" +
      "font:bold 14px Arial,sans-serif;box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer";
    b.addEventListener("click", onClick);
    document.body.appendChild(b);
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferred = e;
    makeButton("Install app", function () {
      if (!deferred) return;
      deferred.prompt();
      deferred.userChoice.finally(function () {
        deferred = null;
        var b = document.getElementById("installAppBtn");
        if (b) b.remove();
      });
    });
  });

  window.addEventListener("appinstalled", function () {
    var b = document.getElementById("installAppBtn");
    if (b) b.remove();
  });

  // iPhone/iPad Safari has no install prompt: show a hint.
  var ua = navigator.userAgent;
  var ios = /iPhone|iPad|iPod/.test(ua) && !window.MSStream;
  if (ios) {
    window.addEventListener("load", function () {
      makeButton("Install app", function () {
        alert("To install: tap the Share button, then choose Add to Home Screen.");
      });
    });
  }
})();
