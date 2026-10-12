import { Router } from "express";

import {
  initializePayment,
  verifyPayment,
  myPayments,
  getMyPayment,
  listAllPayments,
  paystackWebhook
} from "../controllers/payment.controller";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const router = Router();

/*
 * Paystack webhook
 *
 * This route is intentionally outside requireAuth.
 * Paystack itself calls this endpoint.
 *
 * The controller verifies the Paystack HMAC signature
 * before processing the event.
 */
router.post(
  "/webhook/paystack",
  paystackWebhook
);

/*
 * All remaining payment routes require
 * an authenticated LMS user.
 */
router.use(requireAuth);

/*
 * Student payment routes
 */
router.post(
  "/initialize",
  requireRole("STUDENT"),
  initializePayment
);

router.get(
  "/verify/:reference",
  requireRole("STUDENT"),
  verifyPayment
);

router.get(
  "/my",
  requireRole("STUDENT"),
  myPayments
);

router.get(
  "/my/:id",
  requireRole("STUDENT"),
  getMyPayment
);

/*
 * Administrator payment management
 */
router.get(
  "/admin/all",
  requireRole("ADMIN"),
  listAllPayments
);

export default router;