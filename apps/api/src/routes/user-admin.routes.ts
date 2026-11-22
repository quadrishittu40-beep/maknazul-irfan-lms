import { Router } from "express";
import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";
import { audit } from "../services/audit.service";

const router = Router();
router.use(requireAuth);
router.use(requireRole("ADMIN"));

/* List accounts (students, teachers, parents, admins) */
router.get("/users", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const role = String(req.query.role || "").toUpperCase();
    const users = await prisma.user.findMany({
      where: {
        ...(["STUDENT", "TEACHER", "PARENT", "ADMIN"].includes(role) ? { role: role as any } : {}),
        ...(q
          ? {
              OR: [
                { email: { contains: q, mode: "insensitive" } },
                { firstName: { contains: q, mode: "insensitive" } },
                { lastName: { contains: q, mode: "insensitive" } }
              ]
            }
          : {})
      },
      orderBy: { createdAt: "desc" },
      take: 200,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        studentProfile: { select: { matricNumber: true, status: true } }
      }
    });
    return success(res, {
      users: users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        email: u.email,
        role: u.role,
        active: u.isActive,
        matric: u.studentProfile?.matricNumber || null,
        status: u.studentProfile?.status || null,
        createdAt: u.createdAt
      }))
    });
  } catch (error) {
    console.error("manage users list error:", error);
    return failure(res, "Unable to load accounts.", 500);
  }
});

/* Permanently delete a student, teacher, parent or admin account */
router.delete("/users/:id", async (req: any, res) => {
  const id = String(req.params.id);
  try {
    if (id === req.user.id) return failure(res, "You cannot delete your own account.", 400);
    const target = await prisma.user.findUnique({
      where: { id },
      select: { id: true, role: true, email: true, firstName: true, lastName: true }
    });
    if (!target) return failure(res, "Account not found.", 404);

    if (target.role === "ADMIN") {
      const admins = await prisma.user.count({ where: { role: "ADMIN", isActive: true } });
      if (admins <= 1) return failure(res, "You cannot delete the last administrator.", 400);
    }

    await prisma.$transaction([
      // Tests and live classes created by a teacher are kept and handed to the admin doing the deletion.
      prisma.test.updateMany({ where: { createdById: id }, data: { createdById: req.user.id } }),
      prisma.liveClass.updateMany({ where: { teacherId: id }, data: { teacherId: req.user.id } }),
      prisma.course.updateMany({ where: { teacherId: id }, data: { teacherId: null } }),
      prisma.user.delete({ where: { id } })
    ]);

    try {
      await audit({
        userId: req.user.id,
        action: "DELETE_USER",
        entity: "User",
        entityId: id,
        metadata: { email: target.email, role: target.role }
      } as any);
    } catch {
      /* audit is best-effort */
    }
    return success(res, {
      message: `${target.firstName} ${target.lastName} (${target.role.toLowerCase()}) was deleted.`
    });
  } catch (error) {
    console.error("manage delete user error:", error);
    return failure(
      res,
      "This account could not be deleted because other records depend on it. Deactivate it instead, or contact support.",
      409
    );
  }
});

export default router;
