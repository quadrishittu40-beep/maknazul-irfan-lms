import { Router } from "express";

import {
  listQuestions,
  createQuestion,
  updateQuestion,
  
  listTests,
  getTest,
  createTest,
  updateTest,
  
  addQuestionToTest,
  
  startAttempt,
  submitAttempt,
  
  myResults,
  getResult
} from "../controllers/exam.controller";

import {
  requireAuth
} from "../middleware/auth";

import {
  requireRole
} from "../middleware/role";

const router = Router();

router.use(requireAuth);

/*
|--------------------------------------------------------------------------
| Question Bank
|--------------------------------------------------------------------------
*/

router.get(
  "/questions",
  requireRole("ADMIN", "TEACHER"),
  listQuestions
);

router.post(
  "/questions",
  requireRole("ADMIN", "TEACHER"),
  createQuestion
);

router.patch(
  "/questions/:id",
  requireRole("ADMIN", "TEACHER"),
  updateQuestion
);

/*
|--------------------------------------------------------------------------
| Tests
|--------------------------------------------------------------------------
*/

router.get(
  "/tests",
  listTests
);

router.get(
  "/tests/:id",
  getTest
);

router.post(
  "/tests",
  requireRole("ADMIN", "TEACHER"),
  createTest
);

router.patch(
  "/tests/:id",
  requireRole("ADMIN", "TEACHER"),
  updateTest
);

/*
|--------------------------------------------------------------------------
| Test Questions
|--------------------------------------------------------------------------
*/

router.post(
  "/tests/:testId/questions",
  requireRole("ADMIN", "TEACHER"),
  addQuestionToTest
);

/*
|--------------------------------------------------------------------------
| Student Attempts
|--------------------------------------------------------------------------
*/

router.post(
  "/tests/:testId/start",
  requireRole("STUDENT"),
  startAttempt
);

router.post(
  "/attempts/:attemptId/submit",
  requireRole("STUDENT"),
  submitAttempt
);

/*
|--------------------------------------------------------------------------
| Results
|--------------------------------------------------------------------------
*/

router.get(
  "/results/me",
  requireRole("STUDENT"),
  myResults
);

router.get(
  "/results/:attemptId",
  getResult
);

export default router;