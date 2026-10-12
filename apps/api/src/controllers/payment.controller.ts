import type { Request, Response } from "express";

import {
  initializeCoursePayment,
  verifyCoursePayment,
  processPaystackWebhook,
  verifyPaystackWebhook
} from "../services/payment.service";

import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { audit } from "../services/audit.service";

function getUserId(req: Request): string {
  const user = (req as any).user;

  if (!user?.id) {
    throw new Error("Authenticated user not found.");
  }

  return user.id;
}

/**
 * Initialize a Paystack payment for a course.
 */
export async function initializePayment(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    const {
      courseId,
      callbackUrl
    } = req.body;

    if (!courseId) {
      return failure(
        res,
        "courseId is required.",
        400
      );
    }

    const result =
      await initializeCoursePayment(
        userId,
        courseId,
        callbackUrl
      );

    await audit({
      userId,
      action:
        "PAYMENT_INITIALIZED",
      entity:
        "Payment",
      entityId:
        result.payment.id,
      metadata: {
        courseId,
        reference:
          result.reference
      }
    });

    return success(
      res,
      {
        paymentId:
          result.payment.id,
        reference:
          result.reference,
        authorizationUrl:
          result.authorizationUrl,
        accessCode:
          result.accessCode
      },
      201
    );
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to initialize payment.",
      400
    );
  }
}

/**
 * Verify a payment after the student
 * returns from Paystack.
 */
export async function verifyPayment(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    const reference =
      String(
        req.params.reference ||
          req.body?.reference ||
          ""
      ).trim();

    if (!reference) {
      return failure(
        res,
        "Payment reference is required.",
        400
      );
    }

    const result =
      await verifyCoursePayment(
        userId,
        reference
      );

    await audit({
      userId,
      action:
        "PAYMENT_VERIFIED",
      entity:
        "Payment",
      entityId:
        result.payment.id,
      metadata: {
        reference
      }
    });

    return success(
      res,
      {
        payment:
          result.payment,
        course:
          result.course,
        enrolled:
          result.enrollment
      }
    );
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to verify payment.",
      400
    );
  }
}

/**
 * Student payment history.
 */
export async function myPayments(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    const student =
      await prisma.studentProfile.findUnique({
        where: {
          userId
        },
        select: {
          id: true
        }
      });

    if (!student) {
      return failure(
        res,
        "Student profile not found.",
        404
      );
    }

    const payments =
      await prisma.payment.findMany({
        where: {
          studentId:
            student.id
        },
        include: {
          course: {
            select: {
              id: true,
              title: true,
              description: true
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      });

    return success(
      res,
      payments
    );
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to retrieve payments.",
      500
    );
  }
}

/**
 * Get one student's payment.
 */
export async function getMyPayment(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);

    const student =
      await prisma.studentProfile.findUnique({
        where: {
          userId
        },
        select: {
          id: true
        }
      });

    if (!student) {
      return failure(
        res,
        "Student profile not found.",
        404
      );
    }

    const payment =
      await prisma.payment.findFirst({
        where: {
          id: req.params.id,
          studentId:
            student.id
        },
        include: {
          course: true
        }
      });

    if (!payment) {
      return failure(
        res,
        "Payment not found.",
        404
      );
    }

    return success(
      res,
      payment
    );
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to retrieve payment.",
      500
    );
  }
}

/**
 * Admin payment list.
 */
export async function listAllPayments(
  req: Request,
  res: Response
) {
  try {
    const page = Math.max(
      Number(req.query.page) || 1,
      1
    );

    const limit = Math.min(
      Math.max(
        Number(req.query.limit) || 20,
        1
      ),
      100
    );

    const status =
      req.query.status
        ? String(req.query.status)
        : undefined;

    const where: any = {};

    if (status) {
      where.status = status;
    }

    const [
      payments,
      total
    ] =
      await prisma.$transaction([
        prisma.payment.findMany({
          where,
          include: {
            course: {
              select: {
                id: true,
                title: true
              }
            },
            student: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    email: true
                  }
                }
              }
            }
          },
          orderBy: {
            createdAt: "desc"
          },
          skip:
            (page - 1) * limit,
          take: limit
        }),

        prisma.payment.count({
          where
        })
      ]);

    return success(
      res,
      {
        payments,
        pagination: {
          page,
          limit,
          total,
          pages:
            Math.ceil(
              total / limit
            )
        }
      }
    );
  } catch (error) {
    return failure(
      res,
      error instanceof Error
        ? error.message
        : "Unable to retrieve payments.",
      500
    );
  }
}

/**
 * Paystack webhook.
 *
 * This endpoint must receive the raw request body
 * so the HMAC-SHA512 signature can be verified.
 */
export async function paystackWebhook(
  req: Request,
  res: Response
) {
  try {
    const signature =
      String(
        req.headers[
          "x-paystack-signature"
        ] || ""
      );

    if (!signature) {
      return res
        .status(401)
        .json({
          success: false,
          message:
            "Missing Paystack signature."
        });
    }

    const rawBody =
      (req as any).rawBody;

    if (!rawBody) {
      return res
        .status(400)
        .json({
          success: false,
          message:
            "Raw webhook body is unavailable."
        });
    }

    const valid =
      await verifyPaystackWebhook(
        rawBody,
        signature
      );

    if (!valid) {
      return res
        .status(401)
        .json({
          success: false,
          message:
            "Invalid Paystack signature."
        });
    }

    const result =
      await processPaystackWebhook(
        req.body
      );

    return res
      .status(200)
      .json({
        success: true,
        ...result
      });
  } catch (error) {
    console.error(
      "Paystack webhook error:",
      error
    );

    return res
      .status(500)
      .json({
        success: false,
        message:
          "Webhook processing failed."
      });
  }
}