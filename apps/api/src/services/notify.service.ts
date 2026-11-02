import { prisma } from "../config/prisma";

/* Sends a notification to every student enrolled in a course. Never throws. */
export async function notifyCourseStudents(
  courseId: string,
  type: "COURSE" | "LIVE_CLASS" | "EXAM" | "ANNOUNCEMENT",
  title: string,
  message: string
): Promise<void> {
  try {
    const enrolments = await prisma.courseEnrollment.findMany({
      where: { courseId },
      select: { student: { select: { userId: true } } }
    });
    const ids = Array.from(new Set(enrolments.map((e) => e.student.userId)));
    if (!ids.length) return;
    await prisma.notification.createMany({
      data: ids.map((userId) => ({ userId, type, title, message }))
    });
  } catch (e) {
    console.error("notifyCourseStudents failed:", e);
  }
}
