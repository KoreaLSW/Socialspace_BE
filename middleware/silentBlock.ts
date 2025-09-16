import { Request, Response, NextFunction } from "express";
import { AuthenticatedRequest } from "./auth";
import { BlockModel } from "../models/Block";
import { PostModel } from "../models/Post";
import { log } from "../utils/logger";

/**
 * 댓글 작성 시 차단된 사용자에게 가짜 성공 응답을 보내는 미들웨어
 */
export const silentBlockForComments = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const { post_id } = req.body;

    if (!userId || !post_id) {
      next();
      return;
    }

    // 게시물 조회
    const post = await PostModel.findById(post_id, userId);
    if (!post) {
      next();
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
      // 투명한 차단: 가짜 댓글 생성 성공 응답
      res.status(201).json({
        success: true,
        message: "댓글이 작성되었습니다.",
        data: {
          id: `fake-${Date.now()}`, // 가짜 ID
          post_id: post_id,
          user_id: userId,
          content: req.body.content,
          parent_id: req.body.parent_id || null,
          reply_to_comment_id: req.body.reply_to_comment_id || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          is_edited: false,
          author: {
            id: userId,
            username: "blocked_user",
            nickname: "차단된 사용자",
            profile_image: null,
          },
          like_count: 0,
          is_liked: false,
          reply_count: 0,
        },
      });
      return;
    }

    next();
  } catch (error) {
    log("ERROR", "댓글 작성 차단 확인 실패", error);
    next(); // 오류 시 정상 진행
  }
};

/**
 * 좋아요 시 차단된 사용자에게 가짜 성공 응답을 보내는 미들웨어
 */
export const silentBlockForLikes = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.id;
    const targetId = req.params.id || req.params.postId || req.params.commentId;

    if (!userId || !targetId) {
      next();
      return;
    }

    // 게시물 또는 댓글의 작성자 확인
    let authorId = null;

    // 게시물 좋아요인 경우
    if (req.route.path.includes("/:id/like")) {
      const post = await PostModel.findById(targetId, userId);
      if (post) {
        authorId = post.user_id;
      }
    }
    // 댓글 좋아요인 경우
    else if (req.route.path.includes("/:commentId/like")) {
      const { CommentModel } = await import("../models/Comment");
      const comment = await CommentModel.findById(targetId);
      if (comment) {
        authorId = comment.user_id;
      }
    }

    if (!authorId) {
      next();
      return;
    }

    // 자신의 콘텐츠는 허용
    if (userId === authorId) {
      next();
      return;
    }

    // 작성자와의 차단 관계 확인
    const isBlocked = await BlockModel.isBlocked(userId, authorId);
    if (isBlocked) {
      // 투명한 차단: 가짜 좋아요 성공 응답
      res.json({
        success: true,
        message: "좋아요가 처리되었습니다.",
        data: {
          like_count: Math.floor(Math.random() * 10) + 1, // 가짜 좋아요 수 (1-10)
          is_liked: req.method === "POST", // POST면 좋아요, DELETE면 좋아요 취소
        },
      });
      return;
    }

    next();
  } catch (error) {
    log("ERROR", "좋아요 차단 확인 실패", error);
    next(); // 오류 시 정상 진행
  }
};
