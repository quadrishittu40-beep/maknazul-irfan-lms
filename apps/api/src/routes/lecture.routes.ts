import { Router } from "express";

import {
  listLectures,
  getLecture,
  createLecture,
  updateLecture,
  createMaterial,
  updateMaterial,
  getMaterialUrl
} from "../controllers/lecture.controller";

import {
  requireAuth
} from "../middleware/auth";

import {
  requireRole
} from "../middleware/role";

const router = Router();

/*
|--------------------------------------------------------------------------
| Student / Teacher / Admin reading
|--------------------------------------------------------------------------
*/

router.use(requireAuth);

router.get(
  "/course/:courseId",
  listLectures
);

router.get(
  "/:id",
  getLecture
);

router.get(
  "/materials/:id/url",
  getMaterialUrl
);

/*
|--------------------------------------------------------------------------
| Lecture management
|--------------------------------------------------------------------------
*/

router.post(
  "/",
  requireRole("ADMIN", "TEACHER"),
  createLecture
);

router.patch(
  "/:id",
  requireRole("ADMIN", "TEACHER"),
  updateLecture
);

/*
|--------------------------------------------------------------------------
| Material management
|--------------------------------------------------------------------------
*/

router.post(
  "/materials",
  requireRole("ADMIN", "TEACHER"),
  createMaterial
);

router.patch(
  "/materials/:id",
  requireRole("ADMIN", "TEACHER"),
  updateMaterial
);

export default router;