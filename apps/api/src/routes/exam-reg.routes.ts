import { Router, Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { initializeExamPayment, verifyExamPayment } from "../services/payment.service";

const router = Router();
router.use(requireAuth);

const OK_STATUS = ["APPROVED", "ENROLLED", "GRADUATED"];

function isOpen(s: { active: boolean; opensAt: Date | null; closesAt: Date | null }) {
  const now = new Date();
  return s.active && !(s.opensAt && now < s.opensAt) && !(s.closesAt && now > s.closesAt);
}

/* =========================================================
   GUARD: only registered subjects can be attempted.
   Used before POST /api/exams/tests/:testId/start
========================================================= */
export async function examRegistrationGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const user: any = (req as any).user;
    if (!user || user.role !== "STUDENT") return next();
    const test = await prisma.test.findUnique({ where: { id: String(req.params.testId) }, select: { courseId: true } });
    if (!test) return next();
    const offered = await prisma.examSessionCourse.findMany({
      where: { courseId: test.courseId, examSession: { active: true } },
      select: { examSessionId: true }
    });
    if (!offered.length) return next(); // this subject is not part of an exam session
    const profile = await prisma.studentProfile.findUnique({ where: { userId: user.id }, select: { id: true } });
    const reg = profile
      ? await prisma.examRegistration.findFirst({
          where: {
            studentId: profile.id,
            status: "PAID",
            submittedAt: { not: null },
            examSessionId: { in: offered.map((o) => o.examSessionId) },
            courses: { some: { courseId: test.courseId } }
          },
          select: { id: true }
        })
      : null;
    if (reg) return next();
    return failure(
      res,
      "You are not registered for this exam subject. Pay the exam fee and register your subjects under Exam Registration first.",
      403
    );
  } catch (error) {
    console.error("examRegistrationGuard error:", error);
    return failure(res, "Unable to check your exam registration.", 500);
  }
}

/* =========================================================
   STUDENT
========================================================= */
router.get("/me", requireRole("STUDENT"), async (req: any, res) => {
  try {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true, status: true, enrollments: { select: { courseId: true } } }
    });
    if (!profile) return failure(res, "Student profile not found.", 404);
    const enrolled = new Set(profile.enrollments.map((e) => e.courseId));
    const sessions = await prisma.examSession.findMany({
      where: { active: true },
      orderBy: { createdAt: "desc" },
      include: { courses: { include: { course: { select: { id: true, title: true } } } } }
    });
    const regs = await prisma.examRegistration.findMany({
      where: { studentId: profile.id, examSessionId: { in: sessions.map((s) => s.id) } },
      include: { courses: { include: { course: { select: { id: true, title: true } } } } }
    });
    const out = sessions.map((s) => {
      const r = regs.find((x) => x.examSessionId === s.id);
      return {
        id: s.id,
        title: s.title,
        session: s.session,
        term: s.term,
        fee: Number(s.fee),
        opensAt: s.opensAt,
        closesAt: s.closesAt,
        open: isOpen(s),
        subjects: s.courses.map((c) => ({ id: c.course.id, title: c.course.title, enrolled: enrolled.has(c.course.id) })),
        registration: r
          ? {
              status: r.status,
              paid: r.status === "PAID",
              submitted: !!r.submittedAt,
              examNumber: r.examNumber,
              subjects: r.courses.map((c) => ({ id: c.course.id, title: c.course.title }))
            }
          : null
      };
    });
    return success(res, { admitted: OK_STATUS.includes(profile.status), sessions: out });
  } catch (error) {
    console.error("exam-reg me error:", error);
    return failure(res, "Unable to load exam registration.", 500);
  }
});

router.post("/pay", requireRole("STUDENT"), async (req: any, res) => {
  const p = z.object({ sessionId: z.string().min(5) }).safeParse(req.body);
  if (!p.success) return failure(res, "Choose an exam session.", 422);
  try {
    const profile = await prisma.studentProfile.findUnique({ where: { userId: req.user.id }, select: { status: true } });
    if (!profile || !OK_STATUS.includes(profile.status)) return failure(res, "Your admission must be approved before you can register for exams.", 403);
    return success(res, await initializeExamPayment(req.user.id, p.data.sessionId));
  } catch (e) {
    return failure(res, e instanceof Error ? e.message : "Unable to start the payment.", 400);
  }
});

router.get("/verify/:reference", requireRole("STUDENT"), async (req: any, res) => {
  try {
    const reg = await verifyExamPayment(req.user.id, String(req.params.referenc)e);
    return success(res, { paid: reg.status === "PAID" });
  } catch (e) {
    return failure(res, e instanceof Error ? e.message : "Unable to verify the payment.", 400);
  }
});

