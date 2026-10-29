import "dotenv/config";

import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
import path from "path";

import { env } from "./config/env";
import { prisma } from "./config/prisma";

import authRoutes from "./routes/auth.routes";
import adminRoutes from "./routes/admin.routes";
import academicRoutes from "./routes/academic.routes";
import enrollmentRoutes from "./routes/enrollment.routes";
import studentRoutes from "./routes/student.routes";
import lectureRoutes from "./routes/lecture.routes";
import progressRoutes from "./routes/progress.routes";
import examRoutes from "./routes/exam.routes";
import liveClassRoutes from "./routes/live-class.routes";
import paymentRoutes from "./routes/payment.routes";
import notificationRoutes from "./routes/notification.routes";
import certificateRoutes from "./routes/certificate.routes";
import teacherRoutes from "./routes/teacher.routes";
import pdfRoutes from "./routes/pdf.routes";
import avatarRoutes from "./routes/avatar.routes";
import verifyRoutes from "./routes/verify.routes";

import { notFoundHandler as notFound } from "./middleware/error";

const app = express();

app.set("trust proxy", 1);

/* =========================================================
   BASIC SECURITY
========================================================= */

app.disable("x-powered-by");

app.use(
  helmet({
    crossOriginResourcePolicy: false,
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        "script-src": ["'self'", "'unsafe-inline'"],
        "script-src-attr": ["'unsafe-inline'"]
      }
    }
  })
);

/* =========================================================
   CORS
========================================================= */

app.use(
  cors({
    origin: env.APP_URL,
    credentials: true
  })
);

/* =========================================================
   PAYSTACK WEBHOOK
   Raw body must be captured before express.json()
========================================================= */

app.use(
  "/api/payments/webhook/paystack",
  express.raw({
    type: "application/json",
    limit: "1mb"
  }),
  (req, _res, next) => {
    const rawBody = Buffer.isBuffer(req.body)
      ? req.body.toString("utf8")
      : "";

    (req as any).rawBody = rawBody;

    if (Buffer.isBuffer(req.body)) {
      try {
        req.body = JSON.parse(rawBody);
      } catch {
        req.body = {};
      }
    }

    next();
  }
);

/* =========================================================
   BODY PARSING
========================================================= */

app.use(
  express.json({
    limit: "1mb"
  })
);

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb"
  })
);

app.use(cookieParser());

/* =========================================================
   GENERAL API RATE LIMIT
========================================================= */

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1500,
  standardHeaders: true,
  legacyHeaders: true,
  message: {
    success: false,
    message: "Too many requests. Please try again later."
  }
});

app.use("/api", apiLimiter);

/* =========================================================
   HEALTH CHECK
========================================================= */

app.get("/api/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;

    res.json({
      success: true,
      message: "Maknazul Irfan LMS API is running",
      service: "maknazul-irfan-lms-api",
      database: "connected",
      environment: env.NODE_ENV
    });
  } catch (error) {
    console.error(
      "Health check database error:",
      error
    );

    res.status(503).json({
      success: false,
      message: "API is running but database is unavailable",
      service: "maknazul-irfan-lms-api",
      database: "disconnected",
      environment: env.NODE_ENV
    });
  }
});

/* =========================================================
   API ROUTES
========================================================= */

/* Authentication */
app.use(
  "/api/auth",
  authRoutes
);

/* Teacher workspace */
app.use(
  "/api/teacher",
  teacherRoutes
);

/* Administration */
app.use(
  "/api/admin",
  adminRoutes
);

/* Academic structure */
app.use(
  "/api/academic",
  academicRoutes
);

/* Student profile */
app.use(
  "/api/students",
  studentRoutes
);

/* Student enrollment */
app.use(
  "/api/enrollment",
  enrollmentRoutes
);

/* Lectures and learning materials */
app.use(
  "/api/lectures",
  lectureRoutes
);

/* Profile photos */
app.use(
  "/api/avatar",
  avatarRoutes
);

/* Public certificate verification */
app.use(
  "/api/verify",
  verifyRoutes
);

/* PDF downloads */
app.use(
  "/api/pdf",
  pdfRoutes
);

/* Student learning progress */
app.use(
  "/api/progress",
  progressRoutes
);

/* Tests and examinations */
app.use(
  "/api/exams",
  examRoutes
);

/* Live classes */
app.use(
  "/api/live-classes",
  liveClassRoutes
);

/* Payments and Paystack */
app.use(
  "/api/payments",
  paymentRoutes
);

/* Notifications */
app.use(
  "/api/notifications",
  notificationRoutes
);

/* Certificates */
app.use(
  "/api/certificates",
  certificateRoutes
);

/* =========================================================
   API INFORMATION
========================================================= */

app.get("/api", (_req, res) => {
  res.json({
    success: true,
    name: "MAKNAZUL IRFAN LMS",
    message: "Online Islamic & Arabic Institute LMS API",
    version: "1.0.0",

    endpoints: {
      health: "/api/health",
      auth: "/api/auth",
      admin: "/api/admin",
      academic: "/api/academic",
      students: "/api/students",
      enrollment: "/api/enrollment",
      lectures: "/api/lectures",
      progress: "/api/progress",
      exams: "/api/exams",
      liveClasses: "/api/live-classes",
      payments: "/api/payments",
      notifications: "/api/notifications",
      certificates: "/api/certificates"
    }
  });
});

/* =========================================================
   FRONTEND STATIC FILES
========================================================= */

const webDir = path.resolve(__dirname, "../web");

app.use(
  express.static(webDir)
);

/* =========================================================
   FRONTEND HOME PAGE
========================================================= */

app.get("/", (_req, res) => {
  res.sendFile(
    path.join(webDir, "index.html")
  );
});

/* =========================================================
   404 HANDLER
========================================================= */

app.use(notFound);

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use(
  (
    err: any,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error(
      "Unhandled API error:",
      err
    );

    const statusCode =
      typeof err?.statusCode === "number"
        ? err.statusCode
        : 500;

    res.status(statusCode).json({
      success: false,
      message:
        statusCode === 500
          ? "Internal server error"
          : err?.message || "Request failed"
    });
  }
);

/* =========================================================
   START SERVER
========================================================= */

const PORT = env.PORT || 6700;

const server = app.listen(PORT, () => {
  console.log(
    `MAKNAZUL IRFAN LMS running on port ${PORT}`
  );

  console.log(
    `Environment: ${env.NODE_ENV}`
  );

  console.log(
    `Frontend: http://localhost:${PORT}/`
  );
});

/* =========================================================
   GRACEFUL SHUTDOWN
========================================================= */

async function shutdown(signal: string) {
  console.log(
    `${signal} received. Shutting down...`
  );

  server.close(async () => {
    try {
      await prisma.$disconnect();

      console.log(
        "Database connection closed."
      );

      process.exit(0);
    } catch (error) {
      console.error(
        "Error while closing database:",
        error
      );

      process.exit(1);
    }
  });
}

process.on(
  "SIGINT",
  () => shutdown("SIGINT")
);

process.on(
  "SIGTERM",
  () => shutdown("SIGTERM")
);