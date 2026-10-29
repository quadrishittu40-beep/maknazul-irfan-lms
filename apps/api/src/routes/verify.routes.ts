import { Router } from "express";

import { prisma } from "../config/prisma";

const router = Router();

/* Public: confirm that a certificate number is genuine. */
router.get("/certificate/:number", async (req, res) => {
  try {
    const number = String(req.params.number || "").trim();
    if (!number) {
      return res.status(400).json({ success: false, valid: false, message: "Certificate number required." });
    }

    const cert = await prisma.certificate.findUnique({
      where: { certificateNumber: number },
      include: {
        course: { select: { title: true } },
        student: {
          select: { user: { select: { firstName: true, lastName: true } } }
        }
      }
    });

    if (!cert) {
      return res.status(404).json({
        success: false,
        valid: false,
        message: "No certificate with this number was found."
      });
    }

    return res.json({
      success: true,
      valid: true,
      certificate: {
        certificateNumber: cert.certificateNumber,
        studentName: `${cert.student.user.firstName} ${cert.student.user.lastName}`,
        course: cert.course?.title || null,
        grade: cert.grade,
        score: cert.score !== null && cert.score !== undefined ? Number(cert.score) : null,
        issuedAt: cert.issuedAt,
        completionDate: cert.completionDate
      }
    });
  } catch (error) {
    console.error("verify error:", error);
    return res.status(500).json({ success: false, valid: false, message: "Unable to verify right now." });
  }
});

export default router;
