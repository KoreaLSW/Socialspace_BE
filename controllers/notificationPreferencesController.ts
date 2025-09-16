import { Response } from "express";
import { UserModel, NotificationPreferences } from "../models/User";
import { log } from "../utils/logger";
import { AuthenticatedRequest } from "../middleware/auth";

export class NotificationPreferencesController {
  // 현재 알림 설정 조회
  static async getPreferences(
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

      const preferences = await UserModel.getNotificationPreferences(userId);
      if (!preferences) {
        res.status(404).json({
          success: false,
          message: "사용자를 찾을 수 없습니다",
        });
        return;
      }

      res.json({
        success: true,
        data: preferences,
      });
    } catch (error) {
      log("ERROR", "알림 설정 조회 실패", error);
      res.status(500).json({
        success: false,
        message: "알림 설정 조회 중 오류가 발생했습니다",
      });
    }
  }

  // 알림 설정 업데이트
  static async updatePreferences(
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

      const preferences: Partial<NotificationPreferences> = req.body;

      // 유효한 설정 키들만 허용
      const validKeys = [
        "follow",
        "followee_post",
        "post_liked",
        "comment_liked",
        "post_commented",
        "mention_comment",
      ];
      const filteredPreferences: Partial<NotificationPreferences> = {};

      for (const [key, value] of Object.entries(preferences)) {
        if (validKeys.includes(key) && typeof value === "boolean") {
          (filteredPreferences as any)[key] = value;
        }
      }

      if (Object.keys(filteredPreferences).length === 0) {
        res.status(400).json({
          success: false,
          message: "유효한 알림 설정이 없습니다",
        });
        return;
      }

      const updatedPreferences = await UserModel.updateNotificationPreferences(
        userId,
        filteredPreferences
      );

      if (!updatedPreferences) {
        res.status(404).json({
          success: false,
          message: "사용자를 찾을 수 없습니다",
        });
        return;
      }

      res.json({
        success: true,
        message: "알림 설정이 업데이트되었습니다",
        data: updatedPreferences,
      });
    } catch (error) {
      log("ERROR", "알림 설정 업데이트 실패", error);
      res.status(500).json({
        success: false,
        message: "알림 설정 업데이트 중 오류가 발생했습니다",
      });
    }
  }

  // 개별 알림 설정 토글
  static async togglePreference(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      const { type } = req.params as { type: keyof NotificationPreferences };

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증이 필요합니다",
        });
        return;
      }

      // 유효한 알림 타입 확인
      const validTypes = [
        "follow",
        "followee_post",
        "post_liked",
        "comment_liked",
        "post_commented",
        "mention_comment",
      ];
      if (!validTypes.includes(type)) {
        res.status(400).json({
          success: false,
          message: "유효하지 않은 알림 타입입니다",
        });
        return;
      }

      const updatedPreferences = await UserModel.toggleNotificationPreference(
        userId,
        type
      );

      if (!updatedPreferences) {
        res.status(404).json({
          success: false,
          message: "사용자를 찾을 수 없습니다",
        });
        return;
      }

      const isEnabled = updatedPreferences[type];
      const typeLabels = {
        follow: "팔로우",
        followee_post: "팔로잉 게시물",
        post_liked: "게시물 좋아요",
        comment_liked: "댓글 좋아요",
        post_commented: "게시물 댓글",
        mention_comment: "멘션",
      };

      res.json({
        success: true,
        message: `${typeLabels[type]} 알림을 ${
          isEnabled ? "활성화" : "비활성화"
        }했습니다`,
        data: updatedPreferences,
      });
    } catch (error) {
      log("ERROR", "알림 설정 토글 실패", error);
      res.status(500).json({
        success: false,
        message: "알림 설정 토글 중 오류가 발생했습니다",
      });
    }
  }
}
