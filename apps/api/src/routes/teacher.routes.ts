import { Router } from "express";

import {
  listTeacherCourses,
  createTeacherCourse,
  updateTeacherCourse,
  getTeacherCourse,
  addLectureMaterial,
  deleteLectureMaterial,
  searchStudents,
  enrollStudent,
  unenrollStudent
} from "../controllers/teacher.controller";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const router = Router();

router.use(requireAuth);
router.use(requireRole("TEACHER", "ADMIN"));

router.get("/courses", listTeacherCourses);
router.post("/courses", createTeacherCourse);
router.get("/courses/:id", getTeacherCourse);
router.patch("/courses/:id", updateTeacherCourse);

router.get("/students", searchStudents);
router.post("/courses/:id/enroll", enrollStudent);
router.delete("/courses/:id/enroll/:studentId", unenrollStudent);
router.post("/lectures/:id/materials", addLectureMaterial);
router.delete("/materials/:id", deleteLectureMaterial);

export default router;
