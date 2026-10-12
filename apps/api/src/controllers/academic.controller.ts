import {
  Request,
  Response,
  NextFunction
} from "express";

import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { AuthenticatedRequest } from "../middleware/auth";
import { createAuditLog } from "../services/audit.service";

import {
  createLevelSchema,
  updateLevelSchema,
  createClassSchema,
  updateClassSchema,
  createSubjectSchema,
  updateSubjectSchema,
  createCourseSchema,
  updateCourseSchema,
  createTopicSchema,
  updateTopicSchema
} from "../validators/academic";

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

/* =========================================================
   LEVELS
========================================================= */

export async function listLevels(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const levels = await prisma.level.findMany({
      orderBy: {
        name: "asc"
      },

      include: {
        _count: {
          select: {
            classes: true,
            students: true,
            courses: true
          }
        }
      }
    });

    return success(res, {
      levels
    });
  } catch (error) {
    next(error);
  }
}

export async function createLevel(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed =
      createLevelSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid level information.",
        422
      );
    }

    const existing =
      await prisma.level.findUnique({
        where: {
          name: parsed.data.name
        }
      });

    if (existing) {
      return failure(
        res,
        "A level with this name already exists.",
        409
      );
    }

    const level =
      await prisma.level.create({
        data: parsed.data
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "CREATE_LEVEL",
      entity: "Level",
      entityId: level.id,
      metadata: {
        name: level.name
      },
      ...requestInfo(req)
    });

    return success(
      res,
      { level },
      201
    );
  } catch (error) {
    next(error);
  }
}

export async function updateLevel(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed =
      updateLevelSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid level information.",
        422
      );
    }

    const level =
      await prisma.level.findUnique({
        where: {
          id: req.params.id
        }
      });

    if (!level) {
      return failure(
        res,
        "Level not found.",
        404
      );
    }

    const updated =
      await prisma.level.update({
        where: {
          id: level.id
        },
        data: parsed.data
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "UPDATE_LEVEL",
      entity: "Level",
      entityId: level.id,
      metadata: parsed.data,
      ...requestInfo(req)
    });

    return success(res, {
      level: updated
    });
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   CLASSES
========================================================= */

export async function listClasses(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const levelId =
      typeof req.query.levelId === "string"
        ? req.query.levelId
        : undefined;

    const classes =
      await prisma.class.findMany({
        where: {
          ...(levelId
            ? { levelId }
            : {})
        },

        orderBy: {
          name: "asc"
        },

        include: {
          level: {
            select: {
              id: true,
              name: true
            }
          },

          _count: {
            select: {
              students: true,
              courses: true,
              questions: true
            }
          }
        }
      });

    return success(res, {
      classes
    });
  } catch (error) {
    next(error);
  }
}

export async function createClass(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed =
      createClassSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid class information.",
        422
      );
    }

    const level =
      await prisma.level.findUnique({
        where: {
          id: parsed.data.levelId
        }
      });

    if (!level) {
      return failure(
        res,
        "Selected level does not exist.",
        404
      );
    }

    const existing =
      await prisma.class.findUnique({
        where: {
          levelId_name: {
            levelId: parsed.data.levelId,
            name: parsed.data.name
          }
        }
      });

    if (existing) {
      return failure(
        res,
        "This class already exists under the selected level.",
        409
      );
    }

    const classRecord =
      await prisma.class.create({
        data: parsed.data
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "CREATE_CLASS",
      entity: "Class",
      entityId: classRecord.id,
      metadata: parsed.data,
      ...requestInfo(req)
    });

    return success(
      res,
      {
        class: classRecord
      },
      201
    );
  } catch (error) {
    next(error);
  }
}

export async function updateClass(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed =
      updateClassSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid class information.",
        422
      );
    }

    const existing =
      await prisma.class.findUnique({
        where: {
          id: req.params.id
        }
      });

    if (!existing) {
      return failure(
        res,
        "Class not found.",
        404
      );
    }

    if (parsed.data.levelId) {
      const level =
        await prisma.level.findUnique({
          where: {
            id: parsed.data.levelId
          }
        });

      if (!level) {
        return failure(
          res,
          "Selected level does not exist.",
          404
        );
      }
    }

    const updated =
      await prisma.class.update({
        where: {
          id: existing.id
        },
        data: parsed.data
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "UPDATE_CLASS",
      entity: "Class",
      entityId: existing.id,
      metadata: parsed.data,
      ...requestInfo(req)
    });

    return success(res, {
      class: updated
    });
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   SUBJECTS
========================================================= */

