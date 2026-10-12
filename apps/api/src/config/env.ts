import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  
  PORT: z.coerce.number().int().positive().default(6700),
  
  APP_URL: z.string().url().default("http://localhost:6700"),
  
  DATABASE_URL: z.string().min(1),
  
  AUTH_SECRET: z.string().min(32),
  
  COOKIE_NAME: z.string().default("maknazul_session"),
  
  SESSION_DAYS: z.coerce.number().int().positive().default(7)
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration:");
  console.error(parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;