import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { sendMail, mailConfigured } from "./mail.service";

/* Emails the same message to users in the background. Never throws, never blocks the request. */
export function emailUsers(userIds: string[], title: string, message: string): void {
  if (!mailConfigured() || !userIds.length) return;
  void (async () => {
    try {
      const users = await prisma.user.findMany({
        where: { id: { in: Array.from(new Set(userIds)) } },
        select: { email: true, firstName: true }
      });
      const link = (env.APP_URL || "").replace(/\/$/, "");
      for (const u of users) {
        await sendMail(
          u.email,
          `${title} - MAKNAZUL IRFAN ACADEMY`,
          `Assalamu alaikum ${u.firstName},\n\n${message}\n\nOpen your portal: ${link}/login.html\n\nMAKNAZUL IRFAN ACADEMY`
        );
      }
    } catch (e) {
      console.error("emailUsers failed:", e);
    }
  })();
}

/* Sends a notification (and an email when SMTP is set up) to every student enrolled in a course. Never throws. */
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
    emailUsers(ids, title, message);
  } catch (e) {
    console.error("notifyCourseStudents failed:", e);
  }
}
