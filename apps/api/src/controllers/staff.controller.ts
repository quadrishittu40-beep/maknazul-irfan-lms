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

/* =========================================================
   ADMIN: EDIT A STUDENT'S PROFILE, LEVEL AND CLASS
========================================================= */

const updateStudentProfileSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: z.string().trim().min(1).max(80).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  dateOfBirth: z.string().trim().nullable().optional(),
  gender: z.string().trim().max(20).nullable().optional(),
  guardianName: z.string().trim().max(120).nullable().optional(),
  guardianPhone: z.string().trim().max(40).nullable().optional(),
  levelId: z.string().trim().nullable().optional(),
  classId: z.string().trim().nullable().optional(),
  status: z
    .enum([
      "PENDING",
      "APPROVED",
      "REJECTED",
      "ENROLLED",
      "SUSPENDED",
      "GRADUATED"
    ])
    .optional()
});

export async function updateStudentProfile(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const parsed = updateStudentProfileSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(res, "Some of the details are not valid.", 422);
    }

    const data = parsed.data;
    const profileId = String(req.params.id);

    const profile = await prisma.studentProfile.findUnique({
      where: { id: profileId },
      select: { id: true, userId: true, levelId: true }
    });

    if (!profile) {
      return failure(res, "Student not found.", 404);
    }

    const nextLevelId =
      data.levelId === undefined ? profile.levelId : data.levelId || null;

    if (data.classId) {
      const cls = await prisma.class.findUnique({
        where: { id: data.classId },
        select: { id: true, levelId: true }
      });

      if (!cls) {
        return failure(res, "Selected class does not exist.", 404);
      }

      if (nextLevelId && cls.levelId !== nextLevelId) {
        return failure(
          res,
          "The selected class does not belong to the selected level.",
          422
        );
      }
    }

    if (data.levelId) {
      const level = await prisma.level.findUnique({
        where: { id: data.levelId },
        select: { id: true }
      });

      if (!level) {
        return failure(res, "Selected level does not exist.", 404);
      }
    }

    let dob: Date | null | undefined = undefined;
    if (data.dateOfBirth !== undefined) {
      if (!data.dateOfBirth) {
        dob = null;
      } else {
        const parsedDate = new Date(data.dateOfBirth);
        if (Number.isNaN(parsedDate.getTime())) {
          return failure(res, "Date of birth is not valid.", 422);
        }
        dob = parsedDate;
      }
    }

    // Changing the level without choosing a class clears the old class.
    const classValue =
      data.classId !== undefined
        ? data.classId || null
        : data.levelId !== undefined && data.levelId !== profile.levelId
          ? null
          : undefined;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: profile.userId },
        data: {
          ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
          ...(data.lastName !== undefined ? { lastName: data.lastName } : {}),
          ...(data.phone !== undefined ? { phone: data.phone || null } : {})
        }
      }),
      prisma.studentProfile.update({
        where: { id: profile.id },
        data: {
          ...(dob !== undefined ? { dateOfBirth: dob } : {}),
          ...(data.gender !== undefined ? { gender: data.gender || null } : {}),
          ...(data.guardianName !== undefined
            ? { guardianName: data.guardianName || null }
            : {}),
          ...(data.guardianPhone !== undefined
            ? { guardianPhone: data.guardianPhone || null }
            : {}),
          ...(data.levelId !== undefined ? { levelId: data.levelId || null } : {}),
          ...(classValue !== undefined ? { classId: classValue } : {}),
          ...(data.status !== undefined ? { status: data.status } : {})
        }
      })
    ]);

    try {
      await createAuditLog({
        userId: req.user?.id,
        action: "UPDATE_STUDENT_PROFILE",
        entity: "StudentProfile",
        entityId: profile.id,
        metadata: data
      } as any);
    } catch (auditError) {
      console.error("audit failed:", auditError);
    }

    return success(res, { message: "Student updated." });
  } catch (error) {
    console.error("updateStudentProfile error:", error);
    return failure(res, "Unable to update the student.", 500);
  }
}
