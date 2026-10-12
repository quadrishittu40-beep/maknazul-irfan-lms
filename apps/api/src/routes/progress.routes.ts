import { Router } from "express";

import {
  getLectureProgress,
  startLecture,
  updateVideoProgress,
  completeLecture,
  getCourseProgress
} from "../controllers/progress.controller";

import {
  requireAuth
} from "../middleware/auth";

import {
  requireRole
} from "../middleware/role";

const router = Router();

router.use(requireAuth);
router.use(requireRole("STUDENT"));

router.get(
  "/lecture/:lectureId",
  getLectureProgress
);

router.post(
  "/lecture/:lectureId/start",
  startLecture
);

router.patch(
  "/lecture/:lectureId/video",
  updateVideoProgress
);

router.post(
  "/lecture/:lectureId/complete",
  completeLecture
);

router.get(
  "/course/:courseId",
  getCourseProgress
);

export default router;