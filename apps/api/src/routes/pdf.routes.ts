import { Router } from "express";

import {
  certificatePdf,
  profilePdf,
  resultsPdf
} from "../controllers/pdf.controller";

import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/certificate/:id", certificatePdf);
router.get("/profile", profilePdf);
router.get("/results", resultsPdf);

export default router;
