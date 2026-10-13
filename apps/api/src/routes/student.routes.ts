import { Router } from "express";
import {
  getMyProfile,
  updateMyProfile
} from "../controllers/student.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const router = Router();

router.use(
  requireAuth,
  requireRole("STUDENT")
);

router.get(
  "/me",
  getMyProfile
);

router.patch(
  "/me",
  updateMyProfile
);

export default router;
