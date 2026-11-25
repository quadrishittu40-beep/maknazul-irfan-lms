import { Router } from "express";
import { z } from "zod";
import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { fileToText, generateBuiltIn, generateWithAI } from "../services/examgen.service";

const router = Router();
router.use(requireAuth, requireRole("TEACHER", "ADMIN"));

/* A teacher may only manage tests in courses assigned to them; the admin may manage all */
async function ownedCourse(user: any, courseId: string) {
  const course = await prisma.course.findUnique({
    where: { id: courseId },
    select: { id: true, teacherId: true, subjectId: true, levelId: true, classId: true }
  });
  if (!course) return null;
  if (user.role === "TEACHER" && course.teacherId !== user.id) return null;
  return course;
}

async function ownedTest(user: any, testId: string) {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    include: { course: { select: { id: true, teacherId: true, subjectId: true, levelId: true, classId: true } } }
  });
  if (!test) return null;
  if (user.role === "TEACHER" && test.course.teacherId !== user.id) return null;
  return test;
}

const testSchema = z.object({
  title: z.string().trim().min(2).max(200),
  description: z.string().trim().max(5000).optional(),
  durationMinutes: z.coerce.number().int().min(1).max(1440),
  passMark: z.coerce.number().min(0).max(100).default(50),
  maxAttempts: z.coerce.number().int().min(1).max(20).default(1),
  randomQuestions: z.boolean().default(false),
  randomOptions: z.boolean().default(false),
  availableFrom: z.coerce.date().optional().nullable(),
  availableUntil: z.coerce.date().optional().nullable()
});

/* ---------- create a test / exam in a course ---------- */
router.post("/course/:courseId", async (req: any, res) => {
  try {
    const course = await ownedCourse(req.user, String(req.params.courseId));
    if (!course) return failure(res, "You do not own this course.", 403);
    const body = testSchema.parse(req.body);
    const test = await prisma.test.create({
      data: {
        title: body.title,
        description: body.description || null,
        courseId: course.id,
        createdById: req.user.id,
        subjectId: course.subjectId,
        durationMinutes: body.durationMinutes,
        passMark: body.passMark,
        maxAttempts: body.maxAttempts,
        randomQuestions: body.randomQuestions,
        randomOptions: body.randomOptions,
        published: false,
        availableFrom: body.availableFrom || null,
        availableUntil: body.availableUntil || null
      }
    });
    return success(res, { test, message: "Created as a draft. Add questions, then publish it." }, 201);
  } catch (error: any) {
    if (error?.issues) return failure(res, "Please check the test details (title, duration and pass mark).", 400);
    console.error("teacher-tests create error:", error);
    return failure(res, "Unable to create the test.", 500);
  }
});

/* ---------- read one test with its questions and answers ---------- */
router.get("/:testId", async (req: any, res) => {
  try {
    const test = await ownedTest(req.user, String(req.params.testId));
    if (!test) return failure(res, "Test not found.", 404);
    const items = await prisma.testQuestion.findMany({
      where: { testId: test.id },
      orderBy: { order: "asc" },
      include: { question: { include: { options: { orderBy: { id: "asc" } } } } }
    });
    return success(res, {
      test: { id: test.id, title: test.title, published: test.published },
      questions: items.map((i) => ({
        id: i.id,
        text: i.question.text,
        type: i.question.type,
        explanation: i.question.explanation,
        options: i.question.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect }))
      }))
    });
  } catch (error) {
    console.error("teacher-tests get error:", error);
    return failure(res, "Unable to load the test.", 500);
  }
});

