import crypto from "crypto";

import { prisma } from "../config/prisma";
import { env } from "../config/env";

type PaystackInitializeResponse = {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
};

type PaystackVerifyResponse = {
  status: boolean;
  message: string;
  data?: {
    status: string;
    reference: string;
    amount: number;
    currency: string;
    customer?: {
      email?: string;
    };
    metadata?: Record<string, unknown>;
  };
};

function getPaystackSecretKey(): string {
  const key = process.env.PAYSTACK_SECRET_KEY;

  if (!key) {
    throw new Error(
      "PAYSTACK_SECRET_KEY is not configured."
    );
  }

  return key;
}

function generateReference(): string {
  return `MIA-${Date.now()}-${crypto
    .randomBytes(5)
    .toString("hex")
    .toUpperCase()}`;
}

async function paystackRequest<T>(
  endpoint: string,
  options: RequestInit
): Promise<T> {
  const response = await fetch(
    `https://api.paystack.co${endpoint}`,
    {
      ...options,
      headers: {
        Authorization: `Bearer ${getPaystackSecretKey()}`,
        "Content-Type": "application/json",
        ...(options.headers || {})
      }
    }
  );

  const data = await response.json();

  if (!response.ok) {
    throw new Error(
      data?.message ||
        "Paystack request failed."
    );
  }

  return data as T;
}

export async function initializeCoursePayment(
  userId: string,
  courseId: string,
  callbackUrl?: string
) {
  const student =
    await prisma.studentProfile.findUnique({
      where: {
        userId
      },
      include: {
        user: true
      }
    });

  if (!student) {
    throw new Error(
      "Student profile not found."
    );
  }

  if (
    student.status !== "APPROVED" &&
    student.status !== "ENROLLED"
  ) {
    throw new Error(
      "Your student account is not approved for enrollment."
    );
  }

  const course =
    await prisma.course.findUnique({
      where: {
        id: courseId
      }
    });

  if (!course) {
    throw new Error("Course not found.");
  }

  if (course.status !== "PUBLISHED") {
    throw new Error(
      "This course is not currently available."
    );
  }

  /*
   * The current LMS treats a course with a null
   * price as free.
   */
  const amount =
    Number((course as any).price ?? 0);

  if (amount <= 0) {
    throw new Error(
      "This course does not require payment."
    );
  }

  const existingEnrollment =
    await prisma.courseEnrollment.findUnique({
      where: {
        studentId_courseId: {
          studentId: student.id,
          courseId
        }
      }
    });

  if (existingEnrollment) {
    throw new Error(
      "You are already enrolled in this course."
    );
  }

  const existingPayment =
    await prisma.payment.findFirst({
      where: {
        studentId: student.id,
        courseId,
        status: "PAID"
      }
    });

  if (existingPayment) {
    throw new Error(
      "This course has already been paid for."
    );
  }

  const reference =
    generateReference();

  /*
   * Paystack amounts are expressed in
   * the smallest currency unit.
   *
   * For Nigerian Naira:
   * ₦5,000 = 500000 kobo.
   */
  const amountInKobo =
    Math.round(amount * 100);

  const payment =
    await prisma.payment.create({
      data: {
        studentId: student.id,
        courseId,
        amount,
        currency: "NGN",
        status: "PENDING",
        provider: "PAYSTACK",
        reference
      } as any
    });

  try {
    const result =
      await paystackRequest<PaystackInitializeResponse>(
        "/transaction/initialize",
        {
          method: "POST",
          body: JSON.stringify({
            email: student.user.email,
            amount: amountInKobo,
            currency: "NGN",
            reference,
            callback_url:
              callbackUrl ||
              `${env.APP_URL}/payments.html`,
            metadata: {
              paymentId: payment.id,
              studentId: student.id,
              courseId
            }
          })
        }
      );

    if (
      !result.status ||
      !result.data
    ) {
      throw new Error(
        result.message ||
          "Unable to initialize payment."
      );
    }

    return {
      payment,
      authorizationUrl:
        result.data.authorization_url,
      accessCode:
        result.data.access_code,
      reference:
        result.data.reference
    };
  } catch (error) {
    await prisma.payment.update({
      where: {
        id: payment.id
      },
      data: {
        status: "FAILED"
      } as any
    });

    throw error;
  }
}

