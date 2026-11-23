import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { hashPassword } from "../utils/password";
import { success, failure } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const router = Router();
router.use(requireAuth);

/* ---------- Parent: my children with a summary ---------- */
router.get("/children", requireRole("PARENT"), async (req: any, res) => {
  try {
    const links = await prisma.parentLink.findMany({
      where: { parentId: req.user.id },
      include: {
        student: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            studentProfile: {
              select: {
                id: true,
                status: true,
                admissionFee: { select: { status: true, amount: true } },
                enrollments: { select: { course: { select: { id: true, title: true } } } },
                payments: {
                  orderBy: { createdAt: "desc" },
                  select: { id: true, amount: true, status: true, provider: true, createdAt: true, course: { select: { title: true } } }
                }
              }
            }
          }
        }
      }
    });

    const children = [];
    for (const l of links) {
      const s = l.student;
      const sp = s.studentProfile;
      const attempts = await prisma.testAttempt.findMany({
        where: { studentId: s.id, status: "SUBMITTED" },
        orderBy: { submittedAt: "desc" },
        select: {
          percentage: true,
          passed: true,
          submittedAt: true,
          test: { select: { title: true, course: { select: { id: true, title: true } } } }
        }
      });
      const byCourse = new Map<string, { title: string; pcts: number[] }>();
      attempts.forEach((a) => {
        const c = a.test.course;
        const k = c ? c.id : "none";
        const e = byCourse.get(k) || { title: c ? c.title : "General", pcts: [] };
        e.pcts.push(a.percentage !== null ? Number(a.percentage) : 0);
        byCourse.set(k, e);
      });
      const courses = Array.from(byCourse.values()).map((c) => ({
        title: c.title,
        tests: c.pcts.length,
        average: Math.round((c.pcts.reduce((t, n) => t + n, 0) / c.pcts.length) * 10) / 10
      }));
      const overall = attempts.length
        ? Math.round((attempts.reduce((t, a) => t + (a.percentage !== null ? Number(a.percentage) : 0), 0) / attempts.length) * 10) / 10
        : null;

      const courseIds = (sp?.enrollments || []).map((e) => e.course.id);
      const held = courseIds.length
        ? await prisma.liveClass.findMany({
            where: { courseId: { in: courseIds }, published: true, scheduledEnd: { lt: new Date() } },
            select: { id: true }
          })
        : [];
      const attended = held.length
        ? await prisma.liveAttendance.count({
            where: { userId: s.id, liveClassId: { in: held.map((h) => h.id) } }
          })
        : 0;

      const payments = (sp?.payments || []).map((p) => ({
        id: p.id,
        course: p.course.title,
        amount: Number(p.amount),
        status: p.status,
        provider: p.provider,
        date: p.createdAt
      }));

      children.push({
        userId: s.id,
        name: `${s.firstName} ${s.lastName}`.trim(),
        email: s.email,
        status: sp ? sp.status : "PENDING",
        admissionFee: sp?.admissionFee ? { status: sp.admissionFee.status, amount: Number(sp.admissionFee.amount) } : null,
        courses: courses,
        enrolled: (sp?.enrollments || []).map((e) => e.course.title),
        overallAverage: overall,
        recentResults: attempts.slice(0, 8).map((a) => ({
          test: a.test.title,
          course: a.test.course ? a.test.course.title : "General",
          percentage: a.percentage !== null ? Number(a.percentage) : 0,
          passed: !!a.passed,
          date: a.submittedAt
        })),
        attendance: { held: held.length, attended },
        payments,
        totalPaid: payments.filter((p) => p.status === "PAID").reduce((t, p) => t + p.amount, 0),
        totalPending: payments.filter((p) => p.status === "PENDING").reduce((t, p) => t + p.amount, 0)
      });
    }
    return success(res, { children });
  } catch (error) {
    console.error("parent children error:", error);
    return failure(res, "Unable to load your children's records.", 500);
  }
});

/* ---------- Admin: create / link parent ---------- */
const createSchema = z.object({
  firstName: z.string().trim().min(1).max(60),
  lastName: z.string().trim().min(1).max(60),
  email: z.string().trim().email().max(150),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  password: z.string().min(8).max(100).optional().or(z.literal("")),
  studentEmail: z.string().trim().email().max(150)
});

router.post("/admin/create", requireRole("ADMIN"), async (req: any, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return failure(res, "Fill in all fields. The password needs 8 or more characters.", 422);
  const d = parsed.data;
  try {
    const student = await prisma.user.findUnique({
      where: { email: d.studentEmail.toLowerCase() },
      select: { id: true, role: true, firstName: true, lastName: true }
    });
    if (!student || student.role !== "STUDENT") return failure(res, "No student was found with that email.", 404);

    const email = d.email.toLowerCase();
    let parent = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } });
    let created = false;
    if (parent && parent.role !== "PARENT") return failure(res, "That email already belongs to a non-parent account.", 409);
    if (!parent) {
      if (!d.password) return failure(res, "Set a password (8 or more characters) for the new parent account.", 422);
      parent = await prisma.user.create({
        data: {
          email,
          passwordHash: await hashPassword(d.password),
          firstName: d.firstName,
          lastName: d.lastName,
          phone: d.phone || null,
          role: "PARENT"
        },
        select: { id: true, role: true }
      });
      created = true;
    }
    await prisma.parentLink.upsert({
      where: { parentId_studentUserId: { parentId: parent.id, studentUserId: student.id } },
      update: {},
      create: { parentId: parent.id, studentUserId: student.id }
    });
    return success(res, {
      created,
      message: created
        ? `Parent account created and linked to ${student.firstName} ${student.lastName}.`
        : `Existing parent linked to ${student.firstName} ${student.lastName}.`
    });
  } catch (error) {
    console.error("parent create error:", error);
    return failure(res, "Unable to create the parent account.", 500);
  }
});

router.get("/admin/list", requireRole("ADMIN"), async (_req, res) => {
  try {
    const links = await prisma.parentLink.findMany({
      orderBy: { createdAt: "desc" },
      take: 300,
      include: {
        parent: { select: { firstName: true, lastName: true, email: true, phone: true } },
        student: { select: { firstName: true, lastName: true, email: true } }
      }
    });
    return success(res, {
      links: links.map((l) => ({
        id: l.id,
        parent: `${l.parent.firstName} ${l.parent.lastName}`.trim(),
        parentEmail: l.parent.email,
        phone: l.parent.phone,
        student: `${l.student.firstName} ${l.student.lastName}`.trim(),
        studentEmail: l.student.email
      }))
    });
  } catch (error) {
    console.error("parent list error:", error);
    return failure(res, "Unable to load parents.", 500);
  }
});

router.delete("/admin/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    await prisma.parentLink.delete({ where: { id: String(req.params.id) } });
    return success(res, { message: "Link removed." });
  } catch {
    return failure(res, "Link not found.", 404);
  }
});

export default router;
