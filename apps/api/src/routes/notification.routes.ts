import { Router } from "express";

import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from "../controllers/notification.controller";

import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get(
  "/",
  listMyNotifications
);

router.patch(
  "/:id/read",
  markNotificationRead
);

router.patch(
  "/read-all",
  markAllNotificationsRead
);

export default router;