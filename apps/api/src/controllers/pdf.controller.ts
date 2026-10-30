import { Response } from "express";
import path from "path";
import fs from "fs";

import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { failure } from "../utils/http";
import { shapeArabic } from "../utils/arabic";
import { code128Widths } from "../utils/barcode";
import crypto from "crypto";
import { env } from "../config/env";

const GREEN = "#064e3b";
const GOLD = "#b8932a";
const CREAM = "#fbf6e6";
const ACADEMY_EMAIL = "quadrishittu40@gmail.com";
const ACADEMY_PHONE = "0808 492 9862";
const GREY = "#555555";

const FONT_DIR = path.resolve(__dirname, "../../fonts");
const LOGO_PATH = path.resolve(__dirname, "../../web/assets/logo.png");

function fmtDate(d: Date | null | undefined) {
  if (!d) return "-";
  return new Date(d).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric"
  });
}

/* Public address of the site, used in verification links. */
function baseUrl(req: AuthenticatedRequest): string {
  const configured = String(env.APP_URL || "").replace(/\/+$/, "");
  if (configured && !/localhost|127\.0\.0\.1/.test(configured)) return configured;
  return `${req.protocol}://${req.get("host")}`;
}

/* Draws a QR code (scannable with any phone camera) straight into the PDF. */
function drawQr(doc: any, text: string, x: number, y: number, size: number) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const QRCode = require("qrcode");
    const qr = QRCode.create(text, { errorCorrectionLevel: "M" });
    const n = qr.modules.size;
    const cell = size / n;
    doc.save();
    doc.rect(x - 4, y - 4, size + 8, size + 8).fill("#ffffff");
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (qr.modules.get(r, c)) {
          doc.rect(x + c * cell, y + r * cell, cell + 0.15, cell + 0.15).fill("#000000");
        }
      }
    }
    doc.restore();
    doc.font("Body").fontSize(7).fillColor(GREY)
      .text("Scan to verify", x - 10, y + size + 6, { width: size + 20, align: "center" });
  } catch (error) {
    console.error("QR code error:", error);
  }
}

/* Red round "official seal" with curved lettering, drawn as vector shapes. */
function drawStamp(doc: any, cx: number, cy: number, r: number) {
  const RED = "#c1121f";
  doc.save();
  doc.translate(cx, cy);
  doc.rotate(-12);
  doc.opacity(0.88);

  doc.lineWidth(2.6).strokeColor(RED).circle(0, 0, r).stroke();
  doc.lineWidth(0.8).strokeColor(RED).circle(0, 0, r - 5).stroke();
  doc.lineWidth(0.8).strokeColor(RED).circle(0, 0, r - 28).stroke();

  const fs = 7.6;
  const rt = r - 17;
  doc.font("Body-Bold").fontSize(fs).fillColor(RED);

  function arc(text: string, top: boolean) {
    const chars = Array.from(text);
    const widths = chars.map((c) => doc.widthOfString(c) + 0.9);
    const total = widths.reduce((a, b) => a + b, 0);
    const span = (total / rt) * (180 / Math.PI);
    let angle = top ? -span / 2 : span / 2;
    chars.forEach((ch, i) => {
      const step = (widths[i] / rt) * (180 / Math.PI);
      const mid = top ? angle + step / 2 : angle - step / 2;
      doc.save();
      doc.rotate(mid);
      const y = top ? -rt - fs * 0.5 : rt - fs * 0.62;
      doc.text(ch, -widths[i] / 2, y, { lineBreak: false });
      doc.restore();
      angle = top ? angle + step : angle - step;
    });
  }

  arc("MAKNAZUL 'IRFAN ACADEMY", true);
  arc("ONLINE ISLAMIC & ARABIC INSTITUTE", false);

  // small stars between the two arcs
  doc.font("Body-Bold").fontSize(9).fillColor(RED);
  doc.text("\u2605", -r + 6.5, -5, { lineBreak: false });
  doc.text("\u2605", r - 15.5, -5, { lineBreak: false });

  // centre
  doc.font("Body-Bold").fontSize(15).fillColor(RED)
    .text("\u2605", -8, -r + 31, { lineBreak: false });
  doc.font("Body-Bold").fontSize(8.5).fillColor(RED)
    .text("OFFICIAL", -r + 20, -7, { width: 2 * (r - 20), align: "center", lineBreak: false });
  doc.font("Body-Bold").fontSize(8.5).fillColor(RED)
    .text("SEAL", -r + 20, 4, { width: 2 * (r - 20), align: "center", lineBreak: false });

  doc.restore();
}

