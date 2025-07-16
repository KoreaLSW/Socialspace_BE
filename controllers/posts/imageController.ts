import { Response } from "express";
import multer from "multer";
import {
  uploadImage,
  uploadBase64Image,
  uploadMultipleImages,
  deleteImage,
} from "../../config/cloudinary";
import { log } from "../../utils/logger";
import { AuthenticatedRequest } from "../../middleware/auth";

// 메모리 스토리지 설정 (파일을 메모리에 저장)
const storage = multer.memoryStorage();

// 파일 필터 (이미지 파일만 허용)
const fileFilter = (
  req: any,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("이미지 파일만 업로드 가능합니다."));
  }
};

// Multer 설정
export const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB 제한
    files: 5, // 최대 5개 파일
  },
});

export class ImageController {
  // 단일 이미지 업로드
  static async uploadSingleImage(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      console.log("🔍 단일 이미지 업로드 시작");
      console.log("🔍 이미지 업로드 시작:", {
        hasUser: !!req.user,
        userId: req.user?.id,
        hasFile: !!req.file,
        filename: req.file?.originalname,
        mimetype: req.file?.mimetype,
        size: req.file?.size,
      });

      const userId = req.user?.id;
      if (!userId) {
        console.warn("⚠️ 이미지 업로드: 사용자 인증 필요");
        res.status(401).json({ error: "로그인이 필요합니다." });
        return;
      }

      if (!req.file) {
        console.warn("⚠️ 이미지 업로드: 파일 없음");
        res.status(400).json({ error: "이미지 파일이 필요합니다." });
        return;
      }

      console.log("🔍 Cloudinary 업로드 시작...");
      const result = await uploadImage(req.file, "socialspace/posts");

      console.log("✅ 이미지 업로드 성공:", {
        public_id: result.public_id,
        url: result.url,
        userId,
      });

      log("INFO", `이미지 업로드 성공: ${result.public_id} by user ${userId}`);

      res.json({
        success: true,
        data: {
          imageUrl: result.url,
          publicId: result.public_id,
        },
        message: "이미지가 성공적으로 업로드되었습니다.",
      });
    } catch (error) {
      console.error("🔴 이미지 업로드 실패:", error);
      log("ERROR", "이미지 업로드 실패", error);
      res.status(500).json({
        error: "이미지 업로드 중 오류가 발생했습니다.",
        details: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // 다중 이미지 업로드
  static async uploadMultipleImages(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      console.log("🔍 다중 이미지 업로드 시작");
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "로그인이 필요합니다." });
        return;
      }

      if (!req.files || !Array.isArray(req.files) || req.files.length === 0) {
        res.status(400).json({ error: "이미지 파일이 필요합니다." });
        return;
      }

      const files = req.files as Express.Multer.File[];
      if (files.length > 5) {
        res
          .status(400)
          .json({ error: "최대 5개의 이미지만 업로드 가능합니다." });
        return;
      }

      const results = await uploadMultipleImages(files, "socialspace/posts");

      log("INFO", `${results.length}개 이미지 업로드 성공 by user ${userId}`);

      res.json({
        success: true,
        data: results,
        message: "이미지들이 성공적으로 업로드되었습니다.",
      });
    } catch (error) {
      log("ERROR", "다중 이미지 업로드 실패", error);
      res.status(500).json({ error: "이미지 업로드 중 오류가 발생했습니다." });
    }
  }

  // Base64 이미지 업로드
  static async uploadBase64Image(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "로그인이 필요합니다." });
        return;
      }

      const { imageData } = req.body;
      if (!imageData) {
        res.status(400).json({ error: "이미지 데이터가 필요합니다." });
        return;
      }

      // Base64 형식 검증
      if (!imageData.startsWith("data:image/")) {
        res.status(400).json({ error: "올바른 이미지 형식이 아닙니다." });
        return;
      }

      const result = await uploadBase64Image(imageData, "socialspace/posts");

      log(
        "INFO",
        `Base64 이미지 업로드 성공: ${result.public_id} by user ${userId}`
      );

      res.json({
        success: true,
        data: result,
        message: "이미지가 성공적으로 업로드되었습니다.",
      });
    } catch (error) {
      log("ERROR", "Base64 이미지 업로드 실패", error);
      res.status(500).json({ error: "이미지 업로드 중 오류가 발생했습니다." });
    }
  }

  // 이미지 삭제
  static async deleteImage(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "로그인이 필요합니다." });
        return;
      }

      const { publicId } = req.params;
      if (!publicId) {
        res.status(400).json({ error: "이미지 ID가 필요합니다." });
        return;
      }

      const result = await deleteImage(publicId);

      log("INFO", `이미지 삭제 성공: ${publicId} by user ${userId}`);

      res.json({
        success: true,
        data: result,
        message: "이미지가 성공적으로 삭제되었습니다.",
      });
    } catch (error) {
      log("ERROR", "이미지 삭제 실패", error);
      res.status(500).json({ error: "이미지 삭제 중 오류가 발생했습니다." });
    }
  }
}
