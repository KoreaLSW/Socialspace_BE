import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth";
import { BlockModel } from "../models/Block";
import { log } from "../utils/logger";

/**
 * 팔로우/친한친구 액션 시 차단된 사용자에게 가짜 성공 응답을 보내는 미들웨어
 */
export const silentBlockForFollow = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const targetUserId = req.params.targetUserId;

    if (!userId || !targetUserId) {
      next();
      return;
    }

    // 자기 자신과의 상호작용은 허용
    if (userId === targetUserId) {
      next();
      return;
    }

    // 차단 관계 확인
    const isBlocked = await BlockModel.isBlocked(userId, targetUserId);
    if (isBlocked) {
      // 투명한 차단: 가짜 성공 응답
      const action = req.route.path.includes("favorite")
        ? "친한친구"
        : "팔로우";

      res.json({
        success: true,
        message: `${action} 처리가 완료되었습니다.`,
        data: {
          isFollowing: false,
          isPending: false,
          isFavorite: false,
          isBlocked: false, // 차단 상태는 숨김
        },
      });
      return;
    }

    next();
  } catch (error) {
    log("ERROR", "팔로우 차단 확인 실패", error);
    next(); // 오류 시 정상 진행
  }
};