/* Code 128 barcode drawn as vector bars, with the text underneath. */
function drawBarcode(doc: any, text: string, x: number, y: number, width: number, height: number) {
  const widths = code128Widths(text);
  const total = widths.reduce((a, b) => a + b, 0);
  const unit = width / total;
  let cx = x;
  widths.forEach((wd, i) => {
    if (i % 2 === 0) doc.rect(cx, y, wd * unit, height).fill("#000000");
    cx += wd * unit;
  });
  doc.font("Body").fontSize(8).fillColor("#333333")
    .text(text, x, y + height + 3, { width, align: "center", lineBreak: false });
}

/* Green quarter-circle ornament for a certificate corner. */
function cornerOrnament(doc: any, x: number, y: number, sx: number, sy: number, R: number) {
  doc.save();
  doc.translate(x, y);
  doc.scale(sx, sy);
  doc.path(`M 0 0 L ${R} 0 A ${R} ${R} 0 0 1 0 ${R} Z`).fill(GREEN);
  doc.lineWidth(0.9).strokeColor("#d9bd5c");
  [0.8, 0.6, 0.4].forEach((f) => {
    doc.path(`M ${R * f} 0 A ${R * f} ${R * f} 0 0 1 0 ${R * f}`).stroke();
  });
  doc.path(`M ${R * 0.2} ${R * 0.08} L ${R * 0.32} ${R * 0.2} L ${R * 0.2} ${R * 0.32} L ${R * 0.08} ${R * 0.2} Z`).fill("#d9bd5c");
  doc.restore();
}

function diamond(doc: any, cx: number, cy: number, r: number, color: string) {
  doc.save();
  doc.path(`M ${cx} ${cy - r} L ${cx + r} ${cy} L ${cx} ${cy + r} L ${cx - r} ${cy} Z`).fill(color);
  doc.restore();
}

function photoBuffer(avatar: string | null | undefined): Buffer | null {
  const m = avatar && /^data:image\/(?:jpeg|png);base64,(.+)$/.exec(avatar);
  return m ? Buffer.from(m[1], "base64") : null;
}

function safeName(s: string) {
  return s.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "file";
}

