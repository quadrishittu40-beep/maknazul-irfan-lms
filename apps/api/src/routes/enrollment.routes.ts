import { Router } from "express";

import {
  enrollInCourse,
  listMyCourses,
  checkCourseAccess
} from "../controllers/enrollment.controller";

import {
  requireAuth
} from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get(
  "/my-courses",
  listMyCourses
);

router.get(
  "/:courseId/access",
  checkCourseAccess
);

router.post(
  "/:courseId",
  enrollInCourse
);

export default router;