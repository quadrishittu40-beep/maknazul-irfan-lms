import {
  Request,
  Response,
  NextFunction
} from "express";

import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { AuthenticatedRequest } from "../middleware/auth";
import { createAuditLog } from "../services/audit.service";

function requestInfo(req: Request) {
  return {
    ipAddress:
      req.ip ||
      req.socket.remoteAddress ||
      undefined,

    userAgent:
      req.headers["user-agent"] || undefined
  };
}

/**
 * GET /api/admin/students
 *
 * Admin-only list of students.
 */
export async function listStudents(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const status =
      typeof req.query.status === "string"
        ? req.query.status
        : undefined;

    const search =
      typeof req.query.search === "string"
        ? req.query.search.trim()
        : undefined;

    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(Number(req.query.limit) || 20, 1),
      100
    );

    const skip = (page - 1) * limit;

    const where = {
      ...(status
        ? {
            status:
              status as
                | "PENDING"
                | "APPROVED"
                | "REJECTED"
                | "ENROLLED"
                | "SUSPENDED"
                | "GRADUATED"
          }
        : {}),

      ...(search
        ? {
            user: {
              OR: [
                {
                  firstName: {
                    contains: search,
                    mode: "insensitive" as const
                  }
                },
                {
                  lastName: {
                    contains: search,
                    mode: "insensitive" as const
                  }
                },
                {
                  email: {
                    contains: search,
                    mode: "insensitive" as const
                  }
                }
              ]
            }
          }
        : {})
    };

    const [students, total] =
      await prisma.$transaction([
        prisma.studentProfile.findMany({
          where,

          skip,
          take: limit,

          orderBy: {
            createdAt: "desc"
          },

          select: {
            id: true,
            status: true,
            dateOfBirth: true,
            gender: true,
            guardianName: true,
            guardianPhone: true,
            createdAt: true,
            updatedAt: true,

            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phone: true,
                isActive: true,
                createdAt: true
              }
            },

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
        }),

        prisma.studentProfile.count({
          where
        })
      ]);

    return success(res, {
      students,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/admin/students/:id
 *
 * Get one student's complete administrative profile.
 */
export async function getStudent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const student = await prisma.studentProfile.findUnique({
      where: {
        id: req.params.id
      },

      select: {
        id: true,
        status: true,
        dateOfBirth: true,
        gender: true,
        guardianName: true,
        guardianPhone: true,
        createdAt: true,
        updatedAt: true,

        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true
          }
        },

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
        },

        enrollments: {
          select: {
            id: true,
            enrolledAt: true,
            completedAt: true,

            course: {
              select: {
                id: true,
                title: true,
                status: true
              }
            }
          },

          orderBy: {
            enrolledAt: "desc"
          }
        },

        certificates: {
          select: {
            id: true,
            certificateNumber: true,
            score: true,
            grade: true,
            completionDate: true,

            course: {
              select: {
                id: true,
                title: true
              }
            }
          }
        }
      }
    });

    if (!student) {
      return failure(
        res,
        "Student not found.",
        404
      );
    }

    return success(res, {
      student
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/students/:id/approve
 */
export async function approveStudent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const student =
      await prisma.studentProfile.findUnique({
        where: {
          id: req.params.id
        },

        include: {
          user: true
        }
      });

    if (!student) {
      return failure(
        res,
        "Student not found.",
        404
      );
    }

    if (student.status === "APPROVED") {
      return failure(
        res,
        "This student has already been approved.",
        409
      );
    }

    if (
      student.status === "SUSPENDED" ||
      student.status === "GRADUATED"
    ) {
      return failure(
        res,
        `A student with status ${student.status} cannot be approved.`,
        400
      );
    }

    const updatedStudent =
      await prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.studentProfile.update({
              where: {
                id: student.id
              },

              data: {
                status: "APPROVED"
              },

              select: {
                id: true,
                status: true,

                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                  }
                }
              }
            });

          await tx.notification.create({
            data: {
              userId: student.userId,
              type: "APPROVAL",
              title: "Registration Approved",
              message:
                "Your MAKNAZUL IRFAN student registration has been approved. You can now access your student account."
            }
          });

          return updated;
        }
      );

    await createAuditLog({
      userId: req.user!.id,
      action: "APPROVE_STUDENT",
      entity: "StudentProfile",
      entityId: student.id,
      metadata: {
        previousStatus: student.status,
        newStatus: "APPROVED"
      },
      ...requestInfo(req)
    });

    return success(res, {
      message: "Student approved successfully.",
      student: updatedStudent
    });
  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/admin/students/:id/reject
 */
