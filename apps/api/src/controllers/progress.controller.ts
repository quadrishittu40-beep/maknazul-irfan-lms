import { Response } from "express";
import { z } from "zod";

import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { success, failure } from "../utils/http";
import {
  getStudentProfileId,
  studentHasCourseAccess
} from "../services/access.service";

const videoProgressSchema = z.object({
  videoPositionSeconds: z.coerce.number().int().min(0)
});

/*
|--------------------------------------------------------------------------
| Shared: load a published lecture and verify the student may access it
|--------------------------------------------------------------------------
*/

async function resolveLectureAccess(
  req: AuthenticatedRequest,
  res: Response
) {
  if (!req.user) {
    failure(res, "Authentication required.", 401);
    return null;
  }

  const studentId = await getStudentProfileId(req.user.id);

  if (!studentId) {
    failure(res, "Student profile not found.", 404);
    return null;
  }

  const lecture = await prisma.lecture.findUnique({
    where: { id: req.params.lectureId },
    select: {
      id: true,
      courseId: true,
      published: true,
      durationSeconds: true
    }
  });

  if (!lecture || !lecture.published) {
    failure(res, "Lecture not found.", 404);
    return null;
  }

  const allowed = await studentHasCourseAccess(
    req.user.id,
    lecture.courseId
  );

  if (!allowed) {
    failure(res, "You are not enrolled in this course.", 403);
    return null;
  }

  return { studentId, lecture };
}

/*
|--------------------------------------------------------------------------
| Get progress for one lecture
|--------------------------------------------------------------------------
*/

export async function getLectureProgress(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const ctx = await resolveLectureAccess(req, res);
    if (!ctx) return;

    const progress = await prisma.lectureProgress.findUnique({
      where: {
        studentId_lectureId: {
          studentId: ctx.studentId,
          lectureId: ctx.lecture.id
        }
      }
    });

    return success(
      res,
      progress ?? {
        lectureId: ctx.lecture.id,
        startedAt: null,
        completedAt: null,
        videoPositionSeconds: 0,
        completed: false
      }
    );
  } catch (error) {
    console.error("getLectureProgress error:", error);
    return failure(res, "Unable to load lecture progress.", 500);
  }
}

/*
|--------------------------------------------------------------------------
| Start a lecture (idempotent)
|--------------------------------------------------------------------------
*/

export async function startLecture(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const ctx = await resolveLectureAccess(req, res);
    if (!ctx) return;

    const progress = await prisma.lectureProgress.upsert({
      where: {
        studentId_lectureId: {
          studentId: ctx.studentId,
          lectureId: ctx.lecture.id
        }
      },
      create: {
        studentId: ctx.studentId,
        lectureId: ctx.lecture.id,
        startedAt: new Date()
      },
      update: {}
    });

    if (!progress.startedAt) {
      const updated = await prisma.lectureProgress.update({
        where: { id: progress.id },
        data: { startedAt: new Date() }
      });
      return success(res, updated);
    }

    return success(res, progress);
  } catch (error) {
    console.error("startLecture error:", error);
    return failure(res, "Unable to start lecture.", 500);
  }
}

/*
|--------------------------------------------------------------------------
| Save video position
|--------------------------------------------------------------------------
*/

export async function updateVideoProgress(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const parsed = videoProgressSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(res, "Invalid video position.", 400);
    }

    const ctx = await resolveLectureAccess(req, res);
    if (!ctx) return;

    let position = parsed.data.videoPositionSeconds;

    if (ctx.lecture.durationSeconds) {
      position = Math.min(position, ctx.lecture.durationSeconds);
    }

    const progress = await prisma.lectureProgress.upsert({
      where: {
        studentId_lectureId: {
          studentId: ctx.studentId,
          lectureId: ctx.lecture.id
        }
      },
      create: {
        studentId: ctx.studentId,
        lectureId: ctx.lecture.id,
        startedAt: new Date(),
        videoPositionSeconds: position
      },
      update: {
        videoPositionSeconds: position
      }
    });

    return success(res, progress);
  } catch (error) {
    console.error("updateVideoProgress error:", error);
    return failure(res, "Unable to save video progress.", 500);
  }
}

/*
|--------------------------------------------------------------------------
| Mark lecture complete
|--------------------------------------------------------------------------
*/

export async function completeLecture(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const ctx = await resolveLectureAccess(req, res);
    if (!ctx) return;

    const now = new Date();

    const progress = await prisma.lectureProgress.upsert({
      where: {
        studentId_lectureId: {
          studentId: ctx.studentId,
          lectureId: ctx.lecture.id
        }
      },
      create: {
        studentId: ctx.studentId,
        lectureId: ctx.lecture.id,
        startedAt: now,
        completedAt: now,
        completed: true
      },
      update: {
        completed: true,
        completedAt: now
      }
    });

    return success(res, progress);
  } catch (error) {
    console.error("completeLecture error:", error);
    return failure(res, "Unable to complete lecture.", 500);
  }
}

/*
|--------------------------------------------------------------------------
| Progress summary for a whole course
|--------------------------------------------------------------------------
*/

export async function getCourseProgress(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return failure(res, "Authentication required.", 401);
    }

    const { courseId } = req.params;

    const studentId = await getStudentProfileId(req.user.id);

    if (!studentId) {
      return failure(res, "Student profile not found.", 404);
    }

    const allowed = await studentHasCourseAccess(req.user.id, courseId);

    if (!allowed) {
      return failure(res, "You are not enrolled in this course.", 403);
    }

    const lectures = await prisma.lecture.findMany({
      where: { courseId, published: true },
      orderBy: { order: "asc" },
      select: { id: true, title: true, order: true }
    });

    const progressRows = await prisma.lectureProgress.findMany({
      where: {
        studentId,
        lectureId: { in: lectures.map((l) => l.id) }
      }
    });

    const byLecture = new Map(progressRows.map((p) => [p.lectureId, p]));

    const items = lectures.map((lecture) => {
      const p = byLecture.get(lecture.id);
      return {
        lectureId: lecture.id,
        title: lecture.title,
        order: lecture.order,
        completed: p?.completed ?? false,
        videoPositionSeconds: p?.videoPositionSeconds ?? 0
      };
    });

    const completedCount = items.filter((i) => i.completed).length;

    return success(res, {
      courseId,
      totalLectures: items.length,
      completedLectures: completedCount,
      percentage:
        items.length === 0
          ? 0
          : Math.round((completedCount / items.length) * 100),
      lectures: items
    });
  } catch (error) {
    console.error("getCourseProgress error:", error);
    return failure(res, "Unable to load course progress.", 500);
  }
}