function startPdf(
  res: Response,
  filename: string,
  options: any = {}
) {
  // Loaded lazily so a missing package can never stop the server starting.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const PDFDocument = require("pdfkit");
  const doc = new PDFDocument({ size: "A4", margin: 50, ...options });
  // DejaVu Sans covers Latin and Arabic
  doc.registerFont("Body", path.join(FONT_DIR, "DejaVuSans.ttf"));
  doc.registerFont("Body-Bold", path.join(FONT_DIR, "DejaVuSans-Bold.ttf"));
  doc.registerFont("Serif", path.join(FONT_DIR, "DejaVuSerif.ttf"));
  doc.registerFont("Serif-Bold", path.join(FONT_DIR, "DejaVuSerif-Bold.ttf"));

  // Arabic text is shaped and put into visual order before drawing
  const originalText = doc.text.bind(doc);
  doc.text = (t: any, ...args: any[]) =>
    originalText(typeof t === "string" ? shapeArabic(t) : t, ...args);

  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="${safeName(filename)}.pdf"`
  );
  doc.pipe(res);
  return doc;
}

function letterhead(doc: any, subtitle: string) {
  const w = doc.page.width;
  try {
    if (fs.existsSync(LOGO_PATH)) {
      doc.image(LOGO_PATH, 50, 40, { fit: [56, 56] });
    }
  } catch {
    /* logo is optional */
  }
  doc
    .fillColor(GREEN)
    .font("Body-Bold")
    .fontSize(18)
    .text("MAKNAZUL IRFAN ACADEMY", 118, 46, { width: w - 168 });
  doc
    .font("Body")
    .fontSize(10)
    .fillColor(GREY)
    .text("Online Islamic & Arabic Institute", 118, 68, { width: w - 168 });
  doc
    .font("Body-Bold")
    .fontSize(12)
    .fillColor(GOLD)
    .text(subtitle, 118, 82, { width: w - 168 });
  doc
    .moveTo(50, 108)
    .lineTo(w - 50, 108)
    .lineWidth(2)
    .strokeColor(GREEN)
    .stroke();
  doc.y = 124;
  doc.x = 50;
}

function row(doc: any, label: string, value: string) {
  const y = doc.y;
  doc.font("Body-Bold").fontSize(10).fillColor(GREEN).text(label, 50, y, { width: 150 });
  doc.font("Body").fontSize(11).fillColor("#111111").text(value || "-", 205, y, { width: 340 });
  doc.moveDown(0.6);
}

/* The target is ?userId=, or ?studentId= (student profile id), or the viewer. */
async function resolveTargetUserId(req: AuthenticatedRequest): Promise<string> {
  const userId = String(req.query.userId || "");
  if (userId) return userId;
  const studentId = String(req.query.studentId || "");
  if (studentId) {
    const sp = await prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { userId: true }
    });
    return sp ? sp.userId : "";
  }
  return req.user!.id;
}

/* Can this viewer see this student (by user id)? */
async function canViewStudent(
  req: AuthenticatedRequest,
  studentUserId: string
): Promise<boolean> {
  const me = req.user!;
  if (!studentUserId) return false;
  if (me.id === studentUserId) return true;
  if (me.role === "ADMIN") return true;
  if (me.role === "TEACHER") {
    const link = await prisma.courseEnrollment.findFirst({
      where: {
        course: { teacherId: me.id },
        student: { userId: studentUserId }
      },
      select: { id: true }
    });
    return !!link;
  }
  return false;
}

/* =========================================================
   CERTIFICATE
========================================================= */

export async function certificatePdf(req: AuthenticatedRequest, res: Response) {
  try {
    const cert = await prisma.certificate.findUnique({
      where: { id: String(req.params.id) },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
        student: {
          select: {
            userId: true,
            user: { select: { firstName: true, lastName: true } }
          }
        }
      }
    });
    if (!cert) return failure(res, "Certificate not found.", 404);

    const me = req.user!;
    const allowed =
      me.role === "ADMIN" ||
      cert.student.userId === me.id ||
      (me.role === "TEACHER" && cert.course?.teacherId === me.id);
    if (!allowed) return failure(res, "Access denied.", 403);

    const name = `${cert.student.user.firstName} ${cert.student.user.lastName}`;
    const doc = startPdf(res, `Certificate_${name}_${cert.certificateNumber}`, {
      layout: "landscape",
      margin: 40
    });
    const w = doc.page.width;
    const h = doc.page.height;

    const verifyUrl = `${baseUrl(req)}/verify.html?no=${encodeURIComponent(cert.certificateNumber)}`;
    const issued = fmtDate(cert.completionDate || cert.issuedAt);

    // parchment background, ornate frame and corner ornaments
    doc.rect(0, 0, w, h).fill(CREAM);
    doc.lineWidth(6).strokeColor(GREEN).rect(20, 20, w - 40, h - 40).stroke();
    doc.lineWidth(1.2).strokeColor(GOLD).rect(31, 31, w - 62, h - 62).stroke();
    doc.lineWidth(0.6).strokeColor(GREEN).rect(37, 37, w - 74, h - 74).stroke();
    cornerOrnament(doc, 23, 23, 1, 1, 78);
    cornerOrnament(doc, w - 23, 23, -1, 1, 78);
    cornerOrnament(doc, 23, h - 23, 1, -1, 78);
    cornerOrnament(doc, w - 23, h - 23, -1, -1, 78);
    diamond(doc, w / 2, 23, 8, GOLD);
    diamond(doc, w / 2, h - 23, 8, GOLD);
    diamond(doc, 23, h / 2, 8, GOLD);
    diamond(doc, w - 23, h / 2, 8, GOLD);

    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, w / 2 - 36, 44, { fit: [72, 72] });
      }
    } catch {
      /* optional */
    }

    doc.fillColor(GREEN).font("Serif-Bold").fontSize(24)
      .text("MAKNAZUL IRFAN ACADEMY", 0, 122, { align: "center", width: w });
    doc.fillColor(GREEN).font("Serif").fontSize(14)
      .text("for Arabic and Islamic Studies", 0, 150, { align: "center", width: w });

    doc.moveTo(w / 2 - 130, 174).lineTo(w / 2 + 130, 174).lineWidth(1).strokeColor(GOLD).stroke();

    doc.fillColor(GOLD).font("Serif-Bold").fontSize(28)
      .text("CERTIFICATE OF COMPLETION", 0, 184, { align: "center", width: w });

    doc.fillColor(GREY).font("Serif").fontSize(14)
      .text("Awarded to:", 0, 224, { align: "center", width: w });

    doc.fillColor("#111111").font("Serif-Bold").fontSize(26)
      .text(name, 70, 244, { align: "center", width: w - 140 });
    const nameBottom = doc.y;
    doc.moveTo(w / 2 - 200, nameBottom + 2).lineTo(w / 2 + 200, nameBottom + 2)
      .lineWidth(0.9).strokeColor(GOLD).stroke();

    doc.fillColor("#333333").font("Body").fontSize(10.5)
      .text(
        "having duly fulfilled all the academic requirements, attended the prescribed lectures and " +
        "satisfactorily completed the assessments of the course",
        100, nameBottom + 10, { align: "center", width: w - 200, lineGap: 2 }
      );

    doc.fillColor(GREEN).font("Serif-Bold").fontSize(19)
      .text((cert.course?.title || "Course").toUpperCase(), 70, doc.y + 5, { align: "center", width: w - 140 });

    const result: string[] = [];
    if (cert.grade) result.push(`Grade ${cert.grade}`);
    if (cert.score !== null && cert.score !== undefined) result.push(`${cert.score}%`);

    doc.fillColor("#333333").font("Body").fontSize(10.5)
      .text(
        "This certificate recognizes dedication, diligence, and academic excellence within the Academy's " +
        "comprehensive Arabic and Islamic studies curriculum" +
        (result.length ? `, achieved with a final result of ${result.join(" - ")}` : "") +
        `, and is issued under the seal of the Academy on ${issued}.`,
        100, doc.y + 6, { align: "center", width: w - 200, lineGap: 2 }
      );

    // date and signatures
    const lineY = h - 124;
    doc.fillColor("#222222").font("Body-Bold").fontSize(10)
      .text(`DATE: ${issued}`, 80, lineY - 30, { width: 300 });
    doc.lineWidth(0.8).strokeColor(GREEN);
    doc.moveTo(80, lineY).lineTo(245, lineY).stroke();
    doc.moveTo(275, lineY).lineTo(440, lineY).stroke();
    doc.fillColor(GREY).font("Body-Bold").fontSize(9.5)
      .text("DIRECTOR", 80, lineY + 4, { width: 165, align: "center" });
    doc.text("PRINCIPAL", 275, lineY + 4, { width: 165, align: "center" });

    // barcode with the certificate number
    drawBarcode(doc, cert.certificateNumber, 80, h - 92, 200, 22);

    // official red seal
    drawStamp(doc, 540, h - 128, 52);

    // QR code with the certificate details
    const qrText = [
      "MAKNAZUL 'IRFAN ACADEMY",
      "CERTIFICATE OF COMPLETION",
      `No: ${cert.certificateNumber}`,
      `Name: ${name}`,
      `Course: ${cert.course?.title || "-"}`,
      cert.grade ? `Grade: ${cert.grade}` : "",
      cert.score !== null && cert.score !== undefined ? `Score: ${cert.score}%` : "",
      `Issued: ${issued}`,
      `Verify: ${verifyUrl}`
    ].filter(Boolean).join("\n");
    drawQr(doc, qrText, w - 150, h - 172, 84);

    doc.fillColor(GREY).font("Body").fontSize(7)
      .text(`Verify at: ${verifyUrl}`, 300, h - 62, { align: "right", width: w - 350 });

    doc.end();
  } catch (error) {
    console.error("certificatePdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the certificate PDF.", 500);
  }
}

/* =========================================================
   PROFILE
========================================================= */

export async function profilePdf(req: AuthenticatedRequest, res: Response) {
  try {
    const me = req.user!;
    const targetId = await resolveTargetUserId(req);

    if (!(await canViewStudent(req, targetId))) {
      return failure(res, "Access denied.", 403);
    }

    const user = await prisma.user.findUnique({
      where: { id: targetId },
      include: {
        studentProfile: {
          include: {
            level: { select: { name: true } },
            class: { select: { name: true } },
            enrollments: { include: { course: { select: { title: true } } } }
          }
        },
        teacherProfile: true,
        coursesTaught: { select: { title: true } }
      }
    });
    if (!user) return failure(res, "User not found.", 404);

    const fullName = `${user.firstName} ${user.lastName}`;
    const doc = startPdf(res, `Profile_${fullName}`);
    letterhead(doc, "Profile");

    const photo = photoBuffer(user.avatar);
    if (photo) {
      try {
        doc.image(photo, doc.page.width - 140, 122, { fit: [90, 90], align: "center", valign: "center" });
        doc.rect(doc.page.width - 140, 122, 90, 90).lineWidth(1).strokeColor(GREEN).stroke();
      } catch (e) {
        console.error("photo error:", e);
      }
    }

    doc.font("Body-Bold").fontSize(20).fillColor("#111111").text(fullName, 50, doc.y, { width: 390 });
    doc.moveDown(0.8);
    if (photo && doc.y < 222) doc.y = 222;

    row(doc, "Role", user.role);
    row(doc, "Email", user.email);
    row(doc, "Phone", user.phone || "-");
    row(doc, "Account status", user.isActive ? "Active" : "Disabled");
    row(doc, "Registered", fmtDate(user.createdAt));

    const sp: any = user.studentProfile;
    if (sp) {
      doc.moveDown(0.5);
      doc.font("Body-Bold").fontSize(13).fillColor(GREEN).text("Student information", 50);
      doc.moveDown(0.5);
      row(doc, "Status", String(sp.status));
      row(doc, "Level", sp.level?.name || "-");
      row(doc, "Class", sp.class?.name || "-");
      row(doc, "Gender", sp.gender || "-");
      row(doc, "Date of birth", fmtDate(sp.dateOfBirth));
      row(doc, "Guardian", sp.guardianName || "-");
      row(doc, "Guardian phone", sp.guardianPhone || "-");
      row(
        doc,
        "Courses",
        sp.enrollments.length
          ? sp.enrollments.map((e: any) => e.course.title).join(", ")
          : "None yet"
      );
    }

    const tp: any = user.teacherProfile;
    if (tp || user.role === "TEACHER") {
      doc.moveDown(0.5);
      doc.font("Body-Bold").fontSize(13).fillColor(GREEN).text("Teacher information", 50);
      doc.moveDown(0.5);
      row(doc, "Specialization", tp?.specialization || "-");
      row(doc, "Qualification", tp?.qualification || "-");
      row(doc, "About", tp?.bio || "-");
      row(
        doc,
        "Courses taught",
        user.coursesTaught.length
          ? user.coursesTaught.map((c) => c.title).join(", ")
          : "None assigned"
      );
    }

    doc.moveDown(1);
    if (doc.y > doc.page.height - 190) doc.addPage();
    const qy = doc.page.height - 150;
    drawQr(
      doc,
      [
        "MAKNAZUL IRFAN ACADEMY",
        "PROFILE",
        `Name: ${fullName}`,
        `Role: ${user.role}`,
        `Email: ${user.email}`,
        user.studentProfile ? `Status: ${user.studentProfile.status}` : "",
        user.studentProfile ? `Courses: ${user.studentProfile.enrollments.length}` : "",
        `Generated: ${fmtDate(new Date())}`
      ].filter(Boolean).join("\n"),
      doc.page.width - 140,
      qy,
      84
    );
    doc.font("Body").fontSize(9).fillColor(GREY)
      .text(`Generated on ${fmtDate(new Date())}`, 50, qy + 70, { width: 300 });

    doc.end();
  } catch (error) {
    console.error("profilePdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the profile PDF.", 500);
  }
}

/* =========================================================
   RESULTS
========================================================= */

export async function resultsPdf(req: AuthenticatedRequest, res: Response) {
  try {
    const me = req.user!;
    const targetId = await resolveTargetUserId(req);

    if (!(await canViewStudent(req, targetId))) {
      return failure(res, "Access denied.", 403);
    }

    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { firstName: true, lastName: true, email: true }
    });
    if (!user) return failure(res, "Student not found.", 404);

    const attempts = await prisma.testAttempt.findMany({
      where: {
        studentId: targetId,
        status: "SUBMITTED",
        ...(me.role === "TEACHER" && me.id !== targetId
          ? { test: { course: { teacherId: me.id } } }
          : {})
      },
      orderBy: { submittedAt: "desc" },
      include: {
        test: {
          select: { title: true, passMark: true, course: { select: { title: true } } }
        }
      }
    });

    const fullName = `${user.firstName} ${user.lastName}`;
    const doc = startPdf(res, `Results_${fullName}`);
    letterhead(doc, "Examination Results");

    doc.font("Body-Bold").fontSize(16).fillColor("#111111").text(fullName, 50);
    doc.font("Body").fontSize(10).fillColor(GREY).text(user.email, 50);
    doc.moveDown(1);

    const cols = [
      { t: "Test", x: 50, w: 140 },
      { t: "Course", x: 195, w: 115 },
      { t: "Date", x: 315, w: 75 },
      { t: "Score", x: 392, w: 45 },
      { t: "Grade", x: 440, w: 45 },
      { t: "Result", x: 488, w: 62 }
    ];

    function header() {
      const y = doc.y;
      doc.rect(50, y - 3, 500, 18).fill(GREEN);
      doc.fillColor("#ffffff").font("Body-Bold").fontSize(9);
      cols.forEach((c) => {
        doc.text(c.t, c.x + 2, y, { width: c.w });
      });
      doc.y = y + 22;
    }

    if (!attempts.length) {
      doc.font("Body").fontSize(12).fillColor(GREY).text("No submitted tests yet.", 50);
    } else {
      header();
      let passed = 0;
      let totalPct = 0;
      attempts.forEach((a, i) => {
        if (doc.y > doc.page.height - 90) {
          doc.addPage();
          doc.y = 50;
          header();
        }
        const y = doc.y;
        if (i % 2 === 0) doc.rect(50, y - 3, 500, 18).fill("#f3f7f5");
        const pct = a.percentage !== null ? Number(a.percentage) : null;
        if (pct !== null) totalPct += pct;
        if (a.passed) passed++;
        doc.fillColor("#111111").font("Body").fontSize(9);
        doc.text(a.test.title, cols[0].x + 2, y, { width: cols[0].w - 4, height: 12, ellipsis: true });
        doc.text(a.test.course?.title || "-", cols[1].x + 2, y, { width: cols[1].w - 4, height: 12, ellipsis: true });
        doc.text(a.submittedAt ? new Date(a.submittedAt).toLocaleDateString("en-GB") : "-", cols[2].x + 2, y, { width: cols[2].w });
        doc.text(pct !== null ? `${pct.toFixed(0)}%` : "-", cols[3].x + 2, y, { width: cols[3].w });
        doc.text(a.grade || "-", cols[4].x + 2, y, { width: cols[4].w });
        doc.fillColor(a.passed ? "#176b3a" : "#a12626")
          .text(a.passed ? "Pass" : "Fail", cols[5].x + 2, y, { width: cols[5].w });
        doc.y = y + 20;
      });

      doc.moveDown(1);
      doc.x = 50;
      doc.font("Body-Bold").fontSize(11).fillColor(GREEN).text(
        `Tests taken: ${attempts.length}    Passed: ${passed}    Average: ${(totalPct / attempts.length).toFixed(1)}%`,
        50
      );
    }

    doc.moveDown(1);
    if (doc.y > doc.page.height - 190) doc.addPage();
    const qy = doc.page.height - 150;
    const avg = attempts.length
      ? (attempts.reduce((t, a) => t + (a.percentage !== null ? Number(a.percentage) : 0), 0) / attempts.length).toFixed(1)
      : "0";
    drawQr(
      doc,
      [
        "MAKNAZUL IRFAN ACADEMY",
        "EXAMINATION RESULTS",
        `Name: ${fullName}`,
        `Email: ${user.email}`,
        `Tests taken: ${attempts.length}`,
        `Passed: ${attempts.filter((a) => a.passed).length}`,
        `Average: ${avg}%`,
        attempts[0]
          ? `Latest: ${attempts[0].test.title} - ${attempts[0].percentage !== null ? Number(attempts[0].percentage).toFixed(0) + "%" : "-"}`
          : "",
        `Generated: ${fmtDate(new Date())}`
      ].filter(Boolean).join("\n"),
      doc.page.width - 140,
      qy,
      84
    );
    doc.font("Body").fontSize(9).fillColor(GREY)
      .text(`Generated on ${fmtDate(new Date())}`, 50, qy + 70, { width: 300 });
    doc.end();
  } catch (error) {
    console.error("resultsPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the results PDF.", 500);
  }
}

/* =========================================================
   ID CARD
========================================================= */

async function loadIdCard(req: AuthenticatedRequest) {
  const targetId = await resolveTargetUserId(req);
  if (!(await canViewStudent(req, targetId))) return { error: "Access denied.", code: 403 } as const;

  const user = await prisma.user.findUnique({
    where: { id: targetId },
    include: {
      studentProfile: {
        include: {
          level: { select: { name: true } },
          class: { select: { name: true } }
        }
      },
      teacherProfile: true
    }
  });
  if (!user) return { error: "User not found.", code: 404 } as const;

  const prefix = user.role === "TEACHER" ? "T" : user.role === "ADMIN" ? "A" : "S";
  const digest = crypto.createHash("sha1").update(user.id).digest("hex");
  const serial = String(parseInt(digest.slice(0, 8), 16) % 10000).padStart(4, "0");
  const year = new Date(user.createdAt).getFullYear();
  const sp: any = user.studentProfile;
  const tp: any = user.teacherProfile;

  const title =
    user.role === "TEACHER"
      ? "TEACHER IDENTITY CARD"
      : user.role === "ADMIN"
      ? "STAFF IDENTITY CARD"
      : "STUDENT IDENTITY CARD";

  const details: Array<[string, string]> = [];
  if (user.role === "STUDENT") {
    details.push(["LEVEL", sp?.level?.name || "-"]);
    details.push(["CLASS", sp?.class?.name || "-"]);
    details.push(["STATUS", sp?.status ? String(sp.status) : "-"]);
  } else if (user.role === "TEACHER") {
    details.push(["SPECIALIZATION", tp?.specialization || "-"]);
    details.push(["QUALIFICATION", tp?.qualification || "-"]);
  } else {
    details.push(["POSITION", "Administrator"]);
  }
  details.push(["EMAIL", user.email]);

  return {
    user,
    card: {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
      title,
      idNumber: `MIA-${prefix}-${year}-${serial}`,
      details,
      issued: fmtDate(user.createdAt)
    }
  } as const;
}

export async function idCardJson(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await loadIdCard(req);
    if ("error" in result) return failure(res, result.error, result.code);
    return res.json({ success: true, card: result.card });
  } catch (error) {
    console.error("idCardJson error:", error);
    return failure(res, "Unable to load the ID card.", 500);
  }
}

export async function idCardPdf(req: AuthenticatedRequest, res: Response) {
  try {
    const result = await loadIdCard(req);
    if ("error" in result) return failure(res, result.error, result.code);
    const { user, card } = result;

    const doc = startPdf(res, `ID_Card_${card.name}`);
    const pw = doc.page.width;
    const CW = 340;
    const CH = 214;
    const x = (pw - CW) / 2;

    doc.font("Body").fontSize(8).fillColor(GREY)
      .text("Identity card - print and cut along the outline. Front on top, back below.", 50, 36, {
        width: pw - 100,
        align: "center"
      });

    /* ---------------- FRONT ---------------- */
    const fy = 62;
    doc.roundedRect(x, fy, CW, CH, 10).fill(CREAM);
    doc.save();
    doc.roundedRect(x, fy, CW, CH, 10).clip();
    doc.rect(x, fy, CW, 56).fill(GREEN);
    doc.rect(x, fy + CH - 22, CW, 22).fill(GREEN);
    doc.restore();
    doc.lineWidth(1.4).strokeColor(GREEN).roundedRect(x, fy, CW, CH, 10).stroke();
    doc.lineWidth(0.6).strokeColor(GOLD).roundedRect(x + 4, fy + 4, CW - 8, CH - 8, 7).stroke();

    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.save();
        doc.circle(x + 30, fy + 28, 20).fill("#ffffff");
        doc.restore();
        doc.image(LOGO_PATH, x + 12, fy + 10, { fit: [36, 36] });
      }
    } catch {
      /* optional */
    }
    doc.fillColor("#ffffff").font("Serif-Bold").fontSize(13.5)
      .text("MAKNAZUL IRFAN ACADEMY", x + 56, fy + 14, { width: CW - 66 });
    doc.fillColor("#e6c85a").font("Body-Bold").fontSize(8.5)
      .text(card.title, x + 56, fy + 34, { width: CW - 66 });

    // photo
    const px = x + 14;
    const py = fy + 68;
    const photo = photoBuffer(user.avatar);
    doc.rect(px, py, 80, 96).fill("#e8efe9");
    if (photo) {
      try {
        doc.image(photo, px, py, { fit: [80, 96], align: "center", valign: "center" });
      } catch (e) {
        console.error("photo error:", e);
      }
    } else {
      const initials = `${user.firstName[0] || ""}${user.lastName[0] || ""}`.toUpperCase();
      doc.fillColor(GREEN).font("Serif-Bold").fontSize(30)
        .text(initials, px, py + 32, { width: 80, align: "center", lineBreak: false });
    }
    doc.lineWidth(1.2).strokeColor(GREEN).rect(px, py, 80, 96).stroke();

    // details
    const tx = x + 106;
    let ty = fy + 66;
    function field(label: string, value: string, big = false) {
      doc.font("Body-Bold").fontSize(6.5).fillColor(GREY).text(label, tx, ty, { width: CW - 118, lineBreak: false });
      doc.font(big ? "Serif-Bold" : "Body-Bold").fontSize(big ? 13 : 8.5).fillColor("#111111")
        .text(value, tx, ty + 8, { width: CW - 118, height: big ? 18 : 12, ellipsis: true });
      ty += big ? 30 : 21;
    }
    field("FULL NAME", card.name, true);
    field("ID NUMBER", card.idNumber);
    card.details.slice(0, 3).forEach(([l, v]) => field(l, v));

    doc.fillColor("#e6c85a").font("Body-Bold").fontSize(6.5)
      .text("KNOWLEDGE  •  FAITH  •  EXCELLENCE", x, fy + CH - 15, { width: CW, align: "center", lineBreak: false });

    /* ---------------- BACK ---------------- */
    const by = fy + CH + 40;
    doc.roundedRect(x, by, CW, CH, 10).fill(CREAM);
    doc.save();
    doc.roundedRect(x, by, CW, CH, 10).clip();
    doc.rect(x, by, CW, 44).fill(GREEN);
    doc.restore();
    doc.lineWidth(1.4).strokeColor(GREEN).roundedRect(x, by, CW, CH, 10).stroke();
    doc.lineWidth(0.6).strokeColor(GOLD).roundedRect(x + 4, by + 4, CW - 8, CH - 8, 7).stroke();

    doc.fillColor("#ffffff").font("Serif-Bold").fontSize(14)
      .text("MAKNAZUL IRFAN ACADEMY", x, by + 16, { width: CW, align: "center" });

    const site = baseUrl(req).replace(/^https?:\/\//, "");
    doc.fillColor("#222222").font("Body").fontSize(7.5);
    doc.text(`Web: ${site}`, x + 16, by + 54, { width: CW - 32 });
    doc.text(`Email: ${ACADEMY_EMAIL}`, x + 16, by + 66, { width: CW - 32 });
    doc.text("Address: Online Campus & Registered Offices", x + 16, by + 78, { width: CW - 32 });
    doc.text(`Phone: ${ACADEMY_PHONE}`, x + 16, by + 90, { width: CW - 32 });

    doc.fillColor(GREY).font("Body").fontSize(6)
      .text(
        "THIS CARD IS THE PROPERTY OF MAKNAZUL IRFAN ACADEMY. IT IS NON-TRANSFERABLE AND MUST BE " +
        "PRESENTED UPON REQUEST. IF FOUND, PLEASE RETURN IT TO THE ADDRESS ABOVE.",
        x + 16, by + 108, { width: CW - 32, align: "left", lineGap: 1 }
      );

    drawBarcode(doc, card.idNumber, x + 16, by + 150, 150, 26);
    doc.fillColor(GREY).font("Body").fontSize(6)
      .text("Library & Campus Access", x + 16, by + 192, { width: 150, align: "center", lineBreak: false });

    drawQr(
      doc,
      [
        "MAKNAZUL IRFAN ACADEMY",
        card.title,
        `ID: ${card.idNumber}`,
        `Name: ${card.name}`,
        `Role: ${card.role}`,
        `Issued: ${card.issued}`,
        `Web: ${baseUrl(req)}`
      ].join("\n"),
      x + CW - 16 - 58,
      by + 112,
      58
    );

    doc.end();
  } catch (error) {
    console.error("idCardPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the ID card PDF.", 500);
  }
}
