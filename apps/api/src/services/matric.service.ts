import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { sendMail, mailConfigured } from "./mail.service";

/**
 * Gives an approved student a matric number: MIA-<year of admission>-<4 digit serial>.
 * Safe to call many times - an existing number is never changed.
 * Returns the matric number, or null if the student cannot be found.
 */
export async function ensureMatricNumber(
  profileId: string,
  options: { announce?: boolean } = {}
): Promise<string | null> {
  const profile = await prisma.studentProfile.findUnique({
    where: { id: profileId },
    select: {
      id: true,
      matricNumber: true,
      userId: true,
      user: { select: { firstName: true, email: true } }
    }
  });
  if (!profile) return null;
  if (profile.matricNumber) return profile.matricNumber;

  const year = new Date().getFullYear();
  const prefix = `MIA-${year}-`;

  for (let attempt = 0; attempt < 6; attempt++) {
    const last = await prisma.studentProfile.findFirst({
      where: { matricNumber: { startsWith: prefix } },
      orderBy: { matricNumber: "desc" },
      select: { matricNumber: true }
    });
    const lastSerial = last?.matricNumber ? parseInt(last.matricNumber.slice(prefix.length), 10) || 0 : 0;
    const matric = `${prefix}${String(lastSerial + 1 + attempt).padStart(4, "0")}`;
    try {
      await prisma.studentProfile.update({ where: { id: profile.id }, data: { matricNumber: matric } });
    } catch {
      continue; // another student took this number - try the next one
    }

    if (options.announce !== false) {
      try {
        await prisma.notification.create({
          data: {
            userId: profile.userId,
            type: "SYSTEM",
            title: "Your Student ID Number",
            message: `Congratulations! Your student ID number is ${matric}. Use it with your password to log in. Keep it safe.`
          }
        });
      } catch (e) {
        console.error("matric notification failed:", e);
      }
      if (mailConfigured()) {
        const link = (env.APP_URL || "").replace(/\/$/, "");
        void sendMail(
          profile.user.email,
          "Your Student ID Number - MAKNAZUL IRFAN ACADEMY",
          `Assalamu alaikum ${profile.user.firstName},\n\nCongratulations! Your admission has been approved.\n\nYour student ID number is: ${matric}\n\nTo log in, open ${link}/login.html and enter this ID number with the password you chose when registering (use "Forgot password" if you need a new one). Please keep the ID safe.\n\nMAKNAZUL IRFAN ACADEMY`
        ).catch((e) => console.error("matric email failed:", e));
      }
    }
    return matric;
  }
  return null;
}
