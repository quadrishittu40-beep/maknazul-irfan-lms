import { Router } from "express";

import {
  listStudents,
  getStudent,
  approveStudent,
  rejectStudent,
  updateStudentStatus,
  activateUser,
  deactivateUser,
  academicOverview
} from "../controllers/admin.controller";

import { listStaff, createStaff } from "../controllers/staff.controller";
import { listCourses } from "../controllers/academic.controller";
import { listTests } from "../controllers/exam.controller";
import { listAllPayments } from "../controllers/payment.controller";
import { listLiveClasses } from "../controllers/live-class.controller";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const router = Router();

router.use(requireAuth);

router.use(
  requireRole("ADMIN")
);

/*
 * Student administration
 */

router.get(
  "/students",
  listStudents
);

router.get(
  "/students/:id",
  getStudent
);

router.post(
  "/students/:id/approve",
  approveStudent
);

router.post(
  "/students/:id/reject",
  rejectStudent
);

router.patch(
  "/students/:id/status",
  updateStudentStatus
);

/*
 * Staff accounts (teachers and admins)
 */

router.get("/staff", listStaff);

router.post("/staff", createStaff);

/*
 * User account administration
 */

router.patch(
  "/users/:id/activate",
  activateUser
);

router.patch(
  "/users/:id/deactivate",
  deactivateUser
);

/*
 * Dashboard data (the admin page reads these)
 */

router.get("/academic", academicOverview);

router.get("/courses", listCourses);

router.get("/exams", listTests);

router.get("/payments", listAllPayments);

router.get("/live-classes", listLiveClasses);

export default router;