export async function verifyCoursePayment(
  userId: string,
  reference: string
) {
  const student =
    await prisma.studentProfile.findUnique({
      where: {
        userId
      }
    });

  if (!student) {
    throw new Error(
      "Student profile not found."
    );
  }

  const payment =
    await prisma.payment.findFirst({
      where: {
        reference,
        studentId: student.id
      },
      include: {
        course: true
      }
    });

  if (!payment) {
    throw new Error(
      "Payment record not found."
    );
  }

  const result =
    await paystackRequest<PaystackVerifyResponse>(
      `/transaction/verify/${encodeURIComponent(
        reference
      )}`,
      {
        method: "GET"
      }
    );

  if (
    !result.status ||
    !result.data
  ) {
    throw new Error(
      result.message ||
        "Unable to verify payment."
    );
  }

  const transaction =
    result.data;

  const expectedAmount =
    Math.round(
      Number((payment as any).amount) * 100
    );

  if (
    transaction.reference !==
    payment.reference
  ) {
    throw new Error(
      "Payment reference mismatch."
    );
  }

  if (
    transaction.currency !==
    payment.currency
  ) {
    throw new Error(
      "Payment currency mismatch."
    );
  }

  if (
    transaction.amount !==
    expectedAmount
  ) {
    throw new Error(
      "Payment amount mismatch."
    );
  }

  if (
    transaction.status !==
    "success"
  ) {
    await prisma.payment.update({
      where: {
        id: payment.id
      },
      data: {
        status: "FAILED"
      } as any
    });

    throw new Error(
      "Payment was not successful."
    );
  }

  const updatedPayment =
    await prisma.$transaction(
      async (tx) => {
        const updated =
          await tx.payment.update({
            where: {
              id: payment.id
            },
            data: {
              status: "PAID"
            } as any
          });

        await tx.courseEnrollment.upsert({
          where: {
            studentId_courseId: {
              studentId:
                student.id,
              courseId:
                payment.courseId
            }
          },
          create: {
            studentId:
              student.id,
            courseId:
              payment.courseId
          },
          update: {}
        });

        if (
          student.status ===
          "APPROVED"
        ) {
          await tx.studentProfile.update({
            where: {
              id: student.id
            },
            data: {
              status: "ENROLLED"
            }
          });
        }

        await tx.notification.create({
          data: {
            userId,
            type: "SYSTEM",
            title:
              "Payment Successful",
            message:
              `Your payment for "${payment.course.title}" was successful. You are now enrolled in the course.`
          } as any
        });

        return updated;
      }
    );

  return {
    payment:
      updatedPayment,
    course:
      payment.course,
    enrollment:
      true
  };
}

export async function verifyPaystackWebhook(
  rawBody: string,
  signature: string
): Promise<boolean> {
  const secret =
    getPaystackSecretKey();

  const expectedSignature =
    crypto
      .createHmac(
        "sha512",
        secret
      )
      .update(rawBody)
      .digest("hex");

  return crypto.timingSafeEqual(
    Buffer.from(
      expectedSignature
    ),
    Buffer.from(signature)
  );
}

export async function processPaystackWebhook(
  payload: any
) {
  if (
    payload?.event !==
    "charge.success"
  ) {
    return {
      processed: false
    };
  }

  const reference =
    payload?.data?.reference;

  if (!reference) {
    throw new Error(
      "Webhook payment reference is missing."
    );
  }

  const payment =
    await prisma.payment.findUnique({
      where: {
        reference
      },
      include: {
        course: true,
        student: true
      }
    });

  if (!payment) {
    throw new Error(
      "Payment record not found."
    );
  }

  if (
    payment.status ===
    "PAID"
  ) {
    return {
      processed: true,
      alreadyProcessed: true
    };
  }

  const expectedAmount =
    Math.round(
      Number((payment as any).amount) * 100
    );

  if (
    payload.data.amount !==
    expectedAmount ||
    payload.data.currency !==
    payment.currency
  ) {
    throw new Error(
      "Webhook payment amount or currency mismatch."
    );
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.payment.update({
        where: {
          id: payment.id
        },
        data: {
          status: "PAID"
        } as any
      });

      await tx.courseEnrollment.upsert({
        where: {
          studentId_courseId: {
            studentId:
              payment.studentId,
            courseId:
              payment.courseId
          }
        },
        create: {
          studentId:
            payment.studentId,
          courseId:
            payment.courseId
        },
        update: {}
      });

      if (
        payment.student.status ===
        "APPROVED"
      ) {
        await tx.studentProfile.update({
          where: {
            id:
              payment.studentId
          },
          data: {
            status:
              "ENROLLED"
          }
        });
      }

      await tx.notification.create({
        data: {
          userId:
            payment.student.userId,
          type: "SYSTEM",
          title:
            "Payment Successful",
          message:
            `Your payment for "${payment.course.title}" was successful. You are now enrolled in the course.`
        } as any
      });
    }
  );

  return {
    processed: true
  };
}