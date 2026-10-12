import { z } from "zod";

export const initializePaymentSchema = z.object({
  courseId: z.string().min(1),
  callbackUrl: z.string().url().optional()
});

export const verifyPaymentSchema = z.object({
  reference: z.string().min(1)
});

export const listPaymentsQuerySchema = z.object({
  status: z
    .enum([
      "PENDING",
      "PAID",
      "FAILED",
      "REFUNDED",
      "CANCELLED"
    ])
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20)
});