/* ---------- publish / unpublish / edit ---------- */
router.patch("/:testId", async (req: any, res) => {
  try {
    const test = await ownedTest(req.user, String(req.params.testId));
    if (!test) return failure(res, "Test not found.", 404);
    const body = testSchema.partial().extend({ published: z.boolean().optional() }).parse(req.body);

    if (body.published === true) {
      const count = await prisma.testQuestion.count({ where: { testId: test.id } });
      if (count === 0) return failure(res, "Add at least one question before publishing.", 400);
    }
    const updated = await prisma.test.update({
      where: { id: test.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined ? { description: body.description || null } : {}),
        ...(body.durationMinutes !== undefined ? { durationMinutes: body.durationMinutes } : {}),
        ...(body.passMark !== undefined ? { passMark: body.passMark } : {}),
        ...(body.maxAttempts !== undefined ? { maxAttempts: body.maxAttempts } : {}),
        ...(body.randomQuestions !== undefined ? { randomQuestions: body.randomQuestions } : {}),
        ...(body.randomOptions !== undefined ? { randomOptions: body.randomOptions } : {}),
        ...(body.availableFrom !== undefined ? { availableFrom: body.availableFrom } : {}),
        ...(body.availableUntil !== undefined ? { availableUntil: body.availableUntil } : {}),
        ...(body.published !== undefined ? { published: body.published } : {})
      }
    });
    return success(res, { test: updated });
  } catch (error: any) {
    if (error?.issues) return failure(res, "Invalid details.", 400);
    console.error("teacher-tests patch error:", error);
    return failure(res, "Unable to update the test.", 500);
  }
});

/* ---------- delete (only if nobody has attempted it) ---------- */
router.delete("/:testId", async (req: any, res) => {
  try {
    const test = await ownedTest(req.user, String(req.params.testId));
    if (!test) return failure(res, "Test not found.", 404);
    const attempts = await prisma.testAttempt.count({ where: { testId: test.id } });
    if (attempts > 0) return failure(res, "Students have already taken this test. Unpublish it instead of deleting.", 400);
    await prisma.test.delete({ where: { id: test.id } });
    return success(res, { message: "Test deleted." });
  } catch (error) {
    console.error("teacher-tests delete error:", error);
    return failure(res, "Unable to delete the test.", 500);
  }
});

/* ---------- add a question (multiple choice or true/false) ---------- */
const questionSchema = z.object({
  text: z.string().trim().min(2).max(10000),
  type: z.enum(["MCQ", "TRUE_FALSE"]).default("MCQ"),
  explanation: z.string().trim().max(5000).optional(),
  options: z
    .array(z.object({ text: z.string().trim().min(1).max(2000), isCorrect: z.boolean() }))
    .min(2)
    .max(6)
}).superRefine((d, ctx) => {
  if (d.options.filter((o) => o.isCorrect).length !== 1) {
    ctx.addIssue({ code: "custom", path: ["options"], message: "Mark exactly one correct answer." });
  }
});

router.post("/:testId/questions", async (req: any, res) => {
  try {
    const test = await ownedTest(req.user, String(req.params.testId));
    if (!test) return failure(res, "Test not found.", 404);
    const parsed = questionSchema.safeParse(req.body);
    if (!parsed.success) {
      return failure(res, parsed.error.issues[0]?.message || "Please enter the question and its options.", 400);
    }
    const q = parsed.data;
    const count = await prisma.testQuestion.count({ where: { testId: test.id } });
    const question = await prisma.question.create({
      data: {
        text: q.text,
        type: q.type,
        explanation: q.explanation || null,
        createdById: req.user.id,
        subjectId: test.course.subjectId,
        levelId: test.course.levelId,
        classId: test.course.classId,
        options: { create: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) }
      }
    });
    await prisma.testQuestion.create({
      data: { testId: test.id, questionId: question.id, order: count + 1 }
    });
    return success(res, { total: count + 1, message: "Question added." }, 201);
  } catch (error) {
    console.error("teacher-tests add question error:", error);
    return failure(res, "Unable to add the question.", 500);
  }
});