/* Free exams (fee 0): open the registration without paying. */
router.post("/free", requireRole("STUDENT"), async (req: any, res) => {
  const p = z.object({ sessionId: z.string().min(5) }).safeParse(req.body);
  if (!p.success) return failure(res, "Choose an exam session.", 422);
  try {
    const profile = await prisma.studentProfile.findUnique({ where: { userId: req.user.id }, select: { id: true, status: true } });
    if (!profile || !OK_STATUS.includes(profile.status)) return failure(res, "Your admission must be approved first.", 403);
    const s = await prisma.examSession.findUnique({ where: { id: p.data.sessionId } });
    if (!s || !isOpen(s)) return failure(res, "Exam registration is not open.", 400);
    if (Number(s.fee) > 0) return failure(res, "This exam has a fee. Please pay first.", 400);
    await prisma.examRegistration.upsert({
      where: { examSessionId_studentId: { examSessionId: s.id, studentId: profile.id } },
      create: {
        examSessionId: s.id, studentId: profile.id, amount: 0, status: "PAID", provider: "CASH",
        reference: `FREE-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`, paidAt: new Date()
      },
      update: {}
    });
    return success(res, { message: "Registration opened." });
  } catch (e) {
    console.error("exam-reg free error:", e);
    return failure(res, "Unable to open the registration.", 500);
  }
});

/* Choose subjects (only after payment). Locked once submitted. */
router.post("/subjects", requireRole("STUDENT"), async (req: any, res) => {
  const p = z.object({ sessionId: z.string().min(5), courseIds: z.array(z.string().min(5)).min(1).max(30) }).safeParse(req.body);
  if (!p.success) return failure(res, "Select at least one subject.", 422);
  try {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true, enrollments: { select: { courseId: true } } }
    });
    if (!profile) return failure(res, "Student profile not found.", 404);
    const s = await prisma.examSession.findUnique({ where: { id: p.data.sessionId }, include: { courses: true } });
    if (!s || !isOpen(s)) return failure(res, "Exam registration is not open.", 400);
    const reg = await prisma.examRegistration.findUnique({
      where: { examSessionId_studentId: { examSessionId: s.id, studentId: profile.id } }
    });
    if (!reg || reg.status !== "PAID") return failure(res, "You must pay the exam registration fee before choosing subjects.", 403);
    if (reg.submittedAt) return failure(res, "Your subjects are already registered. Contact the academy to change them.", 409);

    const offered = new Set(s.courses.map((c) => c.courseId));
    const enrolled = new Set(profile.enrollments.map((e) => e.courseId));
    const ids = Array.from(new Set(p.data.courseIds));
    if (ids.some((id) => !offered.has(id))) return failure(res, "One of the subjects is not offered in this exam.", 400);
    if (ids.some((id) => !enrolled.has(id))) return failure(res, "You can only register subjects you are enrolled in.", 400);

    const year = new Date().getFullYear();
    const prefix = `EXM/${year}/`;
    let examNumber: string | null = null;
    for (let i = 0; i < 6 && !examNumber; i++) {
      const last = await prisma.examRegistration.findFirst({
        where: { examNumber: { startsWith: prefix } },
        orderBy: { examNumber: "desc" },
        select: { examNumber: true }
      });
      const n = last?.examNumber ? parseInt(last.examNumber.slice(prefix.length), 10) || 0 : 0;
      const candidate = `${prefix}${String(n + 1 + i).padStart(4, "0")}`;
      try {
        await prisma.$transaction([
          prisma.examRegistrationCourse.deleteMany({ where: { registrationId: reg.id } }),
          prisma.examRegistrationCourse.createMany({ data: ids.map((courseId) => ({ registrationId: reg.id, courseId })) }),
          prisma.examRegistration.update({ where: { id: reg.id }, data: { submittedAt: new Date(), examNumber: reg.examNumber || candidate } })
        ]);
        examNumber = reg.examNumber || candidate;
      } catch {
        /* exam number collision - retry */
      }
    }
    if (!examNumber) return failure(res, "Unable to complete the registration. Please try again.", 500);
    await prisma.notification.create({
      data: {
        userId: req.user.id,
        type: "EXAM",
        title: "Exam registration complete",
        message: `You are registered for ${ids.length} subject(s). Exam number: ${examNumber}. Download your exam docket from Exam Registration.`
      }
    });
    return success(res, { message: "Exam registration complete.", examNumber });
  } catch (e) {
    console.error("exam-reg subjects error:", e);
    return failure(res, "Unable to register your subjects.", 500);
  }
});

/* =========================================================
   ADMIN
========================================================= */
router.get("/admin/courses", requireRole("ADMIN"), async (_req, res) => {
  const courses = await prisma.course.findMany({ orderBy: { title: "asc" }, select: { id: true, title: true } });
  return success(res, { courses });
});

