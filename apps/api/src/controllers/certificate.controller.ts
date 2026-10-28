import { Request, Response } from "express";

import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";


/* =========================================================
   HELPER: GET AUTHENTICATED USER ID
========================================================= */

function getUserId(req: Request): string | null {
  const user = (req as any).user;

  // requireAuth stores the signed-in user as req.user.id
  return user?.id ?? user?.userId ?? null;
}


/* =========================================================
   HELPER: GENERATE CERTIFICATE NUMBER
========================================================= */

function generateCertificateNumber(): string {
  const year = new Date().getFullYear();

  const random = Math.random()
    .toString(36)
    .substring(2, 10)
    .toUpperCase();

  return `MIA-${year}-${random}`;
}


/* =========================================================
   STUDENT: LIST MY CERTIFICATES
========================================================= */

export async function listMyCertificates(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(
        res,
        "Authentication required",
        401
      );
    }

    const student =
      await prisma.studentProfile.findUnique({
        where: {
          userId
        },

        select: {
          id: true
        }
      });

    if (!student) {
      return failure(
        res,
        "Student profile not found",
        404
      );
    }

    const certificates =
      await prisma.certificate.findMany({
        where: {
          studentId: student.id
        },

        include: {
          course: {
            select: {
              id: true,
              title: true
            }
          }
        },

        orderBy: {
          issuedAt: "desc"
        }
      });

    return success(res, {
      certificates
    });
  } catch (error) {
    console.error(
      "listMyCertificates error:",
      error
    );

    return failure(
      res,
      "Unable to load certificates",
      500
    );
  }
}


/* =========================================================
   STUDENT: GET ONE CERTIFICATE
========================================================= */

export async function getMyCertificate(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(
        res,
        "Authentication required",
        401
      );
    }

    const { id } = req.params;

    if (!id) {
      return failure(
        res,
        "Certificate ID is required",
        400
      );
    }

    const student =
      await prisma.studentProfile.findUnique({
        where: {
          userId
        },

        select: {
          id: true
        }
      });

    if (!student) {
      return failure(
        res,
        "Student profile not found",
        404
      );
    }

    const certificate =
      await prisma.certificate.findFirst({
        where: {
          id,
          studentId: student.id
        },

        include: {
          course: {
            select: {
              id: true,
              title: true
            }
          },

          student: {
            select: {
              id: true,

              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          }
        }
      });

    if (!certificate) {
      return failure(
        res,
        "Certificate not found",
        404
      );
    }

    return success(res, {
      certificate
    });
  } catch (error) {
    console.error(
      "getMyCertificate error:",
      error
    );

    return failure(
      res,
      "Unable to load certificate",
      500
    );
  }
}


/* =========================================================
   ADMIN: LIST ALL CERTIFICATES
========================================================= */

