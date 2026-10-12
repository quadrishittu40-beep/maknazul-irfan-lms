import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";

import { prisma } from "../config/prisma";
import { AuthenticatedRequest } from "../middleware/auth";
import { success, failure } from "../utils/http";
import {
  createQuestionSchema,
  updateQuestionSchema,
  createTestSchema,
  updateTestSchema,
  addTestQuestionSchema,
  submitAttemptSchema
} from "../validators/exam";
import {
  buildAttemptQuestions,
  markAttempt
} from "../services/exam.service";
import { getStudentProfileId } from "../services/access.service";
import { calculateGrade } from "../services/grading.service";
import { audit } from "../services/audit.service";

/* =========================================================
   HELPERS
========================================================= */

function getUserId(req: Request): string | null {
  return (req as AuthenticatedRequest).user?.id ?? null;
}

function isStaffRole(role: string): boolean {
  return role === "ADMIN" || role === "TEACHER";
}

async function teacherOwnsTest(
  userId: string,
  testId: string
): Promise<boolean> {
  const test = await prisma.test.findUnique({
    where: { id: testId },
    select: {
      course: {
        select: {
          teacherId: true
        }
      }
    }
  });

  return test?.course?.teacherId === userId;
}

async function teacherOwnsCourse(
  userId: string,
  courseId: string
): Promise<boolean> {
  const course = await prisma.course.findFirst({
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

async function studentHasTestAccess(
  userId: string,
  testId: string
): Promise<boolean> {
  const studentId = await getStudentProfileId(userId);

  if (!studentId) {
    return false;
  }

  const test = await prisma.test.findUnique({
    where: { id: testId },
    select: {
      courseId: true
    }
  });

  if (!test) {
    return false;
  }

  const student = await prisma.studentProfile.findUnique({
    where: {
      id: studentId
    },
    select: {
      status: true
    }
  });

  if (
    !student ||
    (student.status !== "ENROLLED" &&
      student.status !== "GRADUATED")
  ) {
    return false;
  }

  const enrollment =
    await prisma.courseEnrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId,
          courseId: test.courseId
        }
      },
      select: {
        id: true
      }
    });

  return Boolean(enrollment);
}

/* =========================================================
   QUESTION BANK
========================================================= */

export async function listQuestions(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(res, "Authentication required.", 401);
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        role: true
      }
    });

    if (!user || !isStaffRole(user.role)) {
      return failure(res, "Access denied.", 403);
    }

    const questions = await prisma.question.findMany({
      orderBy: {
        createdAt: "desc"
      },
      include: {
        options: {
          select: {
            id: true,
            text: true,
            isCorrect: true
          },
          orderBy: {
            id: "asc"
          }
        },
        subject: true,
        topic: true,
        level: true,
        class: true
      }
    });

    return success(res, questions);
  } catch (error) {
    next(error);
  }
}

export async function createQuestion(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(res, "Authentication required.", 401);
    }

    const parsed = createQuestionSchema.safeParse(
      req.body
    );

    if (!parsed.success) {
      return failure(
        res,
        "Invalid question data.",
        400
      );
    }

    const data = parsed.data;

    const question = await prisma.question.create({
      data: {
        text: data.text,
        imageUrl: data.imageUrl,
        audioUrl: data.audioUrl,
        explanation: data.explanation,
        difficulty: data.difficulty,
        subjectId: data.subjectId,
        topicId: data.topicId,
        levelId: data.levelId,
        classId: data.classId,
        options: {
          create: data.options.map((option) => ({
            text: option.text,
            isCorrect: option.isCorrect
          }))
        }
      },
      include: {
        options: true
      }
    });

    await audit({
      userId,
      action: "CREATE_QUESTION",
      entity: "Question",
      entityId: question.id,
      metadata: {
        questionId: question.id
      }
    });

    return success(
      res,
      question,
      201
    );
  } catch (error) {
    next(error);
  }
}