const sessionSchema = z.object({
  title: z.string().trim().min(3).max(150),
  session: z.string().trim().min(4).max(20),
  term: z.string().trim().max(40).optional().or(z.literal("")),
  fee: z.number().min(0).max(10000000),
  opensAt: z.string().optional().or(z.literal("")),
  closesAt: z.string().optional().or(z.literal("")),
  courseIds: z.array(z.string()).min(1).max(60)
});

router.get("/admin/sessions", requireRole("ADMIN"), async (_req, res) => {
  try {
    const sessions = await prisma.examSession.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        courses: { include: { course: { select: { title: true } } } },
        registrations: { select: { status: true, submittedAt: true } }
      }
    });
    return success(res, {
      sessions: sessions.map((s) => ({
        id: s.id,
        title: s.title,
        session: s.session,
        term: s.term,
        fee: Number(s.fee),
        opensAt: s.opensAt,
        closesAt: s.closesAt,
        active: s.active,
        subjects: s.courses.map((c) => c.course.title),
        paid: s.registrations.filter((r) => r.status === "PAID").length,
        registered: s.registrations.filter((r) => r.submittedAt).length
      }))
    });
  } catch (e) {
    console.error("exam sessions error:", e);
    return failure(res, "Unable to load exam sessions.", 500);
  }
});

router.post("/admin/sessions", requireRole("ADMIN"), async (req, res) => {
  const p = sessionSchema.safeParse(req.body);
  if (!p.success) return failure(res, "Enter a title, session, fee and select at least one subject.", 422);
  const d = p.data;
  try {
    await prisma.examSession.create({
      data: {
        title: d.title,
        session: d.session,
        term: d.term || null,
        fee: d.fee,
        opensAt: d.opensAt ? new Date(d.opensAt) : null,
        closesAt: d.closesAt ? new Date(d.closesAt + "T23:59:59") : null,
        courses: { create: d.courseIds.map((courseId) => ({ courseId })) }
      }
    });
    return success(res, { message: "Exam session created." }, 201);
  } catch (e) {
    console.error("exam session create error:", e);
    return failure(res, "Unable to create the exam session.", 500);
  }
});

router.post("/admin/sessions/:id/toggle", requireRole("ADMIN"), async (req, res) => {
  const s = await prisma.examSession.findUnique({ where: { id: String(req.params.id) } });
  if (!s) return failure(res, "Not found.", 404);
  await prisma.examSession.update({ where: { id: s.id }, data: { active: !s.active } });
  return success(res, { message: s.active ? "Session closed." : "Session opened." });
});

router.get("/admin/registrations/:sessionId", requireRole("ADMIN"), async (req, res) => {
  try {
    const regs = await prisma.examRegistration.findMany({
      where: { examSessionId: String(req.params.sessionId) },
      orderBy: { createdAt: "desc" },
      include: {
        student: { select: { matricNumber: true, user: { select: { id: true, firstName: true, lastName: true, email: true } } } },
        courses: { include: { course: { select: { title: true } } } }
      }
    });
    return success(res, {
      registrations: regs.map((r) => ({
        id: r.id,
        userId: r.student.user.id,
        name: `${r.student.user.firstName} ${r.student.user.lastName}`.trim(),
        email: r.student.user.email,
        matric: r.student.matricNumber,
        status: r.status,
        examNumber: r.examNumber,
        subjects: r.courses.map((c) => c.course.title)
      }))
    });
  } catch (e) {
    console.error("exam registrations error:", e);
    return failure(res, "Unable to load registrations.", 500);
  }
});

/* Record a payment made by cash / bank transfer. */
router.post("/admin/record", requireRole("ADMIN"), async (req, res) => {
  const p = z.object({ sessionId: z.string().min(5), studentEmail: z.string().trim().email() }).safeParse(req.body);
  if (!p.success) return failure(res, "Enter the student's email.", 422);
  try {
    const user = await prisma.user.findUnique({
      where: { email: p.data.studentEmail.toLowerCase() },
      select: { studentProfile: { select: { id: true } } }
    });
    const s = await prisma.examSession.findUnique({ where: { id: p.data.sessionId } });
    if (!user?.studentProfile) return failure(res, "No student found with that email.", 404);
    if (!s) return failure(res, "Exam session not found.", 404);
    await prisma.examRegistration.upsert({
      where: { examSessionId_studentId: { examSessionId: s.id, studentId: user.studentProfile.id } },
      create: {
        examSessionId: s.id, studentId: user.studentProfile.id, amount: s.fee, status: "PAID", provider: "CASH",
        reference: `MAN-EXM-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`, paidAt: new Date()
      },
      update: { status: "PAID", paidAt: new Date() }
    });
    return success(res, { message: "Payment recorded. The student can now choose exam subjects." });
  } catch (e) {
    console.error("exam record error:", e);
    return failure(res, "Unable to record the payment.", 500);
  }
});

export default router;
