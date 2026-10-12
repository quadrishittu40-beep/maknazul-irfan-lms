import { prisma } from "../config/prisma";

interface AuditData {
  userId?: string;
  action: string;
  entity: string;
  entityId?: string;
  metadata?: unknown;
  ipAddress?: string;
  userAgent?: string;
}

export async function createAuditLog(data: AuditData) {
  return prisma.auditLog.create({
    data: {
      userId: data.userId,
      action: data.action,
      entity: data.entity,
      entityId: data.entityId,
      metadata: data.metadata as object | undefined,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent
    }
  });
}

export const audit = createAuditLog;
