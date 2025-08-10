import { Router } from "express";
import {
  googleLogin,
  getCurrentUser,
  updateProfile,
  logout,
  getUserProfileByUsername,
} from "../controllers/authController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// Google OAuth 로그인 처리 (사용자 정보 생성/업데이트)
router.post("/google", googleLogin);

// 현재 사용자 정보 조회 (NextAuth 세션 정보 기반)
router.get("/me", authenticateToken, getCurrentUser);

// 내 프로필 정보 조회 (팔로워/팔로잉/게시물 수 포함)
router.get("/profile", authenticateToken, getCurrentUser);

// username으로 사용자 프로필 조회 (공개 정보)
router.get("/profile/username/:username", getUserProfileByUsername);

// 사용자 프로필 업데이트
router.put("/profile", authenticateToken, updateProfile);

// 로그아웃 처리
router.post("/logout", authenticateToken, logout);

export default router;