export async function updateQuestion(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(res, "Authentication required.", 401);
    }

    const questionId = req.params.id;

    const parsed =
      updateQuestionSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid question data.",
        400
      );
    }

    const existing =
      await prisma.question.findUnique({
        where: {
          id: questionId
        },
        include: {
          options: true
        }
      });

    if (!existing) {
      return failure(
        res,
        "Question not found.",
        404
      );
    }

    const data = parsed.data;

    const updated = await prisma.$transaction(
      async (tx) => {
        const question =
          await tx.question.update({
            where: {
              id: questionId
            },
            data: {
              text: data.text,
              imageUrl: data.imageUrl,
              audioUrl: data.audioUrl,
              explanation: data.explanation,
              difficulty: data.difficulty,
              subjectId: data.subjectId,
              topicId: data.topicId,
              levelId: data.levelId,
              classId: data.classId
            }
          });

        if (data.options) {
          await tx.questionOption.deleteMany({
            where: {
              questionId
            }
          });

          await tx.questionOption.createMany({
            data: data.options.map((option) => ({
              questionId,
              text: option.text,
              isCorrect: option.isCorrect
            }))
          });
        }

        return tx.question.findUnique({
          where: {
            id: question.id
          },
          include: {
            options: true
          }
        });
      }
    );

    await audit({
      userId,
      action: "UPDATE_QUESTION",
      entity: "Question",
      entityId: questionId,
      metadata: {
        questionId
      }
    });

    return success(
      res,
      updated
    );
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   TEST MANAGEMENT
========================================================= */

export async function listTests(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(res, "Authentication required.", 401);
    }

    const user = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        role: true
      }
    });

    if (!user) {
      return failure(res, "User not found.", 404);
    }

    let tests;

    if (isStaffRole(user.role)) {
      tests = await prisma.test.findMany({
        orderBy: {
          createdAt: "desc"
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              teacherId: true
            }
          },
          subject: true,
          topic: true,
          _count: {
            select: {
              questions: true,
              attempts: true
            }
          }
        }
      });
    } else {
      const studentId =
        await getStudentProfileId(userId);

      if (!studentId) {
        return failure(
          res,
          "Student profile not found.",
          404
        );
      }

      tests = await prisma.test.findMany({
        where: {
          published: true,
          course: {
            enrollments: {
              some: {
                studentId
              }
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        },
        select: {
          id: true,
          title: true,
          description: true,
          durationMinutes: true,
          numberOfQuestions: true,
          passMark: true,
          maxAttempts: true,
          randomQuestions: true,
          randomOptions: true,
          published: true,
          availableFrom: true,
          availableUntil: true,
          courseId: true,
          subjectId: true,
          topicId: true,
          createdAt: true,
          course: {
            select: {
              id: true,
              title: true
            }
          },
          subject: true,
          topic: true,
          _count: {
            select: {
              questions: true
            }
          }
        }
      });
    }

    return success(res, tests);
  } catch (error) {
    next(error);
  }
}

export async function getTest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(res, "Authentication required.", 401);
    }

    const testId = req.params.id;

    const user = await prisma.user.findUnique({
      where: {
        id: userId
      },
      select: {
        role: true
      }
    });

    if (!user) {
      return failure(res, "User not found.", 404);
    }

    const test =
      await prisma.test.findUnique({
        where: {
          id: testId
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              teacherId: true
            }
          },
          subject: true,
          topic: true,
          questions: {
            orderBy: {
              order: "asc"
            },
            include: {
              question: {
                include: {
                  options: {
                    select: {
                      id: true,
                      text: true
                    }
                  }
                }
              }
            }
          }
        }
      });

    if (!test) {
      return failure(
        res,
        "Test not found.",
        404
      );
    }

    if (user.role === "STUDENT") {
      if (!test.published) {
        return failure(
          res,
          "This test is not available.",
          403
        );
      }

      const access =
        await studentHasTestAccess(
          userId,
          testId
        );

      if (!access) {
        return failure(
          res,
          "You are not enrolled in this course.",
          403
        );
      }

      /*
       * Never return correct answers or explanations
       * to students before submission.
       */
      const studentSafeTest = {
        id: test.id,
        title: test.title,
        description: test.description,
        durationMinutes:
          test.durationMinutes,
        numberOfQuestions:
          test.numberOfQuestions,
        passMark: test.passMark,
        maxAttempts:
          test.maxAttempts,
        randomQuestions:
          test.randomQuestions,
        randomOptions:
          test.randomOptions,
        published: test.published,
        availableFrom:
          test.availableFrom,
        availableUntil:
          test.availableUntil,
        courseId: test.courseId,
        subjectId: test.subjectId,
        topicId: test.topicId,
        course: test.course,
        subject: test.subject,
        topic: test.topic,
        questions: test.questions.map(
          (item) => ({
            id: item.id,
            order: item.order,
            question: {
              id: item.question.id,
              text: item.question.text,
              imageUrl:
                item.question.imageUrl,
              audioUrl:
                item.question.audioUrl,
              difficulty:
                item.question.difficulty,
              options:
                item.question.options
            }
          })
        )
      };

      return success(
        res,
        studentSafeTest
      );
    }

    if (user.role === "TEACHER") {
      const owns =
        await teacherOwnsTest(
          userId,
          testId
        );

      if (!owns) {
        return failure(
          res,
          "You do not own this test.",
          403
        );
      }
    }

    return success(
      res,
      test
    );
  } catch (error) {
    next(error);
  }
}

