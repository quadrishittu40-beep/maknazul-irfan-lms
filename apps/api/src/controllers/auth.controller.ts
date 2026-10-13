import { Request, Response, NextFunction } from "express";
import { prisma } from "../config/prisma";
import { hashPassword, verifyPassword } from "../utils/password";
import { success, failure } from "../utils/http";
import {
  createSession,
  clearSession,
  AuthenticatedRequest
} from "../middleware/auth";
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
            status: true
          }
        }
      }
    });

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
            biography: true
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