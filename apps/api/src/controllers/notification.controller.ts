import { Request, Response } from "express";
import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";

function getUserId(req: Request): string | null {
  const user = (req as any).user;
  return user?.id ?? null;
}

/* =========================================================
   LIST MY NOTIFICATIONS
========================================================= */

export async function listMyNotifications(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    
    if (!userId) {
      return failure(res, "Authentication required", 401);
    }
    
    const limit = Math.min(
      Math.max(Number(req.query.limit) || 50, 1),
      100
    );
    
    const unreadOnly =
      req.query.unread === "true";
    
    const type =
      typeof req.query.type === "string" ?
      req.query.type :
      undefined;
    
    const notifications =
      await prisma.notification.findMany({
        where: {
          userId,
          ...(unreadOnly ?
            {
              readAt: null
            } :
            {}),
          ...(type ?
            {
              type: type as any
            } :
            {})
        },
        orderBy: {
          createdAt: "desc"
        },
        take: limit
      });
    
    const unreadCount =
      await prisma.notification.count({
        where: {
          userId,
          readAt: null
        }
      });
    
    return success(res, {
      notifications,
      unreadCount
    });
  } catch (error) {
    console.error(
      "listMyNotifications error:",
      error
    );
    
    return failure(
      res,
      "Unable to load notifications",
      500
    );
  }
}

/* =========================================================
   MARK ONE NOTIFICATION AS READ
========================================================= */

export async function markNotificationRead(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    
    if (!userId) {
      return failure(res, "Authentication required", 401);
    }
    
    const { id } = req.params;
    
    const notification =
      await prisma.notification.findFirst({
        where: {
          id,
          userId
        }
      });
    
    if (!notification) {
      return failure(
        res,
        "Notification not found",
        404
      );
    }
    
    const updated =
      await prisma.notification.update({
        where: {
          id: notification.id
        },
        data: {
          readAt: notification.readAt ?? new Date()
        }
      });
    
    return success(res, {
      notification: updated
    });
  } catch (error) {
    console.error(
      "markNotificationRead error:",
      error
    );
    
    return failure(
      res,
      "Unable to update notification",
      500
    );
  }
}

/* =========================================================
   MARK ALL NOTIFICATIONS AS READ
========================================================= */

export async function markAllNotificationsRead(
  req: Request,
  res: Response
) {
  try {
    const userId = getUserId(req);
    
    if (!userId) {
      return failure(res, "Authentication required", 401);
    }
    
    const result =
      await prisma.notification.updateMany({
        where: {
          userId,
          readAt: null
        },
        data: {
          readAt: new Date()
        }
      });
    
    return success(res, {
      updated: result.count
    });
  } catch (error) {
    console.error(
      "markAllNotificationsRead error:",
      error
    );
    
    return failure(
      res,
      "Unable to update notifications",
      500
    );
  }
}