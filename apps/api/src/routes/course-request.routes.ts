import { Router } from "express";
import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { feeForLevel, hasPaidCurrentTerm } from "../services/termfee.service";

const router = Router();
router.use(requireAuth);

const OK_STATUS = ["APPROVED", "ENROLLED"];

async function studentContext(userId: string) {
  return prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true, status: true, levelId: true, level: { select: { name: true } } }
  });
}

/* A student may register courses only after the quarterly fee is paid */
async function feeOk(student: { id: string; level: { name: string } | null }) {
  if (feeForLevel(student.level?.name) === null) return true;
  return hasPaidCurrentTerm(student.id);
}

/* =========================================================
   STUDENT
========================================================= */
router.get("/available", requireRole("STUDENT"), async (req: any, res) => {
  try {
    const student = await studentContext(req.user.id);
    if (!student) return failure(res, "Student profile not found.", 404);
    const admitted = OK_STATUS.includes(student.status);
    const paid = await feeOk(student);

    const courses = await prisma.course.findMany({
      where: {
        status: "PUBLISHED",
        ...(student.levelId ? { OR: [{ levelId: student.levelId }, { levelId: null }] } : {})
      },
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        description: true,
        subject: { select: { name: true } },
        teacher: { select: { firstName: true, lastName: true } }
      }
    });
    const enrolled = await prisma.courseEnrollment.findMany({
      where: { studentId: student.id },
      select: { courseId: true }
    });
    const requests = await prisma.courseRequest.findMany({
      where: { studentId: student.id },
      select: { courseId: true, status: true, note: true }
    });
    const enrolledSet = new Set(enrolled.map((e) => e.courseId));
    const reqMap = new Map(requests.map((r) => [r.courseId, r]));

    return success(res, {
      admitted,
      feePaid: paid,
      courses: courses.map((c) => {
        const r = reqMap.get(c.id);
        return {
          id: c.id,
          title: c.title,
          description: c.description,
          subject: c.subject?.name || null,
          teacher: c.teacher ? `${c.teacher.firstName} ${c.teacher.lastName}`.trim() : null,
          enrolled: enrolledSet.has(c.id),
          requestStatus: r ? r.status : null,
          requestNote: r?.note || null
        };
      })
    });
  } catch (error) {
    console.error("course-request available error:", error);
    return failure(res, "Unable to load courses.", 500);
  }
});

router.post("/:courseId", requireRole("STUDENT"), async (req: any, res) => {
  try {
    const courseId = String(req.params.courseId);
    const student = await studentContext(req.user.id);
    if (!student) return failure(res, "Student profile not found.", 404);
    if (!OK_STATUS.includes(student.status)) {
      return failure(res, "Your admission must be approved before you can register courses.", 403);
    }
    if (!(await feeOk(student))) {
      return failure(res, "Pay your quarterly fee first, then you can register your courses.", 402);
    }
    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true, status: true, levelId: true, teacherId: true }
    });
    if (!course || course.status !== "PUBLISHED") return failure(res, "This course is not available.", 404);
    if (course.levelId && student.levelId && course.levelId !== student.levelId) {
      return failure(res, "This course is not for your class level.", 403);
    }
    const already = await prisma.courseEnrollment.findUnique({
      where: { studentId_courseId: { studentId: student.id, courseId } }
    });
    if (already) return failure(res, "You are already enrolled in this course.", 400);

    await prisma.courseRequest.upsert({
      where: { studentId_courseId: { studentId: student.id, courseId } },
      create: { studentId: student.id, courseId, status: "PENDING" },
      update: { status: "PENDING", note: null, decidedAt: null, decidedById: null }
    });

    if (course.teacherId) {
      const me = await prisma.user.findUnique({ where: { id: req.user.id }, select: { firstName: true, lastName: true } });
      await prisma.notification.create({
        data: {
          userId: course.teacherId,
          type: "COURSE",
          title: "New course registration request",
          message: `${me?.firstName || "A student"} ${me?.lastName || ""} asked to register for ${course.title}. Open the course page to approve or reject.`
        }
      });
    }
    return success(res, { message: "Request sent. Your teacher will approve it shortly." }, 201);
  } catch (error) {
    console.error("course-request create error:", error);
    return failure(res, "Unable to send the request.", 500);
  }
});

