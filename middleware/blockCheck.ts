import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth";
import { BlockModel } from "../models/Block";
import { PostModel } from "../models/Post";
import { CommentModel } from "../models/Comment";
import { log } from "../utils/logger";

/**
 * 차단 관계 확인 미들웨어
 * 두 사용자 간 차단 관계가 있으면 404 에러로 처리 (투명한 차단)
 */
export const checkBlockRelation = (
  targetUserIdParam: string = "targetUserId"
) => {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ) => {
    try {
      const userId = req.user?.id;
      const targetUserId =
        req.params[targetUserIdParam] || req.body[targetUserIdParam];

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증이 필요합니다",
        });
        return;
      }

      if (!targetUserId) {
        res.status(400).json({
          success: false,
          message: "대상 사용자 ID가 필요합니다",
        });
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
        // 투명한 차단: 성공한 것처럼 응답하지만 실제로는 아무것도 하지 않음
        res.json({
          success: true,
          message: "처리되었습니다",
          data: {},
        });
        return;
      }

      next();
    } catch (error) {
      log("ERROR", "차단 관계 확인 실패", error);
      res.status(500).json({
        success: false,
        message: "서버 오류가 발생했습니다",
      });
    }
  };
};

/**
 * 게시물 작성자와의 차단 관계 확인 미들웨어
 */
export const checkPostAuthorBlock = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    // 다양한 파라미터 이름 지원: id, postId, post_id
    const postId =
      req.params.id || req.params.postId || req.body.postId || req.body.post_id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    if (!postId) {
      res.status(400).json({
        success: false,
        message: "게시물 ID가 필요합니다",
      });
      return;
    }

    // 게시물 조회
    const post = await PostModel.findById(postId);
    if (!post) {
      res.status(404).json({
        success: false,
        message: "게시물을 찾을 수 없습니다",
      });
      return;
    }

    // 자신의 게시물은 허용
    if (userId === post.user_id) {
      next();
      return;
    }

    // 게시물 작성자와의 차단 관계 확인
    const isBlocked = await BlockModel.isBlocked(userId, post.user_id);
    if (isBlocked) {
      // 투명한 차단: 성공한 것처럼 응답하지만 실제로는 아무것도 하지 않음
      res.json({
        success: true,
        message: "처리되었습니다",
        data: {
          like_count: 0, // 가짜 데이터
          is_liked: false,
        },
      });
      return;
    }

    next();
  } catch (error) {
    log("ERROR", "게시물 작성자 차단 확인 실패", error);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다",
    });
  }
};

/**
 * 댓글 작성자와의 차단 관계 확인 미들웨어
 */
export const checkCommentAuthorBlock = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const commentId = req.params.commentId || req.body.commentId;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    if (!commentId) {
      res.status(400).json({
        success: false,
        message: "댓글 ID가 필요합니다",
      });
      return;
    }

    // 댓글 조회
    const comment = await CommentModel.findById(commentId);
    if (!comment) {
      res.status(404).json({
        success: false,
        message: "댓글을 찾을 수 없습니다",
      });
      return;
    }

    // 자신의 댓글은 허용
    if (userId === comment.user_id) {
      next();
      return;
    }

    // 댓글 작성자와의 차단 관계 확인
    const isBlocked = await BlockModel.isBlocked(userId, comment.user_id);
    if (isBlocked) {
      // 투명한 차단: 성공한 것처럼 응답하지만 실제로는 아무것도 하지 않음
      res.json({
        success: true,
        message: "처리되었습니다",
        data: {
          like_count: 0, // 가짜 데이터
          is_liked: false,
        },
      });
      return;
    }

    next();
  } catch (error) {
    log("ERROR", "댓글 작성자 차단 확인 실패", error);
    res.status(500).json({
      success: false,
      message: "서버 오류가 발생했습니다",
    });
  }
};
