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
import { ensureMatricNumber } from "../services/matric.service";

const GREEN = "#064e3b";
const GOLD = "#b8932a";
const CREAM = "#fbf6e6";
const ACADEMY_EMAIL = "quadrishittu40@gmail.com";
const ACADEMY_PHONE = "0808 492 9862";
const GREY = "#555555";

const FONT_DIR = path.resolve(__dirname, "../../fonts");
const SIGNATURE_PATH = path.resolve(__dirname, "../../web/assets/signature.png");
const LETTER_DIR = path.resolve(__dirname, "../../web/assets/letter");
const SIGNATURE2_PATH = path.resolve(__dirname, "../../web/assets/signature2.png");
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
  const k = r / 70; // every measurement scales with the radius so the text never overlaps
  doc.save();
  doc.translate(cx, cy);
  doc.rotate(-12);
  doc.opacity(0.95);

  doc.lineWidth(3.4 * k).strokeColor(RED).circle(0, 0, r).stroke();
  doc.lineWidth(1.2 * k).strokeColor(RED).circle(0, 0, r - 6 * k).stroke();
  doc.lineWidth(1.2 * k).strokeColor(RED).circle(0, 0, r - 31 * k).stroke();

  const fs = 8.8 * k;
  const rt = r - 18.5 * k;
  doc.font("Body-Bold").fontSize(fs).fillColor(RED).lineWidth(0.45 * k).strokeColor(RED);

  function arc(text: string, top: boolean) {
    const chars = Array.from(text);
    const widths = chars.map((c) => doc.widthOfString(c) + 0.7 * k);
    const total = widths.reduce((a, b) => a + b, 0);
    const span = (total / rt) * (180 / Math.PI);
    let angle = top ? -span / 2 : span / 2;
    chars.forEach((ch, i) => {
      const step = (widths[i] / rt) * (180 / Math.PI);
      const mid = top ? angle + step / 2 : angle - step / 2;
      doc.save();
      doc.rotate(mid);
      const y = top ? -rt - fs * 0.5 : rt - fs * 0.62;
      doc.text(ch, -widths[i] / 2, y, { lineBreak: false, fill: true, stroke: true });
      doc.restore();
      angle = top ? angle + step : angle - step;
    });
  }

  arc("MAKNAZUL 'IRFAN ACADEMY", true);
  arc("ISLAMIC & ARABIC INSTITUTE", false);

  doc.font("Body-Bold").fontSize(16 * k).fillColor(RED).lineWidth(0.4 * k).strokeColor(RED)
    .text("\u2605", -9 * k, -r + 38 * k, { lineBreak: false, fill: true, stroke: true });
  doc.font("Body-Bold").fontSize(11.5 * k).fillColor(RED)
    .text("OFFICIAL", -r + 20 * k, -6 * k, { width: 2 * (r - 20 * k), align: "center", lineBreak: false, fill: true, stroke: true });
  doc.font("Body-Bold").fontSize(11.5 * k).fillColor(RED)
    .text("SEAL", -r + 20 * k, 8 * k, { width: 2 * (r - 20 * k), align: "center", lineBreak: false, fill: true, stroke: true });

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
  if (me.role === "PARENT") {
    const link = await prisma.parentLink.findFirst({
      where: { parentId: me.id, studentUserId },
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
      .text(`DATE: ${issued}`, 255, lineY + 20, { width: 200, align: "center", lineBreak: false });
    try {
      if (fs.existsSync(SIGNATURE_PATH)) {
        doc.image(SIGNATURE_PATH, 112, lineY - 46, { fit: [100, 44], align: "center", valign: "bottom" });
      }
      if (fs.existsSync(SIGNATURE2_PATH)) {
        doc.image(SIGNATURE2_PATH, 307, lineY - 46, { fit: [100, 44], align: "center", valign: "bottom" });
      }
    } catch {
      /* signature is optional */
    }
    doc.lineWidth(0.8).strokeColor(GREEN);
    doc.moveTo(80, lineY).lineTo(245, lineY).stroke();
    doc.moveTo(275, lineY).lineTo(440, lineY).stroke();
    doc.fillColor(GREY).font("Body-Bold").fontSize(9.5)
      .text("DIRECTOR", 80, lineY + 4, { width: 165, align: "center" });
    doc.text("PRINCIPAL", 275, lineY + 4, { width: 165, align: "center" });

    // barcode with the certificate number
    drawBarcode(doc, cert.certificateNumber, 80, h - 92, 200, 22);

    // official red seal
    drawStamp(doc, 545, h - 126, 70);

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
   PAYMENT RECEIPT
========================================================= */

type ReceiptData = {
  reference: string;
  name: string;
  email: string;
  purpose: string;
  method: string;
  amount: number;
  currency: string;
  paidAt: Date;
};

function renderReceipt(res: Response, d: ReceiptData) {
  const money = `${d.currency === "NGN" ? "NGN " : d.currency + " "}${d.amount.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const when = new Date(d.paidAt);
  const dateStr = when.toLocaleDateString("en-GB", { timeZone: "Africa/Lagos", day: "2-digit", month: "long", year: "numeric" });
  const timeStr = when.toLocaleTimeString("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true });
  const doc = startPdf(res, `Receipt_${d.reference}`);
  const w = doc.page.width;

  // faint logo watermark
  try {
    if (fs.existsSync(LOGO_PATH)) {
      doc.save();
      doc.opacity(0.07);
      doc.image(LOGO_PATH, w / 2 - 150, 250, { fit: [300, 300] });
      doc.restore();
    }
  } catch {
    /* optional */
  }

  letterhead(doc, "Official Payment Receipt");

  doc.font("Body").fontSize(9).fillColor(GREY).text("RECEIPT NO.", 50, 124);
  doc.font("Body-Bold").fontSize(12).fillColor("#111111").text(d.reference, 50, 137, { width: 230 });
  doc.font("Body").fontSize(9).fillColor(GREY).text("DATE", 300, 124);
  doc.font("Body-Bold").fontSize(12).fillColor("#111111").text(dateStr, 300, 137, { width: 150 });
  doc.font("Body").fontSize(9).fillColor(GREY).text("TIME (WAT)", 460, 124);
  doc.font("Body-Bold").fontSize(12).fillColor("#111111").text(timeStr, 460, 137, { width: 100 });

  const rows: Array<[string, string]> = [
    ["Received from", d.name],
    ["Email", d.email],
    ["Payment for", d.purpose],
    ["Payment method", d.method],
    ["Status", "PAID"]
  ];
  let y = 180;
  rows.forEach(([k, v], i) => {
    if (i % 2 === 0) doc.rect(50, y - 5, 500, 26).fill("#f3f7f5");
    doc.font("Body").fontSize(10).fillColor(GREY).text(k, 60, y, { width: 150 });
    doc.font("Body-Bold").fontSize(11).fillColor("#111111").text(v, 215, y, { width: 330 });
    y += 26;
  });

  doc.rect(50, y + 10, 500, 46).fill(GREEN);
  doc.font("Body-Bold").fontSize(12).fillColor("#ffffff").text("AMOUNT PAID", 66, y + 26);
  doc.font("Body-Bold").fontSize(20).fillColor("#ffffff")
    .text(money, 250, y + 20, { width: 290, align: "right" });

  const qy = y + 85;
  drawQr(
    doc,
    [
      "MAKNAZUL IRFAN ACADEMY",
      "PAYMENT RECEIPT",
      `Receipt No: ${d.reference}`,
      `Name: ${d.name}`,
      `For: ${d.purpose}`,
      `Amount: ${money}`,
      `Date: ${dateStr}`,
      `Time: ${timeStr} (WAT)`
    ].join("\n"),
    50,
    qy,
    92
  );

  drawBarcode(doc, d.reference, 165, qy, 230, 34);

  // signature: the academy's real signature, above the line
  const sy = qy + 128;
  let signed = false;
  try {
    if (fs.existsSync(SIGNATURE_PATH)) {
      doc.image(SIGNATURE_PATH, 190, sy - 62, { fit: [120, 60], align: "center", valign: "bottom" });
      signed = true;
    }
  } catch {
    /* fall back to the line only */
  }
  void signed;
  doc.lineWidth(0.8).strokeColor(GREEN).moveTo(160, sy).lineTo(340, sy).stroke();
  doc.font("Body-Bold").fontSize(9).fillColor(GREY)
    .text("AUTHORISED SIGNATURE", 160, sy + 4, { width: 180, align: "center" });
  doc.font("Body").fontSize(8).fillColor(GREY)
    .text("Bursar / Accounts Office", 160, sy + 16, { width: 180, align: "center" });

  drawStamp(doc, 470, qy + 52, 56);

  doc.font("Body").fontSize(8.5).fillColor(GREY)
    .text(`Issued on ${dateStr} at ${timeStr} (WAT). This receipt was generated electronically. Scan the QR code to see the payment details.`,
      50, sy + 52, { width: 500, align: "center" });
  doc.end();
}

export async function receiptPdf(req: AuthenticatedRequest, res: Response) {
  try {
    const me = req.user!;
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: {
        course: { select: { title: true } },
        student: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } }
      }
    });
    if (!payment) return failure(res, "Payment not found.", 404);
    if (me.role !== "ADMIN" && payment.student.user.id !== me.id) {
      return failure(res, "Access denied.", 403);
    }
    if (payment.status !== "PAID") {
      return failure(res, "A receipt is only available for paid payments.", 400);
    }
    const u = payment.student.user;
    renderReceipt(res, {
      reference: payment.reference,
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      purpose: payment.course?.title || "-",
      method: String(payment.provider).replace("_", " "),
      amount: Number(payment.amount),
      currency: payment.currency,
      paidAt: payment.updatedAt
    });
  } catch (error) {
    console.error("receiptPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the receipt.", 500);
  }
}

export async function admissionReceiptPdf(req: AuthenticatedRequest, res: Response) {
  try {
    const me = req.user!;
    const fee = await prisma.admissionFee.findUnique({
      where: { id: req.params.id },
      include: { student: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } }
    });
    if (!fee) return failure(res, "Payment not found.", 404);
    if (me.role !== "ADMIN" && fee.student.user.id !== me.id) return failure(res, "Access denied.", 403);
    if (fee.status !== "PAID") return failure(res, "A receipt is only available for paid fees.", 400);
    const u = fee.student.user;
    renderReceipt(res, {
      reference: fee.reference,
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      purpose: "Admission Fee",
      method: String(fee.provider).replace("_", " "),
      amount: Number(fee.amount),
      currency: fee.currency,
      paidAt: fee.paidAt || fee.updatedAt
    });
  } catch (error) {
    console.error("admissionReceiptPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the receipt.", 500);
  }
}

/* Receipt looked up by payment reference: used to offer an instant download after any payment */
export async function receiptByReferencePdf(req: AuthenticatedRequest, res: Response) {
  try {
    const me = req.user!;
    const reference = String(req.params.reference);
    const userSel = { select: { id: true, firstName: true, lastName: true, email: true } };

    const term = await prisma.termFee.findUnique({ where: { reference }, select: { id: true } });
    if (term) { req.params.id = term.id; return termFeeReceiptPdf(req, res); }

    const adm = await prisma.admissionFee.findUnique({ where: { reference }, select: { id: true } });
    if (adm) { req.params.id = adm.id; return admissionReceiptPdf(req, res); }

    const pay = await prisma.payment.findUnique({ where: { reference }, select: { id: true } });
    if (pay) { req.params.id = pay.id; return receiptPdf(req, res); }

    const exam = await prisma.examRegistration.findUnique({
      where: { reference },
      include: {
        examSession: { select: { title: true } },
        student: { include: { user: userSel } }
      }
    });
    if (exam) {
      if (me.role !== "ADMIN" && exam.student.user.id !== me.id) return failure(res, "Access denied.", 403);
      if (exam.status !== "PAID") return failure(res, "A receipt is only available for paid fees.", 400);
      const u = exam.student.user;
      return renderReceipt(res, {
        reference: exam.reference,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        purpose: `Exam Registration - ${exam.examSession.title}`,
        method: String(exam.provider).replace("_", " "),
        amount: Number(exam.amount),
        currency: "NGN",
        paidAt: exam.paidAt || exam.createdAt
      });
    }
    return failure(res, "Payment not found.", 404);
  } catch (error) {
    console.error("receiptByReferencePdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the receipt.", 500);
  }
}

export async function termFeeReceiptPdf(req: AuthenticatedRequest, res: Response) {
  try {
    const me = req.user!;
    const fee = await prisma.termFee.findUnique({
      where: { id: String(req.params.id) },
      include: { student: { include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } } } }
    });
    if (!fee) return failure(res, "Payment not found.", 404);
    if (me.role !== "ADMIN" && fee.student.user.id !== me.id) return failure(res, "Access denied.", 403);
    if (fee.status !== "PAID") return failure(res, "A receipt is only available for paid fees.", 400);
    const u = fee.student.user;
    const m = /^(\d{4})-Q([1-4])$/.exec(fee.period);
    const label = m ? `Quarterly Fee - Quarter ${m[2]}, ${m[1]}` : "Quarterly Fee";
    renderReceipt(res, {
      reference: fee.reference,
      name: `${u.firstName} ${u.lastName}`.trim(),
      email: u.email,
      purpose: label,
      method: String(fee.provider).replace("_", " "),
      amount: Number(fee.amount),
      currency: "NGN",
      paidAt: fee.paidAt || fee.updatedAt
    });
  } catch (error) {
    console.error("termFeeReceiptPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the receipt.", 500);
  }
}

/* =========================================================
   REPORT CARD
========================================================= */

function gradeFor(pct: number): string {
  if (pct >= 70) return "A";
  if (pct >= 60) return "B";
  if (pct >= 50) return "C";
  if (pct >= 40) return "D";
  if (pct >= 30) return "E";
  return "F";
}

function remarkFor(pct: number, hasData: boolean): string {
  if (!hasData) return "No examination has been taken yet. Please take the available tests to receive a report.";
  if (pct >= 70) return "Excellent performance. Keep up the dedication and continue striving for excellence.";
  if (pct >= 60) return "Very good performance. A little more effort will lead to excellent results.";
  if (pct >= 50) return "Good effort. Regular revision and attending lectures will improve the results.";
  if (pct >= 40) return "Fair performance. More study time and class participation are needed.";
  return "Performance is below the expected level. Please seek help from your teachers and revise regularly.";
}

export async function reportCardPdf(req: AuthenticatedRequest, res: Response) {
  try {
    const me = req.user!;
    const targetId = await resolveTargetUserId(req);
    if (!(await canViewStudent(req, targetId))) return failure(res, "Access denied.", 403);

    const loaded = await loadIdCard(req);
    if ("error" in loaded) return failure(res, loaded.error, loaded.code);
    const { user, card } = loaded;
    if (user.role !== "STUDENT") return failure(res, "Report cards are for students only.", 400);
    const sp: any = user.studentProfile;

    const attempts = await prisma.testAttempt.findMany({
      where: {
        studentId: targetId,
        status: "SUBMITTED",
        ...(me.role === "TEACHER" && me.id !== targetId ? { test: { course: { teacherId: me.id } } } : {})
      },
      include: { test: { select: { courseId: true, course: { select: { title: true } } } } }
    });

    const byCourse = new Map<string, { title: string; pcts: number[]; passed: number }>();
    attempts.forEach((a) => {
      const key = a.test.courseId || "none";
      const entry = byCourse.get(key) || { title: a.test.course?.title || "General", pcts: [], passed: 0 };
      entry.pcts.push(a.percentage !== null ? Number(a.percentage) : 0);
      if (a.passed) entry.passed++;
      byCourse.set(key, entry);
    });
    const positions = new Map<string, string>();
    for (const cid of Array.from(byCourse.keys()).slice(0, 8)) {
      if (cid === "none") continue;
      try {
        const cs = await courseStats(cid);
        const mine = cs.rows.find((r) => r.userId === targetId);
        if (mine && mine.position) positions.set(cid, `${ordinal(mine.position)} of ${cs.withResults}`);
      } catch {
        /* position is optional */
      }
    }
    const rows = Array.from(byCourse.entries()).map(([cid, c]) => {
      const avg = c.pcts.reduce((t, n) => t + n, 0) / c.pcts.length;
      return { title: c.title, taken: c.pcts.length, avg, best: Math.max(...c.pcts), passed: c.passed, grade: gradeFor(avg), position: positions.get(cid) || "-" };
    });
    const overall = attempts.length
      ? attempts.reduce((t, a) => t + (a.percentage !== null ? Number(a.percentage) : 0), 0) / attempts.length
      : 0;

    // live class attendance for the student's enrolled courses
    let attendedCount = 0;
    let heldCount = 0;
    if (sp?.id) {
      const enrolled = await prisma.courseEnrollment.findMany({ where: { studentId: sp.id }, select: { courseId: true } });
      const courseIds = enrolled.map((e) => e.courseId);
      if (courseIds.length) {
        const held = await prisma.liveClass.findMany({
          where: { courseId: { in: courseIds }, published: true, scheduledStart: { lt: new Date() } },
          select: { id: true }
        });
        heldCount = held.length;
        if (heldCount) {
          attendedCount = await prisma.liveAttendance.count({
            where: { userId: targetId, liveClassId: { in: held.map((h) => h.id) } }
          });
        }
      }
    }
    const attendPct = heldCount ? (attendedCount / heldCount) * 100 : null;

    const doc = startPdf(res, `Report_Card_${card.name}`);
    const w = doc.page.width;
    const h = doc.page.height;
    letterhead(doc, "Student Report Card");

    // faint watermark
    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.save();
        doc.opacity(0.06);
        doc.image(LOGO_PATH, w / 2 - 150, 280, { fit: [300, 300] });
        doc.restore();
      }
    } catch {
      /* optional */
    }

    // student block
    const photo = photoBuffer(user.avatar);
    const px = w - 50 - 78;
    const py = 122;
    doc.rect(px, py, 78, 94).fill("#e8efe9");
    if (photo) {
      try {
        doc.image(photo, px, py, { fit: [78, 94], align: "center", valign: "center" });
      } catch {
        /* ignore */
      }
    } else {
      const ini = `${user.firstName[0] || ""}${user.lastName[0] || ""}`.toUpperCase();
      doc.fillColor(GREEN).font("Serif-Bold").fontSize(28).text(ini, px, py + 30, { width: 78, align: "center", lineBreak: false });
    }
    doc.lineWidth(1.2).strokeColor(GREEN).rect(px, py, 78, 94).stroke();

    doc.font("Serif-Bold").fontSize(20).fillColor("#111111").text(card.name, 50, 124, { width: 400 });
    let iy = 154;
    const info: Array<[string, string]> = [
      ["Student ID", card.idNumber],
      ["Level", sp?.level?.name || "-"],
      ["Class", sp?.class?.name || "-"],
      ["Status", sp?.status ? String(sp.status) : "-"],
      ["Date issued", fmtDate(new Date())]
    ];
    info.forEach(([k, v]) => {
      doc.font("Body").fontSize(9.5).fillColor(GREY).text(k, 50, iy, { width: 90, lineBreak: false });
      doc.font("Body-Bold").fontSize(10.5).fillColor("#111111").text(v, 145, iy, { width: 300, lineBreak: false });
      iy += 15;
    });

    // summary boxes
    const by = 236;
    const boxes: Array<[string, string]> = [
      ["COURSES", String(rows.length)],
      ["TESTS TAKEN", String(attempts.length)],
      ["AVERAGE", attempts.length ? `${overall.toFixed(1)}%` : "-"],
      ["OVERALL GRADE", attempts.length ? gradeFor(overall) : "-"],
      ["ATTENDANCE", attendPct === null ? "-" : `${attendPct.toFixed(0)}%`]
    ];
    const bw = (w - 100 - 4 * 8) / 5;
    boxes.forEach(([k, v], i) => {
      const bx = 50 + i * (bw + 8);
      doc.roundedRect(bx, by, bw, 50, 6).fill(i === 3 ? GREEN : "#f3f7f5");
      doc.fillColor(i === 3 ? "#e6c85a" : GREY).font("Body-Bold").fontSize(7.5).text(k, bx, by + 9, { width: bw, align: "center", lineBreak: false });
      doc.fillColor(i === 3 ? "#ffffff" : GREEN).font("Serif-Bold").fontSize(19).text(v, bx, by + 22, { width: bw, align: "center", lineBreak: false });
    });

    // course results table
    let y = by + 72;
    doc.font("Body-Bold").fontSize(11).fillColor(GREEN).text("ACADEMIC RESULTS BY COURSE", 50, y);
    y += 20;
    const cols = [
      { t: "Course", x: 50, w: 170 },
      { t: "Tests", x: 222, w: 38 },
      { t: "Average", x: 262, w: 58 },
      { t: "Best", x: 322, w: 46 },
      { t: "Passed", x: 370, w: 50 },
      { t: "Grade", x: 422, w: 44 },
      { t: "Position", x: 468, w: 82 }
    ];
    doc.rect(50, y - 3, 500, 18).fill(GREEN);
    doc.fillColor("#ffffff").font("Body-Bold").fontSize(9);
    cols.forEach((c) => doc.text(c.t, c.x + 3, y, { width: c.w, lineBreak: false }));
    y += 22;
    if (!rows.length) {
      doc.font("Body").fontSize(10).fillColor(GREY).text("No submitted tests yet.", 53, y);
      y += 20;
    }
    rows.slice(0, 8).forEach((r, i) => {
      if (i % 2 === 0) doc.rect(50, y - 3, 500, 18).fill("#f3f7f5");
      doc.fillColor("#111111").font("Body").fontSize(9);
      doc.text(r.title, cols[0].x + 3, y, { width: cols[0].w - 6, height: 12, ellipsis: true, lineBreak: false });
      doc.text(String(r.taken), cols[1].x + 3, y, { width: cols[1].w, lineBreak: false });
      doc.text(`${r.avg.toFixed(1)}%`, cols[2].x + 3, y, { width: cols[2].w, lineBreak: false });
      doc.text(`${r.best.toFixed(0)}%`, cols[3].x + 3, y, { width: cols[3].w, lineBreak: false });
      doc.text(`${r.passed}/${r.taken}`, cols[4].x + 3, y, { width: cols[4].w, lineBreak: false });
      doc.font("Body-Bold").fillColor(r.grade === "F" || r.grade === "E" ? "#a12626" : "#176b3a")
        .text(r.grade, cols[5].x + 3, y, { width: cols[5].w, lineBreak: false });
      doc.font("Body").fillColor("#111111")
        .text(r.position, cols[6].x + 3, y, { width: cols[6].w, lineBreak: false });
      y += 20;
    });

    // attendance line
    y += 10;
    doc.font("Body-Bold").fontSize(11).fillColor(GREEN).text("LIVE CLASS ATTENDANCE", 50, y);
    doc.font("Body").fontSize(10).fillColor("#111111").text(
      heldCount
        ? `Attended ${attendedCount} of ${heldCount} live classes held (${attendPct!.toFixed(0)}%).`
        : "No live classes have been held for the courses this student is enrolled in.",
      50, y + 16, { width: 500 }
    );
    y += 44;

    // remark box
    doc.font("Body-Bold").fontSize(11).fillColor(GREEN).text("REMARK", 50, y);
    doc.roundedRect(50, y + 16, 500, 44, 6).lineWidth(0.8).strokeColor(GOLD).stroke();
    doc.font("Body").fontSize(10).fillColor("#111111")
      .text(remarkFor(overall, attempts.length > 0), 60, y + 26, { width: 480 });

    // footer: QR, barcode, signatures, seal
    const fy = h - 212;
    doc.lineWidth(0.8).strokeColor(GREEN).moveTo(50, fy - 6).lineTo(w - 50, fy - 6).stroke();

    drawQr(
      doc,
      [
        "MAKNAZUL IRFAN ACADEMY",
        "STUDENT REPORT CARD",
        `ID: ${card.idNumber}`,
        `Name: ${card.name}`,
        `Level: ${sp?.level?.name || "-"}`,
        `Tests: ${attempts.length}   Average: ${attempts.length ? overall.toFixed(1) + "%" : "-"}`,
        `Attendance: ${attendPct === null ? "-" : attendPct.toFixed(0) + "%"}`,
        `Issued: ${fmtDate(new Date())}`
      ].join("\n"),
      50,
      fy + 4,
      84
    );
    drawBarcode(doc, card.idNumber, 50, fy + 118, 160, 26);

    // class teacher line
    doc.lineWidth(0.8).strokeColor(GREEN);
    doc.moveTo(215, fy + 72).lineTo(335, fy + 72).stroke();
    doc.fillColor(GREY).font("Body-Bold").fontSize(8.5).text("CLASS TEACHER", 215, fy + 76, { width: 120, align: "center", lineBreak: false });

    // principal signature
    try {
      if (fs.existsSync(SIGNATURE2_PATH)) {
        doc.image(SIGNATURE2_PATH, 235, fy + 128 - 4, { fit: [90, 34], align: "center", valign: "bottom" });
      }
    } catch {
      /* optional */
    }
    doc.moveTo(215, fy + 166).lineTo(335, fy + 166).stroke();
    doc.fillColor(GREY).font("Body-Bold").fontSize(8.5).text("PRINCIPAL", 215, fy + 170, { width: 120, align: "center", lineBreak: false });

    drawStamp(doc, w - 120, fy + 92, 56);

    doc.font("Body").fontSize(7.5).fillColor(GREY).text(
      "Grade scale: A 70-100   B 60-69   C 50-59   D 40-49   E 30-39   F below 30.  Attendance counts live classes joined through the portal.",
      50, h - 40, { width: w - 100, align: "center" }
    );
    doc.end();
  } catch (error) {
    console.error("reportCardPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the report card.", 500);
  }
}

/* =========================================================
   COURSE RESULT SHEET, PERFORMANCE SUMMARY, RANKING
========================================================= */

function ordinal(n: number): string {
  const v = n % 100;
  if (v >= 11 && v <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10 > 3 ? 0 : n % 10]}`;
}

async function courseStats(courseId: string) {
  const [enrol, attempts] = await Promise.all([
    prisma.courseEnrollment.findMany({
      where: { courseId },
      include: { student: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } }
    }),
    prisma.testAttempt.findMany({
      where: { status: "SUBMITTED", test: { courseId } },
      select: { studentId: true, percentage: true, passed: true }
    })
  ]);
  const per = new Map<string, { pcts: number[]; passed: number }>();
  attempts.forEach((a) => {
    const e = per.get(a.studentId) || { pcts: [], passed: 0 };
    e.pcts.push(a.percentage !== null ? Number(a.percentage) : 0);
    if (a.passed) e.passed++;
    per.set(a.studentId, e);
  });
  const rows = enrol.map((en) => {
    const u = en.student.user;
    const p = per.get(u.id);
    const avg = p ? p.pcts.reduce((t, n) => t + n, 0) / p.pcts.length : null;
    return {
      userId: u.id,
      name: `${u.firstName} ${u.lastName}`.trim(),
      taken: p ? p.pcts.length : 0,
      avg,
      best: p ? Math.max(...p.pcts) : null,
      passed: p ? p.passed : 0,
      grade: avg === null ? "-" : gradeFor(avg),
      position: 0
    };
  });
  const ranked = rows.filter((r) => r.avg !== null).sort((a, b) => (b.avg as number) - (a.avg as number));
  ranked.forEach((r, i) => {
    r.position = i > 0 && Math.abs((ranked[i - 1].avg as number) - (r.avg as number)) < 0.005 ? ranked[i - 1].position : i + 1;
  });
  const sorted = [...ranked, ...rows.filter((r) => r.avg === null).sort((a, b) => a.name.localeCompare(b.name))];
  const totalAttempts = attempts.length;
  const passedAttempts = attempts.filter((a) => a.passed).length;
  return {
    rows: sorted,
    enrolled: rows.length,
    withResults: ranked.length,
    classAvg: ranked.length ? ranked.reduce((t, r) => t + (r.avg as number), 0) / ranked.length : null,
    passRate: totalAttempts ? (passedAttempts / totalAttempts) * 100 : null,
    highest: ranked.length ? (ranked[0].avg as number) : null,
    lowest: ranked.length ? (ranked[ranked.length - 1].avg as number) : null,
    totalAttempts
  };
}

function summaryBoxes(doc: any, y: number, items: Array<[string, string]>) {
  const w = doc.page.width;
  const bw = (w - 100 - (items.length - 1) * 8) / items.length;
  items.forEach(([k, v], i) => {
    const bx = 50 + i * (bw + 8);
    doc.roundedRect(bx, y, bw, 48, 6).fill("#f3f7f5");
    doc.fillColor(GREY).font("Body-Bold").fontSize(7.5).text(k, bx, y + 9, { width: bw, align: "center", lineBreak: false });
    doc.fillColor(GREEN).font("Serif-Bold").fontSize(17).text(v, bx, y + 22, { width: bw, align: "center", lineBreak: false });
  });
}

function sheetSignatures(doc: any, leftLabel: string) {
  const w = doc.page.width;
  const h = doc.page.height;
  if (doc.y > h - 190) {
    doc.addPage();
    doc.y = 60;
  }
  const y = Math.max(doc.y + 40, h - 170);
  doc.lineWidth(0.8).strokeColor(GREEN);
  doc.moveTo(60, y).lineTo(210, y).stroke();
  doc.moveTo(w - 260, y).lineTo(w - 110, y).stroke();
  doc.fillColor(GREY).font("Body-Bold").fontSize(9)
    .text(leftLabel, 60, y + 4, { width: 150, align: "center", lineBreak: false })
    .text("PRINCIPAL", w - 260, y + 4, { width: 150, align: "center", lineBreak: false });
  try {
    if (fs.existsSync(SIGNATURE2_PATH)) {
      doc.image(SIGNATURE2_PATH, w - 240, y - 40, { fit: [110, 38], align: "center", valign: "bottom" });
    }
  } catch {
    /* optional */
  }
  drawStamp(doc, w / 2, y - 6, 48);
}

export async function courseResultSheetPdf(req: AuthenticatedRequest, res: Response) {
  try {
    const me = req.user!;
    const course = await prisma.course.findUnique({
      where: { id: req.params.courseId },
      include: { teacher: { select: { firstName: true, lastName: true } } }
    });
    if (!course) return failure(res, "Course not found.", 404);
    if (me.role !== "ADMIN" && !(me.role === "TEACHER" && course.teacherId === me.id)) {
      return failure(res, "Access denied.", 403);
    }
    const st = await courseStats(course.id);

    const doc = startPdf(res, `Result_Sheet_${course.title}`);
    const w = doc.page.width;
    letterhead(doc, "Course Result Sheet");

    doc.font("Serif-Bold").fontSize(18).fillColor("#111111").text(course.title, 50, 122, { width: w - 100 });
    doc.font("Body").fontSize(10).fillColor(GREY).text(
      `Teacher: ${course.teacher ? `${course.teacher.firstName} ${course.teacher.lastName}` : "-"}     Date: ${fmtDate(new Date())}`,
      50, doc.y + 2, { width: w - 100 }
    );

    summaryBoxes(doc, doc.y + 12, [
      ["ENROLLED", String(st.enrolled)],
      ["TOOK TESTS", String(st.withResults)],
      ["CLASS AVERAGE", st.classAvg === null ? "-" : `${st.classAvg.toFixed(1)}%`],
      ["PASS RATE", st.passRate === null ? "-" : `${st.passRate.toFixed(0)}%`],
      ["HIGHEST", st.highest === null ? "-" : `${st.highest.toFixed(0)}%`]
    ]);
    doc.y += 68;

    const cols = [
      { t: "Pos", x: 50, w: 36 },
      { t: "Student", x: 88, w: 190 },
      { t: "Tests", x: 280, w: 44 },
      { t: "Average", x: 326, w: 62 },
      { t: "Best", x: 390, w: 52 },
      { t: "Passed", x: 444, w: 54 },
      { t: "Grade", x: 500, w: 50 }
    ];
    function header() {
      const y = doc.y;
      doc.rect(50, y - 3, 500, 18).fill(GREEN);
      doc.fillColor("#ffffff").font("Body-Bold").fontSize(9);
      cols.forEach((c) => doc.text(c.t, c.x + 3, y, { width: c.w, lineBreak: false }));
      doc.y = y + 22;
    }
    header();
    if (!st.rows.length) {
      doc.font("Body").fontSize(10).fillColor(GREY).text("No students are enrolled in this course.", 53, doc.y);
    }
    st.rows.forEach((r, i) => {
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
        doc.y = 60;
        header();
      }
      const y = doc.y;
      if (i % 2 === 0) doc.rect(50, y - 3, 500, 18).fill("#f3f7f5");
      doc.fillColor("#111111").font("Body").fontSize(9);
      doc.text(r.position ? ordinal(r.position) : "-", cols[0].x + 3, y, { width: cols[0].w, lineBreak: false });
      doc.text(r.name, cols[1].x + 3, y, { width: cols[1].w - 6, height: 12, ellipsis: true, lineBreak: false });
      doc.text(String(r.taken), cols[2].x + 3, y, { width: cols[2].w, lineBreak: false });
      doc.text(r.avg === null ? "-" : `${r.avg.toFixed(1)}%`, cols[3].x + 3, y, { width: cols[3].w, lineBreak: false });
      doc.text(r.best === null ? "-" : `${r.best.toFixed(0)}%`, cols[4].x + 3, y, { width: cols[4].w, lineBreak: false });
      doc.text(r.taken ? `${r.passed}/${r.taken}` : "-", cols[5].x + 3, y, { width: cols[5].w, lineBreak: false });
      doc.font("Body-Bold").fillColor(r.grade === "F" || r.grade === "E" ? "#a12626" : "#176b3a")
        .text(r.grade, cols[6].x + 3, y, { width: cols[6].w, lineBreak: false });
      doc.y = y + 20;
    });

    sheetSignatures(doc, "COURSE TEACHER");
    doc.font("Body").fontSize(7.5).fillColor(GREY).text(
      "Position is by average score across submitted tests. Grade scale: A 70-100  B 60-69  C 50-59  D 40-49  E 30-39  F below 30.",
      50, doc.page.height - 40, { width: w - 100, align: "center" }
    );
    doc.end();
  } catch (error) {
    console.error("courseResultSheetPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the result sheet.", 500);
  }
}

export async function performanceSummaryPdf(req: AuthenticatedRequest, res: Response) {
  try {
    if (req.user!.role !== "ADMIN") return failure(res, "Access denied.", 403);
    const courses = await prisma.course.findMany({
      orderBy: { title: "asc" },
      include: { teacher: { select: { firstName: true, lastName: true } } }
    });
    const stats = [] as Array<{ title: string; teacher: string; st: Awaited<ReturnType<typeof courseStats>> }>;
    for (const c of courses) {
      stats.push({
        title: c.title,
        teacher: c.teacher ? `${c.teacher.firstName} ${c.teacher.lastName}` : "-",
        st: await courseStats(c.id)
      });
    }

    // top students overall
    const grouped = await prisma.testAttempt.groupBy({
      by: ["studentId"],
      where: { status: "SUBMITTED" },
      _avg: { percentage: true },
      _count: { _all: true }
    });
    const topRaw = grouped
      .filter((g) => g._avg.percentage !== null)
      .sort((a, b) => Number(b._avg.percentage) - Number(a._avg.percentage))
      .slice(0, 10);
    const names = await prisma.user.findMany({
      where: { id: { in: topRaw.map((g) => g.studentId) } },
      select: { id: true, firstName: true, lastName: true }
    });
    const nameOf = new Map(names.map((n) => [n.id, `${n.firstName} ${n.lastName}`.trim()]));

    const totalStudents = await prisma.studentProfile.count();
    const totalAttempts = stats.reduce((t, c) => t + c.st.totalAttempts, 0);
    const avgs = stats.filter((c) => c.st.classAvg !== null);
    const overallAvg = avgs.length ? avgs.reduce((t, c) => t + (c.st.classAvg as number), 0) / avgs.length : null;

    const doc = startPdf(res, "Performance_Summary");
    const w = doc.page.width;
    letterhead(doc, "Academy Performance Summary");
    doc.font("Body").fontSize(10).fillColor(GREY).text(`Date: ${fmtDate(new Date())}`, 50, 122);

    summaryBoxes(doc, 142, [
      ["STUDENTS", String(totalStudents)],
      ["COURSES", String(courses.length)],
      ["TESTS TAKEN", String(totalAttempts)],
      ["AVERAGE SCORE", overallAvg === null ? "-" : `${overallAvg.toFixed(1)}%`]
    ]);
    doc.y = 208;

    doc.font("Body-Bold").fontSize(11).fillColor(GREEN).text("PERFORMANCE BY COURSE", 50, doc.y);
    doc.y += 8;
    const cols = [
      { t: "Course", x: 50, w: 170 },
      { t: "Teacher", x: 222, w: 110 },
      { t: "Enrolled", x: 334, w: 50 },
      { t: "Tests", x: 386, w: 40 },
      { t: "Average", x: 428, w: 58 },
      { t: "Pass rate", x: 488, w: 62 }
    ];
    function header() {
      const y = doc.y + 6;
      doc.rect(50, y - 3, 500, 18).fill(GREEN);
      doc.fillColor("#ffffff").font("Body-Bold").fontSize(9);
      cols.forEach((c) => doc.text(c.t, c.x + 3, y, { width: c.w, lineBreak: false }));
      doc.y = y + 22;
    }
    header();
    stats.forEach((c, i) => {
      if (doc.y > doc.page.height - 120) {
        doc.addPage();
        doc.y = 50;
        header();
      }
      const y = doc.y;
      if (i % 2 === 0) doc.rect(50, y - 3, 500, 18).fill("#f3f7f5");
      doc.fillColor("#111111").font("Body").fontSize(9);
      doc.text(c.title, cols[0].x + 3, y, { width: cols[0].w - 6, height: 12, ellipsis: true, lineBreak: false });
      doc.text(c.teacher, cols[1].x + 3, y, { width: cols[1].w - 6, height: 12, ellipsis: true, lineBreak: false });
      doc.text(String(c.st.enrolled), cols[2].x + 3, y, { width: cols[2].w, lineBreak: false });
      doc.text(String(c.st.totalAttempts), cols[3].x + 3, y, { width: cols[3].w, lineBreak: false });
      doc.text(c.st.classAvg === null ? "-" : `${c.st.classAvg.toFixed(1)}%`, cols[4].x + 3, y, { width: cols[4].w, lineBreak: false });
      doc.text(c.st.passRate === null ? "-" : `${c.st.passRate.toFixed(0)}%`, cols[5].x + 3, y, { width: cols[5].w, lineBreak: false });
      doc.y = y + 20;
    });
    if (!stats.length) doc.font("Body").fontSize(10).fillColor(GREY).text("No courses yet.", 53, doc.y);

    if (doc.y > doc.page.height - 260) {
      doc.addPage();
      doc.y = 50;
    }
    doc.y += 14;
    doc.font("Body-Bold").fontSize(11).fillColor(GREEN).text("TOP STUDENTS (OVERALL AVERAGE)", 50, doc.y);
    doc.y += 8;
    const y0 = doc.y + 6;
    doc.rect(50, y0 - 3, 500, 18).fill(GREEN);
    doc.fillColor("#ffffff").font("Body-Bold").fontSize(9)
      .text("Pos", 53, y0, { width: 36, lineBreak: false })
      .text("Student", 92, y0, { width: 260, lineBreak: false })
      .text("Tests", 380, y0, { width: 50, lineBreak: false })
      .text("Average", 450, y0, { width: 90, lineBreak: false });
    doc.y = y0 + 22;
    if (!topRaw.length) doc.font("Body").fontSize(10).fillColor(GREY).text("No submitted tests yet.", 53, doc.y);
    topRaw.forEach((g, i) => {
      const y = doc.y;
      if (i % 2 === 0) doc.rect(50, y - 3, 500, 18).fill("#f3f7f5");
      doc.fillColor("#111111").font("Body").fontSize(9)
        .text(ordinal(i + 1), 53, y, { width: 36, lineBreak: false })
        .text(nameOf.get(g.studentId) || "-", 92, y, { width: 260, lineBreak: false })
        .text(String(g._count._all), 380, y, { width: 50, lineBreak: false })
        .text(`${Number(g._avg.percentage).toFixed(1)}%`, 450, y, { width: 90, lineBreak: false });
      doc.y = y + 20;
    });

    sheetSignatures(doc, "REGISTRAR");
    doc.end();
  } catch (error) {
    console.error("performanceSummaryPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the performance summary.", 500);
  }
}

/* =========================================================
   ADMISSION LETTER, SCHEME OF WORK, ACADEMIC CALENDAR
========================================================= */

function longDate(d: Date): string {
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "Africa/Lagos" });
}

