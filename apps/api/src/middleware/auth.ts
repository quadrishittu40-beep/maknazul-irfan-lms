import crypto from "crypto";
import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";
import { prisma } from "../config/prisma";

interface SessionPayload {
  userId: string;
  expiresAt: number;
}

function signSession(payload: SessionPayload): string {
  const encoded = Buffer.from(
    JSON.stringify(payload)
  ).toString("base64url");

  const signature = crypto
    .createHmac("sha256", env.AUTH_SECRET)
    .update(encoded)
    .digest("base64url");

  return `${encoded}.${signature}`;
}

function verifySession(token: string): SessionPayload | null {
  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [encoded, signature] = parts;

  const expectedSignature = crypto
    .createHmac("sha256", env.AUTH_SECRET)
    .update(encoded)
    .digest("base64url");

  const valid = crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );

  if (!valid) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8")
    ) as SessionPayload;

    if (payload.expiresAt < Date.now()) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

export function createSession(res: Response, userId: string) {
  const expiresAt =
    Date.now() + env.SESSION_DAYS * 24 * 60 * 60 * 1000;

  const token = signSession({
    userId,
    expiresAt
  });

  res.cookie(env.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: env.SESSION_DAYS * 24 * 60 * 60 * 1000,
    path: "/"
  });
}

export function clearSession(res: Response) {
  res.clearCookie(env.COOKIE_NAME, {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
    isActive: boolean;
  };
}

export async function requireAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  try {
    const token = req.cookies?.[env.COOKIE_NAME];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication required."
      });
    }

    const session = verifySession(token);

    if (!session) {
      clearSession(res);

      return res.status(401).json({
        success: false,
        message: "Your session is invalid or has expired."
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: session.userId
      },
      select: {
        id: true,
        email: true,
        role: true,
        firstName: true,
        lastName: true,
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      clearSession(res);

      return res.status(401).json({
        success: false,
        message: "Your account is unavailable."
      });
    }

    req.user = user;

    next();
  } catch (error) {
    next(error);
  }
}