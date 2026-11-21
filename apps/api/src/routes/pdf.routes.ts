import { Router } from "express";

import {
  certificatePdf,
  profilePdf,
  resultsPdf,
  reportCardPdf,
  courseResultSheetPdf,
  performanceSummaryPdf,
  admissionLetterPdf,
  schemePdf,
  calendarPdf,
  examDocketPdf,
  receiptPdf,
  admissionReceiptPdf,
  idCardPdf,
  idCardJson
} from "../controllers/pdf.controller";

import { requireAuth } from "../middleware/auth";

const router = Router();

router.use(requireAuth);

router.get("/certificate/:id", certificatePdf);
router.get("/profile", profilePdf);
router.get("/results", resultsPdf);
router.get("/reportcard", reportCardPdf);
router.get("/course-results/:courseId", courseResultSheetPdf);
router.get("/performance", performanceSummaryPdf);
router.get("/admission-letter", admissionLetterPdf);
router.get("/scheme/:courseId", schemePdf);
router.get("/calendar", calendarPdf);
router.get("/exam-docket", examDocketPdf);
router.get("/receipt/admission/:id", admissionReceiptPdf);
router.get("/receipt/:id", requireAuth, receiptPdf);
router.get("/idcard", idCardPdf);
router.get("/idcard-data", idCardJson);

export default router;
