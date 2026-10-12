import { z } from "zod";

export const registerSchema = z.object({
  firstName: z
    .string()
    .trim()
    .min(2)
    .max(50),
  
  lastName: z
    .string()
    .trim()
    .min(2)
    .max(50),
  
  email: z
    .string()
    .trim()
    .email()
    .max(150),
  
  password: z
    .string()
    .min(8)
    .max(128),
  
  phone: z
    .string()
    .trim()
    .max(30)
    .optional(),
  
  dateOfBirth: z
    .string()
    .optional(),
  
  gender: z
    .string()
    .trim()
    .max(30)
    .optional(),
  
  guardianName: z
    .string()
    .trim()
    .max(100)
    .optional(),
  
  guardianPhone: z
    .string()
    .trim()
    .max(30)
    .optional(),
  
  levelId: z
    .string()
    .optional(),
  
  classId: z
    .string()
    .optional()
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email(),
  
  password: z
    .string()
    .min(1)
    .max(128)
});