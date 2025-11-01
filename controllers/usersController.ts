import { Request, Response } from "express";
import { UserModel } from "../models/User";
import { BlockModel } from "../models/Block";
import { log } from "../utils/logger";
import {
  deleteImage,
  uploadProfileImage,
  uploadBase64ProfileImage,
} from "../config/cloudinary";
import { AuthenticatedRequest } from "../middleware/auth";

export class UsersController {
  static async searchUsers(req: Request, res: Response): Promise<void> {
    try {
      const q = (req.query.q as string) || "";
      const limit = parseInt((req.query.limit as string) || "5", 10);
      const userId = (req as any).user?.id; // 선택적 인증

      if (!q || q.trim().length === 0) {
        res.json({ success: true, data: [] });
        return;
      }

      let users = await UserModel.searchByQuery(q.trim(), limit);

      // 로그인된 사용자의 경우 차단된 사용자 제외
      if (userId && users.length > 0) {
        const blockedUserIds = await BlockModel.getAllBlockedRelationUserIds(
          userId
        );
        if (blockedUserIds.length > 0) {
          users = users.filter((user) => !blockedUserIds.includes(user.id));
        }
      }

      res.json({ success: true, data: users });
    } catch (error) {
      log("ERROR", "사용자 검색 실패", error);
      res.status(500).json({
        success: false,
        message: "사용자 검색 중 오류가 발생했습니다.",
      });
    }
  }