export async function createTest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const parsed =
      createTestSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid test data.",
        400
      );
    }

    const data = parsed.data;

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          role: true
        }
      });

    if (!user) {
      return failure(
        res,
        "User not found.",
        404
      );
    }

    if (
      user.role === "TEACHER" &&
      !(await teacherOwnsCourse(
        userId,
        data.courseId
      ))
    ) {
      return failure(
        res,
        "You do not own this course.",
        403
      );
    }

    const test =
      await prisma.test.create({
        data: {
          title: data.title,
          description: data.description,
          courseId: data.courseId,
          subjectId: data.subjectId,
          topicId: data.topicId,
          durationMinutes:
            data.durationMinutes,
          numberOfQuestions:
            data.numberOfQuestions,
          passMark: data.passMark,
          maxAttempts:
            data.maxAttempts,
          randomQuestions:
            data.randomQuestions,
          randomOptions:
            data.randomOptions,
          published:
            data.published ?? false,
          availableFrom:
            data.availableFrom
              ? new Date(data.availableFrom)
              : null,
          availableUntil:
            data.availableUntil
              ? new Date(data.availableUntil)
              : null
        }
      });

    await audit({
      userId,
      action: "CREATE_TEST",
      entity: "Test",
      entityId: test.id,
      metadata: {
        title: test.title
      }
    });

    return success(
      res,
      test,
      201
    );
  } catch (error) {
    next(error);
  }
}

export async function updateTest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const testId = req.params.id;

    const parsed =
      updateTestSchema.safeParse(req.body);

    if (!parsed.success) {
      return failure(
        res,
        "Invalid test data.",
        400
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          role: true
        }
      });

    if (!user) {
      return failure(
        res,
        "User not found.",
        404
      );
    }

    if (user.role === "TEACHER") {
      const owns =
        await teacherOwnsTest(
          userId,
          testId
        );

      if (!owns) {
        return failure(
          res,
          "You do not own this test.",
          403
        );
      }
    }

    const data = parsed.data;

    const test =
      await prisma.test.update({
        where: {
          id: testId
        },
        data: {
          title: data.title,
          description: data.description,
          subjectId: data.subjectId,
          topicId: data.topicId,
          durationMinutes:
            data.durationMinutes,
          numberOfQuestions:
            data.numberOfQuestions,
          passMark: data.passMark,
          maxAttempts:
            data.maxAttempts,
          randomQuestions:
            data.randomQuestions,
          randomOptions:
            data.randomOptions,
          published:
            data.published,
          availableFrom:
            data.availableFrom !== undefined
              ? data.availableFrom
                ? new Date(data.availableFrom)
                : null
              : undefined,
          availableUntil:
            data.availableUntil !== undefined
              ? data.availableUntil
                ? new Date(data.availableUntil)
                : null
              : undefined
        }
      });

    await audit({
      userId,
      action: "UPDATE_TEST",
      entity: "Test",
      entityId: testId,
      metadata: {
        testId
      }
    });

    return success(
      res,
      test
    );
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   TEST QUESTION ASSIGNMENT
========================================================= */

