import {
  Request,
  Response,
  NextFunction
} from "express";

import crypto from "crypto";
import { prisma } from "../config/prisma";
import {
  AuthenticatedRequest
} from "../middleware/auth";

import {
  success,
  failure
} from "../utils/http";

import {
  createLiveClassSchema,
  updateLiveClassSchema
} from "../validators/live-class";

import {
  audit
} from "../services/audit.service";

function getUserId(
  req: Request
): string | null {
  return (
    (req as AuthenticatedRequest)
      .user?.id ?? null
  );
}

async function teacherOwnsCourse(
  teacherId: string,
  courseId: string
): Promise<boolean> {
  const course =
    await prisma.course.findFirst({
      where: {
        id: courseId,
        teacherId
      },
      select: {
        id: true
      }
    });

  return Boolean(course);
}

async function studentHasCourseAccess(
  studentUserId: string,
  courseId: string
): Promise<boolean> {
  const student =
    await prisma.studentProfile.findUnique({
      where: {
        userId: studentUserId
      },
      select: {
        id: true,
        status: true
      }
    });

  if (!student) {
    return false;
  }

  if (
    student.status !== "ENROLLED" &&
    student.status !== "GRADUATED"
  ) {
    return false;
  }

  const enrollment =
    await prisma.courseEnrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: student.id,
          courseId
        }
      },
      select: {
        id: true
      }
    });

  return Boolean(enrollment);
}

/* =========================================================
   LIST LIVE CLASSES
========================================================= */

export async function listLiveClasses(
  req: Request,
  res: Response,
  next: NextFunction
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
          role: true
        }
      });

    if (!user) {
      return failure(
        res,
        "User not found.",
        404
      );
    }

    if (
      user.role === "ADMIN"
    ) {
      const classes =
        await prisma.liveClass.findMany({
          orderBy: {
            scheduledStart: "asc"
          },
          include: {
            course: {
              select: {
                id: true,
                title: true
              }
            },
            subject: {
              select: {
                id: true,
                name: true
              }
            },
            teacher: {
              select: {
                id: true,
                firstName: true,
                lastName: true
              }
            }
          }
        });

      return success(
        res,
        classes
      );
    }

    if (
      user.role === "TEACHER"
    ) {
      const classes =
        await prisma.liveClass.findMany({
          where: {
            teacherId: userId
          },
          orderBy: {
            scheduledStart: "asc"
          },
          include: {
            course: {
              select: {
                id: true,
                title: true
              }
            },
            subject: {
              select: {
                id: true,
                name: true
              }
            }
          }
        });

      return success(
        res,
        classes
      );
    }

    /*
     * Students only receive live classes belonging
     * to courses in which they are enrolled.
     */
    const student =
      await prisma.studentProfile.findUnique({
        where: {
          userId
        },
        select: {
          id: true,
          status: true
        }
      });

    if (!student) {
      return failure(
        res,
        "Student profile not found.",
        404
      );
    }

    const classes =
      await prisma.liveClass.findMany({
        where: {
          published: true,
          course: {
            enrollments: {
              some: {
                studentId: student.id
              }
            }
          }
        },
        orderBy: {
          scheduledStart: "asc"
        },
        select: {
          id: true,
          title: true,
          description: true,
          provider: true,
          meetingUrl: true,
          scheduledStart: true,
          scheduledEnd: true,
          recordingUrl: true,
          course: {
            select: {
              id: true,
              title: true
            }
          },
          subject: {
            select: {
              id: true,
              name: true
            }
          },
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

    return success(
      res,
      classes
    );
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   GET SINGLE LIVE CLASS
========================================================= */

export async function getLiveClass(
  req: Request,
  res: Response,
  next: NextFunction
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

    const id = req.params.id;

    const liveClass =
      await prisma.liveClass.findUnique({
        where: {
          id
        },
        include: {
          course: {
            select: {
              id: true,
              title: true
            }
          },
          subject: {
            select: {
              id: true,
              name: true
            }
          },
          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        }
      });

    if (!liveClass) {
      return failure(
        res,
        "Live class not found.",
        404
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          role: true
        }
      });

    if (!user) {
      return failure(
        res,
        "User not found.",
        404
      );
    }

    if (
      user.role === "ADMIN"
    ) {
      return success(
        res,
        liveClass
      );
    }

    if (
      user.role === "TEACHER"
    ) {
      if (
        liveClass.teacherId !== userId
      ) {
        return failure(
          res,
          "You do not have access to this live class.",
          403
        );
      }

      return success(
        res,
        liveClass
      );
    }

    if (
      !liveClass.published
    ) {
      return failure(
        res,
        "This live class is not available.",
        403
      );
    }

    const access =
      await studentHasCourseAccess(
        userId,
        liveClass.courseId
      );

    if (!access) {
      return failure(
        res,
        "You are not enrolled in this course.",
        403
      );
    }

    /*
     * Students are allowed to receive the meeting URL
     * only after authorization has succeeded.
     */
    return success(
      res,
      {
        id: liveClass.id,
        title: liveClass.title,
        description:
          liveClass.description,
        provider:
          liveClass.provider,
        meetingUrl:
          liveClass.meetingUrl,
        recordingUrl:
          liveClass.recordingUrl,
        scheduledStart:
          liveClass.scheduledStart,
        scheduledEnd:
          liveClass.scheduledEnd,
        course:
          liveClass.course,
        subject:
          liveClass.subject,
        teacher:
          liveClass.teacher
      }
    );
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   CREATE LIVE CLASS
========================================================= */

export async function createLiveClass(
  req: Request,
  res: Response,
  next: NextFunction
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
      createLiveClassSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return failure(
        res,
        "Invalid live class data.",
        400
      );
    }

    const data = parsed.data;

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          role: true
        }
      });

    if (!user) {
      return failure(
        res,
        "User not found.",
        404
      );
    }

    if (
      user.role === "TEACHER"
    ) {
      const owns =
        await teacherOwnsCourse(
          userId,
          data.courseId
        );

      if (!owns) {
        return failure(
          res,
          "You do not own this course.",
          403
        );
      }
    }

    const teacherId =
      user.role === "TEACHER"
        ? userId
        : data.teacherId;

    if (!teacherId) {
      return failure(
        res,
        "Teacher is required.",
        400
      );
    }

    const teacher =
      await prisma.user.findUnique({
        where: {
          id: teacherId
        },
        select: {
          id: true,
          role: true
        }
      });

    if (
      !teacher ||
      teacher.role !== "TEACHER"
    ) {
      return failure(
        res,
        "Selected teacher is invalid.",
        400
      );
    }

    const liveClass =
      await prisma.liveClass.create({
        data: {
          title: data.title,
          description:
            data.description,
          courseId: data.courseId,
          subjectId:
            data.subjectId,
          teacherId,
          provider:
            data.provider,
          meetingUrl:
            data.provider === "JITSI" && !data.meetingUrl
              ? `https://${process.env.JITSI_DOMAIN || "meet.jit.si"}/MaknazulIrfan-${crypto.randomBytes(6).toString("hex")}`
              : (data.meetingUrl as string),
          recordingUrl:
            data.recordingUrl || null,
          scheduledStart:
            new Date(
              data.scheduledStart
            ),
          scheduledEnd:
            new Date(
              data.scheduledEnd
            ),
          published:
            data.published
        }
      });

    await audit({
      userId,
      action: "CREATE_LIVE_CLASS",
      entity: "LiveClass",
      entityId: liveClass.id,
      metadata: {
        title:
          liveClass.title,
        courseId:
          liveClass.courseId
      }
    });

    return success(
      res,
      liveClass,
      201
    );
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   UPDATE LIVE CLASS
========================================================= */

