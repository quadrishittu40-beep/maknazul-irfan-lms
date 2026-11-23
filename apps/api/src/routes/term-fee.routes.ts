import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { feeForLevel, currentPeriod, periodInfo } from "../services/termfee.service";
import { initializeTermPayment, verifyTermPayment } from "../services/payment.service";

const router = Router();

/* =========================================================
   GUARD: the quarterly fee must be paid before a student can open
   lectures, classes, live classes, exams or results.
========================================================= */
export async function termFeeGuard(req: Request, res: Response, next: NextFunction) {
  try {
    const user: any = (req as any).user;
    if (!user || user.role !== "STUDENT") return next();
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: user.id },
      select: { id: true, level: { select: { name: true } } }
    });
    if (!profile) return next();
    const amount = feeForLevel(profile.level?.name);
    if (amount === null) return next(); // level not recognised: no fee set
    const { period } = currentPeriod();
    const rec = await prisma.termFee.findUnique({
      where: { studentId_period: { studentId: profile.id, period } },
      select: { status: true }
    });
    if (rec?.status === "PAID") return next();
    return res.status(402).json({
      success: false,
      code: "TERM_FEE_DUE",
      message: "Your quarterly fee is not paid yet. Please pay it under Quarterly Fee to continue."
    });
  } catch (error) {
    console.error("termFeeGuard error:", error);
    return failure(res, "Unable to check your fee status.", 500);
  }
}

router.use(requireAuth);

/* =========================================================
   STUDENT
========================================================= */
router.get("/me", requireRole("STUDENT"), async (req: any, res) => {
  try {
    const profile = await prisma.studentProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true, level: { select: { name: true } } }
    });
    if (!profile) return failure(res, "Student profile not found.", 404);
    const cur = currentPeriod();
    const amount = feeForLevel(profile.level?.name);
    const history = await prisma.termFee.findMany({
      where: { studentId: profile.id },
      orderBy: { createdAt: "desc" },
      take: 12
    });
    const now = history.find((h) => h.period === cur.period);
    return success(res, {
      level: profile.level?.name || null,
      period: cur.period,
      label: cur.label,
      amount,
      required: amount !== null,
      paid: amount === null ? true : now?.status === "PAID",
      history: history.map((h) => ({
        id: h.id,
        period: h.period,
        label: periodInfo(h.period).label,
        amount: Number(h.amount),
        status: h.status,
        provider: h.provider,
        reference: h.reference,
        paidAt: h.paidAt
      }))
    });
  } catch (error) {
    console.error("term-fee me error:", error);
    return failure(res, "Unable to load your fee status.", 500);
  }
});

router.post("/pay", requireRole("STUDENT"), async (req: any, res) => {
  try {
    const out = await initializeTermPayment(req.user.id, `${process.env.APP_URL || ""}/fees.html`);
    return success(res, out);
  } catch (error: any) {
    return failure(res, error.message || "Unable to start the payment.", 400);
  }
});

router.get("/verify/:reference", requireRole("STUDENT"), async (req: any, res) => {
  try {
    const rec = await verifyTermPayment(req.user.id, String(req.params.reference));
    return success(res, { status: rec.status, paid: rec.status === "PAID" });
  } catch (error: any) {
    return failure(res, error.message || "Unable to verify the payment.", 400);
  }
});

/* =========================================================
   ADMIN
========================================================= */
router.get("/admin/list", requireRole("ADMIN"), async (req, res) => {
  try {
    const cur = currentPeriod();
    const period = periodInfo(String(req.query.period || cur.period)).period;
    const q = String(req.query.q || "").trim();
    const students = await prisma.studentProfile.findMany({
      where: {
        ...(q
          ? {
              OR: [
                { user: { firstName: { contains: q, mode: "insensitive" } } },
                { user: { lastName: { contains: q, mode: "insensitive" } } },
                { user: { email: { contains: q, mode: "insensitive" } } },
                { matricNumber: { contains: q, mode: "insensitive" } }
              ]
            }
          : {})
      },
      select: {
        id: true,
        matricNumber: true,
        user: { select: { firstName: true, lastName: true, email: true } },
        level: { select: { name: true } },
        termFees: { where: { period } }
      },
      orderBy: { createdAt: "desc" },
      take: 300
    });
    const rows = students.map((s) => {
      const f = s.termFees[0];
      const amount = feeForLevel(s.level?.name);
      return {
        studentId: s.id,
        name: `${s.user.firstName} ${s.user.lastName}`.trim(),
        email: s.user.email,
        matric: s.matricNumber,
        level: s.level?.name || null,
        amount,
        status: amount === null ? "NO_FEE" : f?.status === "PAID" ? "PAID" : "UNPAID",
        provider: f?.status === "PAID" ? f.provider : null,
        reference: f?.status === "PAID" ? f.reference : null,
        feeId: f?.status === "PAID" ? f.id : null,
        paidAt: f?.paidAt || null
      };
    });
    return success(res, { period, label: periodInfo(period).label, rows });
  } catch (error) {
    console.error("term-fee admin list error:", error);
    return failure(res, "Unable to load fees.", 500);
  }
});

const recordSchema = z.object({
  studentId: z.string().min(1),
  provider: z.enum(["CASH", "BANK_TRANSFER"]),
  period: z.string().optional(),
  note: z.string().max(200).optional()
});

router.post("/admin/record", requireRole("ADMIN"), async (req, res) => {
  try {
    const body = recordSchema.parse(req.body);
    const student = await prisma.studentProfile.findUnique({
      where: { id: body.studentId },
      select: { id: true, userId: true, level: { select: { name: true } } }
    });
    if (!student) return failure(res, "Student not found.", 404);
    const amount = feeForLevel(student.level?.name);
    if (amount === null) return failure(res, "This student's level has no quarterly fee.", 400);
    const period = periodInfo(body.period || currentPeriod().period).period;
    const reference = `TRM-${Date.now()}-${Math.random().toString(16).slice(2, 8).toUpperCase()}`;
    await prisma.termFee.upsert({
      where: { studentId_period: { studentId: student.id, period } },
      create: {
        studentId: student.id, period, amount, status: "PAID", provider: body.provider,
        reference, note: body.note || null, paidAt: new Date()
      },
      update: {
        amount, status: "PAID", provider: body.provider, reference,
        note: body.note || null, paidAt: new Date()
      }
    });
    await prisma.notification.create({
      data: {
        userId: student.userId,
        type: "PAYMENT",
        title: "Quarterly fee received",
        message: `Your quarterly fee for ${periodInfo(period).label} was recorded. You now have full access.`
      }
    });
    return success(res, { message: "Payment recorded." });
  } catch (error: any) {
    if (error?.issues) return failure(res, "Invalid details.", 400);
    console.error("term-fee record error:", error);
    return failure(res, "Unable to record the payment.", 500);
  }
});

/* Undo a manual (cash / bank transfer) record made by mistake */
router.delete("/admin/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    const rec = await prisma.termFee.findUnique({ where: { id: String(req.params.id) } });
    if (!rec) return failure(res, "Record not found.", 404);
    if (rec.provider === "PAYSTACK") return failure(res, "Online payments cannot be removed.", 400);
    await prisma.termFee.delete({ where: { id: rec.id } });
    return success(res, { message: "Record removed." });
  } catch (error) {
    console.error("term-fee delete error:", error);
    return failure(res, "Unable to remove the record.", 500);
  }
});

export default router;