export async function admissionLetterPdf(req: AuthenticatedRequest, res: Response) {
  try {
    const me = req.user!;
    const targetId = await resolveTargetUserId(req);
    if (!(await canViewStudent(req, targetId))) return failure(res, "Access denied.", 403);
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      include: {
        studentProfile: { include: { level: true, class: true, admissionFee: { select: { status: true, paidAt: true } } } }
      }
    });
    if (!user || !user.studentProfile) return failure(res, "Student not found.", 404);
    const sp = user.studentProfile;
    if (me.role !== "ADMIN" && !["APPROVED", "ENROLLED", "GRADUATED"].includes(sp.status)) {
      return failure(res, "Your admission letter is available after your admission has been approved.", 403);
    }

    let matric: string | null = sp.matricNumber || null;
    if (!matric && ["APPROVED", "ENROLLED", "GRADUATED"].includes(sp.status)) {
      try {
        matric = await ensureMatricNumber(sp.id, { announce: false });
      } catch {
        /* optional */
      }
    }

    const now = new Date();
    const events = await prisma.calendarEvent.findMany({ orderBy: { startDate: "asc" } });
    const upcoming = events.filter((e) => e.startDate >= new Date(now.getTime() - 86400000));
    const resumption = upcoming.find((e) => e.type === "RESUMPTION") || null;
    const sessionName = resumption ? resumption.session : events.length ? events[events.length - 1].session : "";
    const fullName = `${user.firstName} ${user.lastName}`.trim();
    const ref = `MIA/ADM/${now.getFullYear()}/${sp.id.slice(-6).toUpperCase()}`;

    const doc = startPdf(res, `Admission_Letter_${fullName}`);
    const w = doc.page.width;
    const H = doc.page.height;
    const k = w / 1122; // scale of the designed artwork
    const CREAM = "#FDF9EC";
    const art = (name: string) => path.join(LETTER_DIR, name);

    // paper
    doc.rect(0, 0, w, H).fill(CREAM);
    const headerH = 305 * k;
    const titleH = 95 * k;
    const footerH = 362 * k;
    const footerY = H - footerH;
    try {
      doc.image(art("header.jpg"), 0, 0, { width: w });
      doc.image(art("title.jpg"), 0, headerH, { width: w });
      doc.image(art("footer.jpg"), 0, footerY, { width: w });
    } catch (e) {
      console.error("admission letter artwork missing:", e);
    }

    const L = 50;
    const R = w - 50;
    const W = R - L;
    let y = headerH + titleH + 6;

    // reference and date
    doc.font("Serif").fontSize(10.5).fillColor("#111111")
      .text(`Ref. No.: ${ref}`, L, y, { width: W / 2, lineBreak: false })
      .text(`Date: ${longDate(now)}`, L + W / 2, y, { width: W / 2, align: "right", lineBreak: false });
    y += 24;

    doc.font("Serif-Bold").fontSize(13).fillColor("#111111")
      .text(`Dear ${fullName},`, L, y, { width: W, lineBreak: false });
    y += 24;

    doc.font("Serif-Bold").fontSize(30).fillColor(GREEN)
      .text("Congratulations!", L, y, { width: W, align: "center", lineBreak: false });
    y += 38;
    doc.lineWidth(2).strokeColor(GOLD).moveTo(w / 2 - 90, y).lineTo(w / 2 + 90, y).stroke();
    y += 12;

    doc.font("Serif").fontSize(11.5).fillColor("#111111")
      .text("We are pleased to inform you that you have been officially admitted into", L, y, { width: W, align: "center", lineBreak: false });
    y += 17;
    const segs: Array<{ t: string; f: string; c: string }> = [
      { t: "Maknazul \u2019Irfan Academy", f: "Serif-Bold", c: GREEN },
      { t: sessionName ? " for the " : " for the new academic session.", f: "Serif", c: "#111111" }
    ];
    if (sessionName) segs.push({ t: `${sessionName} Academic Session.`, f: "Serif-Bold", c: "#111111" });
    doc.fontSize(11.5);
    const total = segs.reduce((t, g) => t + doc.font(g.f).widthOfString(g.t), 0);
    let sx = (w - total) / 2;
    segs.forEach((g) => {
      doc.font(g.f).fontSize(11.5).fillColor(g.c).text(g.t, sx, y, { lineBreak: false });
      sx += doc.widthOfString(g.t);
    });
    y += 30;

    // details box
    const rowsL: Array<[string, string]> = [
      ["Student’s Name", fullName],
      ["Email", user.email],
      ["Level / Class", [sp.level?.name, sp.class?.name].filter(Boolean).join(" / ") || "-"],
      ["Status", sp.status === "APPROVED" ? "Approved" : sp.status.charAt(0) + sp.status.slice(1).toLowerCase()]
    ];
    const rowsR: Array<[string, string]> = [
      ["Matric No.", matric || "To be issued"],
      ["Admission Fee", sp.admissionFee ? (sp.admissionFee.status === "PAID" ? "Paid" : sp.admissionFee.status) : "-"],
      ["Session", sessionName || "-"],
      ["Resumption", resumption ? longDate(resumption.startDate) : "As announced"]
    ];
    const rowGap = 19;
    const boxH = 16 + rowGap * 4;
    doc.roundedRect(L, y, W, boxH, 12).lineWidth(1.5).fillAndStroke("#FBF6DF", GREEN);
    doc.lineWidth(1).strokeColor(GREEN).moveTo(L + W * 0.52, y + 8).lineTo(L + W * 0.52, y + boxH - 8).stroke();
    const colL = L + 14;
    const colR = L + W * 0.52 + 14;
    const field = (label: string, value: string, x: number, yy: number, labelW: number, valW: number) => {
      doc.font("Serif-Bold").fontSize(9.5).fillColor("#111111").text(label, x, yy, { width: labelW, lineBreak: false });
      doc.text(":", x + labelW, yy, { width: 8, lineBreak: false });
      doc.font("Serif").fontSize(9.5).fillColor("#111111")
        .text(value || "-", x + labelW + 12, yy, { width: valW, height: 12, ellipsis: true, lineBreak: false });
    };
    rowsL.forEach(([k, v], i) => field(k, v, colL, y + 10 + i * rowGap, 78, 140));
    rowsR.forEach(([k, v], i) => field(k, v, colR, y + 10 + i * rowGap, 76, 110));
    y += boxH + 12;

    doc.font("Serif").fontSize(10.5).fillColor("#111111")
      .text("Please log in to your student portal to access your courses, live classes, lectures and tests. Kindly read and observe the following:", L, y, { width: W, align: "justify", lineGap: 1.5 });
    y = doc.y + 5;
    [
      "Attend live classes and complete your lectures and tests on time.",
      "Pay all course fees through the official portal and keep your receipts.",
      "Keep your login details private. Do not share your password.",
      "Conduct yourself with good Islamic manners (adab) towards teachers and fellow students.",
      "Check your notifications and the academic calendar regularly."
    ].forEach((r, i) => {
      doc.font("Serif").fontSize(10).fillColor("#111111").text(`${i + 1}.  ${r}`, L + 12, y, { width: W - 20, lineGap: 1 });
      y = doc.y + 2.5;
    });
    y += 4;
    doc.font("Serif").fontSize(10.5).fillColor("#111111")
      .text("We congratulate you and pray that Allah grants you beneficial knowledge. Welcome to the Maknazul ’Irfan family.", L, y, { width: W, align: "justify", lineGap: 1.5 });

    // principal's signature, stamp and verification code
    try {
      if (fs.existsSync(SIGNATURE2_PATH)) {
        doc.image(SIGNATURE2_PATH, 40, footerY + 28, { fit: [130, 46], align: "center", valign: "bottom" });
      }
    } catch {
      /* optional */
    }
    doc.lineWidth(1).strokeColor("#222222").moveTo(26, footerY + 76).lineTo(272, footerY + 76).stroke();
    drawStamp(doc, 322, footerY + 84, 46);
    doc.font("Serif-Bold").fontSize(10.5).fillColor("#111111")
      .text("Ustadh Abdul Qadir Hibatullah Shittu", 26, footerY + 81, { width: 262, lineBreak: false });
    doc.font("Serif").fontSize(10).fillColor("#111111").text("Principal", 26, footerY + 96, { width: 262, lineBreak: false });
    doc.font("Serif-Bold").fontSize(10).fillColor(GREEN).text("Maknazul ’Irfan Academy", 26, footerY + 109, { width: 262, lineBreak: false });
    drawQr(doc, `MAKNAZUL IRFAN ADMISSION|${ref}|${fullName}`, 384, footerY + 44, 62);
    doc.font("Body").fontSize(6.5).fillColor(GREY).text(ref, 366, footerY + 110, { width: 98, align: "center", lineBreak: false });
    doc.end();
  } catch (error) {
    console.error("admissionLetterPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the admission letter.", 500);
  }
}