export async function addQuestionToTest(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const testId = req.params.testId;

    const parsed =
      addTestQuestionSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return failure(
        res,
        "Invalid test question data.",
        400
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          role: true
        }
      });

    if (!user) {
      return failure(
        res,
        "User not found.",
        404
      );
    }

    if (user.role === "TEACHER") {
      const owns =
        await teacherOwnsTest(
          userId,
          testId
        );

      if (!owns) {
        return failure(
          res,
          "You do not own this test.",
          403
        );
      }
    }

    const question =
      await prisma.question.findUnique({
        where: {
          id: parsed.data.questionId
        },
        select: {
          id: true
        }
      });

    if (!question) {
      return failure(
        res,
        "Question not found.",
        404
      );
    }

    const test =
      await prisma.test.findUnique({
        where: {
          id: testId
        },
        select: {
          id: true
        }
      });

    if (!test) {
      return failure(
        res,
        "Test not found.",
        404
      );
    }

    const existing =
      await prisma.testQuestion.findFirst({
        where: {
          testId,
          questionId:
            parsed.data.questionId
        }
      });

    if (existing) {
      return failure(
        res,
        "Question is already assigned to this test.",
        409
      );
    }

    const testQuestion =
      await prisma.testQuestion.create({
        data: {
          testId,
          questionId:
            parsed.data.questionId,
          order:
            parsed.data.order
        }
      });

    await audit({
      userId,
      action: "ADD_TEST_QUESTION",
      entity: "TestQuestion",
      entityId: testQuestion.id,
      metadata: {
        testId,
        questionId:
          parsed.data.questionId
      }
    });

    return success(
      res,
      testQuestion,
      201
    );
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   START EXAM ATTEMPT
========================================================= */

