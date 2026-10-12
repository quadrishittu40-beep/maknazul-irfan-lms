import { Router } from "express";

import {
  listMyCertificates,
  getMyCertificate,
  listAllCertificates,
  issueCertificate
} from "../controllers/certificate.controller";

import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const router = Router();

/* =========================================================
   STUDENT CERTIFICATES
========================================================= */

router.get(
  "/my",
  requireAuth,
  requireRole("STUDENT"),
  listMyCertificates
);

router.get(
  "/my/:id",
  requireAuth,
  requireRole("STUDENT"),
  getMyCertificate
);

/* =========================================================
   ADMIN CERTIFICATES
========================================================= */

router.get(
  "/admin/all",
  requireAuth,
  requireRole("ADMIN"),
  listAllCertificates
);

router.post(
  "/admin",
  requireAuth,
  requireRole("ADMIN"),
  issueCertificate
);

export default router;