export async function schemePdf(req: AuthenticatedRequest, res: Response) {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.courseId },
      include: { teacher: { select: { firstName: true, lastName: true } } }
    });
    if (!course) return failure(res, "Course not found.", 404);
    const items = await prisma.schemeItem.findMany({
      where: { courseId: course.id },
      orderBy: [{ week: "asc" }, { createdAt: "asc" }]
    });
    const doc = startPdf(res, `Scheme_of_Work_${course.title}`);
    const w = doc.page.width;
    letterhead(doc, "Scheme of Work");
    doc.font("Serif-Bold").fontSize(17).fillColor("#111111").text(course.title, 50, 122, { width: w - 100 });
    doc.font("Body").fontSize(10).fillColor(GREY).text(
      `Teacher: ${course.teacher ? `${course.teacher.firstName} ${course.teacher.lastName}` : "-"}     Date: ${fmtDate(new Date())}`,
      50, doc.y + 2, { width: w - 100 }
    );
    doc.y += 14;

    const cols = [
      { t: "Week", x: 50, w: 40 },
      { t: "Topic", x: 92, w: 150 },
      { t: "Objectives", x: 244, w: 160 },
      { t: "Activities", x: 406, w: 144 }
    ];
    function header() {
      const y = doc.y;
      doc.rect(50, y - 3, 500, 18).fill(GREEN);
      doc.fillColor("#ffffff").font("Body-Bold").fontSize(9);
      cols.forEach((c) => doc.text(c.t, c.x + 3, y, { width: c.w, lineBreak: false }));
      doc.y = y + 22;
    }
    header();
    if (!items.length) doc.font("Body").fontSize(10).fillColor(GREY).text("No scheme of work has been entered yet.", 53, doc.y);
    items.forEach((it, i) => {
      doc.font("Body").fontSize(9);
      const vals = [String(it.week), it.topic, it.objectives || "-", it.activities || "-"];
      const hts = vals.map((v, k) => doc.heightOfString(v, { width: cols[k].w - 6 }));
      const rh = Math.max(...hts) + 8;
      if (doc.y + rh > doc.page.height - 70) {
        doc.addPage();
        doc.y = 50;
        header();
      }
      const y = doc.y;
      if (i % 2 === 0) doc.rect(50, y - 3, 500, rh).fill("#f3f7f5");
      doc.fillColor("#111111");
      vals.forEach((v, k) => doc.font(k === 0 ? "Body-Bold" : "Body").fontSize(9).text(v, cols[k].x + 3, y, { width: cols[k].w - 6 }));
      doc.y = y + rh;
    });
    doc.end();
  } catch (error) {
    console.error("schemePdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the scheme of work.", 500);
  }
}