export async function startAttempt(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const testId = req.params.testId;

    const access =
      await studentHasTestAccess(
        userId,
        testId
      );

    if (!access) {
      return failure(
        res,
        "You do not have access to this test.",
        403
      );
    }

    const test =
      await prisma.test.findUnique({
        where: {
          id: testId
        },
        include: {
          questions: {
            include: {
              question: {
                include: {
                  options: true
                }
              }
            },
            orderBy: {
              order: "asc"
            }
          }
        }
      });

    if (!test) {
      return failure(
        res,
        "Test not found.",
        404
      );
    }

    if (!test.published) {
      return failure(
        res,
        "This test is not published.",
        403
      );
    }

    const now = new Date();

    if (
      test.availableFrom &&
      now < test.availableFrom
    ) {
      return failure(
        res,
        "This test is not yet available.",
        403
      );
    }

    if (
      test.availableUntil &&
      now > test.availableUntil
    ) {
      return failure(
        res,
        "This test is no longer available.",
        403
      );
    }

    const previousAttempts =
      await prisma.testAttempt.findMany({
        where: {
          testId,
          studentId: userId
        },
        select: {
          id: true,
          status: true,
          startedAt: true,
          submittedAt: true
        }
      });

    if (
      test.maxAttempts !== null &&
      previousAttempts.length >=
        test.maxAttempts
    ) {
      return failure(
        res,
        "Maximum number of attempts reached.",
        403
      );
    }

    const activeAttempt =
      previousAttempts.find(
        (attempt) =>
          attempt.status === "IN_PROGRESS"
      );

    if (activeAttempt) {
      const expiresAt =
        new Date(
          activeAttempt.startedAt.getTime() +
            test.durationMinutes *
              60 *
              1000
        );

      if (now < expiresAt) {
        return success(res, {
          attemptId:
            activeAttempt.id,
          startedAt:
            activeAttempt.startedAt,
          expiresAt
        });
      }

      await prisma.testAttempt.update({
        where: {
          id: activeAttempt.id
        },
        data: {
          status: "SUBMITTED",
          submittedAt: now
        }
      });
    }

    const selectedQuestions =
      buildAttemptQuestions(
        test.questions,
        test.numberOfQuestions,
        test.randomQuestions,
        test.randomOptions
      );

    if (
      selectedQuestions.length === 0
    ) {
      return failure(
        res,
        "This test has no questions.",
        400
      );
    }

    const attempt =
      await prisma.testAttempt.create({
        data: {
          testId,
          studentId: userId,
          status: "IN_PROGRESS",
          startedAt: now,
          totalQuestions:
            selectedQuestions.length
        }
      });

    /*
     * The current schema does not yet persist the
     * exact selected question order per attempt.
     *
     * Therefore the response contains the selected
     * questions for this attempt. Before production,
     * attempt-question persistence should be added
     * to the Prisma schema.
     */

    const expiresAt =
      new Date(
        now.getTime() +
          test.durationMinutes *
            60 *
            1000
      );

    return success(
      res,
      {
        attemptId: attempt.id,
        testId,
        startedAt: now,
        expiresAt,
        durationMinutes:
          test.durationMinutes,
        questions:
          selectedQuestions.map(
            (item: any) => ({
              id: item.question.id,
              text: item.question.text,
              imageUrl:
                item.question.imageUrl,
              audioUrl:
                item.question.audioUrl,
              options:
                item.question.options.map(
                  (option: any) => ({
                    id: option.id,
                    text: option.text
                  })
                )
            })
          )
      },
      201
    );
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   SUBMIT EXAM
========================================================= */

export async function submitAttempt(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const attemptId =
      req.params.attemptId;

    const parsed =
      submitAttemptSchema.safeParse(
        req.body
      );

    if (!parsed.success) {
      return failure(
        res,
        "Invalid submission data.",
        400
      );
    }

    const attempt =
      await prisma.testAttempt.findUnique({
        where: {
          id: attemptId
        },
        include: {
          test: {
            include: {
              questions: {
                include: {
                  question: {
                    include: {
                      options: true
                    }
                  }
                },
                orderBy: {
                  order: "asc"
                }
              }
            }
          },
          answers: true
        }
      });

    if (!attempt) {
      return failure(
        res,
        "Exam attempt not found.",
        404
      );
    }

    if (
      attempt.studentId !== userId
    ) {
      return failure(
        res,
        "You are not allowed to submit this attempt.",
        403
      );
    }

    if (
      attempt.status === "SUBMITTED"
    ) {
      return failure(
        res,
        "This attempt has already been submitted.",
        409
      );
    }

    if (
      attempt.status !== "IN_PROGRESS"
    ) {
      return failure(
        res,
        "This attempt cannot be submitted.",
        409
      );
    }

    const now = new Date();

    const expiresAt =
      new Date(
        attempt.startedAt.getTime() +
          attempt.test.durationMinutes *
            60 *
            1000
      );

    if (now > expiresAt) {
      await prisma.testAttempt.update({
        where: {
          id: attemptId
        },
        data: {
          status: "SUBMITTED",
          submittedAt: now
        }
      });

      return failure(
        res,
        "The examination time has expired.",
        400
      );
    }

    const studentProfileId =
      await getStudentProfileId(
        userId
      );

    if (!studentProfileId) {
      return failure(
        res,
        "Student profile not found.",
        404
      );
    }

    const testQuestionIds =
      new Set(
        attempt.test.questions.map(
          (item) => item.questionId
        )
      );

    const uniqueAnswers = new Map<
      string,
      string
    >();

    for (
      const answer of parsed.data.answers
    ) {
      if (
        testQuestionIds.has(
          answer.questionId
        )
      ) {
        uniqueAnswers.set(
          answer.questionId,
          answer.optionId
        );
      }
    }

    const answerRows =
      Array.from(
        uniqueAnswers.entries()
      ).map(
        ([
          questionId,
          optionId
        ]) => ({
          attemptId,
          questionId,
          optionId,
          studentId:
            studentProfileId
        })
      );

    await prisma.$transaction(
      async (tx) => {
        if (
          answerRows.length > 0
        ) {
          for (
            const answer of answerRows
          ) {
            await tx.studentAnswer.upsert(
              {
                where: {
                  attemptId_questionId: {
                    attemptId:
                      answer.attemptId,
                    questionId:
                      answer.questionId
                  }
                },
                create: answer,
                update: {
                  optionId:
                    answer.optionId
                }
              }
            );
          }
        }
      }
    );

    const refreshedAttempt =
      await prisma.testAttempt.findUnique(
        {
          where: {
            id: attemptId
          },
          include: {
            test: {
              include: {
                questions: {
                  include: {
                    question: {
                      include: {
                        options: true
                      }
                    }
                  },
                  orderBy: {
                    order: "asc"
                  }
                }
              }
            },
            answers: true
          }
        }
      );

    if (!refreshedAttempt) {
      return failure(
        res,
        "Unable to process examination.",
        500
      );
    }

    /*
     * Marking is performed server-side.
     */
    const result =
      await markAttempt(
        refreshedAttempt
      );

    const updatedAttempt =
      await prisma.testAttempt.update({
        where: {
          id: attemptId
        },
        data: {
          status: "SUBMITTED",
          submittedAt: now,
          correctAnswers:
            result.correctAnswers,
          score:
            result.score,
          percentage:
            result.percentage,
          grade:
            result.grade,
          passed:
            result.passed,
          totalQuestions:
            refreshedAttempt.test
              .questions.length
        }
      });

    await audit({
      userId,
      action: "SUBMIT_TEST_ATTEMPT",
      entity: "TestAttempt",
      entityId: attemptId,
      metadata: {
        testId:
          attempt.testId,
        score:
          result.score,
        percentage:
          result.percentage,
        grade:
          result.grade,
        passed:
          result.passed
      }
    });

    return success(
      res,
      {
        attemptId:
          updatedAttempt.id,
        testId:
          updatedAttempt.testId,
        totalQuestions:
          updatedAttempt.totalQuestions,
        correctAnswers:
          updatedAttempt.correctAnswers,
        score:
          updatedAttempt.score,
        percentage:
          updatedAttempt.percentage,
        grade:
          updatedAttempt.grade,
        passed:
          updatedAttempt.passed,
        submittedAt:
          updatedAttempt.submittedAt
      }
    );
  } catch (error) {
    next(error);
  }
}

