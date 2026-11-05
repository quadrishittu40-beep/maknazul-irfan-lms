import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { hashPassword, verifyPassword } from "../utils/password";
import { success, failure } from "../utils/http";
import {
  createSession,
  clearSession,
  AuthenticatedRequest
} from "../middleware/auth";
import { ADMISSION_FEE_AMOUNT } from "../services/payment.service";
import crypto from "crypto";
import {
  registerSchema,
  loginSchema
} from "../validators/auth";

export async function register(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = registerSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Please provide valid registration information.",
        422
      );
    }

    const data = parsed.data;

    const existingUser = await prisma.user.findUnique({
      where: {
        email: data.email.toLowerCase()
      }
    });

    if (existingUser) {
      return failure(
        res,
        "An account with this email already exists.",
        409
      );
    }

    /* The admission fee must be paid (card) or proof attached (bank transfer) before registering. */
    const feeReference = String(req.body?.feeReference || "");
    const feeProof = String(req.body?.feeProof || "");
    const email = data.email.toLowerCase();
    let regPayment: { id: string; reference: string } | null = null;
    let proofMime = "";
    let proofBuf: Buffer | null = null;

    if (feeReference) {
      const rp = await prisma.registrationPayment.findUnique({ where: { reference: feeReference } });
      if (!rp || rp.status !== "PAID" || rp.usedByStudentId || rp.email !== email) {
        return failure(
          res,
          "Admission fee payment was not found for this email. Please pay the fee again using the same email address.",
          402
        );
      }
      regPayment = { id: rp.id, reference: rp.reference };
    } else if (feeProof) {
      const m = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(feeProof);
      if (!m) return failure(res, "Please attach a clear photo (JPG/PNG) of your bank transfer receipt.", 422);
      proofMime = m[1];
      proofBuf = Buffer.from(m[2], "base64");
      if (!proofBuf.length || proofBuf.length > 600 * 1024) {
        return failure(res, "The receipt photo is too large. Please try a smaller photo.", 422);
      }
    } else {
      return failure(
        res,
        `The admission fee of NGN ${ADMISSION_FEE_AMOUNT.toLocaleString("en-NG")} must be paid before you can register.`,
        402
      );
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: "STUDENT",

        studentProfile: {
          create: {
            dateOfBirth: data.dateOfBirth
              ? new Date(data.dateOfBirth)
              : undefined,

            gender: data.gender,
            guardianName: data.guardianName,
            guardianPhone: data.guardianPhone,
            levelId: data.levelId,
            classId: data.classId,
            status: "PENDING"
          }
        }
      },

      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        studentProfile: {
          select: {
            id: true,
            status: true
          }
        }
      }
    });

    if (user.studentProfile) {
      const sid = user.studentProfile.id;
      if (regPayment) {
        await prisma.admissionFee.create({
          data: {
            studentId: sid,
            amount: ADMISSION_FEE_AMOUNT,
            status: "PAID",
            provider: "PAYSTACK",
            reference: regPayment.reference,
            paidAt: new Date()
          }
        });
        await prisma.registrationPayment.update({
          where: { id: regPayment.id },
          data: { usedByStudentId: sid }
        });
      } else if (proofBuf) {
        await prisma.admissionFee.create({
          data: {
            studentId: sid,
            amount: ADMISSION_FEE_AMOUNT,
            status: "PENDING",
            provider: "BANK_TRANSFER",
            reference: `ADM-${Date.now()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
            proofMime,
            proofData: proofBuf
          }
        });
        const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true } });
        if (admins.length) {
          await prisma.notification.createMany({
            data: admins.map((a) => ({
              userId: a.id,
              type: "PAYMENT" as const,
              title: "Admission fee proof received",
              message: `${data.firstName} ${data.lastName} registered with a bank transfer receipt. Confirm it under Payments > Admission Fees.`
            }))
          });
        }
      }
    }

    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "SYSTEM",
        title: "Registration Received",
        message:
          "Your student registration has been received and is awaiting administrator review."
      }
    });

    return success(
      res,
      {
        user
      },
      201
    );
  } catch (error) {
    next(error);
  }
}

export async function login(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid email or password.",
        422
      );
    }

    const { email, password } = parsed.data;

    const user = await prisma.user.findUnique({
      where: {
        email: email.toLowerCase()
      }
    });

    if (!user || !user.isActive) {
      return failure(
        res,
        "Invalid email or password.",
        401
      );
    }

    const passwordValid = await verifyPassword(
      user.passwordHash,
      password
    );

    if (!passwordValid) {
      return failure(
        res,
        "Invalid email or password.",
        401
      );
    }

    createSession(res, user.id);

    return success(res, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function logout(
  _req: Request,
  res: Response
) {
  clearSession(res);

  return success(res, {
    message: "You have been logged out successfully."
  });
}

export async function me(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user!.id
      },

      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,

        studentProfile: {
          select: {
            id: true,
            status: true,
            dateOfBirth: true,
            gender: true,
            guardianName: true,
            guardianPhone: true,
            level: {
              select: {
                id: true,
                name: true
              }
            },
            class: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },

        teacherProfile: {
          select: {
            id: true,
            qualification: true,
            specialization: true,
            bio: true
          }
        }
      }
    });

    return success(res, {
      user
    });
  } catch (error) {
    next(error);
  }
}