export async function listSubjects(
  _req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const subjects =
      await prisma.subject.findMany({
        orderBy: {
          name: "asc"
        },

        include: {
          _count: {
            select: {
              topics: true,
              courses: true,
              questions: true
            }
          }
        }
      });

    return success(res, {
      subjects
    });
  } catch (error) {
    next(error);
  }
}

export async function createSubject(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed =
      createSubjectSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid subject information.",
        422
      );
    }

    const existing =
      await prisma.subject.findUnique({
        where: {
          name: parsed.data.name
        }
      });

    if (existing) {
      return failure(
        res,
        "A subject with this name already exists.",
        409
      );
    }

    const subject =
      await prisma.subject.create({
        data: parsed.data
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "CREATE_SUBJECT",
      entity: "Subject",
      entityId: subject.id,
      metadata: parsed.data,
      ...requestInfo(req)
    });

    return success(
      res,
      { subject },
      201
    );
  } catch (error) {
    next(error);
  }
}

export async function updateSubject(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed =
      updateSubjectSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid subject information.",
        422
      );
    }

    const subject =
      await prisma.subject.findUnique({
        where: {
          id: req.params.id
        }
      });

    if (!subject) {
      return failure(
        res,
        "Subject not found.",
        404
      );
    }

    const updated =
      await prisma.subject.update({
        where: {
          id: subject.id
        },
        data: parsed.data
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "UPDATE_SUBJECT",
      entity: "Subject",
      entityId: subject.id,
      metadata: parsed.data,
      ...requestInfo(req)
    });

    return success(res, {
      subject: updated
    });
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   COURSES
========================================================= */

export async function listCourses(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const courses =
      await prisma.course.findMany({
        where: {
          ...(typeof req.query.status === "string"
            ? {
                status:
                  req.query.status as
                    | "DRAFT"
                    | "PUBLISHED"
                    | "ARCHIVED"
              }
            : {}),

          ...(typeof req.query.subjectId === "string"
            ? {
                subjectId: req.query.subjectId
              }
            : {}),

          ...(typeof req.query.teacherId === "string"
            ? {
                teacherId: req.query.teacherId
              }
            : {})
        },

        orderBy: {
          createdAt: "desc"
        },

        include: {
          subject: {
            select: {
              id: true,
              name: true
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

          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },

          _count: {
            select: {
              topics: true,
              lectures: true,
              tests: true,
              enrollments: true
            }
          }
        }
      });

    return success(res, {
      courses
    });
  } catch (error) {
    next(error);
  }
}

export async function getCourse(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const course =
      await prisma.course.findUnique({
        where: {
          id: req.params.id
        },

        include: {
          subject: true,
          level: true,
          class: true,

          teacher: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              teacherProfile: true
            }
          },

          topics: {
            orderBy: {
              createdAt: "asc"
            },

            include: {
              lectures: {
                orderBy: {
                  orderNumber: "asc"
                }
              },

              tests: {
                select: {
                  id: true,
                  title: true,
                  durationMinutes: true,
                  passMark: true,
                  isPublished: true
                }
              }
            }
          },

          _count: {
            select: {
              enrollments: true,
              lectures: true,
              tests: true
            }
          }
        }
      });

    if (!course) {
      return failure(
        res,
        "Course not found.",
        404
      );
    }

    return success(res, {
      course
    });
  } catch (error) {
    next(error);
  }
}

export async function createCourse(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed =
      createCourseSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid course information.",
        422
      );
    }

    const data = parsed.data;

    const subject =
      await prisma.subject.findUnique({
        where: {
          id: data.subjectId
        }
      });

    if (!subject) {
      return failure(
        res,
        "Selected subject does not exist.",
        404
      );
    }

    const teacher =
      await prisma.user.findUnique({
        where: {
          id: data.teacherId
        }
      });

    if (
      !teacher ||
      teacher.role !== "TEACHER"
    ) {
      return failure(
        res,
        "Selected teacher does not exist.",
        404
      );
    }

    if (data.levelId) {
      const level =
        await prisma.level.findUnique({
          where: {
            id: data.levelId
          }
        });

      if (!level) {
        return failure(
          res,
          "Selected level does not exist.",
          404
        );
      }
    }

    if (data.classId) {
      const classRecord =
        await prisma.class.findUnique({
          where: {
            id: data.classId
          }
        });

      if (!classRecord) {
        return failure(
          res,
          "Selected class does not exist.",
          404
        );
      }

      if (
        data.levelId &&
        classRecord.levelId !== data.levelId
      ) {
        return failure(
          res,
          "The selected class does not belong to the selected level.",
          422
        );
      }
    }

    if (
      data.isFree === false &&
      (data.price === undefined ||
        data.price <= 0)
    ) {
      return failure(
        res,
        "A paid course must have a price greater than zero.",
        422
      );
    }

    const course =
      await prisma.course.create({
        data: {
          title: data.title,
          description: data.description,
          thumbnail: data.thumbnail,

          levelId: data.levelId,
          classId: data.classId,
          subjectId: data.subjectId,
          teacherId: data.teacherId,

          status: data.status,

          isFree: data.isFree,
          price: data.price,
          currency: data.currency,

          startDate: data.startDate
            ? new Date(data.startDate)
            : undefined,

          endDate: data.endDate
            ? new Date(data.endDate)
            : undefined
        }
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "CREATE_COURSE",
      entity: "Course",
      entityId: course.id,
      metadata: {
        title: course.title,
        subjectId: course.subjectId,
        teacherId: course.teacherId
      },
      ...requestInfo(req)
    });

    return success(
      res,
      { course },
      201
    );
  } catch (error) {
    next(error);
  }
}