export async function rejectStudent(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const student =
      await prisma.studentProfile.findUnique({
        where: {
          id: req.params.id
        }
      });

    if (!student) {
      return failure(
        res,
        "Student not found.",
        404
      );
    }

    const updatedStudent =
      await prisma.$transaction(
        async (tx) => {
          const updated =
            await tx.studentProfile.update({
              where: {
                id: student.id
              },

              data: {
                status: "REJECTED"
              },

              select: {
                id: true,
                status: true,

                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                  }
                }
              }
            });

          await tx.notification.create({
            data: {
              userId: student.userId,
              type: "REJECTION",
              title: "Registration Update",
              message:
                "Your student registration has not been approved at this time. Please contact the academy administration for further information."
            }
          });

          return updated;
        }
      );

    await createAuditLog({
      userId: req.user!.id,
      action: "REJECT_STUDENT",
      entity: "StudentProfile",
      entityId: student.id,
      metadata: {
        previousStatus: student.status,
        newStatus: "REJECTED"
      },
      ...requestInfo(req)
    });

    return success(res, {
      message: "Student rejected successfully.",
      student: updatedStudent
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/students/:id/status
 */
export async function updateStudentStatus(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const allowedStatuses = [
      "PENDING",
      "APPROVED",
      "REJECTED",
      "ENROLLED",
      "SUSPENDED",
      "GRADUATED"
    ] as const;

    const status = req.body.status;

    if (!allowedStatuses.includes(status)) {
      return failure(
        res,
        "Invalid student status.",
        422
      );
    }

    const student =
      await prisma.studentProfile.findUnique({
        where: {
          id: req.params.id
        }
      });

    if (!student) {
      return failure(
        res,
        "Student not found.",
        404
      );
    }

    const updated =
      await prisma.studentProfile.update({
        where: {
          id: student.id
        },

        data: {
          status
        },

        select: {
          id: true,
          status: true,

          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          }
        }
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "UPDATE_STUDENT_STATUS",
      entity: "StudentProfile",
      entityId: student.id,
      metadata: {
        previousStatus: student.status,
        newStatus: status
      },
      ...requestInfo(req)
    });

    return success(res, {
      message: "Student status updated successfully.",
      student: updated
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/users/:id/activate
 */
export async function activateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const user =
      await prisma.user.findUnique({
        where: {
          id: req.params.id
        }
      });

    if (!user) {
      return failure(
        res,
        "User not found.",
        404
      );
    }

    const updated =
      await prisma.user.update({
        where: {
          id: user.id
        },

        data: {
          isActive: true
        },

        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true
        }
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "ACTIVATE_USER",
      entity: "User",
      entityId: user.id,
      ...requestInfo(req)
    });

    return success(res, {
      message: "User account activated.",
      user: updated
    });
  } catch (error) {
    next(error);
  }
}

/**
 * PATCH /api/admin/users/:id/deactivate
 */
export async function deactivateUser(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    if (req.params.id === req.user!.id) {
      return failure(
        res,
        "You cannot deactivate your own administrator account.",
        400
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: req.params.id
        }
      });

    if (!user) {
      return failure(
        res,
        "User not found.",
        404
      );
    }

    const updated =
      await prisma.user.update({
        where: {
          id: user.id
        },

        data: {
          isActive: false
        },

        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          role: true,
          isActive: true
        }
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "DEACTIVATE_USER",
      entity: "User",
      entityId: user.id,
      ...requestInfo(req)
    });

    return success(res, {
      message: "User account deactivated.",
      user: updated
    });
  } catch (error) {
    next(error);
  }
}

/*
|--------------------------------------------------------------------------
| Admin dashboard: academic overview (levels, classes, subjects, topics)
|--------------------------------------------------------------------------
*/

export async function academicOverview(
  _req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const [levels, classes, subjects, topics] = await Promise.all([
      prisma.level.findMany({ orderBy: { name: "asc" } }),
      prisma.class.findMany({
        orderBy: { name: "asc" },
        include: { level: { select: { id: true, name: true } } }
      }),
      prisma.subject.findMany({ orderBy: { name: "asc" } }),
      prisma.topic.findMany({ orderBy: { createdAt: "desc" } })
    ]);

    return success(res, { levels, classes, subjects, topics });
  } catch (error) {
    next(error);
  }
}
