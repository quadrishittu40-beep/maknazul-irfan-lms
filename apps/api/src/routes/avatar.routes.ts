import { Router, Response } from "express";

import { prisma } from "../config/prisma";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth";
import { success, failure } from "../utils/http";

const router = Router();

router.use(requireAuth);

const MAX_CHARS = 300_000; // about 220 KB of image data
const DATA_URL = /^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/;

async function canView(req: AuthenticatedRequest, targetUserId: string) {
  const me = req.user!;
  if (me.id === targetUserId || me.role === "ADMIN") return true;
  if (me.role === "TEACHER") {
    const link = await prisma.courseEnrollment.findFirst({
      where: {
        course: { teacherId: me.id },
        student: { userId: targetUserId }
      },
      select: { id: true }
    });
    return !!link;
  }
  return false;
}

/* Save my photo */
router.put("/me", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const image = String(req.body?.image || "");
    if (!DATA_URL.test(image) || image.length > MAX_CHARS) {
      return failure(
        res,
        "Please choose a JPG or PNG photo (it is resized automatically).",
        422
      );
    }
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatar: image }
    });
    return success(res, { message: "Profile photo saved." });
  } catch (error) {
    console.error("avatar save error:", error);
    return failure(res, "Unable to save the photo.", 500);
  }
});

/* Remove my photo */
router.delete("/me", async (req: AuthenticatedRequest, res: Response) => {
  try {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { avatar: null }
    });
    return success(res, { message: "Profile photo removed." });
  } catch (error) {
    console.error("avatar delete error:", error);
    return failure(res, "Unable to remove the photo.", 500);
  }
});

/* View a photo: /api/avatar/me or /api/avatar/<userId> */
router.get("/:id", async (req: AuthenticatedRequest, res: Response) => {
  try {
    const targetId =
      req.params.id === "me" ? req.user!.id : String(req.params.id);

    if (!(await canView(req, targetId))) {
      return res.status(404).end();
    }

    const user = await prisma.user.findUnique({
      where: { id: targetId },
      select: { avatar: true }
    });

    const match =
      user?.avatar && /^data:(image\/[a-z]+);base64,(.+)$/.exec(user.avatar);
    if (!match) return res.status(404).end();

    res.setHeader("Content-Type", match[1]);
    res.setHeader("Cache-Control", "private, no-cache");
    return res.send(Buffer.from(match[2], "base64"));
  } catch (error) {
    console.error("avatar view error:", error);
    return res.status(500).end();
  }
});

export default router;
