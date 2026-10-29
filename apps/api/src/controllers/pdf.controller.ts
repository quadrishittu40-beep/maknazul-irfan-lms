import { Response } from "express";
import path from "path";
import fs from "fs";

import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { failure } from "../utils/http";
import { shapeArabic } from "../utils/arabic";
import { env } from "../config/env";

const GREEN = "#064e3b";
const GOLD = "#b8932a";
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

    // borders and corner ornaments
    doc.lineWidth(4).strokeColor(GREEN).rect(24, 24, w - 48, h - 48).stroke();
    doc.lineWidth(1).strokeColor(GOLD).rect(34, 34, w - 68, h - 68).stroke();
    doc.lineWidth(0.5).strokeColor(GOLD).rect(40, 40, w - 80, h - 80).stroke();
    [[34, 34], [w - 34, 34], [34, h - 34], [w - 34, h - 34]].forEach(([x, y]) => {
      doc.save().rect(x - 5, y - 5, 10, 10).fill(GOLD).restore();
    });

    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, w / 2 - 28, 50, { fit: [56, 56] });
      }
    } catch {
      /* optional */
    }

    doc.fillColor(GREEN).font("Body-Bold").fontSize(22)
      .text("MAKNAZUL IRFAN ACADEMY", 0, 112, { align: "center", width: w });
    doc.fillColor(GREY).font("Body").fontSize(10)
      .text("Online Islamic & Arabic Institute", 0, 140, { align: "center", width: w });
    doc.fillColor(GREY).font("Body").fontSize(8.5)
      .text("In the name of Allah, the Most Gracious, the Most Merciful", 0, 156, { align: "center", width: w });

    doc.moveTo(w / 2 - 110, 174).lineTo(w / 2 + 110, 174).lineWidth(1).strokeColor(GOLD).stroke();

    doc.fillColor(GOLD).font("Body-Bold").fontSize(28)
      .text("CERTIFICATE OF COMPLETION", 0, 184, { align: "center", width: w });

    doc.fillColor(GREY).font("Body").fontSize(12)
      .text("This is to certify that", 0, 226, { align: "center", width: w });

    doc.fillColor("#111111").font("Body-Bold").fontSize(26)
      .text(name, 60, 244, { align: "center", width: w - 120 });
    const nameBottom = doc.y;
    doc.moveTo(w / 2 - 170, nameBottom + 2).lineTo(w / 2 + 170, nameBottom + 2)
      .lineWidth(0.8).strokeColor(GOLD).stroke();

    doc.fillColor("#333333").font("Body").fontSize(11)
      .text(
        "having duly fulfilled all the academic requirements, attended the prescribed lectures and " +
        "satisfactorily completed the assessments of the course of study entitled",
        90, nameBottom + 12, { align: "center", width: w - 180, lineGap: 2 }
      );

    doc.fillColor(GREEN).font("Body-Bold").fontSize(20)
      .text(cert.course?.title || "Course", 70, doc.y + 6, { align: "center", width: w - 140 });

    const result: string[] = [];
    if (cert.grade) result.push(`Grade ${cert.grade}`);
    if (cert.score !== null && cert.score !== undefined) result.push(`a score of ${cert.score}%`);

    doc.fillColor("#333333").font("Body").fontSize(11)
      .text(
        "offered by Maknazul 'Irfan Academy, Online Islamic & Arabic Institute" +
        (result.length ? `, with a final result of ${result.join(" and ")}` : "") +
        ". This certificate is hereby issued and awarded in recognition of the above achievement, " +
        `given under the seal of the Academy on ${issued}.`,
        90, doc.y + 6, { align: "center", width: w - 180, lineGap: 2 }
      );

    // signatures
    const lineY = h - 112;
    doc.lineWidth(0.8).strokeColor(GREEN);
    doc.moveTo(70, lineY).lineTo(235, lineY).stroke();
    doc.moveTo(265, lineY).lineTo(430, lineY).stroke();
    doc.fillColor(GREY).font("Body-Bold").fontSize(9.5)
      .text("Director of Studies", 70, lineY + 4, { width: 165, align: "center" });
    doc.text("Registrar", 265, lineY + 4, { width: 165, align: "center" });

    doc.fillColor(GREY).font("Body").fontSize(9)
      .text(`Date of issue: ${issued}`, 70, h - 84, { width: 380 });
    doc.text(`Certificate No: ${cert.certificateNumber}`, 70, h - 71, { width: 380 });

    // official red seal
    drawStamp(doc, 520, h - 124, 52);

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
    drawQr(doc, qrText, w - 150, h - 168, 84);

    doc.fillColor(GREY).font("Body").fontSize(7.5)
      .text(`Verify this certificate at: ${verifyUrl}`, 60, h - 56, { align: "center", width: w - 120 });

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
