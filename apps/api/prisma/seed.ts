import { PrismaClient, Role, StudentStatus, CourseStatus, MaterialType, Difficulty, TestQuestionType, PaymentProvider, LiveClassProvider } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

async function main() {
  console.log("Starting Maknazul Irfan LMS database seed...");

  // ─────────────────────────────────────────────
  // DEVELOPMENT PASSWORDS
  // ─────────────────────────────────────────────

  const adminPassword = "ChangeMe_Admin_2026!";
  const teacherPassword = "ChangeMe_Teacher_2026!";
  const studentPassword = "ChangeMe_Student_2026!";

  // ─────────────────────────────────────────────
  // GRADE SCALE
  // ─────────────────────────────────────────────

  const gradeScales = [
    {
      grade: "A+",
      minPercentage: 90,
      maxPercentage: 100,
      description: "Excellent"
    },
    {
      grade: "A",
      minPercentage: 80,
      maxPercentage: 89.99,
      description: "Very Good"
    },
    {
      grade: "B",
      minPercentage: 70,
      maxPercentage: 79.99,
      description: "Good"
    },
    {
      grade: "C",
      minPercentage: 60,
      maxPercentage: 69.99,
      description: "Credit"
    },
    {
      grade: "D",
      minPercentage: 50,
      maxPercentage: 59.99,
      description: "Pass"
    },
    {
      grade: "F",
      minPercentage: 0,
      maxPercentage: 49.99,
      description: "Fail"
    }
  ];

  for (const grade of gradeScales) {
    await prisma.gradeScale.upsert({
      where: {
        grade: grade.grade
      },
      update: grade,
      create: grade
    });
  }

  // ─────────────────────────────────────────────
  // LEVELS
  // ─────────────────────────────────────────────

  const primary = await prisma.level.upsert({
    where: {
      name: "Primary"
    },
    update: {},
    create: {
      name: "Primary",
      description: "Primary level Islamic and Arabic education."
    }
  });

  const juniorSecondary = await prisma.level.upsert({
    where: {
      name: "Junior Secondary"
    },
    update: {},
    create: {
      name: "Junior Secondary",
      description: "Junior secondary Islamic and Arabic education."
    }
  });

  const seniorSecondary = await prisma.level.upsert({
    where: {
      name: "Senior Secondary"
    },
    update: {},
    create: {
      name: "Senior Secondary",
      description: "Senior secondary Islamic and Arabic education."
    }
  });

  // ─────────────────────────────────────────────
  // CLASSES
  // ─────────────────────────────────────────────

  const primaryClasses = [
    "Primary 1",
    "Primary 2",
    "Primary 3",
    "Primary 4",
    "Primary 5",
    "Primary 6"
  ];

  const juniorClasses = [
    "JSS 1",
    "JSS 2",
    "JSS 3"
  ];

  const seniorClasses = [
    "SS 1",
    "SS 2",
    "SS 3"
  ];

  for (const name of primaryClasses) {
    await prisma.class.upsert({
      where: {
        levelId_name: {
          levelId: primary.id,
          name
        }
      },
      update: {},
      create: {
        name,
        levelId: primary.id
      }
    });
  }

  for (const name of juniorClasses) {
    await prisma.class.upsert({
      where: {
        levelId_name: {
          levelId: juniorSecondary.id,
          name
        }
      },
      update: {},
      create: {
        name,
        levelId: juniorSecondary.id
      }
    });
  }

  for (const name of seniorClasses) {
    await prisma.class.upsert({
      where: {
        levelId_name: {
          levelId: seniorSecondary.id,
          name
        }
      },
      update: {},
      create: {
        name,
        levelId: seniorSecondary.id
      }
    });
  }

  // ─────────────────────────────────────────────
  // SUBJECTS
  // ─────────────────────────────────────────────

  const subjectNames = [
    "Arabic Language",
    "Arabic Reading",
    "Arabic Writing",
    "Arabic Grammar",
    "Arabic Morphology",
    "Arabic Vocabulary",
    "Arabic Literature",
    "Qur'an Studies",
    "Qur'an Recitation",
    "Tajweed",
    "Qur'an Memorization",
    "Hadith",
    "Fiqh",
    "Aqeedah",
    "Seerah",
    "Islamic History",
    "Akhlaq",
    "Islamic Etiquette"
  ];

  const subjects: Record<string, string> = {};

  for (const name of subjectNames) {
    const subject = await prisma.subject.upsert({
      where: {
        name
      },
      update: {},
      create: {
        name,
        description: `${name} course at MAKNAZUL IRFAN Online Islamic & Arabic Institute.`
      }
    });

    subjects[name] = subject.id;
  }

  // ─────────────────────────────────────────────
  // ADMIN
  // ─────────────────────────────────────────────

  const admin = await prisma.user.upsert({
    where: {
      email: "admin@maknazulirfan.org"
    },
    update: {
      role: Role.ADMIN,
      isActive: true
    },
    create: {
      email: "admin@maknazulirfan.org",
      passwordHash: await hashPassword(adminPassword),
      firstName: "System",
      lastName: "Administrator",
      role: Role.ADMIN
    }
  });

  // ─────────────────────────────────────────────
  // TEACHER
  // ─────────────────────────────────────────────

  const teacher = await prisma.user.upsert({
    where: {
      email: "teacher@maknazulirfan.org"
    },
    update: {
      role: Role.TEACHER,
      isActive: true
    },
    create: {
      email: "teacher@maknazulirfan.org",
      passwordHash: await hashPassword(teacherPassword),
      firstName: "MAKNAZUL",
      lastName: "Teacher",
      role: Role.TEACHER
    }
  });

  await prisma.teacherProfile.upsert({
    where: {
      userId: teacher.id
    },
    update: {
      specialization: "Arabic and Islamic Studies",
      qualification: "Islamic and Arabic Education"
    },
    create: {
      userId: teacher.id,
      specialization: "Arabic and Islamic Studies",
      qualification: "Islamic and Arabic Education",
      biography:
        "Teacher at MAKNAZUL IRFAN Online Islamic & Arabic Institute."
    }
  });

  // ─────────────────────────────────────────────
  // STUDENT
  // ─────────────────────────────────────────────

  const primaryOne = await prisma.class.findUnique({
    where: {
      levelId_name: {
        levelId: primary.id,
        name: "Primary 1"
      }
    }
  });

  if (!primaryOne) {
    throw new Error("Primary 1 class was not created.");
  }

  const student = await prisma.user.upsert({
    where: {
      email: "student@maknazulirfan.org"
    },
    update: {
      role: Role.STUDENT,
      isActive: true
    },
    create: {
      email: "student@maknazulirfan.org",
      passwordHash: await hashPassword(studentPassword),
      firstName: "Demo",
      lastName: "Student",
      role: Role.STUDENT
    }
  });

  await prisma.studentProfile.upsert({
    where: {
      userId: student.id
    },
    update: {
      status: StudentStatus.ENROLLED,
      levelId: primary.id,
      classId: primaryOne.id
    },
    create: {
      userId: student.id,
      status: StudentStatus.ENROLLED,
      levelId: primary.id,
      classId: primaryOne.id,
      guardianName: "Demo Guardian",
      guardianPhone: "08000000000"
    }
  });

  // ─────────────────────────────────────────────
  // DEMO COURSE
  // ─────────────────────────────────────────────

  const aqeedahSubjectId = subjects["Aqeedah"];

  const course = await prisma.course.create({
    data: {
      title: "Building Sound Aqeedah for Young Muslims",
      description:
        "An introductory course designed to teach young Muslims the foundations of sound Islamic belief.",
      levelId: primary.id,
      classId: primaryOne.id,
      subjectId: aqeedahSubjectId,
      teacherId: teacher.id,
      status: CourseStatus.PUBLISHED,
      isFree: true,
      currency: "NGN"
    }
  });

  // ─────────────────────────────────────────────
  // TOPICS
  // ─────────────────────────────────────────────

  const topicOne = await prisma.topic.create({
    data: {
      title: "Introduction to Tawheed",
      description:
        "An introduction to the meaning and importance of Tawheed.",
      subjectId: aqeedahSubjectId,
      courseId: course.id
    }
  });

  const topicTwo = await prisma.topic.create({
    data: {
      title: "The Three Fundamental Categories",
      description:
        "Introduction to the major categories used in studying Tawheed.",
      subjectId: aqeedahSubjectId,
      courseId: course.id
    }
  });

  // ─────────────────────────────────────────────
  // LECTURES
  // ─────────────────────────────────────────────

  const lectureOne = await prisma.lecture.create({
    data: {
      title: "What Is Tawheed?",
      description:
        "A basic explanation of the meaning and significance of Tawheed.",
      courseId: course.id,
      topicId: topicOne.id,
      orderNumber: 1
    }
  });

  const lectureTwo = await prisma.lecture.create({
    data: {
      title: "Why Tawheed Matters",
      description:
        "Understanding the importance of worshipping Allah alone.",
      courseId: course.id,
      topicId: topicOne.id,
      orderNumber: 2
    }
  });

  const lectureThree = await prisma.lecture.create({
    data: {
      title: "Categories of Tawheed",
      description:
        "An introduction to the categories of Tawheed.",
      courseId: course.id,
      topicId: topicTwo.id,
      orderNumber: 3
    }
  });

  // ─────────────────────────────────────────────
  // DEMO MATERIALS
  // ─────────────────────────────────────────────

  await prisma.lectureMaterial.create({
    data: {
      lectureId: lectureOne.id,
      type: MaterialType.OTHER,
      title: "Introduction Lecture Material",
      fileUrl: "/demo-materials/tawheed-introduction.pdf",
      mimeType: "application/pdf"
    }
  });

  await prisma.lectureMaterial.create({
    data: {
      lectureId: lectureTwo.id,
      type: MaterialType.OTHER,
      title: "Why Tawheed Matters",
      fileUrl: "/demo-materials/why-tawheed-matters.pdf",
      mimeType: "application/pdf"
    }
  });

  // ─────────────────────────────────────────────
  // DEMO TEST
  // ─────────────────────────────────────────────

  const test = await prisma.test.create({
    data: {
      title: "Tawheed Introduction Test",
      description:
        "A short assessment covering the introductory Tawheed lessons.",
      courseId: course.id,
      topicId: topicOne.id,
      durationMinutes: 20,
      numberOfQuestions: 5,
      passMark: 50,
      maxAttempts: 2,
      randomQuestions: false,
      randomOptions: true,
      isPublished: true,
      questionType: TestQuestionType.MCQ
    }
  });

  // ─────────────────────────────────────────────
  // QUESTIONS
  // ─────────────────────────────────────────────

  const questions = [
    {
      text: "What does Tawheed primarily mean?",
      explanation: "Tawheed means affirming the oneness of Allah.",
      options: [
        ["Believing in many gods", false],
        ["Affirming the oneness of Allah", true],
        ["Rejecting worship", false],
        ["Following every religion", false]
      ]
    },
    {
      text: "Who alone deserves worship?",
      explanation: "Islam teaches that worship belongs to Allah alone.",
      options: [
        ["Angels", false],
        ["Prophets", false],
        ["Allah", true],
        ["Human beings", false]
      ]
    },
    {
      text: "What is one of the foundations of Islamic belief?",
      explanation: "Belief in Allah is fundamental to Islam.",
      options: [
        ["Belief in Allah", true],
        ["Worshipping idols", false],
        ["Rejecting revelation", false],
        ["Denying the Prophets", false]
      ]
    },
    {
      text: "What is the opposite of Tawheed in worship?",
      explanation: "Shirk means associating partners with Allah.",
      options: [
        ["Sabr", false],
        ["Shukr", false],
        ["Shirk", true],
        ["Salah", false]
      ]
    },
    {
      text: "Which book is the final revealed scripture in Islam?",
      explanation: "The Qur'an is the final revealed scripture.",
      options: [
        ["The Qur'an", true],
        ["A history book", false],
        ["A dictionary", false],
        ["A mathematics book", false]
      ]
    }
  ];

  for (let index = 0; index < questions.length; index++) {
    const item = questions[index];

    const question = await prisma.question.create({
      data: {
        text: item.text,
        explanation: item.explanation,
        difficulty: Difficulty.EASY,
        subjectId: aqeedahSubjectId,
        topicId: topicOne.id,
        classId: primaryOne.id,

        options: {
          create: item.options.map(([text, isCorrect]) => ({
            text: String(text),
            isCorrect: Boolean(isCorrect)
          }))
        }
      },

      include: {
        options: true
      }
    });

    await prisma.testQuestion.create({
      data: {
        testId: test.id,
        questionId: question.id,
        orderNumber: index + 1
      }
    });
  }

  // ─────────────────────────────────────────────
  // ENROLL DEMO STUDENT
  // ─────────────────────────────────────────────

  const studentProfile = await prisma.studentProfile.findUnique({
    where: {
      userId: student.id
    }
  });

  if (!studentProfile) {
    throw new Error("Student profile was not created.");
  }

  await prisma.courseEnrollment.upsert({
    where: {
      studentId_courseId: {
        studentId: studentProfile.id,
        courseId: course.id
      }
    },
    update: {},
    create: {
      studentId: studentProfile.id,
      courseId: course.id
    }
  });

  // ─────────────────────────────────────────────
  // SAMPLE NOTIFICATION
  // ─────────────────────────────────────────────

  await prisma.notification.create({
    data: {
      userId: student.id,
      type: "GENERAL",
      title: "Welcome to MAKNAZUL IRFAN",
      message:
        "Welcome to the MAKNAZUL IRFAN Online Islamic & Arabic Institute LMS."
    }
  });

  // ─────────────────────────────────────────────
  // SUMMARY
  // ─────────────────────────────────────────────

  console.log("");
  console.log("==============================================");
  console.log("MAKNAZUL IRFAN LMS SEED COMPLETED");
  console.log("==============================================");
  console.log("");
  console.log("Development accounts:");
  console.log("");
  console.log("ADMIN");
  console.log("Email: admin@maknazulirfan.org");
  console.log("Password: ChangeMe_Admin_2026!");
  console.log("");
  console.log("TEACHER");
  console.log("Email: teacher@maknazulirfan.org");
  console.log("Password: ChangeMe_Teacher_2026!");
  console.log("");
  console.log("STUDENT");
  console.log("Email: student@maknazulirfan.org");
  console.log("Password: ChangeMe_Student_2026!");
  console.log("");
  console.log("These are DEVELOPMENT credentials only.");
  console.log("Change them before production deployment.");
  console.log("");
  console.log(`Admin ID: ${admin.id}`);
  console.log(`Teacher ID: ${teacher.id}`);
  console.log(`Student ID: ${student.id}`);
  console.log(`Course: ${course.title}`);
  console.log(`Test: ${test.title}`);
  console.log("");
}

main()
  .catch((error) => {
    console.error("Database seed failed:");
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });