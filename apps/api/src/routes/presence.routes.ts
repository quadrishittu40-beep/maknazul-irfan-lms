import { Router } from "express";
import { prisma } from "../config/prisma";
import { success, failure } from "../utils/http";
import { requireAuth } from "../middleware/auth";
import { requireRole } from "../middleware/role";

const router = Router();
router.use(requireAuth);

const ONLINE_WINDOW_MS = 3 * 60 * 1000;

/* Last time each user was seen (kept in memory; resets when the server restarts) */
const lastSeen = new Map<string, number>();

function prune() {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [id, t] of lastSeen) if (t < cutoff) lastSeen.delete(id);
}

/* Every open page calls this about once a minute while a user is signed in */
router.post("/ping", (req: any, res) => {
  lastSeen.set(String(req.user.id), Date.now());
  if (lastSeen.size > 2000) prune();
  return success(res, { role: req.user.role });
});

/* Students who are online now: all students for the admin, own students for a teacher */
router.get("/online", requireRole("ADMIN", "TEACHER"), async (req: any, res) => {
  try {
    const since = Date.now() - ONLINE_WINDOW_MS;
    const ids = [...lastSeen.entries()].filter(([, t]) => t >= since).map(([id]) => id);
    if (!ids.length) return success(res, { count: 0, students: [] });

    const users = await prisma.user.findMany({
      where: {
        id: { in: ids },
        role: "STUDENT",
        ...(req.user.role === "TEACHER"
          ? { studentProfile: { enrollments: { some: { course: { teacherId: req.user.id } } } } }
          : {})
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        studentProfile: {
          select: { level: { select: { name: true } }, class: { select: { name: true } } }
        }
      }
    });
    return success(res, {
      count: users.length,
      students: users.map((u) => ({
        id: u.id,
        name: `${u.firstName} ${u.lastName}`.trim(),
        level: u.studentProfile?.level?.name || null,
        class: u.studentProfile?.class?.name || null
      }))
    });
  } catch (error) {
    console.error("presence online error:", error);
    return failure(res, "Unable to load online students.", 500);
  }
});

export default router;
