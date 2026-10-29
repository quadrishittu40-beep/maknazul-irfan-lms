import { Response } from "express";
import { z } from "zod";

import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { AuthenticatedRequest } from "../middleware/auth";

const createCourseSchema = z.object({
  title: z.string().trim().min(3).max(200),
  description: z.string().trim().max(5000).optional(),
  subjectId: z.string().min(1).optional(),
  levelId: z.string().min(1).optional(),
  classId: z.string().min(1).optional(),
  status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT")
});

const updateCourseSchema = z.object({
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().trim().max(5000).nullable().optional(),
  status: z.enum(["DRAFT", "PUBLISHED", "ARCHIVED"]).optional()
});

function isAdmin(req: AuthenticatedRequest) {
  return req.user?.role === "ADMIN";
}

async function loadOwnedCourse(req: AuthenticatedRequest, id: string) {
  const course = await prisma.course.findUnique({
    where: { id },
    select: { id: true, teacherId: true }
  });
  if (!course) return { error: "Course not found.", code: 404 } as const;
  if (!isAdmin(req) && course.teacherId !== req.user?.id) {
    return { error: "This course is not assigned to you.", code: 403 } as const;
  }
  return { course } as const;
}

export async function listTeacherCourses(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const courses = await prisma.course.findMany({
      where: isAdmin(req) ? {} : { teacherId: req.user!.id },
      orderBy: { createdAt: "desc" },
      include: {
        subject: { select: { id: true, name: true } },
        level: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        _count: {
          select: { lectures: true, tests: true, enrollments: true }
        }
      }
    });
    return success(res, { courses });
  } catch (error) {
    console.error("listTeacherCourses error:", error);
    return failure(res, "Unable to load your courses.", 500);
  }
}

export async function createTeacherCourse(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const parsed = createCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      return failure(res, "Please give the course a title of at least 3 characters.", 422);
    }
    const d = parsed.data;

    const course = await prisma.course.create({
      data: {
        title: d.title,
        description: d.description || null,
        status: d.status,
        isFree: true,
        teacherId: req.user!.id,
        subjectId: d.subjectId || null,
        levelId: d.levelId || null,
        classId: d.classId || null
      }
    });

    return success(res, { course }, 201);
  } catch (error) {
    console.error("createTeacherCourse error:", error);
    return failure(res, "Unable to create the course.", 500);
  }
}

export async function updateTeacherCourse(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const owned = await loadOwnedCourse(req, req.params.id);
    if ("error" in owned) return failure(res, owned.error, owned.code);

    const parsed = updateCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      return failure(res, "Invalid course information.", 422);
    }

    const course = await prisma.course.update({
      where: { id: req.params.id },
      data: parsed.data
    });
    return success(res, { course });
  } catch (error) {
    console.error("updateTeacherCourse error:", error);
    return failure(res, "Unable to update the course.", 500);
  }
}

export async function getTeacherCourse(
  req: AuthenticatedRequest,
  res: Response
) {
  try {
    const owned = await loadOwnedCourse(req, req.params.id);
    if ("error" in owned) return failure(res, owned.error, owned.code);

    const course = await prisma.course.findUnique({
      where: { id: req.params.id },
      include: {
        subject: { select: { id: true, name: true } },
        level: { select: { id: true, name: true } },
        class: { select: { id: true, name: true } },
        lectures: {
          orderBy: [{ orderNumber: "asc" }, { createdAt: "asc" }],
          select: {
            id: true,
            title: true,
            description: true,
            content: true,
            videoUrl: true,
            published: true,
            orderNumber: true,
            materials: {
              orderBy: { createdAt: "asc" },
              select: { id: true, title: true, type: true, fileUrl: true, originalName: true }
            }
          }
        },
        tests: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            title: true,
            durationMinutes: true,
            published: true,
            _count: { select: { questions: true, attempts: true } }
          }
        },
        enrollments: {
          orderBy: { enrolledAt: "desc" },
          select: {
            enrolledAt: true,
            student: {
              select: {
                id: true,
                user: {
                  select: { firstName: true, lastName: true, email: true }
                },
                level: { select: { name: true } },
                class: { select: { name: true } }
              }
            }
          }
        }
      }
    });

    return success(res, { course });
  } catch (error) {
    console.error("getTeacherCourse error:", error);
    return failure(res, "Unable to load the course.", 500);
  }
}


