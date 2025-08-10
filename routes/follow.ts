import { Router } from "express";
import {
  checkFollowStatus,
  toggleFollow,
  toggleFavorite,
  toggleBlock,
  getFollowers,
  getFollowing,
} from "../controllers/followController";
import { getRecommendedUsers } from "../controllers/authController";
import { authenticateToken } from "../middleware/auth";

const router = Router();

// 팔로우 상태 확인
router.get("/status/:targetUserId", authenticateToken, checkFollowStatus);

// 팔로우/언팔로우
router.post("/:targetUserId", authenticateToken, toggleFollow);

// 친한친구 추가/제거
router.post("/favorite/:targetUserId", authenticateToken, toggleFavorite);

// 차단하기/차단해제
router.post("/block/:targetUserId", authenticateToken, toggleBlock);

// 팔로워/팔로잉 목록
router.get("/followers/:userId", authenticateToken, getFollowers);
router.get("/following/:userId", authenticateToken, getFollowing);

// 추천 유저 (동일 엔드포인트 유지 요청에 따라 경로명 유지)
router.get("/recommended-userss", authenticateToken, getRecommendedUsers);

export default router;
