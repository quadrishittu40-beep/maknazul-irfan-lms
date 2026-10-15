import { Response } from "express";
import { z } from "zod";

import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { AuthenticatedRequest } from "../middleware/auth";
import { hashPassword } from "../utils/password";
import { createAuditLog } from "../services/audit.service";

const createStaffSchema = z.object({
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(100),
  role: z.enum(["TEACHER", "ADMIN"]).default("TEACHER"),
  phone: z.string().trim().max(40).optional(),
  specialization: z.string().trim().max(160).optional()
});

export async function listStaff(
  _req: AuthenticatedRequest,
  res: Response
) {
  try {
    const staff = await prisma.user.findMany({
      where: { role: { in: ["TEACHER", "ADMIN"] } },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        isActive: true,
        createdAt: true,
        teacherProfile: {
          select: { specialization: true }
        }
      }
    });

    return success(res, { staff });
  } catch (error) {
    console.error("listStaff error:", error);
    return failure(res, "Unable to load staff.", 500);
  }
}

export async function createStaff(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const parsed = createStaffSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Please give a first name, last name, valid email and a password of at least 8 characters.",
        422
      );
    }

    const data = parsed.data;
    const email = data.email.toLowerCase();

    const existing = await prisma.user.findUnique({
      where: { email },
      select: { id: true }
    });

    if (existing) {
      return failure(
        res,
        "An account with this email already exists.",
        409
      );
    }

    const passwordHash = await hashPassword(data.password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone || null,
        role: data.role,
        ...(data.role === "TEACHER"
          ? {
              teacherProfile: {
                create: {
                  specialization: data.specialization || null
                }
              }
            }
          : {})
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true
      }
    });

    try {
      await createAuditLog({
        userId: req.user?.id,
        action: "CREATE_STAFF",
        entity: "User",
        entityId: user.id,
        metadata: { role: user.role, email: user.email }
      } as any);
    } catch (auditError) {
      console.error("audit failed:", auditError);
    }

    return success(res, { user }, 201);
  } catch (error) {
    console.error("createStaff error:", error);
    return failure(res, "Unable to create the account.", 500);
  }
}
