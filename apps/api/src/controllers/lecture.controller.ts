import { Response } from "express";

import { prisma } from "../config/prisma";

import {
  AuthenticatedRequest
} from "../middleware/auth";

import {
  success,
  failure
} from "../utils/http";

import {
  createLectureSchema,
  updateLectureSchema,
  createMaterialSchema,
  updateMaterialSchema
} from "../validators/lecture";

import {
  studentHasCourseAccess,
  teacherOwnsCourse
} from "../services/access.service";

import {
  storageService
} from "../services/storage.service";

import {
  createAuditLog
} from "../services/audit.service";

async function canManageCourse(
  req: AuthenticatedRequest,
  courseId: string
): Promise<boolean> {
  if (!req.user) {
    return false;
  }

  if (req.user.role === "ADMIN") {
    return true;
  }

  if (req.user.role === "TEACHER") {
    return teacherOwnsCourse(
      req.user.id,
      courseId
    );
  }

  return false;
}

/*
|--------------------------------------------------------------------------
| List lectures
|--------------------------------------------------------------------------
*/

export async function listLectures(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const { courseId } = req.params;

    if (!req.user) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const course =
      await prisma.course.findUnique({
        where: {
          id: courseId
        },
        select: {
          id: true,
          status: true,
          teacherId: true
        }
      });

    if (!course) {
      return failure(
        res,
        "Course not found.",
        404
      );
    }

    if (
      req.user.role === "STUDENT"
    ) {
      const access =
        await studentHasCourseAccess(
          req.user.id,
          courseId
        );

      if (!access) {
        return failure(
          res,
          "You do not have access to this course.",
          403
        );
      }
    } else if (
      req.user.role === "TEACHER" &&
      course.teacherId !== req.user.id
    ) {
      return failure(
        res,
        "You do not have permission to view this course.",
        403
      );
    }

    const lectures =
      await prisma.lecture.findMany({
        where: {
          courseId,
          ...(req.user.role === "STUDENT" ? { published: true } : {})
        },
        include: {
          topic: true,
          materials: {
            select: {
              id: true,
              type: true,
              title: true,
              originalName: true,
              fileUrl: true,
              mimeType: true,
              fileSize: true
            }
          },
          _count: {
            select: {
              progress: true
            }
          }
        },
        orderBy: [
          {
            orderNumber: "asc"
          },
          {
            createdAt: "asc"
          }
        ]
      });

    return success(res, {
      lectures
    });
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to load lectures.",
      500
    );
  }
}

/*
|--------------------------------------------------------------------------
| Get single lecture
|--------------------------------------------------------------------------
*/

export async function getLecture(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const { id } = req.params;

    const lecture =
      await prisma.lecture.findUnique({
        where: {
          id
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              status: true,
              teacherId: true
            }
          },
          topic: true,
          materials: {
            select: {
              id: true,
              type: true,
              title: true,
              originalName: true,
              fileUrl: true,
              mimeType: true,
              fileSize: true,
              storageKey: true
            }
          }
        }
      });

    if (!lecture) {
      return failure(
        res,
        "Lecture not found.",
        404
      );
    }

    if (
      req.user.role === "STUDENT"
    ) {
      const access =
        await studentHasCourseAccess(
          req.user.id,
          lecture.courseId
        );

      if (!access) {
        return failure(
          res,
          "You do not have access to this lecture.",
          403
        );
      }
    }

    if (
      req.user.role === "STUDENT" &&
      !lecture.published
    ) {
      return failure(
        res,
        "This lecture is not available yet.",
        404
      );
    }

    if (
      req.user.role === "TEACHER" &&
      lecture.course.teacherId !== req.user.id
    ) {
      return failure(
        res,
        "You do not have permission to view this lecture.",
        403
      );
    }

    return success(res, {
      lecture
    });
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to load lecture.",
      500
    );
  }
}

/*
|--------------------------------------------------------------------------
| Create lecture
|--------------------------------------------------------------------------
*/

export async function createLecture(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const parsed =
      createLectureSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return failure(
        res,
        "Invalid lecture information."
      );
    }

    const data = parsed.data;

    const allowed =
      await canManageCourse(
        req,
        data.courseId
      );

    if (!allowed) {
      return failure(
        res,
        "You do not have permission to create lectures for this course.",
        403
      );
    }

    const course =
      await prisma.course.findUnique({
        where: {
          id: data.courseId
        },
        select: {
          id: true,
          subjectId: true
        }
      });

    if (!course) {
      return failure(
        res,
        "Course not found.",
        404
      );
    }

    if (data.topicId) {
      const topic =
        await prisma.topic.findUnique({
          where: {
            id: data.topicId
          }
        });

      if (
        !topic ||
        topic.courseId !== data.courseId
      ) {
        return failure(
          res,
          "The selected topic does not belong to this course.",
          400
        );
      }
    }

    const lecture =
      await prisma.lecture.create({
        data: {
          title: data.title,
          description:
            data.description,
          courseId: data.courseId,
          topicId: data.topicId,
          content: data.content ?? undefined,
          videoUrl: data.videoUrl ?? undefined,
          published: data.published ?? true,
          orderNumber:
            data.orderNumber,
          order:
            data.orderNumber
        },
        include: {
          topic: true
        }
      });

    await createAuditLog({
      userId: req.user.id,
      action: "CREATE",
      entity: "LECTURE",
      entityId: lecture.id,
      metadata: {
        courseId: data.courseId
      }
    });

    return success(
      res,
      {
        lecture
      },
      201
    );
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to create lecture.",
      500
    );
  }
}

