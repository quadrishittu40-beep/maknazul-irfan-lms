/* After a successful payment: pop up a prompt to download the receipt straight away. */
(function () {
  "use strict";
  window.promptReceipt = function (reference, title) {
    if (!reference || document.getElementById("rcptBox")) return;
    var url = "/api/pdf/receipt/ref/" + encodeURIComponent(reference);
    var o = document.createElement("div");
    o.id = "rcptBox";
    o.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:18px;font-family:Arial,sans-serif";
    o.innerHTML =
      '<div style="background:#fff;border-radius:14px;max-width:360px;width:100%;padding:24px;text-align:center;box-shadow:0 10px 40px rgba(0,0,0,.35)">' +
      '<div style="width:56px;height:56px;border-radius:50%;background:#e8f7ed;color:#176b3a;font-size:30px;line-height:56px;margin:0 auto 12px">&#10003;</div>' +
      '<h3 style="color:#064e3b;margin:0 0 6px;font-size:19px">' + (title || "Payment successful") + '</h3>' +
      '<p style="color:#68756d;font-size:14px;line-height:1.5;margin:0 0 16px">Your official receipt is ready. Download it now and keep it for your records.</p>' +
      '<a id="rcptDl" href="' + url + '" style="display:block;background:#d4af37;color:#1a1a1a;text-decoration:none;font-weight:bold;padding:13px;border-radius:8px;font-size:15px">Download Receipt (PDF)</a>' +
      '<button id="rcptClose" type="button" style="margin-top:10px;background:none;border:0;color:#68756d;font-size:14px;cursor:pointer;padding:8px">Close</button>' +
      '</div>';
    document.body.appendChild(o);
    document.getElementById("rcptClose").onclick = function () { o.remove(); };
  };
})();
