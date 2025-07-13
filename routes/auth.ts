import express from "express";
import {
  googleLogin,
  updateProfile,
  logout,
} from "../controllers/authController";

const router = express.Router();

// 인증 관련 라우트
router.post("/google", googleLogin);
router.put("/profile", updateProfile);
router.post("/logout", logout);

export default router;