export async function updateLiveClass(
  req: Request,
  res: Response,
  next: NextFunction
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

    const id = req.params.id;

    const parsed =
      updateLiveClassSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return failure(
        res,
        "Invalid live class data.",
        400
      );
    }

    const existing =
      await prisma.liveClass.findUnique({
        where: {
          id
        }
      });

    if (!existing) {
      return failure(
        res,
        "Live class not found.",
        404
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          role: true
        }
      });

    if (!user) {
      return failure(
        res,
        "User not found.",
        404
      );
    }

    if (
      user.role === "TEACHER" &&
      existing.teacherId !== userId
    ) {
      return failure(
        res,
        "You do not own this live class.",
        403
      );
    }

    const data = parsed.data;

    if (
      user.role === "TEACHER" &&
      data.courseId &&
      !(await teacherOwnsCourse(
        userId,
        data.courseId
      ))
    ) {
      return failure(
        res,
        "You do not own the selected course.",
        403
      );
    }

    const updated =
      await prisma.liveClass.update({
        where: {
          id
        },
        data: {
          title:
            data.title,
          description:
            data.description,
          courseId:
            data.courseId,
          subjectId:
            data.subjectId,
          teacherId:
            user.role === "TEACHER"
              ? userId
              : data.teacherId,
          provider:
            data.provider,
          meetingUrl:
            data.meetingUrl,
          recordingUrl:
            data.recordingUrl === ""
              ? null
              : data.recordingUrl,
          scheduledStart:
            data.scheduledStart
              ? new Date(
                  data.scheduledStart
                )
              : undefined,
          scheduledEnd:
            data.scheduledEnd
              ? new Date(
                  data.scheduledEnd
                )
              : undefined,
          published:
            data.published
        }
      });

    await audit({
      userId,
      action: "UPDATE_LIVE_CLASS",
      entity: "LiveClass",
      entityId: id,
      metadata: {
        liveClassId: id
      }
    });

    return success(
      res,
      updated
    );
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   DELETE LIVE CLASS
========================================================= */

export async function deleteLiveClass(
  req: Request,
  res: Response,
  next: NextFunction
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

    const id = req.params.id;

    const existing =
      await prisma.liveClass.findUnique({
        where: {
          id
        }
      });

    if (!existing) {
      return failure(
        res,
        "Live class not found.",
        404
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          role: true
        }
      });

    if (!user) {
      return failure(
        res,
        "User not found.",
        404
      );
    }

    if (
      user.role === "TEACHER" &&
      existing.teacherId !== userId
    ) {
      return failure(
        res,
        "You do not own this live class.",
        403
      );
    }

    await prisma.liveClass.delete({
      where: {
        id
      }
    });

    await audit({
      userId,
      action: "DELETE_LIVE_CLASS",
      entity: "LiveClass",
      entityId: id,
      metadata: {
        liveClassId: id
      }
    });

    return success(
      res,
      {
        message:
          "Live class deleted successfully."
      }
    );
  } catch (error) {
    next(error);
  }
}