/* Profile photo: shows the current photo and lets the signed-in user change or remove it. */
(function () {
  "use strict";

  var SIZE = 320; // saved photos are cropped to a square this big

  function applyToHeader(hasPhoto) {
    var el = document.getElementById("avatar");
    if (!el) return;
    if (hasPhoto) {
      el.style.backgroundImage = "url(/api/avatar/me?t=" + Date.now() + ")";
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center";
      el.style.color = "transparent";
    } else {
      el.style.backgroundImage = "";
      el.style.color = "";
    }
  }

  function api(method, body) {
    return fetch("/api/avatar/me", {
      method: method,
      credentials: "include",
      headers: body ? { "Content-Type": "application/json" } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.message || "Request failed.");
        return d;
      });
    });
  }

  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("Could not read the photo.")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("That file is not a usable image.")); };
        img.onload = function () {
          var canvas = document.createElement("canvas");
          canvas.width = SIZE;
          canvas.height = SIZE;
          var side = Math.min(img.width, img.height);
          var sx = (img.width - side) / 2;
          var sy = (img.height - side) / 2;
          var ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, SIZE, SIZE);
          ctx.drawImage(img, sx, sy, side, side, 0, 0, SIZE, SIZE);
          var q = 0.85;
          var out = canvas.toDataURL("image/jpeg", q);
          while (out.length > 280000 && q > 0.3) {
            q -= 0.15;
            out = canvas.toDataURL("image/jpeg", q);
          }
          resolve(out);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function build(mount) {
    mount.innerHTML = "";
    mount.style.cssText =
      "display:flex;align-items:center;gap:16px;flex-wrap:wrap;background:#fff;border-radius:12px;" +
      "padding:16px;margin:0 0 18px;box-shadow:0 3px 14px rgba(0,0,0,.06)";

    var pic = document.createElement("img");
    pic.alt = "Profile photo";
    pic.style.cssText =
      "width:96px;height:96px;border-radius:50%;object-fit:cover;background:#e8efe9;" +
      "border:3px solid #064e3b;display:block";

    var side = document.createElement("div");
    var label = document.createElement("div");
    label.style.cssText = "font-weight:bold;color:#064e3b;margin-bottom:8px";
    label.textContent = "Profile photo";

    var note = document.createElement("div");
    note.style.cssText = "font-size:13px;color:#64748b;margin:6px 0 0;min-height:18px";

    var input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.style.display = "none";

    function mkBtn(text, bg, fg) {
      var b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.style.cssText =
        "background:" + bg + ";color:" + fg + ";border:0;border-radius:7px;padding:9px 14px;" +
        "font-weight:bold;font-size:14px;cursor:pointer;margin-right:8px";
      return b;
    }
    var change = mkBtn("Change photo", "#d4af37", "#1a1a1a");
    var remove = mkBtn("Remove", "#e5e7eb", "#374151");
    remove.style.display = "none";

    function show(has) {
      if (has) {
        pic.src = "/api/avatar/me?t=" + Date.now();
        pic.style.visibility = "visible";
      } else {
        pic.removeAttribute("src");
        pic.style.visibility = "hidden";
      }
      remove.style.display = has ? "inline-block" : "none";
      change.textContent = has ? "Change photo" : "Add photo";
      pic.parentNode && (pic.style.background = "#e8efe9");
      applyToHeader(has);
    }

    pic.addEventListener("error", function () { show(false); });

    change.addEventListener("click", function () { input.click(); });

    input.addEventListener("change", function () {
      var file = input.files && input.files[0];
      input.value = "";
      if (!file) return;
      note.textContent = "Saving...";
      shrink(file)
        .then(function (data) { return api("PUT", { image: data }); })
        .then(function () { note.textContent = "Photo saved."; show(true); })
        .catch(function (e) { note.textContent = e.message; });
    });

    remove.addEventListener("click", function () {
      note.textContent = "Removing...";
      api("DELETE")
        .then(function () { note.textContent = "Photo removed."; show(false); })
        .catch(function (e) { note.textContent = e.message; });
    });

    side.appendChild(label);
    side.appendChild(change);
    side.appendChild(remove);
    side.appendChild(note);
    side.appendChild(input);
    mount.appendChild(pic);
    mount.appendChild(side);

    // start by trying to load the saved photo; the error handler hides it if there is none
    pic.style.visibility = "hidden";
    pic.onload = function () { pic.style.visibility = "visible"; remove.style.display = "inline-block"; change.textContent = "Change photo"; applyToHeader(true); };
    pic.src = "/api/avatar/me?t=" + Date.now();
  }

  function start() {
    var mount = document.getElementById("avatarMount");
    if (mount) build(mount);
    else {
      // pages without the widget still show the photo in the round header badge
      var probe = new Image();
      probe.onload = function () { applyToHeader(true); };
      probe.src = "/api/avatar/me?t=" + Date.now();
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
