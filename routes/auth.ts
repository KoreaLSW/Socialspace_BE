import express from "express";
import {
  googleLogin,
  getMe,
  updateProfile,
  logout,
  refreshToken,
} from "../controllers/authController";

const router = express.Router();

// 인증 관련 라우트
router.post("/google", googleLogin);
router.get("/me", getMe);
router.put("/profile", updateProfile);
router.post("/logout", logout);
router.post("/refresh", refreshToken);

export default router;
