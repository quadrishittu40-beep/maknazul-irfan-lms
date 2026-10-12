import { Router } from "express";

import {
  listLevels,
  createLevel,
  updateLevel,
  
  listClasses,
  createClass,
  updateClass,
  
  listSubjects,
  createSubject,
  updateSubject,
  
  listCourses,
  getCourse,
  createCourse,
  updateCourse,
  
  listTopics,
  createTopic,
  updateTopic
} from "../controllers/academic.controller";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const router = Router();

/*
 * Public/read endpoints
 *
 * These can later be restricted further depending
 * on whether the course is published.
 */

router.get(
  "/levels",
  listLevels
);

router.get(
  "/classes",
  listClasses
);

router.get(
  "/subjects",
  listSubjects
);

router.get(
  "/courses",
  listCourses
);

router.get(
  "/courses/:id",
  getCourse
);

router.get(
  "/topics",
  listTopics
);

/*
 * Administrative write endpoints
 */

router.use(requireAuth);

router.use(
  requireRole("ADMIN")
);

router.post(
  "/levels",
  createLevel
);

router.patch(
  "/levels/:id",
  updateLevel
);

router.post(
  "/classes",
  createClass
);

router.patch(
  "/classes/:id",
  updateClass
);

router.post(
  "/subjects",
  createSubject
);

router.patch(
  "/subjects/:id",
  updateSubject
);

router.post(
  "/courses",
  createCourse
);

router.patch(
  "/courses/:id",
  updateCourse
);

router.post(
  "/topics",
  createTopic
);

router.patch(
  "/topics/:id",
  updateTopic
);


export default router;
