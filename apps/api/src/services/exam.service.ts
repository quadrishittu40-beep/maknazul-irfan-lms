import crypto from "crypto";

import { prisma } from "../config/prisma";
import {
  calculateGrade
} from "./grading.service";

/*
|--------------------------------------------------------------------------
| Randomize array securely
|--------------------------------------------------------------------------
*/

function secureShuffle<T>(
  items: T[]
): T[] {
  const result = [...items];

  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {
    const random =
      crypto.randomInt(i + 1);

    [
      result[i],
      result[random]
    ] = [
      result[random],
      result[i]
    ];
  }

  return result;
}

/*
|--------------------------------------------------------------------------
| Get questions for an attempt
|--------------------------------------------------------------------------
*/

export async function buildAttemptQuestions(
  testId: string
) {
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
            orderNumber: "asc"
          }
        }
      }
    });

  if (!test) {
    throw new Error(
      "Test not found."
    );
  }

  let questions =
    test.questions.map(
      item => item.question
    );

  if (test.randomQuestions) {
    questions =
      secureShuffle(questions);
  }

  if (
    test.numberOfQuestions &&
    questions.length >
      test.numberOfQuestions
  ) {
    questions =
      questions.slice(
        0,
        test.numberOfQuestions
      );
  }

  return questions.map(
    question => {
      let options =
        [...question.options];

      if (test.randomOptions) {
        options =
          secureShuffle(options);
      }

      return {
        id: question.id,
        text: question.text,
        imageUrl: question.imageUrl,
        audioUrl: question.audioUrl,
        difficulty:
          question.difficulty,
        options: options.map(
          option => ({
            id: option.id,
            text: option.text
          })
        )
      };
    }
  );
}

/*
|--------------------------------------------------------------------------
| Mark attempt
|--------------------------------------------------------------------------
*/

export async function markAttempt(
  attemptId: string
) {
  const attempt =
    await prisma.testAttempt.findUnique({
      where: {
        id: attemptId
      },
      include: {
        test: true,
        answers: {
          include: {
            question: {
              include: {
                options: true
              }
            }
          }
        }
      }
    });

  if (!attempt) {
    throw new Error(
      "Attempt not found."
    );
  }

  let correctAnswers = 0;

  for (const answer of attempt.answers) {
    const correctOption =
      answer.question.options.find(
        option =>
          option.isCorrect
      );

    const isCorrect =
      Boolean(
        correctOption &&
        answer.optionId ===
          correctOption.id
      );

    if (isCorrect) {
      correctAnswers++;
    }

    if (
      answer.isCorrect !==
      isCorrect
    ) {
      await prisma.studentAnswer.update({
        where: {
          id: answer.id
        },
        data: {
          isCorrect
        }
      });
    }
  }

  const totalQuestions =
    attempt.answers.length;

  const percentage =
    totalQuestions === 0
      ? 0
      : Number(
          (
            (correctAnswers /
              totalQuestions) *
            100
          ).toFixed(2)
        );

  const gradeResult =
    await calculateGrade(
      percentage,
      Number(attempt.test.passMark)
    );

  const updated =
    await prisma.testAttempt.update({
      where: {
        id: attemptId
      },
      data: {
        totalQuestions,
        correctAnswers,
        rawScore: correctAnswers,
        percentage,
        grade: gradeResult.grade,
        passed: gradeResult.passed,
        status: "SUBMITTED",
        submittedAt:
          new Date()
      },
      include: {
        test: {
          select: {
            id: true,
            title: true,
            passMark: true
          }
        }
      }
    });

  return updated;
}