router.delete("/:courseId", requireRole("STUDENT"), async (req: any, res) => {
  try {
    const student = await studentContext(req.user.id);
    if (!student) return failure(res, "Student profile not found.", 404);
    await prisma.courseRequest.deleteMany({
      where: { studentId: student.id, courseId: String(req.params.courseId), status: "PENDING" }
    });
    return success(res, { message: "Request cancelled." });
  } catch (error) {
    console.error("course-request cancel error:", error);
    return failure(res, "Unable to cancel the request.", 500);
  }
});

/* =========================================================
   TEACHER / ADMIN
========================================================= */
router.get("/pending", requireRole("TEACHER", "ADMIN"), async (req: any, res) => {
  try {
    const courseId = req.query.courseId ? String(req.query.courseId) : undefined;
    const rows = await prisma.courseRequest.findMany({
      where: {
        status: "PENDING",
        ...(courseId ? { courseId } : {}),
        ...(req.user.role === "TEACHER" ? { course: { teacherId: req.user.id } } : {})
      },
      orderBy: { createdAt: "asc" },
      take: 300,
      include: {
        course: { select: { id: true, title: true } },
        student: {
          select: {
            matricNumber: true,
            level: { select: { name: true } },
            user: { select: { firstName: true, lastName: true, email: true } }
          }
        }
      }
    });
    return success(res, {
      requests: rows.map((r) => ({
        id: r.id,
        courseId: r.course.id,
        course: r.course.title,
        name: `${r.student.user.firstName} ${r.student.user.lastName}`.trim(),
        email: r.student.user.email,
        matric: r.student.matricNumber,
        level: r.student.level?.name || null,
        createdAt: r.createdAt
      }))
    });
  } catch (error) {
    console.error("course-request pending error:", error);
    return failure(res, "Unable to load requests.", 500);
  }
});

async function decide(req: any, res: any, approve: boolean) {
  try {
    const r = await prisma.courseRequest.findUnique({
      where: { id: String(req.params.id) },
      include: {
        course: { select: { id: true, title: true, teacherId: true } },
        student: { select: { id: true, userId: true, status: true } }
      }
    });
    if (!r) return failure(res, "Request not found.", 404);
    if (req.user.role === "TEACHER" && r.course.teacherId !== req.user.id) {
      return failure(res, "This is not your course.", 403);
    }
    if (r.status !== "PENDING") return failure(res, "This request was already handled.", 400);

    if (approve) {
      await prisma.courseEnrollment.upsert({
        where: { studentId_courseId: { studentId: r.student.id, courseId: r.course.id } },
        create: { studentId: r.student.id, courseId: r.course.id },
        update: {}
      });
      if (r.student.status === "APPROVED") {
        await prisma.studentProfile.update({ where: { id: r.student.id }, data: { status: "ENROLLED" } });
      }
    }
    const note = req.body && req.body.note ? String(req.body.note).slice(0, 200) : null;
    await prisma.courseRequest.update({
      where: { id: r.id },
      data: { status: approve ? "APPROVED" : "REJECTED", note, decidedById: req.user.id, decidedAt: new Date() }
    });
    await prisma.notification.create({
      data: {
        userId: r.student.userId,
        type: "COURSE",
        title: approve ? "Course registration approved" : "Course registration declined",
        message: approve
          ? `You are now enrolled in ${r.course.title}.`
          : `Your request for ${r.course.title} was declined.${note ? " Reason: " + note : ""}`
      }
    });
    return success(res, { message: approve ? "Student enrolled." : "Request declined." });
  } catch (error) {
    console.error("course-request decide error:", error);
    return failure(res, "Unable to save the decision.", 500);
  }
}

router.post("/:id/approve", requireRole("TEACHER", "ADMIN"), (req, res) => decide(req, res, true));
router.post("/:id/reject", requireRole("TEACHER", "ADMIN"), (req, res) => decide(req, res, false));

export default router;