const materialSchema = z.object({
  title: z.string().trim().min(2).max(200),
  type: z
    .enum(["VIDEO", "AUDIO", "IMAGE", "PDF", "DOCUMENT", "PRESENTATION", "LINK", "OTHER"])
    .default("DOCUMENT")
    .transform((t) => (t === "PRESENTATION" ? "DOCUMENT" : t)),
  url: z.string().trim().url().max(1000)
});

async function loadOwnedLecture(req: AuthenticatedRequest, lectureId: string) {
  const lecture = await prisma.lecture.findUnique({
    where: { id: lectureId },
    select: { id: true, courseId: true }
  });
  if (!lecture) return { error: "Lecture not found.", code: 404 } as const;
  const owned = await loadOwnedCourse(req, lecture.courseId);
  if ("error" in owned) return owned;
  return { lecture } as const;
}

export async function addLectureMaterial(req: AuthenticatedRequest, res: Response) {
  try {
    const owned = await loadOwnedLecture(req, req.params.id);
    if ("error" in owned) return failure(res, owned.error, owned.code);
    const parsed = materialSchema.safeParse(req.body);
    if (!parsed.success) {
      return failure(res, "Enter a title and a valid link starting with https://", 422);
    }
    const d = parsed.data;
    const material = await prisma.lectureMaterial.create({
      data: {
        lectureId: req.params.id,
        type: d.type,
        title: d.title,
        storageKey: "link:" + d.url,
        fileUrl: d.url
      }
    });
    return success(res, { material }, 201);
  } catch (error) {
    console.error("addLectureMaterial error:", error);
    return failure(res, "Unable to add the material.", 500);
  }
}

export async function deleteLectureMaterial(req: AuthenticatedRequest, res: Response) {
  try {
    const material = await prisma.lectureMaterial.findUnique({
      where: { id: req.params.id },
      select: { id: true, lectureId: true }
    });
    if (!material) return failure(res, "Material not found.", 404);
    const owned = await loadOwnedLecture(req, material.lectureId);
    if ("error" in owned) return failure(res, owned.error, owned.code);
    await prisma.lectureMaterial.delete({ where: { id: material.id } });
    return success(res, { message: "Material removed." });
  } catch (error) {
    console.error("deleteLectureMaterial error:", error);
    return failure(res, "Unable to remove the material.", 500);
  }
}

export async function searchStudents(req: AuthenticatedRequest, res: Response) {
  try {
    const q = String(req.query.q || "").trim();
    const courseId = String(req.query.courseId || "");
    const students = await prisma.studentProfile.findMany({
      where: {
        status: { in: ["APPROVED", "ENROLLED"] },
        ...(courseId ? { enrollments: { none: { courseId } } } : {}),
        ...(q
          ? {
              user: {
                OR: [
                  { firstName: { contains: q, mode: "insensitive" } },
                  { lastName: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } }
                ]
              }
            }
          : {})
      },
      take: 30,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        user: { select: { firstName: true, lastName: true, email: true } }
      }
    });
    return success(res, { students });
  } catch (error) {
    console.error("searchStudents error:", error);
    return failure(res, "Unable to search students.", 500);
  }
}

export async function enrollStudent(req: AuthenticatedRequest, res: Response) {
  try {
    const owned = await loadOwnedCourse(req, req.params.id);
    if ("error" in owned) return failure(res, owned.error, owned.code);
    const studentId = String(req.body?.studentId || "");
    if (!studentId) return failure(res, "Choose a student.", 422);
    const student = await prisma.studentProfile.findUnique({ where: { id: studentId } });
    if (!student) return failure(res, "Student not found.", 404);
    if (student.status !== "APPROVED" && student.status !== "ENROLLED") {
      return failure(res, "This student has not been approved yet.", 403);
    }
    const existing = await prisma.courseEnrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId: req.params.id } }
    });
    if (existing) return success(res, { message: "Student is already enrolled." });
    await prisma.courseEnrollment.create({
      data: { studentId, courseId: req.params.id }
    });
    if (student.status === "APPROVED") {
      await prisma.studentProfile.update({ where: { id: studentId }, data: { status: "ENROLLED" } });
    }
    return success(res, { message: "Student enrolled." }, 201);
  } catch (error) {
    console.error("enrollStudent error:", error);
    return failure(res, "Unable to enroll the student.", 500);
  }
}

