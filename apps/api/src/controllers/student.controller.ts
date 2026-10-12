import { Request, Response } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";

const updateMyProfileSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(1, "First name is required.")
    .max(100, "First name is too long."),

  lastName: z
    .string()
    .trim()
    .min(1, "Last name is required.")
    .max(100, "Last name is too long."),

  phone: z
    .string()
    .trim()
    .max(30, "Phone number is too long.")
    .optional(),

  dateOfBirth: z
    .string()
    .trim()
    .optional(),

  gender: z
    .enum(["MALE", "FEMALE"])
    .optional()
});

function getUserId(req: Request): string | null {
  const user = (req as any).user;

  return user?.id || null;
}

function parseDateOfBirth(
  value?: string
): Date | undefined {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Invalid date of birth.");
  }

  return date;
}

/**
 * GET /api/students/me
 *
 * Returns the authenticated student's complete profile.
 */
export async function getMyProfile(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,

          studentProfile: {
            select: {
              id: true,
              dateOfBirth: true,
              gender: true,
              guardianName: true,
              guardianPhone: true,
              status: true,

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
          }
        }
      });

    if (!user) {
      return failure(
        res,
        "Student account not found.",
        404
      );
    }

    if (user.role !== "STUDENT") {
      return failure(
        res,
        "This endpoint is for students only.",
        403
      );
    }

    return success(res, {
      user
    });

  } catch (error) {
    console.error(
      "getMyProfile error:",
      error
    );

    return failure(
      res,
      "Unable to load your profile.",
      500
    );
  }
}

/**
 * PATCH /api/students/me
 *
 * Allows a student to update permitted personal information.
 *
 * The student cannot change:
 * - email
 * - role
 * - status
 * - level
 * - class
 * - guardian information
 */
export async function updateMyProfile(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const parsed =
      updateMyProfileSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return failure(
        res,
        parsed.error.issues[0]?.message ||
          "Invalid profile information.",
        400
      );
    }

    const {
      firstName,
      lastName,
      phone,
      dateOfBirth,
      gender
    } = parsed.data;

    const existingUser =
      await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          id: true,
          role: true,
          studentProfile: {
            select: {
              id: true
            }
          }
        }
      });

    if (!existingUser) {
      return failure(
        res,
        "Student account not found.",
        404
      );
    }

    if (existingUser.role !== "STUDENT") {
      return failure(
        res,
        "Only students can update this profile.",
        403
      );
    }

    if (!existingUser.studentProfile) {
      return failure(
        res,
        "Student profile not found.",
        404
      );
    }

    let parsedDate: Date | undefined;

    try {
      parsedDate =
        parseDateOfBirth(dateOfBirth);
    } catch (error) {
      return failure(
        res,
        error instanceof Error
          ? error.message
          : "Invalid date of birth.",
        400
      );
    }

    const updatedUser =
      await prisma.user.update({
        where: {
          id: userId
        },

        data: {
          firstName,
          lastName,

          ...(phone !== undefined
            ? {
                phone:
                  phone || null
              }
            : {})
        },

        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          role: true,
          isActive: true,
          createdAt: true,

          studentProfile: {
            select: {
              id: true,
              dateOfBirth: true,
              gender: true,
              guardianName: true,
              guardianPhone: true,
              status: true,

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
          }
        }
      });

    const updatedProfile =
      await prisma.studentProfile.update({
        where: {
          id:
            existingUser.studentProfile.id
        },

        data: {
          ...(dateOfBirth !== undefined
            ? {
                dateOfBirth:
                  parsedDate || null
              }
            : {}),

          ...(gender !== undefined
            ? {
                gender
              }
            : {})
        },

        select: {
          id: true,
          dateOfBirth: true,
          gender: true,
          guardianName: true,
          guardianPhone: true,
          status: true,

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
      });

    const result = {
      ...updatedUser,
      studentProfile:
        updatedProfile
    };

    return success(res, {
      user: result,
      message:
        "Profile updated successfully."
    });

  } catch (error) {
    console.error(
      "updateMyProfile error:",
      error
    );

    return failure(
      res,
      "Unable to update your profile.",
      500
    );
  }
}