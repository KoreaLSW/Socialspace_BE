import express from "express";
import {
  getHealth,
  testDatabase,
  testKoreanTime,
} from "../controllers/healthController";
import authRoutes from "./auth";
import postsRoutes from "./posts";
import commentsRoutes from "./comments";
import followRoutes from "./follow";
import usersRoutes from "./users";
import notificationsRoutes from "./notifications";
import chatRoutes from "./chat";

const router = express.Router();

// 루트 라우트
router.get("/", (req, res) => {
  res.json({
    success: true,
    message: "SocialSpace Backend API",
    version: "1.0.0",
    timestamp: new Date().toISOString(),
  });
});

// 헬스체크 라우트
router.get("/health", getHealth);

// 데이터베이스 테스트 라우트
router.get("/api/test-db", testDatabase);

// 한국시간 테스트 라우트
router.get("/api/test-time", testKoreanTime);

// 인증 라우트
router.use("/auth", authRoutes);

// 팔로우 라우트 (인증 하위 경로로 연결)
router.use("/follow", followRoutes);

// 게시글 라우트
router.use("/posts", postsRoutes);

// 댓글 라우트
router.use("/comments", commentsRoutes);

// 사용자 라우트
router.use("/users", usersRoutes);

// 알림 라우트
router.use("/notifications", notificationsRoutes);

// 채팅 라우트
router.use("/chat", chatRoutes);

export default router;
