import { z } from "zod";

export const createLevelSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500).optional()
});

export const updateLevelSchema = createLevelSchema.partial();

export const createClassSchema = z.object({
  name: z.string().trim().min(1).max(100),
  levelId: z.string().min(1)
});

export const updateClassSchema = createClassSchema.partial();

export const createSubjectSchema = z.object({
  name: z.string().trim().min(2).max(150),
  description: z.string().trim().max(500).optional(),
  isActive: z.boolean().optional()
});

export const updateSubjectSchema =
  createSubjectSchema.partial();

export const createCourseSchema = z.object({
  title: z.string().trim().min(3).max(200),
  
  description: z
    .string()
    .trim()
    .max(5000)
    .optional(),
  
  thumbnail: z
    .string()
    .url()
    .optional(),
  
  levelId: z
    .string()
    .min(1)
    .optional(),
  
  classId: z
    .string()
    .min(1)
    .optional(),
  
  subjectId: z
    .string()
    .min(1),
  
  teacherId: z
    .string()
    .min(1),
  
  isFree: z
    .boolean()
    .default(true),
  
  price: z
    .number()
    .nonnegative()
    .optional(),
  
  currency: z
    .string()
    .trim()
    .length(3)
    .default("NGN"),
  
  startDate: z
    .string()
    .datetime()
    .optional(),
  
  endDate: z
    .string()
    .datetime()
    .optional(),
  
  status: z
    .enum([
      "DRAFT",
      "PUBLISHED",
      "ARCHIVED"
    ])
    .default("DRAFT")
});

export const updateCourseSchema =
  createCourseSchema.partial();

export const createTopicSchema = z.object({
  title: z.string().trim().min(2).max(200),
  
  description: z
    .string()
    .trim()
    .max(2000)
    .optional(),
  
  subjectId: z.string().min(1),
  
  courseId: z.string().min(1).optional()
});

export const updateTopicSchema =
  createTopicSchema.partial();