/* =========================================================
   STUDENT RESULTS
========================================================= */

export async function myResults(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const results =
      await prisma.testAttempt.findMany({
        where: {
          studentId: userId,
          status: "SUBMITTED"
        },
        orderBy: {
          submittedAt: "desc"
        },
        select: {
          id: true,
          testId: true,
          startedAt: true,
          submittedAt: true,
          totalQuestions: true,
          correctAnswers: true,
          score: true,
          percentage: true,
          grade: true,
          passed: true,
          test: {
            select: {
              id: true,
              title: true,
              course: {
                select: {
                  id: true,
                  title: true
                }
              }
            }
          }
        }
      });

    return success(
      res,
      results
    );
  } catch (error) {
    next(error);
  }
}

export async function getResult(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return failure(
        res,
        "Authentication required.",
        401
      );
    }

    const attemptId =
      req.params.attemptId;

    const attempt =
      await prisma.testAttempt.findUnique({
        where: {
          id: attemptId
        },
        include: {
          test: {
            include: {
              course: {
                select: {
                  id: true,
                  title: true,
                  teacherId: true
                }
              }
            }
          },
          answers: {
            include: {
              question: {
                select: {
                  id: true,
                  text: true,
                  explanation: true
                }
              },
              option: {
                select: {
                  id: true,
                  text: true,
                  isCorrect: true
                }
              }
            }
          }
        }
      });

    if (!attempt) {
      return failure(
        res,
        "Result not found.",
        404
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId
        },
        select: {
          role: true
        }
      });

    if (!user) {
      return failure(
        res,
        "User not found.",
        404
      );
    }

    /*
     * Students can see only their own result.
     */
    if (
      user.role === "STUDENT" &&
      attempt.studentId !== userId
    ) {
      return failure(
        res,
        "Access denied.",
        403
      );
    }

    /*
     * Teachers can see results only for
     * tests belonging to their own courses.
     */
    if (user.role === "TEACHER") {
      if (
        attempt.test.course.teacherId !==
        userId
      ) {
        return failure(
          res,
          "You do not have access to this result.",
          403
        );
      }
    }

    /*
     * Only submitted attempts are valid results.
     */
    if (
      attempt.status !== "SUBMITTED"
    ) {
      return failure(
        res,
        "This examination has not been submitted.",
        400
      );
    }

    const result = {
      id: attempt.id,
      testId: attempt.testId,
      test: {
        id: attempt.test.id,
        title: attempt.test.title,
        course:
          attempt.test.course
      },
      startedAt:
        attempt.startedAt,
      submittedAt:
        attempt.submittedAt,
      totalQuestions:
        attempt.totalQuestions,
      correctAnswers:
        attempt.correctAnswers,
      score:
        attempt.score,
      percentage:
        attempt.percentage,
      grade:
        attempt.grade,
      passed:
        attempt.passed,
      answers:
        attempt.answers.map(
          (answer) => ({
            questionId:
              answer.questionId,
            question:
              answer.question,
            selectedOption:
              answer.option
          })
        )
    };

    return success(
      res,
      result
    );
  } catch (error) {
    next(error);
  }
}