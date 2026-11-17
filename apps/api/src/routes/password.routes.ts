import { Router } from "express";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { env } from "../config/env";
import { hashPassword } from "../utils/password";
import { success, failure } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { sendMail, mailConfigured } from "../services/mail.service";

const router = Router();

function sha(t: string) {
  return crypto.createHash("sha256").update(t).digest("hex");
}

function appUrl(req: any): string {
  const configured = env.APP_URL || "";
  if (configured && !/localhost|127\.0\.0\.1/.test(configured)) return configured.replace(/\/$/, "");
  return `${req.protocol}://${req.get("host")}`;
}

const GENERIC =
  "If that email is registered, a reset link has been sent and the academy has been notified. If you do not receive it, please contact the academy and an administrator will reset your password.";

/* Public: ask for a password reset. */
router.post("/forgot", async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email().max(150) }).safeParse(req.body);
  if (!parsed.success) return failure(res, "Enter a valid email address.", 422);
  const email = parsed.data.email.toLowerCase();
  try {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, firstName: true, lastName: true, email: true }
    });
    if (user) {
      const recent = await prisma.passwordReset.count({
        where: { userId: user.id, createdAt: { gt: new Date(Date.now() - 60 * 60 * 1000) } }
      });
      if (recent < 3) {
        const token = crypto.randomBytes(32).toString("hex");
        await prisma.passwordReset.create({
          data: { userId: user.id, tokenHash: sha(token), expiresAt: new Date(Date.now() + 60 * 60 * 1000) }
        });
        const link = `${appUrl(req)}/reset-password.html?token=${token}`;
        if (mailConfigured()) {
          await sendMail(
            user.email,
            "Reset your MAKNAZUL IRFAN password",
            `Assalamu alaikum ${user.firstName},\n\nUse this link to choose a new password (valid for 1 hour):\n${link}\n\nIf you did not ask for this, ignore this message.\n\nMAKNAZUL IRFAN ACADEMY`
          );
        }
        const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
        if (admins.length) {
          await prisma.notification.createMany({
            data: admins.map((a) => ({
              userId: a.id,
              type: "ANNOUNCEMENT" as const,
              title: "Password reset requested",
              message: `${user.firstName} ${user.lastName} (${user.email}) asked to reset their password. You can set a new one from Admin > Reset Password.`
            }))
          });
        }
      }
    }
    return success(res, { message: GENERIC });
  } catch (e) {
    console.error("forgot password error:", e);
    return success(res, { message: GENERIC });
  }
});

/* Public: choose a new password with a valid token. */
router.post("/reset", async (req, res) => {
  const parsed = z
    .object({ token: z.string().min(20).max(200), password: z.string().min(8).max(100) })
    .safeParse(req.body);
  if (!parsed.success) return failure(res, "The password must be at least 8 characters.", 422);
  try {
    const row = await prisma.passwordReset.findUnique({ where: { tokenHash: sha(parsed.data.token) } });
    if (!row || row.usedAt || row.expiresAt < new Date()) {
      return failure(res, "This reset link is invalid or has expired. Please request a new one.", 400);
    }
    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.$transaction([
      prisma.user.update({ where: { id: row.userId }, data: { passwordHash } }),
      prisma.passwordReset.update({ where: { id: row.id }, data: { usedAt: new Date() } })
    ]);
    return success(res, { message: "Password changed. You can now log in." });
  } catch (e) {
    console.error("reset password error:", e);
    return failure(res, "Unable to reset the password.", 500);
  }
});

/* Admin: set a new password for any user. */
router.post("/admin/set", requireAuth, requireRole("ADMIN"), async (req, res) => {
  const parsed = z
    .object({ email: z.string().trim().email(), password: z.string().min(8).max(100) })
    .safeParse(req.body);
  if (!parsed.success) return failure(res, "Enter the user's email and a password of at least 8 characters.", 422);
  try {
    const user = await prisma.user.findUnique({
      where: { email: parsed.data.email.toLowerCase() },
      select: { id: true, firstName: true, lastName: true }
    });
    if (!user) return failure(res, "No user found with that email.", 404);
    const passwordHash = await hashPassword(parsed.data.password);
    await prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "ANNOUNCEMENT",
        title: "Password changed",
        message: "An administrator changed your password. If this was not expected, contact the academy."
      }
    });
    return success(res, { message: `Password changed for ${user.firstName} ${user.lastName}.` });
  } catch (e) {
    console.error("admin set password error:", e);
    return failure(res, "Unable to change the password.", 500);
  }
});

export default router;