/*
|--------------------------------------------------------------------------
| Update lecture
|--------------------------------------------------------------------------
*/

export async function updateLecture(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const { id } = req.params;

    const parsed =
      updateLectureSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return failure(
        res,
        "Invalid lecture information."
      );
    }

    const existing =
      await prisma.lecture.findUnique({
        where: {
          id
        }
      });

    if (!existing) {
      return failure(
        res,
        "Lecture not found.",
        404
      );
    }

    const allowed =
      await canManageCourse(
        req,
        existing.courseId
      );

    if (!allowed) {
      return failure(
        res,
        "You do not have permission to update this lecture.",
        403
      );
    }

    if (parsed.data.topicId) {
      const topic =
        await prisma.topic.findUnique({
          where: {
            id: parsed.data.topicId
          }
        });

      if (
        !topic ||
        topic.courseId !== existing.courseId
      ) {
        return failure(
          res,
          "The selected topic does not belong to this course.",
          400
        );
      }
    }

    const lecture =
      await prisma.lecture.update({
        where: {
          id
        },
        data: parsed.data
      });

    await createAuditLog({
      userId: req.user.id,
      action: "UPDATE",
      entity: "LECTURE",
      entityId: id
    });

    return success(res, {
      lecture
    });
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to update lecture.",
      500
    );
  }
}

/*
|--------------------------------------------------------------------------
| Create material
|--------------------------------------------------------------------------
*/

export async function createMaterial(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const parsed =
      createMaterialSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return failure(
        res,
        "Invalid material information."
      );
    }

    const data = parsed.data;

    const lecture =
      await prisma.lecture.findUnique({
        where: {
          id: data.lectureId
        },
        select: {
          id: true,
          courseId: true
        }
      });

    if (!lecture) {
      return failure(
        res,
        "Lecture not found.",
        404
      );
    }

    const allowed =
      await canManageCourse(
        req,
        lecture.courseId
      );

    if (!allowed) {
      return failure(
        res,
        "You do not have permission to add materials to this lecture.",
        403
      );
    }

    const material =
      await prisma.lectureMaterial.create({
        data: {
          lectureId: data.lectureId,
          type: data.type,
          title: data.title,
          storageKey:
            data.storageKey,
          originalName:
            data.originalName,
          mimeType:
            data.mimeType,
          fileSize:
            data.fileSize
        }
      });

    await createAuditLog({
      userId: req.user.id,
      action: "CREATE",
      entity: "LECTURE_MATERIAL",
      entityId: material.id,
      metadata: {
        lectureId: data.lectureId
      }
    });

    return success(
      res,
      {
        material
      },
      201
    );
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to create lecture material.",
      500
    );
  }
}

/*
|--------------------------------------------------------------------------
| Update material
|--------------------------------------------------------------------------
*/

export async function updateMaterial(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const { id } = req.params;

    const parsed =
      updateMaterialSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return failure(
        res,
        "Invalid material information."
      );
    }

    const existing =
      await prisma.lectureMaterial.findUnique({
        where: {
          id
        },
        include: {
          lecture: {
            select: {
              courseId: true
            }
          }
        }
      });

    if (!existing) {
      return failure(
        res,
        "Material not found.",
        404
      );
    }

    const allowed =
      await canManageCourse(
        req,
        existing.lecture.courseId
      );

    if (!allowed) {
      return failure(
        res,
        "You do not have permission to update this material.",
        403
      );
    }

    const material =
      await prisma.lectureMaterial.update({
        where: {
          id
        },
        data: parsed.data
      });

    return success(res, {
      material
    });
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to update material.",
      500
    );
  }
}

/*
|--------------------------------------------------------------------------
| Generate secure material download URL
|--------------------------------------------------------------------------
*/

export async function getMaterialUrl(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const { id } = req.params;

    const material =
      await prisma.lectureMaterial.findUnique({
        where: {
          id
        },
        include: {
          lecture: {
            select: {
              courseId: true
            }
          }
        }
      });

    if (!material) {
      return failure(
        res,
        "Material not found.",
        404
      );
    }

    if (
      req.user.role === "STUDENT"
    ) {
      const access =
        await studentHasCourseAccess(
          req.user.id,
          material.lecture.courseId
        );

      if (!access) {
        return failure(
          res,
          "You do not have access to this material.",
          403
        );
      }
    } else if (
      req.user.role === "TEACHER"
    ) {
      const owns =
        await teacherOwnsCourse(
          req.user.id,
          material.lecture.courseId
        );

      if (!owns) {
        return failure(
          res,
          "You do not have permission to access this material.",
          403
        );
      }
    }

    if (material.fileUrl) {
      return success(res, {
        url: material.fileUrl,
        expiresInSeconds: 300
      });
    }

    const signedUrl =
      await storageService.createSignedDownloadUrl(
        material.storageKey,
        {
          expiresInSeconds: 300,
          contentType:
            material.mimeType ?? undefined
        }
      );

    return success(res, {
      url: signedUrl,
      expiresInSeconds: 300
    });
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to generate material URL.",
      500
    );
  }
}