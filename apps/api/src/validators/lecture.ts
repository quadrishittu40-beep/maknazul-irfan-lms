import { z } from "zod";

const materialTypeSchema = z.enum([
  "VIDEO",
  "AUDIO",
  "IMAGE",
  "PDF",
  "DOCUMENT",
  "PRESENTATION",
  "OTHER"
]);

export const createLectureSchema = z.object({
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
  
  orderNumber: z
    .coerce
    .number()
    .int()
    .min(0)
    .default(0)
});

export const updateLectureSchema = z.object({
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
  
  orderNumber: z
    .coerce
    .number()
    .int()
    .min(0)
    .optional()
});

export const createMaterialSchema = z.object({
  lectureId: z
    .string()
    .min(1),
  
  type: materialTypeSchema,
  
  title: z
    .string()
    .trim()
    .min(2)
    .max(200),
  
  storageKey: z
    .string()
    .trim()
    .min(1)
    .max(1000),
  
  originalName: z
    .string()
    .trim()
    .max(255)
    .optional(),
  
  mimeType: z
    .string()
    .trim()
    .max(150)
    .optional(),
  
  fileSize: z
    .coerce
    .number()
    .int()
    .nonnegative()
    .optional()
});

export const updateMaterialSchema = z.object({
  title: z
    .string()
    .trim()
    .min(2)
    .max(200)
    .optional(),
  
  type: materialTypeSchema.optional(),
  
  storageKey: z
    .string()
    .trim()
    .min(1)
    .max(1000)
    .optional(),
  
  originalName: z
    .string()
    .trim()
    .max(255)
    .nullable()
    .optional(),
  
  mimeType: z
    .string()
    .trim()
    .max(150)
    .nullable()
    .optional(),
  
  fileSize: z
    .coerce
    .number()
    .int()
    .nonnegative()
    .nullable()
    .optional()
});

export const videoProgressSchema = z.object({
  videoProgress: z
    .coerce
    .number()
    .int()
    .min(0)
    .max(100)
});

export const completeLectureSchema = z.object({
  completed: z
    .boolean()
    .default(true)
});