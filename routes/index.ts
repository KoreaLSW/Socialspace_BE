import express from "express";
import {
  getHealth,
  testDatabase,
  testKoreanTime,
} from "../controllers/healthController";
import authRoutes from "./auth";

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

export default router;
