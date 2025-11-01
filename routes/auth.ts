import { Router } from "express";
import {
  googleLogin,
  getCurrentUser,
  updateProfile,
  logout,
  getUserProfileByUsername,
  getFavorites,
  getBlockedUsers,
  getFollowRequests,
  approveFollowRequest,
  rejectFollowRequest,
  localSignup,
  localLogin,
  checkDuplicate,
} from "../controllers/authController";
import { authenticateToken, optionalAuth } from "../middleware/auth";

const router = Router();

// ===== 일반 회원가입/로그인 =====
// 중복 체크 (이메일, 사용자명, 닉네임)
router.get("/check-duplicate", checkDuplicate);

// 일반 회원가입 (이메일 + 비밀번호)
router.post("/signup", localSignup);

// 일반 로그인 (이메일 + 비밀번호)
router.post("/login", localLogin);

// ===== Google OAuth =====
// Google OAuth 로그인 처리 (사용자 정보 생성/업데이트)
router.post("/google", googleLogin);

// 현재 사용자 정보 조회 (NextAuth 세션 정보 기반)
router.get("/me", authenticateToken, getCurrentUser);

// 내 프로필 정보 조회 (팔로워/팔로잉/게시물 수 포함)
router.get("/profile", authenticateToken, getCurrentUser);

// username으로 사용자 프로필 조회 (공개 정보, 선택적 인증)
router.get(
  "/profile/username/:username",
  optionalAuth,
  getUserProfileByUsername
);

// 사용자 프로필 업데이트
router.put("/profile", authenticateToken, updateProfile);

// 친한친구 목록 조회
router.get("/favorites", authenticateToken, getFavorites);

// 차단된 사용자 목록 조회
router.get("/blocked-users", authenticateToken, getBlockedUsers);

// 팔로우 요청 목록 조회
router.get("/follow-requests", authenticateToken, getFollowRequests);

// 팔로우 요청 승인
router.post(
  "/follow-requests/:requesterId/approve",
  authenticateToken,
  approveFollowRequest
);

// 팔로우 요청 거절
router.post(
  "/follow-requests/:requesterId/reject",
  authenticateToken,
  rejectFollowRequest
);

// 로그아웃 처리
router.post("/logout", authenticateToken, logout);

export default router;
