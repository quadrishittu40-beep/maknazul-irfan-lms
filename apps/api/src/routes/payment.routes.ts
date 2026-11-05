import express, { Router } from "express";

import {
  bankInfo,
  startBankPayment,
  uploadProof,
  downloadProof,
  approveBankPayment,
  rejectBankPayment,
  recordManualPayment
} from "../controllers/bank-payment.controller";

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
 * Bank transfer
 */
router.get("/bank/info", requireRole("STUDENT"), bankInfo);
router.post("/bank/start", requireRole("STUDENT"), startBankPayment);
router.post(
  "/bank/:id/proof",
  requireRole("STUDENT"),
  express.raw({ type: () => true, limit: "6mb" }),
  uploadProof
);
router.get("/bank/:id/proof", requireRole("STUDENT", "ADMIN"), downloadProof);
router.post("/admin/record", requireRole("ADMIN"), recordManualPayment);
router.post("/admin/:id/approve", requireRole("ADMIN"), approveBankPayment);
router.post("/admin/:id/reject", requireRole("ADMIN"), rejectBankPayment);

/*
 * Administrator payment management
 */
router.get(
  "/admin/all",
  requireRole("ADMIN"),
  listAllPayments
);

export default router;