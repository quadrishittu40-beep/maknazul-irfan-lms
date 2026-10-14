import { Response } from "express";

import { prisma } from "../config/prisma";
import {
  AuthenticatedRequest
} from "../middleware/auth";
import { success, failure } from "../utils/http";
import {
  studentHasCourseAccess
} from "../services/access.service";

export async function enrollInCourse(
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
    
    const { courseId } = req.params;
    
    const student =
      await prisma.studentProfile.findUnique({
        where: {
          userId: req.user.id
        }
      });
    
    if (!student) {
      return failure(
        res,
        "Student profile not found.",
        404
      );
    }
    
    if (
      student.status !== "APPROVED" &&
      student.status !== "ENROLLED"
    ) {
      return failure(
        res,
        "Your student account has not been approved for enrollment.",
        403
      );
    }
    
    const course =
      await prisma.course.findUnique({
        where: {
          id: courseId
        }
      });
    
    if (!course) {
      return failure(
        res,
        "Course not found.",
        404
      );
    }
    
    if (course.status !== "PUBLISHED") {
      return failure(
        res,
        "This course is not currently available.",
        403
      );
    }
    
    const existing =
      await prisma.courseEnrollment.findUnique({
        where: {
          studentId_courseId: {
            studentId: student.id,
            courseId
          }
        }
      });
    
    if (existing) {
      return success(res, {
        enrollment: existing,
        message: "You are already enrolled in this course."
      });
    }
    
    const enrollment =
      await prisma.courseEnrollment.create({
        data: {
          studentId: student.id,
          courseId
        }
      });
    
    if (student.status === "APPROVED") {
      await prisma.studentProfile.update({
        where: {
          id: student.id
        },
        data: {
          status: "ENROLLED"
        }
      });
    }
    
    return success(
      res,
      {
        enrollment,
        message: "Course enrollment successful."
      },
      201
    );
  } catch (error) {
    return failure(
      res,
      error instanceof Error ?
      error.message :
      "Unable to enroll in course.",
      500
    );
  }
}

export async function listMyCourses(
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
    
    const student =
      await prisma.studentProfile.findUnique({
        where: {
          userId: req.user.id
        },
        select: {
          id: true
        }
      });
    
    if (!student) {
      return failure(
        res,
        "Student profile not found.",
        404
      );
    }
    
    const enrollments =
      await prisma.courseEnrollment.findMany({
        where: {
          studentId: student.id
        },
        include: {
          course: {
            include: {
              subject: true,
              teacher: {
                select: {
                  id: true,
                  firstName: true,
                  lastName: true
                }
              },
              _count: {
                select: {
                  lectures: true,
                  tests: true
                }
              }
            }
          }
        },
        orderBy: {
          enrolledAt: "desc"
        }
      });
    
    return success(res, {
      courses: enrollments
    });
  } catch (error) {
    return failure(
      res,
      error instanceof Error ?
      error.message :
      "Unable to load enrolled courses.",
      500
    );
  }
}

export async function checkCourseAccess(
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
    
    const { courseId } = req.params;
    
    const hasAccess =
      await studentHasCourseAccess(
        req.user.id,
        courseId
      );
    
    return success(res, {
      courseId,
      hasAccess
    });
  } catch (error) {
    return failure(
      res,
      error instanceof Error ?
      error.message :
      "Unable to check course access.",
      500
    );
  }
}

export async function listCourseStudents(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    if (!req.user) {
      return failure(res, "Authentication required.", 401);
    }

    const role = String((req.user as any).role);
    const courseId = String(req.params.courseId);

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, teacherId: true }
    });

    if (!course) {
      return failure(res, "Course not found.", 404);
    }

    if (
      role !== "ADMIN" &&
      !(role === "TEACHER" && course.teacherId === req.user.id)
    ) {
      return failure(res, "Access denied.", 403);
    }

    const enrollments = await prisma.courseEnrollment.findMany({
      where: { courseId },
      orderBy: { enrolledAt: "desc" },
      include: {
        student: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true
              }
            }
          }
        }
      }
    });

    const students = enrollments.map((e: any) => ({
      id: e.student.userId,
      studentId: e.student.id,
      enrolledAt: e.enrolledAt,
      user: e.student.user
    }));

    return success(res, { students });
  } catch (error) {
    console.error("listCourseStudents error:", error);
    return failure(res, "Unable to load students.", 500);
  }
}