export async function calendarPdf(_req: AuthenticatedRequest, res: Response) {
  try {
    const events = await prisma.calendarEvent.findMany({ orderBy: { startDate: "asc" } });
    const doc = startPdf(res, "Academic_Calendar");
    const w = doc.page.width;
    letterhead(doc, "Academic Calendar");
    const sessions = Array.from(new Set(events.map((e) => e.session)));
    if (!sessions.length) doc.font("Body").fontSize(11).fillColor(GREY).text("No calendar events have been added yet.", 50, 130);
    const cols = [
      { t: "Date", x: 50, w: 150 },
      { t: "Event", x: 202, w: 200 },
      { t: "Type", x: 404, w: 146 }
    ];
    sessions.forEach((sess) => {
      if (doc.y > doc.page.height - 140) {
        doc.addPage();
        doc.y = 50;
      }
      doc.font("Serif-Bold").fontSize(14).fillColor(GREEN).text(`${sess} Academic Session`, 50, doc.y + 4, { width: w - 100 });
      doc.y += 6;
      const hy = doc.y;
      doc.rect(50, hy - 3, 500, 18).fill(GREEN);
      doc.fillColor("#ffffff").font("Body-Bold").fontSize(9);
      cols.forEach((c) => doc.text(c.t, c.x + 3, hy, { width: c.w, lineBreak: false }));
      doc.y = hy + 22;
      events.filter((e) => e.session === sess).forEach((e, i) => {
        const date = e.endDate && e.endDate.getTime() !== e.startDate.getTime()
          ? `${fmtDate(e.startDate)} - ${fmtDate(e.endDate)}`
          : fmtDate(e.startDate);
        const title = e.term ? `${e.title} (${e.term})` : e.title;
        doc.font("Body").fontSize(9);
        const rh = Math.max(doc.heightOfString(date, { width: cols[0].w - 6 }), doc.heightOfString(title, { width: cols[1].w - 6 })) + 8;
        if (doc.y + rh > doc.page.height - 60) {
          doc.addPage();
          doc.y = 50;
        }
        const y = doc.y;
        if (i % 2 === 0) doc.rect(50, y - 3, 500, rh).fill("#f3f7f5");
        doc.fillColor("#111111").font("Body").fontSize(9)
          .text(date, cols[0].x + 3, y, { width: cols[0].w - 6 })
          .text(title, cols[1].x + 3, y, { width: cols[1].w - 6 });
        doc.font("Body-Bold").fillColor(GREEN).text(e.type.charAt(0) + e.type.slice(1).toLowerCase(), cols[2].x + 3, y, { width: cols[2].w - 6 });
        doc.y = y + rh;
      });
      doc.y += 10;
    });
    doc.end();
  } catch (error) {
    console.error("calendarPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the calendar.", 500);
  }
}