  static async getBasicById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      if (!id) {
        res.status(400).json({ success: false, message: "사용자 ID 필요" });
        return;
      }
      const user = await UserModel.findById(id);
      if (!user) {
        res
          .status(404)
          .json({ success: false, message: "사용자를 찾을 수 없습니다." });
        return;
      }
      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          profile_image: user.profileImage,
        },
      });
    } catch (error) {
      log("ERROR", "사용자 기본정보 조회 실패", error);
      res.status(500).json({ success: false, message: "오류가 발생했습니다." });
    }
  }

  // 프로필 이미지 업데이트 (기존 이미지 삭제 포함)
  static async updateProfileImage(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증이 필요합니다",
        });
        return;
      }

      const { profileImage } = req.body;
      if (!profileImage) {
        res.status(400).json({
          success: false,
          message: "프로필 이미지가 필요합니다",
        });
        return;
      }

      // 현재 사용자 정보 조회
      const currentUser = await UserModel.findById(userId);
      if (!currentUser) {
        res.status(404).json({
          success: false,
          message: "사용자를 찾을 수 없습니다",
        });
        return;
      }

      // 기존 프로필 이미지가 있고, 새로운 이미지와 다른 경우 삭제
      if (
        currentUser.profileImage &&
        currentUser.profileImage !== profileImage
      ) {
        try {
          // Cloudinary URL에서 public_id 추출
          const urlParts = currentUser.profileImage.split("/");
          const filename = urlParts[urlParts.length - 1];
          // 파일 확장자 제거
          const publicId = filename.split(".")[0];

          // users 폴더 내의 전체 경로 구성
          // socialspace/users/{userId}/{publicId} 형태로 저장되므로
          const fullPublicId = `socialspace/users/${userId}/${publicId}`;

          // 기존 이미지 삭제
          const deleteResult = await deleteImage(fullPublicId);
          if (deleteResult) {
            log("INFO", `기존 프로필 이미지 삭제 성공: ${fullPublicId}`);
          } else {
            log("WARN", `기존 프로필 이미지 삭제 실패: ${fullPublicId}`);
          }
        } catch (deleteError) {
          log("ERROR", "기존 프로필 이미지 삭제 중 오류", deleteError);
          // 삭제 실패해도 계속 진행
        }
      }

      // 새 프로필 이미지로 업데이트
      const updatedUser = await UserModel.update(userId, { profileImage });

      if (!updatedUser) {
        res.status(500).json({
          success: false,
          message: "프로필 이미지 업데이트에 실패했습니다",
        });
        return;
      }

      res.json({
        success: true,
        message: "프로필 이미지가 성공적으로 업데이트되었습니다",
        data: {
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            username: updatedUser.username,
            nickname: updatedUser.nickname,
            bio: updatedUser.bio,
            profileImage: updatedUser.profileImage,
            visibility: updatedUser.visibility,
            role: updatedUser.role,
            emailVerified: updatedUser.emailVerified,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
          },
        },
      });
    } catch (error) {
      log("ERROR", "프로필 이미지 업데이트 실패", error);
      res.status(500).json({
        success: false,
        message: "프로필 이미지 업데이트 중 오류가 발생했습니다",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // 프로필 이미지 파일 업로드
  static async uploadProfileImage(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증이 필요합니다",
        });
        return;
      }

      if (!req.file) {
        res.status(400).json({
          success: false,
          message: "이미지 파일이 필요합니다",
        });
        return;
      }

      // 현재 사용자 정보 조회
      const currentUser = await UserModel.findById(userId);
      if (!currentUser) {
        res.status(404).json({
          success: false,
          message: "사용자를 찾을 수 없습니다",
        });
        return;
      }

      // 기존 프로필 이미지가 있는 경우 삭제
      if (currentUser.profileImage) {
        try {
          // Cloudinary public_id 추출 (URL에서)
          const urlParts = currentUser.profileImage.split("/");
          const filename = urlParts[urlParts.length - 1];
          const publicId = filename.split(".")[0];

          // users 폴더 내의 전체 경로 구성
          const fullPublicId = `socialspace/users/${userId}/${publicId}`;

          // 기존 이미지 삭제
          const deleteResult = await deleteImage(fullPublicId);
          if (deleteResult) {
            log("INFO", `기존 프로필 이미지 삭제 성공: ${fullPublicId}`);
          } else {
            log("WARN", `기존 프로필 이미지 삭제 실패: ${fullPublicId}`);
          }
        } catch (deleteError) {
          log("ERROR", "기존 프로필 이미지 삭제 중 오류", deleteError);
          // 삭제 실패해도 계속 진행
        }
      }

      // 새 프로필 이미지 업로드
      const result = await uploadProfileImage(req.file, userId);

      // 사용자 정보 업데이트
      const updatedUser = await UserModel.update(userId, {
        profileImage: result.url,
      });

      if (!updatedUser) {
        res.status(500).json({
          success: false,
          message: "프로필 이미지 업데이트에 실패했습니다",
        });
        return;
      }

      res.json({
        success: true,
        message: "프로필 이미지가 성공적으로 업로드되었습니다",
        data: {
          imageUrl: result.url,
          publicId: result.public_id,
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            username: updatedUser.username,
            nickname: updatedUser.nickname,
            bio: updatedUser.bio,
            profileImage: updatedUser.profileImage,
            visibility: updatedUser.visibility,
            role: updatedUser.role,
            emailVerified: updatedUser.emailVerified,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
          },
        },
      });
    } catch (error) {
      log("ERROR", "프로필 이미지 업로드 실패", error);
      res.status(500).json({
        success: false,
        message: "프로필 이미지 업로드 중 오류가 발생했습니다",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // Base64 프로필 이미지 업로드
  static async uploadBase64ProfileImage(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증이 필요합니다",
        });
        return;
      }

      const { imageData } = req.body;
      if (!imageData) {
        res.status(400).json({
          success: false,
          message: "이미지 데이터가 필요합니다",
        });
        return;
      }

      // Base64 형식 검증
      if (!imageData.startsWith("data:image/")) {
        res.status(400).json({
          success: false,
          message: "올바른 이미지 형식이 아닙니다",
        });
        return;
      }

      // 현재 사용자 정보 조회
      const currentUser = await UserModel.findById(userId);
      if (!currentUser) {
        res.status(404).json({
          success: false,
          message: "사용자를 찾을 수 없습니다",
        });
        return;
      }

      // 기존 프로필 이미지가 있는 경우 삭제
      if (currentUser.profileImage) {
        try {
          // Cloudinary URL에서 public_id 추출
          const urlParts = currentUser.profileImage.split("/");
          const filename = urlParts[urlParts.length - 1];
          // 파일 확장자 제거
          const publicId = filename.split(".")[0];

          // users 폴더 내의 전체 경로 구성
          // socialspace/users/{userId}/{publicId} 형태로 저장되므로
          const fullPublicId = `socialspace/users/${userId}/${publicId}`;

          // 기존 이미지 삭제
          const deleteResult = await deleteImage(fullPublicId);
          if (deleteResult) {
            log("INFO", `기존 프로필 이미지 삭제 성공: ${fullPublicId}`);
          } else {
            log("WARN", `기존 프로필 이미지 삭제 실패: ${fullPublicId}`);
          }
        } catch (deleteError) {
          log("ERROR", "기존 프로필 이미지 삭제 중 오류", deleteError);
          // 삭제 실패해도 계속 진행
        }
      }

      // 새 프로필 이미지 업로드
      const result = await uploadBase64ProfileImage(imageData, userId);

      // 사용자 정보 업데이트
      const updatedUser = await UserModel.update(userId, {
        profileImage: result.url,
      });

      if (!updatedUser) {
        res.status(500).json({
          success: false,
          message: "프로필 이미지 업데이트에 실패했습니다",
        });
        return;
      }

      res.json({
        success: true,
        message: "프로필 이미지가 성공적으로 업로드되었습니다",
        data: {
          imageUrl: result.url,
          publicId: result.public_id,
          user: {
            id: updatedUser.id,
            email: updatedUser.email,
            username: updatedUser.username,
            nickname: updatedUser.nickname,
            bio: updatedUser.bio,
            profileImage: updatedUser.profileImage,
            visibility: updatedUser.visibility,
            role: updatedUser.role,
            emailVerified: updatedUser.emailVerified,
            createdAt: updatedUser.createdAt,
            updatedAt: updatedUser.updatedAt,
          },
        },
      });
    } catch (error) {
      log("ERROR", "Base64 프로필 이미지 업로드 실패", error);
      res.status(500).json({
        success: false,
        message: "프로필 이미지 업로드 중 오류가 발생했습니다",
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  // 회원 탈퇴 (본인 계정 삭제)
  static async deleteMe(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: "인증이 필요합니다" });
        return;
      }

      const deleted = await UserModel.deleteById(userId);
      if (!deleted) {
        res
          .status(404)
          .json({ success: false, message: "사용자를 찾을 수 없습니다" });
        return;
      }

      res.json({ success: true, message: "회원 탈퇴가 완료되었습니다" });
    } catch (error) {
      log("ERROR", "회원 탈퇴 실패", error);
      res
        .status(500)
        .json({ success: false, message: "회원 탈퇴 중 오류가 발생했습니다" });
    }
  }
}
