import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { success, failure } from "../utils/http";

function me(req: Request) {
  return (req as AuthenticatedRequest).user!;
}

async function myStudent(userId: string) {
  return prisma.studentProfile.findUnique({
    where: { userId },
    select: { id: true, status: true }
  });
}

/* Bank details (set in Render environment) and the courses a student can still pay for. */
export async function bankInfo(req: Request, res: Response, next: NextFunction) {
  try {
    const student = await myStudent(me(req).id);
    if (!student) return failure(res, "Student profile not found.", 404);
    const enrolled = await prisma.courseEnrollment.findMany({
      where: { studentId: student.id },
      select: { courseId: true }
    });
    const courses = await prisma.course.findMany({
      where: {
        status: "PUBLISHED",
        price: { gt: 0 },
        id: { notIn: enrolled.map((e) => e.courseId) }
      },
      select: { id: true, title: true, price: true },
      orderBy: { title: "asc" }
    });
    return success(res, {
      bank: {
        bankName: process.env.BANK_NAME || "",
        accountName: process.env.BANK_ACCOUNT_NAME || "",
        accountNumber: process.env.BANK_ACCOUNT_NUMBER || ""
      },
      courses: courses.map((c) => ({ id: c.id, title: c.title, price: Number(c.price) }))
    });
  } catch (e) { next(e); }
}

export async function startBankPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const courseId = String(req.body?.courseId || "");
    const student = await myStudent(me(req).id);
    if (!student) return failure(res, "Student profile not found.", 404);
    if (student.status !== "APPROVED" && student.status !== "ENROLLED") {
      return failure(res, "Your student account is not approved for enrollment.", 400);
    }
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course || course.status !== "PUBLISHED") return failure(res, "Course not available.", 404);
    const amount = Number(course.price ?? 0);
    if (amount <= 0) return failure(res, "This course does not require payment.", 400);
    const enrolled = await prisma.courseEnrollment.findUnique({
      where: { studentId_courseId: { studentId: student.id, courseId } }
    });
    if (enrolled) return failure(res, "You are already enrolled in this course.", 400);

    const existing = await prisma.payment.findFirst({
      where: { studentId: student.id, courseId, provider: "BANK_TRANSFER", status: "PENDING" }
    });
    if (existing) return success(res, { payment: existing });

    const payment = await prisma.payment.create({
      data: {
        studentId: student.id,
        courseId,
        amount,
        currency: "NGN",
        status: "PENDING",
        provider: "BANK_TRANSFER",
        reference: `BT-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`
      }
    });
    return success(res, { payment }, 201);
  } catch (e) { next(e); }
}

export async function uploadProof(req: Request, res: Response, next: NextFunction) {
  try {
    const student = await myStudent(me(req).id);
    const payment = await prisma.payment.findUnique({ where: { id: req.params.id } });
    if (!student || !payment || payment.studentId !== student.id || payment.provider !== "BANK_TRANSFER") {
      return failure(res, "Payment not found.", 404);
    }
    if (payment.status !== "PENDING") return failure(res, "This payment is already closed.", 400);
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) return failure(res, "No file received.", 400);
    if (body.length > 4 * 1024 * 1024) return failure(res, "File is too large (max 4 MB).", 400);
    const mime = String(req.headers["content-type"] || "").split(";")[0].toLowerCase();
    if (!/^image\/(jpeg|png|webp)$|^application\/pdf$/.test(mime)) {
      return failure(res, "Please upload a photo (JPG/PNG) or a PDF.", 400);
    }
    await prisma.paymentProof.upsert({
      where: { paymentId: payment.id },
      create: { paymentId: payment.id, mime, data: body },
      update: { mime, data: body }
    });
    const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
    if (admins.length) {
      await prisma.notification.createMany({
        data: admins.map((a) => ({
          userId: a.id,
          type: "PAYMENT" as const,
          title: "Bank transfer proof received",
          message: `Payment ${payment.reference} is waiting for your approval.`
        }))
      });
    }
    return success(res, { uploaded: true });
  } catch (e) { next(e); }
}

