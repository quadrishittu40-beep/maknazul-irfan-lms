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
      maxPercentage: 100
    },
    {
      grade: "A",
      minPercentage: 80,
      maxPercentage: 89.99
    },
    {
      grade: "B",
      minPercentage: 70,
      maxPercentage: 79.99
    },
    {
      grade: "C",
      minPercentage: 60,
      maxPercentage: 69.99
    },
    {
      grade: "D",
      minPercentage: 50,
      maxPercentage: 59.99
    },
    {
      grade: "F",
      minPercentage: 0,
      maxPercentage: 49.99
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
      bio: "Teacher at MAKNAZUL IRFAN Online Islamic & Arabic Institute."
    },
    create: {
      userId: teacher.id,
      specialization: "Arabic and Islamic Studies",
      bio: "Teacher at MAKNAZUL IRFAN Online Islamic & Arabic Institute."
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