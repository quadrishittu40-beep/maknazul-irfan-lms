import { z } from "zod";

const providerSchema = z.enum([
  "ZOOM",
  "GOOGLE_MEET",
  "JITSI"
]);

const liveClassBaseSchema = z.object({
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

  subjectId: z
    .string()
    .min(1)
    .optional(),

  teacherId: z
    .string()
    .min(1)
    .optional(),

  provider: providerSchema,

  meetingUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("")),

  recordingUrl: z
    .string()
    .url()
    .optional()
    .or(z.literal("")),

  scheduledStart: z
    .string()
    .datetime(),

  scheduledEnd: z
    .string()
    .datetime(),

  published: z
    .boolean()
    .default(true)
});

export const createLiveClassSchema =
  liveClassBaseSchema.superRefine((data, ctx) => {
    const start = new Date(data.scheduledStart);
    const end = new Date(data.scheduledEnd);

    if (end <= start) {
      ctx.addIssue({
        code: "custom",
        path: ["scheduledEnd"],
        message:
          "End time must be after start time."
      });
    }

    if (data.provider !== "JITSI" && !data.meetingUrl) {
      ctx.addIssue({
        code: "custom",
        path: ["meetingUrl"],
        message:
          "Please paste the meeting link."
      });
    }
  });

export const updateLiveClassSchema =
  liveClassBaseSchema
    .partial()
    .extend({ published: z.boolean().optional() })
    .superRefine(
    (data, ctx) => {
      if (
        data.scheduledStart &&
        data.scheduledEnd
      ) {
        const start =
          new Date(data.scheduledStart);

        const end =
          new Date(data.scheduledEnd);

        if (end <= start) {
          ctx.addIssue({
            code: "custom",
            path: ["scheduledEnd"],
            message:
              "End time must be after start time."
          });
        }
      }
    }
  );