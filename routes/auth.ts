import { Router } from "express";
import {
  googleLogin,
  getCurrentUser,
  updateProfile,
  logout,
} from "../controllers/authController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// Google OAuth 로그인 처리 (사용자 정보 생성/업데이트)
router.post("/google", googleLogin);

// 현재 사용자 정보 조회 (NextAuth 세션 정보 기반)
router.get("/me", authenticateToken, getCurrentUser);

// 사용자 프로필 업데이트
router.put("/profile", authenticateToken, updateProfile);

// 로그아웃 처리
router.post("/logout", authenticateToken, logout);

export default router;