export async function updateCourse(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed =
      updateCourseSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid course information.",
        422
      );
    }

    const existing =
      await prisma.course.findUnique({
        where: {
          id: req.params.id
        }
      });

    if (!existing) {
      return failure(
        res,
        "Course not found.",
        404
      );
    }

    const data = parsed.data;

    if (data.subjectId) {
      const subject =
        await prisma.subject.findUnique({
          where: {
            id: data.subjectId
          }
        });

      if (!subject) {
        return failure(
          res,
          "Selected subject does not exist.",
          404
        );
      }
    }

    if (data.teacherId) {
      const teacher =
        await prisma.user.findUnique({
          where: {
            id: data.teacherId
          }
        });

      if (
        !teacher ||
        teacher.role !== "TEACHER"
      ) {
        return failure(
          res,
          "Selected teacher does not exist.",
          404
        );
      }
    }

    const updated =
      await prisma.course.update({
        where: {
          id: existing.id
        },

        data: {
          ...data,

          startDate: data.startDate
            ? new Date(data.startDate)
            : undefined,

          endDate: data.endDate
            ? new Date(data.endDate)
            : undefined
        }
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "UPDATE_COURSE",
      entity: "Course",
      entityId: existing.id,
      metadata: data,
      ...requestInfo(req)
    });

    return success(res, {
      course: updated
    });
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   TOPICS
========================================================= */

export async function listTopics(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const topics =
      await prisma.topic.findMany({
        where: {
          ...(typeof req.query.courseId === "string"
            ? {
                courseId: req.query.courseId
              }
            : {}),

          ...(typeof req.query.subjectId === "string"
            ? {
                subjectId: req.query.subjectId
              }
            : {})
        },

        orderBy: {
          createdAt: "asc"
        },

        include: {
          subject: {
            select: {
              id: true,
              name: true
            }
          },

          course: {
            select: {
              id: true,
              title: true
            }
          },

          _count: {
            select: {
              lectures: true,
              tests: true
            }
          }
        }
      });

    return success(res, {
      topics
    });
  } catch (error) {
    next(error);
  }
}

export async function createTopic(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed =
      createTopicSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid topic information.",
        422
      );
    }

    const data = parsed.data;

    const subject =
      await prisma.subject.findUnique({
        where: {
          id: data.subjectId
        }
      });

    if (!subject) {
      return failure(
        res,
        "Selected subject does not exist.",
        404
      );
    }

    if (data.courseId) {
      const course =
        await prisma.course.findUnique({
          where: {
            id: data.courseId
          }
        });

      if (!course) {
        return failure(
          res,
          "Selected course does not exist.",
          404
        );
      }

      if (
        course.subjectId !== data.subjectId
      ) {
        return failure(
          res,
          "The topic subject must match the course subject.",
          422
        );
      }
    }

    const topic =
      await prisma.topic.create({
        data
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "CREATE_TOPIC",
      entity: "Topic",
      entityId: topic.id,
      metadata: data,
      ...requestInfo(req)
    });

    return success(
      res,
      { topic },
      201
    );
  } catch (error) {
    next(error);
  }
}

export async function updateTopic(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const parsed =
      updateTopicSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid topic information.",
        422
      );
    }

    const existing =
      await prisma.topic.findUnique({
        where: {
          id: req.params.id
        }
      });

    if (!existing) {
      return failure(
        res,
        "Topic not found.",
        404
      );
    }

    const updated =
      await prisma.topic.update({
        where: {
          id: existing.id
        },
        data: parsed.data
      });

    await createAuditLog({
      userId: req.user!.id,
      action: "UPDATE_TOPIC",
      entity: "Topic",
      entityId: existing.id,
      metadata: parsed.data,
      ...requestInfo(req)
    });

    return success(res, {
      topic: updated
    });
  } catch (error) {
    next(error);
  }
}
