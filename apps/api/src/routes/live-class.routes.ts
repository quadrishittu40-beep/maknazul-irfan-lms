import { Router } from "express";

import {
  listLiveClasses,
  getLiveClass,
  createLiveClass,
  updateLiveClass,
  deleteLiveClass
} from "../controllers/live-class.controller";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  listLiveClasses
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