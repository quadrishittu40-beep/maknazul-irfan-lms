/* Sends students to the Quarterly Fee page when the server says the fee is unpaid. */
(function () {
  "use strict";
  var page = location.pathname.split("/").pop();
  if (page === "fees.html" || page === "student.html") return;
  var orig = window.fetch;
  window.fetch = function () {
    return orig.apply(this, arguments).then(function (res) {
      if (res.status === 402) {
        res.clone().json().then(function (d) {
          if (d && d.code === "TERM_FEE_DUE") location.href = "fees.html";
        }).catch(function () {});
      }
      return res;
    });
  };
})();
