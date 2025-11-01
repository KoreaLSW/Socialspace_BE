import express from "express";
import { UsersController } from "../controllers/usersController";
import { NotificationPreferencesController } from "../controllers/notificationPreferencesController";
import { authenticateToken } from "../middleware/auth";
import multer from "multer";

const router = express.Router();

// Multer 설정 (프로필 이미지 업로드용)
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("이미지 파일만 업로드 가능합니다."));
    }
  },
});

// 사용자 검색 (멘션 자동완성용)
router.get("/search", UsersController.searchUsers);

// 사용자 기본 정보(프로필 링크용)
router.get("/:id/basic", UsersController.getBasicById);

// 프로필 이미지 업로드 (파일)
router.post(
  "/profile-image/upload",
  authenticateToken,
  upload.single("image"),
  UsersController.uploadProfileImage
);

// 프로필 이미지 업로드 (Base64)
router.post(
  "/profile-image/upload-base64",
  authenticateToken,
  UsersController.uploadBase64ProfileImage
);

// 프로필 이미지 업데이트 (URL만)
router.put(
  "/profile-image",
  authenticateToken,
  UsersController.updateProfileImage
);

// 알림 설정 관련 라우트
// 현재 알림 설정 조회
router.get(
  "/notification-preferences",
  authenticateToken,
  NotificationPreferencesController.getPreferences
);

// 알림 설정 업데이트
router.put(
  "/notification-preferences",
  authenticateToken,
  NotificationPreferencesController.updatePreferences
);

// 개별 알림 설정 토글
router.patch(
  "/notification-preferences/:type",
  authenticateToken,
  NotificationPreferencesController.togglePreference
);

// 회원 탈퇴 (본인 계정 삭제)
router.delete("/me", authenticateToken, UsersController.deleteMe);

export default router;
