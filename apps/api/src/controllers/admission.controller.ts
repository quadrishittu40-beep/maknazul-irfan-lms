import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { success, failure } from "../utils/http";
import {
  ADMISSION_FEE_AMOUNT,
  initializeAdmissionPayment,
  verifyAdmissionPayment
} from "../services/payment.service";

function me(req: Request) {
  return (req as AuthenticatedRequest).user!;
}

function pub(f: any) {
  if (!f) return null;
  return {
    id: f.id,
    amount: Number(f.amount),
    currency: f.currency,
    status: f.status,
    provider: f.provider,
    reference: f.reference,
    hasProof: Boolean(f.proofMime),
    paidAt: f.paidAt,
    createdAt: f.createdAt
  };
}

async function myStudent(userId: string) {
  return prisma.studentProfile.findUnique({
    where: { userId },
    include: { admissionFee: true }
  });
}

export async function myAdmission(req: Request, res: Response, next: NextFunction) {
  try {
    const s = await myStudent(me(req).id);
    if (!s) return failure(res, "Student profile not found.", 404);
    return success(res, {
      fee: pub(s.admissionFee),
      amount: ADMISSION_FEE_AMOUNT,
      studentStatus: s.status,
      bank: {
        bankName: process.env.BANK_NAME || "",
        accountName: process.env.BANK_ACCOUNT_NAME || "",
        accountNumber: process.env.BANK_ACCOUNT_NUMBER || ""
      }
    });
  } catch (e) { next(e); }
}

export async function payWithCard(req: Request, res: Response, next: NextFunction) {
  try {
    const r = await initializeAdmissionPayment(me(req).id);
    return success(res, r);
  } catch (e) {
    return failure(res, e instanceof Error ? e.message : "Unable to start the payment.", 400);
  }
}

export async function verifyCard(req: Request, res: Response, next: NextFunction) {
  try {
    const f = await verifyAdmissionPayment(me(req).id, req.params.reference);
    return success(res, { fee: pub(f) });
  } catch (e) {
    return failure(res, e instanceof Error ? e.message : "Unable to verify the payment.", 400);
  }
}

export async function startBank(req: Request, res: Response, next: NextFunction) {
  try {
    const s = await myStudent(me(req).id);
    if (!s) return failure(res, "Student profile not found.", 404);
    if (s.admissionFee?.status === "PAID") return failure(res, "Your admission fee is already paid.", 400);
    const fee = await prisma.admissionFee.upsert({
      where: { studentId: s.id },
      create: {
        studentId: s.id,
        amount: ADMISSION_FEE_AMOUNT,
        provider: "BANK_TRANSFER",
        reference: `ADM-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`
      },
      update: { provider: "BANK_TRANSFER", status: "PENDING" }
    });
    return success(res, { fee: pub(fee) });
  } catch (e) { next(e); }
}

export async function uploadAdmissionProof(req: Request, res: Response, next: NextFunction) {
  try {
    const s = await myStudent(me(req).id);
    if (!s || !s.admissionFee || s.admissionFee.provider !== "BANK_TRANSFER") {
      return failure(res, "Start a bank transfer first.", 400);
    }
    if (s.admissionFee.status !== "PENDING") return failure(res, "This payment is already closed.", 400);
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || !body.length) return failure(res, "No file received.", 400);
    if (body.length > 4 * 1024 * 1024) return failure(res, "File is too large (max 4 MB).", 400);
    const mime = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
    if (!/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(mime)) {
      return failure(res, "Please upload a photo (JPG/PNG) or a PDF.", 400);
    }
    await prisma.admissionFee.update({ where: { id: s.admissionFee.id }, data: { proofMime: mime, proofData: body } });
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    if (admins.length) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "PAYMENT" as const,
          title: "Admission fee proof received",
          message: `Admission fee ${s.admissionFee!.reference} is waiting for your approval.`
        }))
      });
    }
    return success(res, { uploaded: true });
  } catch (e) { next(e); }
}

