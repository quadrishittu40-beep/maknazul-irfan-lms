import { prisma } from "../config/prisma";

export async function studentHasCourseAccess(
  userId: string,
  courseId: string
): Promise < boolean > {
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

export async function getStudentProfileId(
  userId: string
): Promise < string | null > {
  const student =
    await prisma.studentProfile.findUnique({
      where: {
        userId
      },
      select: {
        id: true
      }
    });
  
  return student?.id ?? null;
}

export async function teacherOwnsCourse(
  userId: string,
  courseId: string
): Promise < boolean > {
  const course =
    await prisma.course.findFirst({
      where: {
        id: courseId,
        teacherId: userId
      },
      select: {
        id: true
      }
    });
  
  return Boolean(course);
}