import { PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function main() {
  // 1) Optional password changes from Render environment variables
  const pw: Record<string, string | undefined> = {
    "admin@maknazulirfan.org": process.env.ADMIN_PASSWORD,
    "teacher@maknazulirfan.org": process.env.TEACHER_PASSWORD,
    "student@maknazulirfan.org": process.env.STUDENT_PASSWORD
  };
  for (const [email, pass] of Object.entries(pw)) {
    if (!pass) continue;
    if (pass.length < 8) {
      console.log("Skipping password for " + email + " (needs 8+ characters).");
      continue;
    }
    const hash = await argon2.hash(pass, { type: argon2.argon2id });
    const r = await prisma.user.updateMany({
      where: { email },
      data: { passwordHash: hash }
    });
    if (r.count) console.log("Password updated for " + email);
  }

  // 2) Sample content, only when there are no courses yet
  if ((await prisma.course.count()) > 0) {
    console.log("Courses already exist. Skipping sample content.");
    return;
  }

  const teacher = await prisma.user.findUnique({ where: { email: "teacher@maknazulirfan.org" } });
  const studentUser = await prisma.user.findUnique({ where: { email: "student@maknazulirfan.org" } });
  const subject = await prisma.subject.findFirst();
  if (!teacher || !studentUser) {
    console.log("Demo users missing. Skipping sample content.");
    return;
  }

  const course = await prisma.course.create({
    data: {
      title: "Introduction to Arabic Reading",
      description: "A sample beginner course: Arabic letters, sounds and simple words.",
      status: "PUBLISHED",
      isFree: true,
      teacherId: teacher.id,
      subjectId: subject ? subject.id : null
    }
  });

  const topic = await prisma.topic.create({
    data: {
      name: "Arabic Letters",
      description: "Learning the alphabet",
      subjectId: subject ? subject.id : (await prisma.subject.create({ data: { name: "Arabic Language" } })).id,
      courseId: course.id
    }
  });

  await prisma.lecture.createMany({
    data: [
      { courseId: course.id, topicId: topic.id, title: "Lesson 1: The Arabic Alphabet", description: "Overview of the 28 letters.", content: "Arabic is written from right to left and has 28 letters.", order: 1, orderNumber: 1, published: true },
      { courseId: course.id, topicId: topic.id, title: "Lesson 2: Short Vowels", description: "Fathah, kasrah and dammah.", content: "Short vowels are small marks placed above or below letters.", order: 2, orderNumber: 2, published: true }
    ]
  });

  const qs = [
    { text: "How many letters are in the Arabic alphabet?", opts: ["26", "28", "30", "32"], correct: 1 },
    { text: "In which direction is Arabic written?", opts: ["Left to right", "Top to bottom", "Right to left", "Bottom to top"], correct: 2 },
    { text: "Which mark is placed above a letter to give the 'a' sound?", opts: ["Fathah", "Kasrah", "Dammah", "Sukun"], correct: 0 }
  ];
  const questionIds: string[] = [];
  for (const q of qs) {
    const created = await prisma.question.create({
      data: {
        text: q.text,
        type: "MCQ",
        difficulty: "EASY",
        createdById: teacher.id,
        subjectId: subject ? subject.id : null,
        topicId: topic.id,
        options: { create: q.opts.map((t, i) => ({ text: t, isCorrect: i === q.correct })) }
      }
    });
    questionIds.push(created.id);
  }

  const test = await prisma.test.create({
    data: {
      title: "Arabic Letters Quiz",
      description: "A short sample quiz.",
      courseId: course.id,
      createdById: teacher.id,
      durationMinutes: 15,
      passMark: 50,
      maxAttempts: 3,
      published: true,
      numberOfQuestions: questionIds.length,
      subjectId: subject ? subject.id : null,
      topicId: topic.id
    }
  });
  await prisma.testQuestion.createMany({
    data: questionIds.map((id, i) => ({ testId: test.id, questionId: id, order: i + 1, orderNumber: i + 1, points: 1 }))
  });

  await prisma.notification.create({
    data: {
      userId: studentUser.id,
      type: "COURSE",
      title: "Welcome to Maknazul Irfan",
      message: "A sample course is available. Open Courses to start learning."
    }
  });

  console.log("Sample course, lectures, quiz and notification created.");
}

main()
  .catch((e) => console.error("Sample seed failed (non-fatal):", e))
  .finally(() => prisma.$disconnect());
