import { Router } from "express";
import { z } from "zod";
import { success, failure } from "../utils/http";
import {
  initializeRegistrationPayment,
  verifyRegistrationPayment,
  ADMISSION_FEE_AMOUNT
} from "../services/payment.service";

const router = Router();

/* Public: details shown on the registration page. */
router.get("/info", (_req, res) =>
  success(res, {
    amount: ADMISSION_FEE_AMOUNT,
    bank: {
      bankName: process.env.BANK_NAME || "",
      accountName: process.env.BANK_ACCOUNT_NAME || "",
      accountNumber: process.env.BANK_ACCOUNT_NUMBER || ""
    }
  })
);

router.post("/pay", async (req, res) => {
  const parsed = z.object({ email: z.string().trim().email().max(150) }).safeParse(req.body);
  if (!parsed.success) return failure(res, "Enter a valid email address first.", 422);
  try {
    return success(res, await initializeRegistrationPayment(parsed.data.email));
  } catch (e) {
    return failure(res, e instanceof Error ? e.message : "Unable to start the payment.", 400);
  }
});

router.get("/verify/:reference", async (req, res) => {
  try {
    const rp = await verifyRegistrationPayment(req.params.reference);
    return success(res, { paid: true, email: rp.email, used: Boolean(rp.usedByStudentId) });
  } catch (e) {
    return failure(res, e instanceof Error ? e.message : "Unable to verify the payment.", 400);
  }
});

export default router;
