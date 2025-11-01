import { Response } from "express";
import { log } from "../utils/logger";
import { AuthenticatedRequest } from "../middleware/auth";
import { FollowModel } from "../models/Follow";
import { NotificationModel } from "../models/Notification";
import { UserModel } from "../models/User";

// 팔로우 상태 확인
export const checkFollowStatus = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { targetUserId } = req.params as { targetUserId: string };

    if (!userId) {
      res.status(401).json({ success: false, message: "인증이 필요합니다" });
      return;
    }

    const data = await FollowModel.checkFollowStatus(userId, targetUserId);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    log("ERROR", "팔로우 상태 확인 실패", error);
    res.status(500).json({
      success: false,
      message: "팔로우 상태 확인 중 오류가 발생했습니다",
    });
  }
};

// 팔로우/언팔로우 토글
export const toggleFollow = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { targetUserId } = req.params as { targetUserId: string };

    if (!userId) {
      res.status(401).json({ success: false, message: "인증이 필요합니다" });
      return;
    }
    if (userId === targetUserId) {
      res
        .status(400)
        .json({ success: false, message: "자기 자신을 팔로우할 수 없습니다" });
      return;
    }

    const result = await FollowModel.toggleFollow(userId, targetUserId);

    // 알림: 상대방을 팔로우하기 시작했을 때, 팔로우 받은 사용자에게 알림
    if (result.isFollowing && userId !== targetUserId) {
      try {
        // 대상 사용자의 팔로우 알림 설정 확인
        const isFollowNotificationEnabled =
          await UserModel.isNotificationEnabled(targetUserId, "follow");

        if (isFollowNotificationEnabled) {
          await NotificationModel.createManyIfNotExists([
            {
              user_id: targetUserId,
              type: "follow",
              from_user_id: userId,
              target_id: targetUserId,
            },
          ]);
        }
      } catch (e) {
        log("ERROR", "팔로우 알림 생성 실패", e);
      }
    }

    res.json({
      success: true,
      message: result.isFollowing
        ? "팔로우했습니다"
        : result.isPending
        ? "팔로우 요청을 보냈습니다"
        : "팔로우를 취소했습니다",
      data: result,
    });
  } catch (error) {
    log("ERROR", "팔로우/언팔로우 실패", error);
    res
      .status(500)
      .json({ success: false, message: "팔로우 처리 중 오류가 발생했습니다" });
  }
};

// 친한친구 토글
export const toggleFavorite = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { targetUserId } = req.params as { targetUserId: string };
    if (!userId) {
      res.status(401).json({ success: false, message: "인증이 필요합니다" });
      return;
    }

    const { isFavorite } = await FollowModel.toggleFavorite(
      userId,
      targetUserId
    );
    res.json({
      success: true,
      message: isFavorite ? "친한친구 추가" : "친한친구에서 제거",
      data: { isFavorite },
    });
  } catch (error) {
    log("ERROR", "친한친구 토글 실패", error);
    res.status(500).json({ success: false, message: "친한친구 처리 중 오류" });
  }
};

// 차단 토글
export const toggleBlock = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { targetUserId } = req.params as { targetUserId: string };
    if (!userId) {
      res.status(401).json({ success: false, message: "인증이 필요합니다" });
      return;
    }

    const { isBlocked } = await FollowModel.toggleBlock(userId, targetUserId);
    res.json({
      success: true,
      message: isBlocked ? "차단 완료" : "차단 해제",
      data: { isBlocked },
    });
  } catch (error) {
    log("ERROR", "차단 토글 실패", error);
    res.status(500).json({ success: false, message: "차단 처리 중 오류" });
  }
};

// 팔로워 리스트
export const getFollowers = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { userId } = req.params as { userId: string };
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);

    const { users, total } = await FollowModel.getFollowers(
      userId,
      page,
      limit
    );
    res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    log("ERROR", "팔로워 목록 조회 실패", error);
    res
      .status(500)
      .json({ success: false, message: "팔로워 목록 조회 중 오류" });
  }
};

// 팔로잉 리스트
export const getFollowing = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { userId } = req.params as { userId: string };
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);

    const { users, total } = await FollowModel.getFollowing(
      userId,
      page,
      limit
    );
    res.json({
      success: true,
      data: users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    log("ERROR", "팔로잉 목록 조회 실패", error);
    res
      .status(500)
      .json({ success: false, message: "팔로잉 목록 조회 중 오류" });
  }
};

// 맞팔로우 목록 조회
export const getMutualFollows = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { userId } = req.params as { userId: string };
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.page as string) || "20", 10);

    const { users, pagination } = await FollowModel.getMutualFollows(
      userId,
      page,
      limit
    );

    res.json({
      success: true,
      data: users,
      pagination,
    });
  } catch (error) {
    log("ERROR", "맞팔로우 목록 조회 실패", error);
    res
      .status(500)
      .json({ success: false, message: "맞팔로우 목록 조회 중 오류" });
  }
};