export async function listAllCertificates(
  req: Request,
  res: Response
) {
  try {
    const certificates =
      await prisma.certificate.findMany({
        include: {
          student: {
            select: {
              id: true,

              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },

          course: {
            select: {
              id: true,
              title: true
            }
          }
        },

        orderBy: {
          issuedAt: "desc"
        }
      });

    return success(res, {
      certificates
    });
  } catch (error) {
    console.error(
      "listAllCertificates error:",
      error
    );

    return failure(
      res,
      "Unable to load certificates",
      500
    );
  }
}


/* =========================================================
   ADMIN: ISSUE CERTIFICATE
========================================================= */

export async function issueCertificate(
  req: Request,
  res: Response
) {
  try {
    const {
      studentId,
      courseId,
      certificateUrl
    } = req.body;

    /* -----------------------------------------------------
       VALIDATE STUDENT ID
    ----------------------------------------------------- */

    if (
      typeof studentId !== "string" ||
      !studentId.trim()
    ) {
      return failure(
        res,
        "Student ID is required",
        400
      );
    }

    /* -----------------------------------------------------
       FIND STUDENT
    ----------------------------------------------------- */

    const student =
      await prisma.studentProfile.findUnique({
        where: {
          id: studentId.trim()
        },

        select: {
          id: true,
          userId: true
        }
      });

    if (!student) {
      return failure(
        res,
        "Student not found",
        404
      );
    }

    /* -----------------------------------------------------
       VALIDATE COURSE ID
    ----------------------------------------------------- */

    if (
      courseId !== undefined &&
      courseId !== null &&
      typeof courseId !== "string"
    ) {
      return failure(
        res,
        "Invalid course ID",
        400
      );
    }

    const normalizedCourseId =
      typeof courseId === "string" &&
      courseId.trim()
        ? courseId.trim()
        : null;

    /* -----------------------------------------------------
       VERIFY COURSE
    ----------------------------------------------------- */

    if (normalizedCourseId) {
      const course =
        await prisma.course.findUnique({
          where: {
            id: normalizedCourseId
          },

          select: {
            id: true
          }
        });

      if (!course) {
        return failure(
          res,
          "Course not found",
          404
        );
      }
    }

    /* -----------------------------------------------------
       CHECK DUPLICATE CERTIFICATE
    ----------------------------------------------------- */

    const existing =
      await prisma.certificate.findFirst({
        where: {
          studentId: student.id,
          courseId: normalizedCourseId
        },

        select: {
          id: true
        }
      });

    if (existing) {
      return failure(
        res,
        normalizedCourseId
          ? "This student already has a certificate for this course"
          : "This student already has a certificate without a course",
        409
      );
    }

    /* -----------------------------------------------------
       GENERATE UNIQUE CERTIFICATE NUMBER
    ----------------------------------------------------- */

    let certificateNumber =
      generateCertificateNumber();

    let numberExists =
      await prisma.certificate.findUnique({
        where: {
          certificateNumber
        },

        select: {
          id: true
        }
      });

    let attempts = 0;

    while (numberExists && attempts < 5) {
      certificateNumber =
        generateCertificateNumber();

      numberExists =
        await prisma.certificate.findUnique({
          where: {
            certificateNumber
          },

          select: {
            id: true
          }
        });

      attempts++;
    }

    if (numberExists) {
      return failure(
        res,
        "Unable to generate a unique certificate number",
        500
      );
    }

    /* -----------------------------------------------------
       NORMALIZE CERTIFICATE URL
    ----------------------------------------------------- */

    const normalizedCertificateUrl =
      typeof certificateUrl === "string" &&
      certificateUrl.trim()
        ? certificateUrl.trim()
        : null;

    /* -----------------------------------------------------
       CREATE CERTIFICATE
    ----------------------------------------------------- */

    const certificate =
      await prisma.certificate.create({
        data: {
          certificateNumber,

          studentId: student.id,

          courseId:
            normalizedCourseId,

          certificateUrl:
            normalizedCertificateUrl
        },

        include: {
          student: {
            select: {
              id: true,

              user: {
                select: {
                  firstName: true,
                  lastName: true,
                  email: true
                }
              }
            }
          },

          course: {
            select: {
              id: true,
              title: true
            }
          }
        }
      });

    /* -----------------------------------------------------
       NOTIFY STUDENT
    ----------------------------------------------------- */

    await prisma.notification.create({
      data: {
        userId: student.userId,

        type: "SYSTEM",

        title: "Certificate Issued",

        message:
          normalizedCourseId
            ? "A certificate has been issued to your student profile for a completed course."
            : "A certificate has been issued to your student profile."
      }
    });

    /* -----------------------------------------------------
       RESPONSE
    ----------------------------------------------------- */

    return success(
      res,
      {
        certificate
      },
      201
    );
  } catch (error) {
    console.error(
      "issueCertificate error:",
      error
    );

    return failure(
      res,
      "Unable to issue certificate",
      500
    );
  }
}