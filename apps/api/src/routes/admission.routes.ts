import express, { Router } from "express";
import {
  myAdmission,
  payWithCard,
  verifyCard,
  startBank,
  uploadAdmissionProof,
  admissionProof,
  listAdmissionFees,
  approveAdmissionFee,
  rejectAdmissionFee,
  recordAdmissionFee
} from "../controllers/admission.controller";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const router = Router();
router.use(requireAuth);

router.get("/me", requireRole("STUDENT"), myAdmission);
router.post("/card", requireRole("STUDENT"), payWithCard);
router.get("/verify/:reference", requireRole("STUDENT"), verifyCard);
router.post("/bank", requireRole("STUDENT"), startBank);
router.post("/bank/proof", requireRole("STUDENT"), express.raw({ type: () => true, limit: "6mb" }), uploadAdmissionProof);
router.get("/proof/:id", requireRole("STUDENT", "ADMIN"), admissionProof);

router.get("/admin", requireRole("ADMIN"), listAdmissionFees);
router.post("/admin/record", requireRole("ADMIN"), recordAdmissionFee);
router.post("/admin/:id/approve", requireRole("ADMIN"), approveAdmissionFee);
router.post("/admin/:id/reject", requireRole("ADMIN"), rejectAdmissionFee);

export default router;