export async function downloadProof(req: Request, res: Response, next: NextFunction) {
  try {
    const user = me(req);
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { proof: true, student: { select: { userId: true } } }
    });
    if (!payment || !payment.proof) return failure(res, "No proof uploaded.", 404);
    if (user.role !== "ADMIN" && payment.student.userId !== user.id) return failure(res, "Access denied.", 403);
    res.setHeader("Content-Type", payment.proof.mime);
    res.setHeader("Content-Disposition", "inline");
    res.send(Buffer.from(payment.proof.data));
  } catch (e) { next(e); }
}

export async function approveBankPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { course: { select: { title: true } }, student: true }
    });
    if (!payment || payment.provider !== "BANK_TRANSFER") return failure(res, "Payment not found.", 404);
    if (payment.status !== "PENDING") return failure(res, "This payment is already closed.", 400);
    await prisma.$transaction(async (tx) => {
      await tx.payment.update({ where: { id: payment.id }, data: { status: "PAID" } });
      await tx.courseEnrollment.upsert({
        where: { studentId_courseId: { studentId: payment.studentId, courseId: payment.courseId } },
        create: { studentId: payment.studentId, courseId: payment.courseId },
        update: {}
      });
      if (payment.student.status === "APPROVED") {
        await tx.studentProfile.update({ where: { id: payment.studentId }, data: { status: "ENROLLED" } });
      }
      await tx.notification.create({
        data: {
          userId: payment.student.userId,
          type: "PAYMENT",
          title: "Payment approved",
          message: `Your bank transfer for "${payment.course.title}" was confirmed. You are now enrolled. You can download your receipt from Payments.`
        }
      });
    });
    return success(res, { approved: true });
  } catch (e) { next(e); }
}

export async function rejectBankPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const payment = await prisma.payment.findUnique({
      where: { id: req.params.id },
      include: { course: { select: { title: true } }, student: { select: { userId: true } } }
    });
    if (!payment || payment.provider !== "BANK_TRANSFER") return failure(res, "Payment not found.", 404);
    if (payment.status !== "PENDING") return failure(res, "This payment is already closed.", 400);
    const reason = String(req.body?.reason || "").slice(0, 300);
    await prisma.$transaction([
      prisma.payment.update({ where: { id: payment.id }, data: { status: "CANCELLED" } }),
      prisma.notification.create({
        data: {
          userId: payment.student.userId,
          type: "PAYMENT",
          title: "Payment not confirmed",
          message: `We could not confirm your bank transfer for "${payment.course.title}".${reason ? " Reason: " + reason : ""} Please contact the academy or try again.`
        }
      })
    ]);
    return success(res, { rejected: true });
  } catch (e) { next(e); }
}

/* Admin records a payment received outside the site (cash or direct bank transfer). */
export async function recordManualPayment(req: Request, res: Response, next: NextFunction) {
  try {
    const studentId = String(req.body?.studentId || "");
    const courseId = String(req.body?.courseId || "");
    const method = req.body?.method === "CASH" ? "CASH" : "BANK_TRANSFER";
    const student = await prisma.studentProfile.findUnique({
      where: { id: studentId },
      select: { id: true, userId: true, status: true }
    });
    const course = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true, price: true } });
    if (!student) return failure(res, "Student not found.", 404);
    if (!course) return failure(res, "Course not found.", 404);
    const amount = Number(req.body?.amount ?? course.price ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) return failure(res, "Enter an amount greater than zero.", 400);

    const payment = await prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: {
          studentId: student.id,
          courseId: course.id,
          amount,
          currency: "NGN",
          status: "PAID",
          provider: method,
          reference: `MAN-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`
        }
      });
      await tx.courseEnrollment.upsert({
        where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
        create: { studentId: student.id, courseId: course.id },
        update: {}
      });
      if (student.status === "APPROVED") {
        await tx.studentProfile.update({ where: { id: student.id }, data: { status: "ENROLLED" } });
      }
      await tx.notification.create({
        data: {
          userId: student.userId,
          type: "PAYMENT",
          title: "Payment recorded",
          message: `Your payment of NGN ${amount.toLocaleString("en-NG")} for "${course.title}" was recorded. You are enrolled. You can download your receipt from Payments.`
        }
      });
      return p;
    });
    return success(res, { payment }, 201);
  } catch (e) { next(e); }
}