export async function admissionProof(req: Request, res: Response, next: NextFunction) {
  try {
    const user = me(req);
    const f = await prisma.admissionFee.findUnique({
      where: { id: req.params.id },
      include: { student: { select: { userId: true } } }
    });
    if (!f || !f.proofData || !f.proofMime) return failure(res, "No proof uploaded.", 404);
    if (user.role !== "ADMIN" && f.student.userId !== user.id) return failure(res, "Access denied.", 403);
    res.setHeader("Content-Type", f.proofMime);
    res.setHeader("Content-Disposition", "inline");
    res.send(Buffer.from(f.proofData));
  } catch (e) { next(e); }
}

/* ---------------- Admin ---------------- */

export async function listAdmissionFees(_req: Request, res: Response, next: NextFunction) {
  try {
    const fees = await prisma.admissionFee.findMany({
      orderBy: { createdAt: "desc" },
      include: { student: { include: { user: { select: { firstName: true, lastName: true, email: true } } } } }
    });
    return success(res, {
      fees: fees.map((f) => ({
        ...pub(f),
        studentId: f.studentId,
        name: `${f.student.user.firstName} ${f.student.user.lastName}`.trim(),
        email: f.student.user.email,
        studentStatus: f.student.status
      }))
    });
  } catch (e) { next(e); }
}

async function markPaid(studentId: string, provider: "CASH" | "BANK_TRANSFER", amount: number) {
  const student = await prisma.studentProfile.findUnique({ where: { id: studentId }, select: { id: true, userId: true } });
  if (!student) return null;
  const fee = await prisma.admissionFee.upsert({
    where: { studentId },
    create: {
      studentId,
      amount,
      status: "PAID",
      provider,
      paidAt: new Date(),
      reference: `ADM-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`
    },
    update: { status: "PAID", provider, amount, paidAt: new Date() }
  });
  await prisma.notification.create({
    data: {
      userId: student.userId,
      type: "PAYMENT",
      title: "Admission fee confirmed",
      message: "Your admission fee was confirmed. The academy will now review and approve your admission."
    }
  });
  return fee;
}

export async function approveAdmissionFee(req: Request, res: Response, next: NextFunction) {
  try {
    const f = await prisma.admissionFee.findUnique({ where: { id: req.params.id } });
    if (!f) return failure(res, "Not found.", 404);
    if (f.status !== "PENDING") return failure(res, "This payment is already closed.", 400);
    await markPaid(f.studentId, f.provider === "CASH" ? "CASH" : "BANK_TRANSFER", Number(f.amount));
    return success(res, { approved: true });
  } catch (e) { next(e); }
}

export async function rejectAdmissionFee(req: Request, res: Response, next: NextFunction) {
  try {
    const f = await prisma.admissionFee.findUnique({
      where: { id: req.params.id },
      include: { student: { select: { userId: true } } }
    });
    if (!f) return failure(res, "Not found.", 404);
    if (f.status !== "PENDING") return failure(res, "This payment is already closed.", 400);
    const reason = String(req.body?.reason || "").slice(0, 300);
    await prisma.$transaction([
      prisma.admissionFee.update({ where: { id: f.id }, data: { status: "CANCELLED" } }),
      prisma.notification.create({
        data: {
          userId: f.student.userId,
          type: "PAYMENT",
          title: "Admission fee not confirmed",
          message: `We could not confirm your admission fee payment.${reason ? " Reason: " + reason : ""} Please try again or contact the academy.`
        }
      })
    ]);
    return success(res, { rejected: true });
  } catch (e) { next(e); }
}

/* Admin records an admission fee received in cash / directly; waived = no charge. */
export async function recordAdmissionFee(req: Request, res: Response, next: NextFunction) {
  try {
    const studentId = String(req.body?.studentId || "");
    const method = req.body?.method === "BANK_TRANSFER" ? "BANK_TRANSFER" : "CASH";
    const waived = Boolean(req.body?.waived);
    const fee = await markPaid(studentId, method, waived ? 0 : ADMISSION_FEE_AMOUNT);
    if (!fee) return failure(res, "Student not found.", 404);
    return success(res, { recorded: true });
  } catch (e) { next(e); }
}
