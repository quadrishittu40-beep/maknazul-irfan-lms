import { Router } from "express";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { requireAuth, createSession } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { hashPassword, verifyPassword } from "../utils/password";
import { sendMail, mailConfigured } from "../services/mail.service";
import { env } from "../config/env";

const router = Router();

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Random access code like K7M2P-9XQ4R (10 characters, no look-alike letters). */
function makeCode(): string {
  let out = "";
  const bytes = crypto.randomBytes(10);
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

function normalise(code: string): string {
  return String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many attempts. Please wait 15 minutes and try again." }
});

/* Staff / admin sign-in: email + access code */
router.post("/login", loginLimiter, async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const code = normalise(req.body?.code);
    if (!email || !code) return failure(res, "Enter your email and access code.", 422);

    const user = await prisma.user.findUnique({ where: { email } });
    const ok =
      user &&
      user.isActive &&
      (user.role === "ADMIN" || user.role === "TEACHER") &&
      (user as any).accessCodeHash &&
      (await verifyPassword((user as any).accessCodeHash, code).catch(() => false));

    if (!user || !ok) return failure(res, "Invalid email or access code.", 401);

    createSession(res, user.id);
    return success(res, {
      user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role }
    });
  } catch (e) {
    next(e);
  }
});

/* Admin: generate (or replace) a staff member's access code. Shown once, and emailed when email is set up. */
router.post("/generate", requireAuth, requireRole("ADMIN"), async (req, res, next) => {
  try {
    const userId = String(req.body?.userId || "");
    const email = String(req.body?.email || "").trim().toLowerCase();
    const user = userId
      ? await prisma.user.findUnique({ where: { id: userId } })
      : email
      ? await prisma.user.findUnique({ where: { email } })
      : null;

    if (!user) return failure(res, "Staff member not found.", 404);
    if (user.role !== "ADMIN" && user.role !== "TEACHER") {
      return failure(res, "Access codes are only for teachers and admins.", 400);
    }

    const code = makeCode();
    const hash = await hashPassword(normalise(code));
    await prisma.user.update({ where: { id: user.id }, data: { accessCodeHash: hash } as any });

    let emailed = false;
    if (mailConfigured()) {
      const link = (env.APP_URL || "").replace(/\/$/, "");
      emailed = true;
      void sendMail(
        user.email,
        "Your Staff Access Code - MAKNAZUL IRFAN ACADEMY",
        `Assalamu alaikum ${user.firstName},\n\nYour staff access code is: ${code}\n\nLog in at ${link}/staff-login.html with your email (${user.email}) and this code. Keep it private.\n\nMAKNAZUL IRFAN ACADEMY`
      ).catch((e) => console.error("access code email failed:", e));
    }

    return success(res, {
      message: "Access code created. Copy it now - it will not be shown again.",
      code,
      emailed,
      email: user.email
    });
  } catch (e) {
    next(e);
  }
});

export default router;