/* ---------- generate questions from notes / lecture notes / uploaded materials ---------- */
const genSchema = z.object({
  text: z.string().max(40000).optional(),
  useLectures: z.boolean().default(false),
  useMaterials: z.boolean().default(false),
  count: z.coerce.number().int().min(1).max(30).default(10),
  kind: z.enum(["MCQ", "TRUE_FALSE", "MIXED"]).default("MIXED")
});

router.post("/:testId/generate", async (req: any, res) => {
  try {
    const test = await ownedTest(req.user, String(req.params.testId));
    if (!test) return failure(res, "Test not found.", 404);
    const body = genSchema.parse(req.body);

    const parts: string[] = [];
    const skipped: string[] = [];
    if (body.text && body.text.trim()) parts.push(body.text);

    if (body.useLectures) {
      const lectures = await prisma.lecture.findMany({
        where: { courseId: test.courseId },
        orderBy: { order: "asc" },
        select: { title: true, description: true, content: true }
      });
      for (const l of lectures) {
        const t = [l.description, l.content].filter(Boolean).join("\n");
        if (t.trim()) parts.push(t);
      }
    }

    if (body.useMaterials) {
      const mats = await prisma.lectureMaterial.findMany({
        where: { lecture: { courseId: test.courseId } },
        take: 20,
        include: { file: true }
      });
      for (const m of mats) {
        const name = m.originalName || m.title;
        const t = m.file ? fileToText(name, m.mimeType, Buffer.from(m.file.data)) : null;
        if (t && t.trim()) parts.push(t);
        else skipped.push(name);
      }
    }

    const text = parts.join("\n").slice(0, 60000);
    if (text.trim().length < 80) {
      return failure(
        res,
        skipped.length
          ? "I could not read text from those files (PDF and images cannot be read). Paste the notes into the box instead."
          : "Please paste your notes (at least a few sentences) or tick a source.",
        400
      );
    }

    let engine = "AI";
    let questions = await generateWithAI(text, body.count, body.kind);
    if (!questions) {
      engine = "built-in";
      questions = generateBuiltIn(text, body.count, body.kind);
    }
    if (!questions.length) {
      return failure(res, "I could not make questions from this text. Use longer notes written in full sentences.", 400);
    }

    let order = await prisma.testQuestion.count({ where: { testId: test.id } });
    for (const q of questions) {
      const question = await prisma.question.create({
        data: {
          text: q.text,
          type: q.type,
          explanation: q.explanation || null,
          createdById: req.user.id,
          subjectId: test.course.subjectId,
          levelId: test.course.levelId,
          classId: test.course.classId,
          options: { create: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) }
        }
      });
      order += 1;
      await prisma.testQuestion.create({
        data: { testId: test.id, questionId: question.id, order }
      });
    }
    return success(res, { added: questions.length, engine, skipped, total: order }, 201);
  } catch (error: any) {
    if (error?.issues) return failure(res, "Invalid request.", 400);
    console.error("teacher-tests generate error:", error);
    return failure(res, "Unable to generate questions.", 500);
  }
});

/* ---------- remove a question from a test ---------- */
router.delete("/:testId/questions/:id", async (req: any, res) => {
  try {
    const test = await ownedTest(req.user, String(req.params.testId));
    if (!test) return failure(res, "Test not found.", 404);
    const tq = await prisma.testQuestion.findFirst({
      where: { id: String(req.params.id), testId: test.id }
    });
    if (!tq) return failure(res, "Question not found.", 404);
    await prisma.testQuestion.delete({ where: { id: tq.id } });
    const used = await prisma.testQuestion.count({ where: { questionId: tq.questionId } });
    const answered = await prisma.studentAnswer.count({ where: { questionId: tq.questionId } });
    if (!used && !answered) await prisma.question.delete({ where: { id: tq.questionId } });
    return success(res, { message: "Question removed." });
  } catch (error) {
    console.error("teacher-tests remove question error:", error);
    return failure(res, "Unable to remove the question.", 500);
  }
});

export default router;