export async function unenrollStudent(req: AuthenticatedRequest, res: Response) {
  try {
    const owned = await loadOwnedCourse(req, req.params.id);
    if ("error" in owned) return failure(res, owned.error, owned.code);
    await prisma.courseEnrollment.deleteMany({
      where: { courseId: req.params.id, studentId: req.params.studentId }
    });
    return success(res, { message: "Student removed from the course." });
  } catch (error) {
    console.error("unenrollStudent error:", error);
    return failure(res, "Unable to remove the student.", 500);
  }
}


/* =========================================================
   Direct file upload (PDF, documents, images, audio, video)
========================================================= */

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

function materialTypeFor(mime: string, name: string) {
  const n = name.toLowerCase();
  if (mime === "application/pdf" || n.endsWith(".pdf")) return "PDF" as const;
  if (mime.startsWith("image/")) return "IMAGE" as const;
  if (mime.startsWith("audio/")) return "AUDIO" as const;
  if (mime.startsWith("video/")) return "VIDEO" as const;
  if (/\.(pptx?|key)$/.test(n)) return "DOCUMENT" as const;
  if (/\.(docx?|xlsx?|txt|rtf|odt)$/.test(n)) return "DOCUMENT" as const;
  return "OTHER" as const;
}

export async function uploadLectureMaterial(req: AuthenticatedRequest, res: Response) {
  try {
    const owned = await loadOwnedLecture(req, req.params.id);
    if ("error" in owned) return failure(res, owned.error, owned.code);

    const body: any = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      return failure(res, "No file was received.", 422);
    }
    if (body.length > MAX_UPLOAD_BYTES) {
      return failure(res, "The file is too large. The limit is 15 MB.", 413);
    }

    const mime = String(req.headers["content-type"] || "application/octet-stream").split(";")[0];
    const originalName = String(req.query.name || "file").slice(0, 200);
    const title = String(req.query.title || originalName).trim().slice(0, 200);
    if (title.length < 2) return failure(res, "Enter a title for the material.", 422);

    const material = await prisma.lectureMaterial.create({
      data: {
        lectureId: req.params.id,
        type: materialTypeFor(mime, originalName),
        title,
        storageKey: "upload:" + Date.now(),
        originalName,
        mimeType: mime,
        fileSize: body.length
      }
    });

    await prisma.materialFile.create({
      data: { materialId: material.id, data: body }
    });

    const updated = await prisma.lectureMaterial.update({
      where: { id: material.id },
      data: { fileUrl: `/api/lectures/materials/${material.id}/file` },
      select: { id: true, title: true, type: true, fileUrl: true, originalName: true }
    });

    return success(res, { material: updated }, 201);
  } catch (error) {
    console.error("uploadLectureMaterial error:", error);
    return failure(res, "Unable to upload the file.", 500);
  }
}

/* Serves an uploaded material to people allowed to see the course. */
export async function downloadMaterialFile(req: AuthenticatedRequest, res: Response) {
  try {
    const material = await prisma.lectureMaterial.findUnique({
      where: { id: String(req.params.id) },
      include: {
        file: true,
        lecture: { select: { courseId: true, published: true, course: { select: { teacherId: true } } } }
      }
    });
    if (!material || !material.file) return res.status(404).end();

    const me = req.user!;
    let allowed = me.role === "ADMIN";
    if (me.role === "TEACHER") allowed = material.lecture.course.teacherId === me.id;
    if (me.role === "STUDENT") {
      const sp = await prisma.studentProfile.findUnique({
        where: { userId: me.id },
        select: { id: true }
      });
      const enrolled = sp
        ? await prisma.courseEnrollment.findUnique({
            where: { studentId_courseId: { studentId: sp.id, courseId: material.lecture.courseId } },
            select: { id: true }
          })
        : null;
      allowed = !!enrolled && material.lecture.published;
    }
    if (!allowed) return res.status(403).end();

    const safe = (material.originalName || material.title || "file").replace(/[^a-zA-Z0-9._-]+/g, "_");
    res.setHeader("Content-Type", material.mimeType || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${safe}"`);
    res.setHeader("Cache-Control", "private, no-cache");
    return res.send(Buffer.from(material.file.data));
  } catch (error) {
    console.error("downloadMaterialFile error:", error);
    return res.status(500).end();
  }
}
