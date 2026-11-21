import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { ensureMatricNumber } from "../services/matric.service";

const router = Router();
router.use(requireAuth);

const TYPES = ["RESUMPTION", "CLOSING", "EXAM", "HOLIDAY", "EVENT"] as const;

/* ---------- My matric number (students) ---------- */
router.get("/matric", requireRole("STUDENT"), async (req: any, res) => {
  try {
    const sp = await prisma.studentProfile.findUnique({
      where: { userId: req.user.id },
      select: { id: true, status: true, matricNumber: true }
    });
    if (!sp) return success(res, { matricNumber: null });
    let matric = sp.matricNumber;
    if (!matric && ["APPROVED", "ENROLLED", "GRADUATED"].includes(sp.status)) {
      matric = await ensureMatricNumber(sp.id);
    }
    return success(res, { matricNumber: matric });
  } catch (error) {
    console.error("matric error:", error);
    return success(res, { matricNumber: null });
  }
});

/* ---------- Academic calendar ---------- */
router.get("/calendar", async (_req, res) => {
  try {
    const events = await prisma.calendarEvent.findMany({ orderBy: { startDate: "asc" }, take: 500 });
    return success(res, { events });
  } catch (error) {
    console.error("calendar list error:", error);
    return failure(res, "Unable to load the calendar.", 500);
  }
});

const eventSchema = z.object({
  session: z.string().trim().min(4).max(20),
  term: z.string().trim().max(40).optional().or(z.literal("")),
  title: z.string().trim().min(2).max(150),
  description: z.string().trim().max(500).optional().or(z.literal("")),
  type: z.enum(TYPES),
  startDate: z.string().min(8),
  endDate: z.string().optional().or(z.literal(""))
});

router.post("/calendar", requireRole("ADMIN"), async (req, res) => {
  const p = eventSchema.safeParse(req.body);
  if (!p.success) return failure(res, "Enter the session (e.g. 2026/2027), a title, a type and a start date.", 422);
  const d = p.data;
  const start = new Date(d.startDate);
  const end = d.endDate ? new Date(d.endDate) : null;
  if (isNaN(start.getTime()) || (end && isNaN(end.getTime()))) return failure(res, "Invalid date.", 422);
  if (end && end < start) return failure(res, "The end date cannot be before the start date.", 422);
  try {
    const event = await prisma.calendarEvent.create({
      data: {
        session: d.session,
        term: d.term || null,
        title: d.title,
        description: d.description || null,
        type: d.type,
        startDate: start,
        endDate: end
      }
    });
    return success(res, { event, message: "Event added." }, 201);
  } catch (error) {
    console.error("calendar create error:", error);
    return failure(res, "Unable to add the event.", 500);
  }
});

router.delete("/calendar/:id", requireRole("ADMIN"), async (req, res) => {
  try {
    await prisma.calendarEvent.delete({ where: { id: req.params.id } });
    return success(res, { message: "Event removed." });
  } catch {
    return failure(res, "Event not found.", 404);
  }
});

/* ---------- Scheme of work ---------- */
router.get("/scheme/:courseId", async (req: any, res) => {
  try {
    const course = await prisma.course.findUnique({
      where: { id: req.params.courseId },
      select: { id: true, title: true, teacherId: true, teacher: { select: { firstName: true, lastName: true } } }
    });
    if (!course) return failure(res, "Course not found.", 404);
    const items = await prisma.schemeItem.findMany({
      where: { courseId: course.id },
      orderBy: [{ week: "asc" }, { createdAt: "asc" }]
    });
    const canEdit = req.user.role === "ADMIN" || (req.user.role === "TEACHER" && course.teacherId === req.user.id);
    return success(res, {
      course: {
        id: course.id,
        title: course.title,
        teacher: course.teacher ? `${course.teacher.firstName} ${course.teacher.lastName}`.trim() : ""
      },
      items,
      canEdit
    });
  } catch (error) {
    console.error("scheme get error:", error);
    return failure(res, "Unable to load the scheme of work.", 500);
  }
});

const schemeSchema = z.object({
  items: z
    .array(
      z.object({
        week: z.number().int().min(1).max(60),
        topic: z.string().trim().min(1).max(200),
        objectives: z.string().trim().max(1000).optional().or(z.literal("")),
        activities: z.string().trim().max(1000).optional().or(z.literal(""))
      })
    )
    .max(60)
});

router.put("/scheme/:courseId", requireRole("ADMIN", "TEACHER"), async (req: any, res) => {
  const p = schemeSchema.safeParse(req.body);
  if (!p.success) return failure(res, "Each row needs a week number and a topic.", 422);
  try {
    const course = await prisma.course.findUnique({ where: { id: req.params.courseId }, select: { id: true, teacherId: true } });
    if (!course) return failure(res, "Course not found.", 404);
    if (req.user.role === "TEACHER" && course.teacherId !== req.user.id) return failure(res, "Access denied.", 403);
    await prisma.$transaction([
      prisma.schemeItem.deleteMany({ where: { courseId: course.id } }),
      prisma.schemeItem.createMany({
        data: p.data.items.map((i) => ({
          courseId: course.id,
          week: i.week,
          topic: i.topic,
          objectives: i.objectives || null,
          activities: i.activities || null
        }))
      })
    ]);
    return success(res, { message: "Scheme of work saved." });
  } catch (error) {
    console.error("scheme save error:", error);
    return failure(res, "Unable to save the scheme of work.", 500);
  }
});

export default router;
