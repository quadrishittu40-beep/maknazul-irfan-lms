import { Router } from "express";

import {
  listLiveClasses,
  getLiveClass,
  createLiveClass,
  updateLiveClass,
  deleteLiveClass
} from "../controllers/live-class.controller";

import {
  markAttendance,
  getAttendance
} from "../controllers/live-attendance.controller";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  listLiveClasses
);

router.post("/:id/attend", markAttendance);

router.get(
  "/:id/attendance",
  requireRole("ADMIN", "TEACHER"),
  getAttendance
);

router.get(
  "/:id",
  getLiveClass
);

router.post(
  "/",
  requireRole("ADMIN", "TEACHER"),
  createLiveClass
);

router.patch(
  "/:id",
  requireRole("ADMIN", "TEACHER"),
  updateLiveClass
);

router.delete(
  "/:id",
  requireRole("ADMIN", "TEACHER"),
  deleteLiveClass
);

export default router;