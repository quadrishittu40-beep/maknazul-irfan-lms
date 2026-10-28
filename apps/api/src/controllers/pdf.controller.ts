import { Response } from "express";
import path from "path";
import fs from "fs";

import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { failure } from "../utils/http";
import { shapeArabic } from "../utils/arabic";

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
    .fontSize(15)
    .text("MAKNAZUL IRFAN ACADEMY  |  أكاديمية مكنزل عرفان", 118, 46, { width: w - 168 });
  doc
    .font("Body")
    .fontSize(10)
    .fillColor(GREY)
    .text("Online Islamic & Arabic Institute  |  المعهد الإسلامي والعربي عبر الإنترنت", 118, 68, { width: w - 168 });
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
  doc.font("Body-Bold").fontSize(9).fillColor(GREEN).text(label, 50, y, { width: 200 });
  doc.font("Body").fontSize(11).fillColor("#111111").text(value || "-", 255, y, { width: 290 });
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

    doc.lineWidth(4).strokeColor(GREEN).rect(24, 24, w - 48, h - 48).stroke();
    doc.lineWidth(1).strokeColor(GOLD).rect(34, 34, w - 68, h - 68).stroke();

    try {
      if (fs.existsSync(LOGO_PATH)) {
        doc.image(LOGO_PATH, w / 2 - 32, 50, { fit: [64, 64] });
      }
    } catch {
      /* optional */
    }

    doc.fillColor(GREEN).font("Body-Bold").fontSize(22)
      .text("MAKNAZUL IRFAN ACADEMY  |  أكاديمية مكنزل عرفان", 0, 125, { align: "center", width: w });
    doc.fillColor(GREY).font("Body").fontSize(11)
      .text("Online Islamic & Arabic Institute  |  المعهد الإسلامي والعربي عبر الإنترنت", 0, 156, { align: "center", width: w });

    doc.fillColor(GOLD).font("Body-Bold").fontSize(30)
      .text("Certificate of Completion  |  شهادة إتمام", 0, 190, { align: "center", width: w });

    doc.fillColor(GREY).font("Body").fontSize(13)
      .text("This is to certify that  |  يشهد بأن", 0, 245, { align: "center", width: w });

    doc.fillColor("#111111").font("Body-Bold").fontSize(30)
      .text(name, 0, 270, { align: "center", width: w });

    doc.fillColor(GREY).font("Body").fontSize(13)
      .text("has successfully completed the course  |  قد أتمّ بنجاح دورة", 0, 318, { align: "center", width: w });

    doc.fillColor(GREEN).font("Body-Bold").fontSize(22)
      .text(cert.course?.title || "Course", 60, 342, { align: "center", width: w - 120 });

    const extra: string[] = [];
    if (cert.grade) extra.push(`Grade | التقدير: ${cert.grade}`);
    if (cert.score !== null && cert.score !== undefined) extra.push(`Score | الدرجة: ${cert.score}%`);
    if (extra.length) {
      doc.fillColor("#111111").font("Body").fontSize(13)
        .text(extra.join("     "), 0, 385, { align: "center", width: w });
    }

    doc.fillColor(GREY).font("Body").fontSize(11)
      .text(`Date | التاريخ: ${fmtDate(cert.completionDate || cert.issuedAt)}`, 70, h - 110, { width: 250 });
    doc.text(`Certificate No | رقم الشهادة: ${cert.certificateNumber}`, w - 320, h - 110, { width: 250, align: "right" });

    doc.moveTo(w / 2 - 80, h - 78).lineTo(w / 2 + 80, h - 78).lineWidth(1).strokeColor(GREEN).stroke();
    doc.fillColor(GREY).fontSize(10)
      .text("Director | المدير", 0, h - 72, { align: "center", width: w });

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
    letterhead(doc, "Profile  |  الملف الشخصي");

    doc.font("Body-Bold").fontSize(20).fillColor("#111111").text(fullName, 50);
    doc.moveDown(0.8);

    row(doc, "Role | الدور", user.role);
    row(doc, "Email | البريد الإلكتروني", user.email);
    row(doc, "Phone | الهاتف", user.phone || "-");
    row(doc, "Account status | حالة الحساب", user.isActive ? "Active" : "Disabled");
    row(doc, "Registered | تاريخ التسجيل", fmtDate(user.createdAt));

    const sp: any = user.studentProfile;
    if (sp) {
      doc.moveDown(0.5);
      doc.font("Body-Bold").fontSize(13).fillColor(GREEN).text("Student information  |  معلومات الطالب", 50);
      doc.moveDown(0.5);
      row(doc, "Status | الحالة", String(sp.status));
      row(doc, "Level | المستوى", sp.level?.name || "-");
      row(doc, "Class | الفصل", sp.class?.name || "-");
      row(doc, "Gender | الجنس", sp.gender || "-");
      row(doc, "Date of birth | تاريخ الميلاد", fmtDate(sp.dateOfBirth));
      row(doc, "Guardian | ولي الأمر", sp.guardianName || "-");
      row(doc, "Guardian phone | هاتف ولي الأمر", sp.guardianPhone || "-");
      row(
        doc,
        "Courses | الدورات",
        sp.enrollments.length
          ? sp.enrollments.map((e: any) => e.course.title).join(", ")
          : "None yet"
      );
    }

    const tp: any = user.teacherProfile;
    if (tp || user.role === "TEACHER") {
      doc.moveDown(0.5);
      doc.font("Body-Bold").fontSize(13).fillColor(GREEN).text("Teacher information  |  معلومات المعلم", 50);
      doc.moveDown(0.5);
      row(doc, "Specialization | التخصص", tp?.specialization || "-");
      row(doc, "Qualification | المؤهل", tp?.qualification || "-");
      row(doc, "About | نبذة", tp?.bio || "-");
      row(
        doc,
        "Courses taught | الدورات المدرّسة",
        user.coursesTaught.length
          ? user.coursesTaught.map((c) => c.title).join(", ")
          : "None assigned"
      );
    }

    doc.moveDown(2);
    doc.font("Body").fontSize(9).fillColor(GREY)
      .text(`Generated on | أُنشئ في ${fmtDate(new Date())}`, 50);

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
    letterhead(doc, "Examination Results  |  نتائج الاختبارات");

    doc.font("Body-Bold").fontSize(16).fillColor("#111111").text(fullName, 50);
    doc.font("Body").fontSize(10).fillColor(GREY).text(user.email, 50);
    doc.moveDown(1);

    const cols = [
      { t: "Test", a: "الاختبار", x: 50, w: 140 },
      { t: "Course", a: "الدورة", x: 195, w: 115 },
      { t: "Date", a: "التاريخ", x: 315, w: 75 },
      { t: "Score", a: "الدرجة", x: 392, w: 45 },
      { t: "Grade", a: "التقدير", x: 440, w: 45 },
      { t: "Result", a: "النتيجة", x: 488, w: 62 }
    ];

    function header() {
      const y = doc.y;
      doc.rect(50, y - 3, 500, 28).fill(GREEN);
      doc.fillColor("#ffffff").font("Body-Bold").fontSize(8);
      cols.forEach((c) => {
        doc.text(c.t, c.x + 2, y, { width: c.w });
        doc.text(c.a, c.x + 2, y + 10, { width: c.w });
      });
      doc.y = y + 32;
    }

    if (!attempts.length) {
      doc.font("Body").fontSize(12).fillColor(GREY).text("No submitted tests yet. | لا توجد اختبارات مقدّمة بعد.", 50);
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
          .text(a.passed ? "Pass/ناجح" : "Fail/راسب", cols[5].x + 2, y, { width: cols[5].w });
        doc.y = y + 20;
      });

      doc.moveDown(1);
      doc.x = 50;
      doc.font("Body-Bold").fontSize(11).fillColor(GREEN).text(
        `Tests taken | الاختبارات: ${attempts.length}    Passed | الناجحة: ${passed}    Average | المعدل: ${(totalPct / attempts.length).toFixed(1)}%`,
        50
      );
    }

    doc.moveDown(2);
    doc.font("Body").fontSize(9).fillColor(GREY).text(`Generated on | أُنشئ في ${fmtDate(new Date())}`, 50);
    doc.end();
  } catch (error) {
    console.error("resultsPdf error:", error);
    if (!res.headersSent) failure(res, "Unable to create the results PDF.", 500);
  }
}
