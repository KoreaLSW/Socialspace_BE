import express from "express";
import { NotificationsController } from "../controllers/notificationsController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

router.get("/", authenticateToken, NotificationsController.list);
router.get(
  "/unread-count",
  authenticateToken,
  NotificationsController.unreadCount
);
router.patch("/:id/read", authenticateToken, NotificationsController.markRead);
router.patch(
  "/read-all",
  authenticateToken,
  NotificationsController.markAllRead
);

export default router;