/* =========================================================
   EXAM DOCKET
========================================================= */

export async function examDocketPdf(req: AuthenticatedRequest, res: Response) {
  try {
    const targetId = await resolveTargetUserId(req);
    if (!(await canViewStudent(req, targetId))) return failure(res, "Access denied.", 403);
    const sessionId = String(req.query.sessionId || "");
    const user = await prisma.user.findUnique({
      where: { id: targetId },
      include: { studentProfile: { include: { level: true, class: true } } }
    });
    if (!user || !user.studentProfile) return failure(res, "Student not found.", 404);
    const sp = user.studentProfile;
    const reg = await prisma.examRegistration.findFirst({
      where: {
        studentId: sp.id,
        status: "PAID",
        submittedAt: { not: null },
        ...(sessionId ? { examSessionId: sessionId } : {})
      },
      orderBy: { submittedAt: "desc" },
      include: {
        examSession: true,
        courses: { include: { course: { include: { teacher: { select: { firstName: true, lastName: true } } } } } }
      }
    });
    if (!reg) return failure(res, "No completed exam registration was found. Pay the exam fee and register your subjects first.", 404);

    const fullName = `${user.firstName} ${user.lastName}`.trim();
    const doc = startPdf(res, `Exam_Docket_${fullName}`);
    const w = doc.page.width;
    letterhead(doc, "Examination Docket");

    const photo = photoBuffer(user.avatar);
    const px = w - 150;
    doc.rect(px, 122, 100, 120).lineWidth(1).strokeColor(GREEN).stroke();
    if (photo) {
      try {
        doc.image(photo, px + 2, 124, { fit: [96, 116], align: "center", valign: "center" });
      } catch (e) {
        console.error("docket photo error:", e);
      }
    } else {
      doc.font("Body").fontSize(8).fillColor(GREY).text("PASTE PASSPORT PHOTO", px, 176, { width: 100, align: "center" });
    }

    doc.font("Serif-Bold").fontSize(16).fillColor("#111111").text(reg.examSession.title, 50, 124, { width: w - 220 });
    doc.font("Body").fontSize(10).fillColor(GREY).text(
      `${reg.examSession.session} session${reg.examSession.term ? ` - ${reg.examSession.term}` : ""}`,
      50, doc.y + 2, { width: w - 220 }
    );
    doc.y += 12;
    row(doc, "Name", fullName);
    row(doc, "Matric number", sp.matricNumber || "-");
    row(doc, "Exam number", reg.examNumber || "-");
    row(doc, "Level / Class", [sp.level?.name, sp.class?.name].filter(Boolean).join(" / ") || "-");
    row(doc, "Fee status", "Paid");
    if (doc.y < 252) doc.y = 252;

    doc.moveDown(0.6);
    doc.font("Body-Bold").fontSize(11).fillColor(GREEN).text("REGISTERED SUBJECTS", 50, doc.y);
    doc.y += 8;
    const cols = [
      { t: "No", x: 50, w: 36 },
      { t: "Subject", x: 88, w: 280 },
      { t: "Teacher", x: 370, w: 180 }
    ];
    let y0 = doc.y;
    doc.rect(50, y0 - 3, 500, 18).fill(GREEN);
    doc.fillColor("#ffffff").font("Body-Bold").fontSize(9);
    cols.forEach((c) => doc.text(c.t, c.x + 3, y0, { width: c.w, lineBreak: false }));
    doc.y = y0 + 22;
    reg.courses.forEach((c, i) => {
      if (doc.y > doc.page.height - 260) {
        doc.addPage();
        doc.y = 60;
      }
      const y = doc.y;
      if (i % 2 === 0) doc.rect(50, y - 3, 500, 18).fill("#f3f7f5");
      const t = c.course.teacher ? `${c.course.teacher.firstName} ${c.course.teacher.lastName}` : "-";
      doc.fillColor("#111111").font("Body").fontSize(9.5)
        .text(String(i + 1), cols[0].x + 3, y, { width: cols[0].w, lineBreak: false })
        .text(c.course.title, cols[1].x + 3, y, { width: cols[1].w - 6, height: 13, ellipsis: true, lineBreak: false })
        .text(t, cols[2].x + 3, y, { width: cols[2].w - 6, height: 13, ellipsis: true, lineBreak: false });
      doc.y = y + 20;
    });

    doc.moveDown(0.8);
    doc.font("Body-Bold").fontSize(10).fillColor(GREEN).text("INSTRUCTIONS", 50, doc.y);
    doc.moveDown(0.3);
    [
      "You may attempt only the subjects listed on this docket.",
      "Log in to your student portal and start each exam within its available time.",
      "Keep your login private. Malpractice leads to disqualification.",
      "Present this docket (printed or on your phone) whenever you are asked."
    ].forEach((r, i) => {
      doc.font("Body").fontSize(9.5).fillColor("#111111").text(`${i + 1}.  ${r}`, 60, doc.y, { width: w - 120, lineGap: 2 });
      doc.moveDown(0.2);
    });

    const h = doc.page.height;
    const sy = Math.max(doc.y + 40, h - 170);
    drawStamp(doc, w / 2, sy, 48);
    try {
      if (fs.existsSync(SIGNATURE_PATH)) doc.image(SIGNATURE_PATH, 70, sy - 38, { fit: [110, 38] });
    } catch {
      /* optional */
    }
    doc.lineWidth(0.8).strokeColor(GREEN).moveTo(60, sy + 2).lineTo(210, sy + 2).stroke();
    doc.font("Body-Bold").fontSize(9).fillColor(GREY).text("EXAMINATIONS OFFICER", 60, sy + 6, { width: 150, lineBreak: false });
    drawQr(doc, `MAKNAZUL IRFAN EXAM DOCKET|${reg.examNumber}|${fullName}`, w - 130, sy - 34, 66);
    drawBarcode(doc, reg.examNumber || "EXAM", 50, h - 82, 200, 28);
    doc.end();
  } catch (error) {
    console.error("examDocketPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the exam docket.", 500);
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
  let matric: string | null = sp?.matricNumber || null;
  if (!matric && sp && ["APPROVED", "ENROLLED", "GRADUATED"].includes(sp.status)) {
    try {
      matric = await ensureMatricNumber(sp.id, { announce: false });
    } catch {
      /* optional */
    }
  }

  const title =
    user.role === "TEACHER"
      ? "TEACHER IDENTITY CARD"
      : user.role === "ADMIN"
      ? "STAFF IDENTITY CARD"
      : "STUDENT IDENTITY CARD";

  const shortDate = (d: Date | null | undefined) =>
    d ? new Date(d).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "-";
  const now = new Date();
  const validYear = now.getMonth() > 5 || (now.getMonth() === 5 && now.getDate() > 30) ? now.getFullYear() + 1 : now.getFullYear();
  const validUntil = `30 Jun ${validYear}`;

  const details: Array<[string, string]> = [];
  if (user.role === "STUDENT") {
    details.push(["LEVEL", sp?.level?.name || "-"]);
    details.push(["PROGRAM", sp?.class?.name || "General Islamic & Arabic Studies"]);
    details.push(["DOB", shortDate(sp?.dateOfBirth)]);
    details.push(["BLOOD GP", sp?.bloodGroup || "-"]);
  } else if (user.role === "TEACHER") {
    details.push(["SPECIALIZATION", tp?.specialization || "-"]);
    details.push(["QUALIFICATION", tp?.qualification || "-"]);
    details.push(["EMAIL", user.email]);
  } else {
    details.push(["POSITION", "Administrator"]);
    details.push(["EMAIL", user.email]);
  }
  details.push(["VALID UNTIL", validUntil]);

  return {
    user,
    card: {
      userId: user.id,
      name: `${user.firstName} ${user.lastName}`,
      role: user.role,
      title,
      idLabel: user.role === "STUDENT" ? (matric ? "MATRIC NO" : "STUDENT ID") : "STAFF ID",
      idNumber: matric || `MIA-${prefix}-${year}-${serial}`,
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
    const CW = 480;
    const CH = 300;
    const x = (pw - CW) / 2;
    const DARK = "#0c4a2e";

    doc.font("Body").fontSize(8).fillColor(GREY)
      .text("Identity card - print and cut along the outline. Front on top, back below.", 50, 34, {
        width: pw - 100,
        align: "center"
      });

    function frame(cy: number) {
      doc.roundedRect(x, cy, CW, CH, 12).fill(CREAM);
    }
    function borders(cy: number) {
      doc.lineWidth(2).strokeColor(DARK).roundedRect(x, cy, CW, CH, 12).stroke();
      doc.lineWidth(0.8).strokeColor(GOLD).roundedRect(x + 5, cy + 5, CW - 10, CH - 10, 9).stroke();
    }
    function watermark(cy: number) {
      try {
        if (fs.existsSync(LOGO_PATH)) {
          doc.save();
          doc.opacity(0.08);
          doc.image(LOGO_PATH, x + CW / 2 - 90, cy + 80, { fit: [180, 180] });
          doc.restore();
        }
      } catch {
        /* optional */
      }
    }
    function hologram(hx: number, hy: number, hw: number, text: string) {
      const g = doc.linearGradient(hx, hy, hx + hw, hy + 24);
      g.stop(0, "#dfe8f1").stop(0.3, "#c9f1e1").stop(0.55, "#f2dcf6").stop(0.8, "#fbefc4").stop(1, "#d3e4f4");
      doc.roundedRect(hx, hy, hw, 24, 4).fill(g);
      doc.lineWidth(0.5).strokeColor("#9aa7b3").roundedRect(hx, hy, hw, 24, 4).stroke();
      doc.fillColor("#4b5563").font("Body-Bold").fontSize(5.2)
        .text(text, hx + 2, hy + 9, { width: hw - 4, align: "center", lineBreak: false });
    }

    /* ---------------- FRONT ---------------- */
    const fy = 62;
    frame(fy);
    doc.save();
    doc.roundedRect(x, fy, CW, CH, 12).clip();
    doc.rect(x, fy, CW, 80).fill(DARK);
    doc.restore();
    watermark(fy);
    borders(fy);

    doc.fillColor("#ffffff").font("Serif-Bold").fontSize(21)
      .text("MAKNAZUL IRFAN ACADEMY", x, fy + 17, { width: CW, align: "center", lineBreak: false });
    doc.fillColor("#e6c85a").font("Serif-Bold").fontSize(13)
      .text(card.title, x, fy + 48, { width: CW, align: "center", lineBreak: false });

    // photo
    const px = x + 22;
    const py = fy + 94;
    const PW = 104;
    const PH = 124;
    const photo = photoBuffer(user.avatar);
    doc.rect(px, py, PW, PH).fill("#ffffff");
    if (photo) {
      try {
        doc.image(photo, px, py, { fit: [PW, PH], align: "center", valign: "center" });
      } catch (e) {
        console.error("photo error:", e);
      }
    } else {
      const initials = `${user.firstName[0] || ""}${user.lastName[0] || ""}`.toUpperCase();
      doc.fillColor(DARK).font("Serif-Bold").fontSize(36)
        .text(initials, px, py + 40, { width: PW, align: "center", lineBreak: false });
    }
    doc.lineWidth(2).strokeColor(GOLD).rect(px, py, PW, PH).stroke();
    doc.lineWidth(0.6).strokeColor(GOLD).rect(px + 3, py + 3, PW - 6, PH - 6).stroke();

    // fields
    const lx = x + 146;
    const vx = x + 232;
    const vw = CW - 232 - 18;
    let ty = fy + 92;
    function row(label: string, value: string, big = false) {
      doc.font("Body-Bold").fontSize(8.5).fillColor("#222222")
        .text(`${label}:`, lx, ty + (big ? 4 : 1), { width: 84, lineBreak: false });
      doc.font(big ? "Serif-Bold" : "Body-Bold").fontSize(big ? 16 : 10).fillColor("#0b0b0b")
        .text(value, vx, ty, { width: vw, height: big ? 20 : 13, ellipsis: true, lineBreak: false });
      ty += big ? 25 : 18;
    }
    row("FULL NAME", card.name, true);
    row(card.idLabel, card.idNumber);
    card.details.slice(0, 5).forEach(([l, v]) => row(l, v));

    // holograms
    hologram(x + 22, fy + 238, 110, "KNOWLEDGE \u2022 FAITH \u2022 EXCELLENCE");
    hologram(x + 140, fy + 238, 96, "FAITH \u2022 EXCELLENCE");
    doc.fillColor("#222222").font("Body-Bold").fontSize(6.5)
      .text("UNIQUE NUMBER", x + 22, fy + 266, { width: 110, align: "center", lineBreak: false });

    // principal signature
    try {
      if (fs.existsSync(SIGNATURE2_PATH)) {
        doc.image(SIGNATURE2_PATH, x + 276, fy + 222, { fit: [110, 38], align: "center", valign: "bottom" });
      }
    } catch {
      /* optional */
    }
    doc.lineWidth(0.6).strokeColor("#555555").moveTo(x + 268, fy + 264).lineTo(x + 398, fy + 264).stroke();
    doc.fillColor("#222222").font("Body-Bold").fontSize(6.5)
      .text("PRINCIPAL'S SIGNATURE", x + 268, fy + 268, { width: 130, align: "center", lineBreak: false });

    // gold shield
    const sx = x + CW - 52;
    const sy = fy + 236;
    doc.save();
    doc.moveTo(sx, sy).lineTo(sx + 28, sy).lineTo(sx + 28, sy + 18)
      .bezierCurveTo(sx + 28, sy + 28, sx + 14, sy + 34, sx + 14, sy + 36)
      .bezierCurveTo(sx + 14, sy + 34, sx, sy + 28, sx, sy + 18)
      .closePath().fillAndStroke(GOLD, DARK);
    doc.lineWidth(2).strokeColor("#ffffff").moveTo(sx + 8, sy + 16).lineTo(sx + 13, sy + 22).lineTo(sx + 21, sy + 10).stroke();
    doc.restore();

    /* ---------------- BACK ---------------- */
    const by = fy + CH + 46;
    frame(by);
    doc.save();
    doc.roundedRect(x, by, CW, CH, 12).clip();
    doc.rect(x, by, CW, 62).fill(DARK);
    doc.restore();
    watermark(by);
    borders(by);

    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.circle(x + CW / 2, by + 34, 27).fill("#ffffff");
        doc.image(LOGO_PATH, x + CW / 2 - 23, by + 11, { fit: [46, 46] });
      }
    } catch {
      /* optional */
    }
    doc.fillColor(DARK).font("Serif-Bold").fontSize(20)
      .text("MAKNAZUL IRFAN ACADEMY", x, by + 74, { width: CW, align: "center", lineBreak: false });

    const site = baseUrl(req).replace(/^https?:\/\//, "");
    doc.fillColor("#222222").font("Body").fontSize(8.5);
    doc.text(`Web: ${site}`, x + 22, by + 106, { width: 230, lineBreak: false });
    doc.text("Address: Online Campus & Registered Offices", x + 22, by + 120, { width: 230, lineBreak: false });
    doc.text(`Email: ${ACADEMY_EMAIL}`, x + 262, by + 106, { width: 200, lineBreak: false });
    doc.text(`Phone: ${ACADEMY_PHONE}`, x + 262, by + 120, { width: 200, lineBreak: false });

    doc.fillColor("#444444").font("Body").fontSize(6.8)
      .text(
        "THIS CARD IS THE PROPERTY OF MAKNAZUL IRFAN ACADEMY. IT IS NON-TRANSFERABLE AND MUST BE " +
        "PRESENTED UPON REQUEST. IF FOUND, PLEASE RETURN IT TO THE ADDRESS ABOVE.",
        x + 22, by + 142, { width: CW - 44, align: "center", lineGap: 1.5 }
      );

    doc.fillColor("#111111").font("Body-Bold").fontSize(9)
      .text("Emergency Contacts:", x + 22, by + 180, { width: 100, lineBreak: false });
    doc.lineWidth(0.6).strokeColor("#444444").moveTo(x + 124, by + 190).lineTo(x + 300, by + 190).stroke();

    drawBarcode(doc, card.idNumber, x + 22, by + 206, 250, 36);
    doc.fillColor(GREY).font("Body").fontSize(7)
      .text("Library & Campus Access", x + 22, by + 268, { width: 250, align: "center", lineBreak: false });

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
      x + CW - 22 - 80,
      by + 196,
      80
    );

    doc.fillColor(DARK).font("Serif-Bold").fontSize(9.5)
      .text("EMBARK ON YOUR PATH TO ILLUMINATION & EXCELLENCE.", x - 20, by + CH + 14, { width: CW + 40, align: "center", lineBreak: false });

    doc.end();
  } catch (error) {
    console.error("idCardPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the ID card PDF.", 500);
  }
}
