/* Teacher dashboard: lets teachers create tests/exams and add questions from the Tests page. */
(function () {
  "use strict";
  if ((location.pathname.split("/").pop() || "").toLowerCase() !== "teacher.html") return;

  function link(id, text, bg, fg) {
    return '<a href="teacher-course.html?id=' + encodeURIComponent(id) + '#testsCard" style="display:inline-block;background:' + bg +
      ';color:' + fg + ';text-decoration:none;font-weight:bold;padding:9px 13px;border-radius:7px;font-size:13px;margin:0 6px 8px 0">' + text + "</a>";
  }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function run() {
    var list;
    try { list = courses; } catch (e) { return; }
    if (!Array.isArray(list) || !list.length) return;
    var sec = document.getElementById("tests");
    if (!sec) return;

    if (!document.getElementById("newTestCard")) {
      var card = document.createElement("div");
      card.id = "newTestCard";
      card.className = "card";
      card.innerHTML = "<h3>Create a test or exam</h3><p style=\"color:#64748b;font-size:13px;margin:0 0 10px\">Choose a course, then create the test and add its questions.</p>" +
        list.map(function (c) { return link(c.id, "+ " + esc(c.title || c.name || "Course"), "#d4af37", "#1a1a1a"); }).join("");
      var title = sec.querySelector(".page-title");
      if (title && title.nextSibling) sec.insertBefore(card, title.nextSibling); else sec.appendChild(card);
    }

    var byTitle = {};
    list.forEach(function (c) { byTitle[String(c.title || c.name || "").trim()] = c.id; });
    var body = document.getElementById("teacherTestsBody");
    if (body) {
      Array.prototype.forEach.call(body.querySelectorAll("tr"), function (tr) {
        var tds = tr.querySelectorAll("td");
        if (tds.length < 6 || tr.getAttribute("data-patched")) return;
        var cid = byTitle[tds[1].textContent.trim()];
        if (cid) {
          tds[5].innerHTML = link(cid, "Manage / Add questions", "#064e3b", "#fff");
        }
        tr.setAttribute("data-patched", "1");
      });
    }
  }
  setInterval(run, 800);
})();
