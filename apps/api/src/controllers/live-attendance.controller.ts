import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { success, failure } from "../utils/http";

function uid(req: Request): string | null {
  return (req as AuthenticatedRequest).user?.id ?? null;
}

/* A student opening the room (and the page pinging every minute) is recorded as present. */
export async function markAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = uid(req);
    if (!userId) return failure(res, "Authentication required.", 401);
    const lc = await prisma.liveClass.findUnique({
      where: { id: req.params.id },
      select: { id: true, courseId: true, published: true }
    });
    if (!lc || !lc.published) return failure(res, "Live class not found.", 404);
    const student = await prisma.studentProfile.findUnique({
      where: { userId },
      select: { id: true }
    });
    if (!student) return success(res, { recorded: false });
    const enrolled = await prisma.courseEnrollment.findUnique({
      where: { studentId_courseId: { studentId: student.id, courseId: lc.courseId } },
      select: { id: true }
    });
    if (!enrolled) return failure(res, "You are not enrolled in this course.", 403);
    await prisma.liveAttendance.upsert({
      where: { liveClassId_userId: { liveClassId: lc.id, userId } },
      create: { liveClassId: lc.id, userId },
      update: { lastSeenAt: new Date() }
    });
    return success(res, { recorded: true });
  } catch (e) { next(e); }
}

/* Teacher (own class) or admin: every enrolled student with present / absent. */
export async function getAttendance(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = uid(req);
    if (!userId) return failure(res, "Authentication required.", 401);
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const lc = await prisma.liveClass.findUnique({
      where: { id: req.params.id },
      select: { id: true, title: true, teacherId: true, courseId: true, scheduledStart: true }
    });
    if (!lc) return failure(res, "Live class not found.", 404);
    if (user?.role !== "ADMIN" && lc.teacherId !== userId) return failure(res, "Not allowed.", 403);
    const [enrolments, marks] = await Promise.all([
      prisma.courseEnrollment.findMany({
        where: { courseId: lc.courseId },
        include: { student: { include: { user: { select: { id: true, firstName: true, lastName: true } } } } }
      }),
      prisma.liveAttendance.findMany({ where: { liveClassId: lc.id } })
    ]);
    const byUser = new Map(marks.map((m) => [m.userId, m]));
    const students = enrolments.map((e) => {
      const u = e.student.user;
      const m = byUser.get(u.id);
      return {
        userId: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        present: Boolean(m),
        joinedAt: m?.joinedAt ?? null,
        minutes: m ? Math.max(1, Math.round((m.lastSeenAt.getTime() - m.joinedAt.getTime()) / 60000)) : 0
      };
    }).sort((a, b) => Number(b.present) - Number(a.present) || a.name.localeCompare(b.name));
    const present = students.filter((s) => s.present).length;
    return success(res, { title: lc.title, total: students.length, present, absent: students.length - present, students });
  } catch (e) { next(e); }
}
