import { z } from "zod";

/*
|--------------------------------------------------------------------------
| Question
|--------------------------------------------------------------------------
*/

export const createQuestionSchema = z.object({
  text: z
    .string()
    .trim()
    .min(2)
    .max(10000),

  imageUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("")),

  audioUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("")),

  explanation: z
    .string()
    .trim()
    .max(5000)
    .optional(),

  difficulty: z
    .enum([
      "EASY",
      "MEDIUM",
      "HARD"
    ])
    .default("MEDIUM"),

  subjectId: z
    .string()
    .min(1)
    .optional(),

  topicId: z
    .string()
    .min(1)
    .optional(),

  classId: z
    .string()
    .min(1)
    .optional(),

  options: z
    .array(
      z.object({
        text: z
          .string()
          .trim()
          .min(1)
          .max(2000),

        isCorrect: z.boolean()
      })
    )
    .min(2)
    .max(10)
}).superRefine((data, ctx) => {
  const correctAnswers =
    data.options.filter(
      option => option.isCorrect
    );

  if (correctAnswers.length !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["options"],
      message:
        "An MCQ question must have exactly one correct option."
    });
  }
});

export const updateQuestionSchema = z.object({
  text: z
    .string()
    .trim()
    .min(2)
    .max(10000)
    .optional(),

  imageUrl: z
    .string()
    .url()
    .nullable()
    .optional()
    .or(z.literal("")),

  audioUrl: z
    .string()
    .url()
    .nullable()
    .optional()
    .or(z.literal("")),

  explanation: z
    .string()
    .trim()
    .max(5000)
    .nullable()
    .optional(),

  difficulty: z
    .enum([
      "EASY",
      "MEDIUM",
      "HARD"
    ])
    .optional(),

  subjectId: z
    .string()
    .min(1)
    .nullable()
    .optional(),

  topicId: z
    .string()
    .min(1)
    .nullable()
    .optional(),

  classId: z
    .string()
    .min(1)
    .nullable()
    .optional(),

  options: z
    .array(
      z.object({
        id: z
          .string()
          .min(1)
          .optional(),

        text: z
          .string()
          .trim()
          .min(1)
          .max(2000),

        isCorrect: z.boolean()
      })
    )
    .min(2)
    .max(10)
    .optional()
}).superRefine((data, ctx) => {
  if (!data.options) {
    return;
  }

  const correctAnswers =
    data.options.filter(
      option => option.isCorrect
    );

  if (correctAnswers.length !== 1) {
    ctx.addIssue({
      code: "custom",
      path: ["options"],
      message:
        "An MCQ question must have exactly one correct option."
    });
  }
});

/*
|--------------------------------------------------------------------------
| Test
|--------------------------------------------------------------------------
*/

export const createTestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2)
    .max(200),

  description: z
    .string()
    .trim()
    .max(5000)
    .optional(),

  courseId: z
    .string()
    .min(1),

  topicId: z
    .string()
    .min(1)
    .optional(),

  durationMinutes: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(1440),

  numberOfQuestions: z
    .coerce
    .number()
    .int()
    .min(1)
    .optional(),

  passMark: z
    .coerce
    .number()
    .min(0)
    .max(100),

  maxAttempts: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .default(1),

  randomQuestions: z
    .boolean()
    .default(false),

  randomOptions: z
    .boolean()
    .default(false),

  isPublished: z
    .boolean()
    .default(false),

  availableFrom: z
    .coerce
    .date()
    .optional(),

  availableUntil: z
    .coerce
    .date()
    .optional()
});

export const updateTestSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .optional(),

  description: z
    .string()
    .trim()
    .max(5000)
    .nullable()
    .optional(),

  topicId: z
    .string()
    .min(1)
    .nullable()
    .optional(),

  durationMinutes: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(1440)
    .optional(),

  numberOfQuestions: z
    .coerce
    .number()
    .int()
    .min(1)
    .nullable()
    .optional(),

  passMark: z
    .coerce
    .number()
    .min(0)
    .max(100)
    .optional(),

  maxAttempts: z
    .coerce
    .number()
    .int()
    .min(1)
    .max(20)
    .optional(),

  randomQuestions: z
    .boolean()
    .optional(),

  randomOptions: z
    .boolean()
    .optional(),

  isPublished: z
    .boolean()
    .optional(),

  availableFrom: z
    .coerce
    .date()
    .nullable()
    .optional(),

  availableUntil: z
    .coerce
    .date()
    .nullable()
    .optional()
});

/*
|--------------------------------------------------------------------------
| Add question to test
|--------------------------------------------------------------------------
*/

export const addTestQuestionSchema =
  z.object({
    questionId: z
      .string()
      .min(1),

    orderNumber: z
      .coerce
      .number()
      .int()
      .min(0)
      .default(0)
  });

/*
|--------------------------------------------------------------------------
| Submit attempt
|--------------------------------------------------------------------------
*/

export const submitAttemptSchema =
  z.object({
    answers: z.array(
      z.object({
        questionId: z
          .string()
          .min(1),

        optionId: z
          .string()
          .nullable()
          .optional(),

        selectedOptionId: z
          .string()
          .nullable()
          .optional()
      })
    )
  });