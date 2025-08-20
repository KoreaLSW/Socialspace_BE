import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { CommentModel, Comment, CreateCommentData } from "../models/Comment";
import { LikeModel } from "../models/Like";
import { NotificationModel } from "../models/Notification";
import { PostModel } from "../models/Post";
import { NotificationsController } from "./notificationsController";
import { log } from "../utils/logger";

export class CommentsController {
  // 댓글 생성
  static async createComment(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { post_id, content, parent_id, reply_to_comment_id } = req.body;
      const user_id = req.user?.id;

      if (!user_id) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      if (!post_id || !content) {
        res.status(400).json({
          success: false,
          message: "게시글 ID와 댓글 내용은 필수입니다.",
        });
        return;
      }

      if (content.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: "댓글 내용을 입력해주세요.",
        });
        return;
      }

      const commentData: CreateCommentData = {
        post_id,
        user_id,
        content: content.trim(),
        parent_id: parent_id || undefined,
        reply_to_comment_id: reply_to_comment_id || undefined,
      };

      const comment = await CommentModel.create(commentData);

      // 알림: 내 게시글에 달린 댓글 알림 (게시글 작성자에게)
      try {
        const post = await PostModel.findById(post_id);
        if (post && post.user_id && post.user_id !== user_id) {
          await NotificationModel.createManyIfNotExists([
            {
              user_id: post.user_id,
              type: "post_commented",
              from_user_id: user_id,
              target_id: comment.id,
            },
          ]);
        }
      } catch (e) {}

      await NotificationsController.processCommentMentionsOnCreate({
        commentId: comment.id,
        authorUserId: user_id,
        content,
      });

      // 작성자 정보를 포함한 댓글 조회
      const comments = await CommentModel.findByPostId(post_id, user_id);
      const createdComment = comments.find((c) => c.id === comment.id);

      res.status(201).json({
        success: true,
        message: "댓글이 작성되었습니다.",
        data: createdComment || comment,
      });
    } catch (error) {
      log("ERROR", "댓글 생성 오류", error);
      res.status(500).json({
        success: false,
        message: "댓글 작성 중 오류가 발생했습니다.",
      });
    }
  }

  // 게시글의 댓글 목록 조회 (선택적 인증)
  static async getCommentsByPostId(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { postId } = req.params;
      const user_id = req.user?.id;
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "20", 10);

      if (!postId) {
        res.status(400).json({
          success: false,
          message: "게시글 ID가 필요합니다.",
        });
        return;
      }

      const { comments, total } = await CommentModel.findByPostIdPaged(
        postId,
        page,
        limit,
        user_id
      );

      res.status(200).json({
        success: true,
        message: "댓글 목록을 가져왔습니다.",
        data: comments,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      log("ERROR", "댓글 목록 조회 오류", error);
      res.status(500).json({
        success: false,
        message: "댓글 목록 조회 중 오류가 발생했습니다.",
      });
    }
  }

  // 댓글의 대댓글 조회 (선택적 인증)
  static async getRepliesByCommentId(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { commentId } = req.params;
      const user_id = req.user?.id;
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "10", 10);

      if (!commentId) {
        res.status(400).json({
          success: false,
          message: "댓글 ID가 필요합니다.",
        });
        return;
      }

      const { replies, total } = await CommentModel.findRepliesByParentIdPaged(
        commentId,
        page,
        limit,
        user_id
      );

      res.status(200).json({
        success: true,
        message: "대댓글 목록을 가져왔습니다.",
        data: replies,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (error) {
      log("ERROR", "대댓글 조회 오류", error);
      res.status(500).json({
        success: false,
        message: "대댓글 조회 중 오류가 발생했습니다.",
      });
    }
  }

  // 댓글 기본 정보 (포스트 매핑용)
  static async getCommentBasic(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params as { commentId: string };
      if (!commentId) {
        res
          .status(400)
          .json({ success: false, message: "댓글 ID가 필요합니다." });
        return;
      }
      const comment = await CommentModel.findById(commentId);
      if (!comment) {
        res
          .status(404)
          .json({ success: false, message: "댓글을 찾을 수 없습니다." });
        return;
      }
      res.json({
        success: true,
        data: { id: comment.id, post_id: (comment as any).post_id },
      });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, message: "댓글 기본정보 조회 오류" });
    }
  }

  // 단일 댓글 조회 (선택적 인증) - 상단 고정 표시용
  static async getCommentById(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { commentId } = req.params as { commentId: string };
      const userId = req.user?.id;
      if (!commentId) {
        res
          .status(400)
          .json({ success: false, message: "댓글 ID가 필요합니다." });
        return;
      }
      const comment = await CommentModel.findById(commentId);
      if (!comment) {
        res
          .status(404)
          .json({ success: false, message: "댓글을 찾을 수 없습니다." });
        return;
      }
      const likeCount = await LikeModel.getCount(commentId, "comment");
      let isLiked = false;
      if (userId) {
        isLiked = await LikeModel.isLiked(userId, commentId, "comment");
      }
      res.json({
        success: true,
        data: { ...comment, like_count: likeCount, is_liked: isLiked },
      });
    } catch (error) {
      res
        .status(500)
        .json({ success: false, message: "댓글 조회 중 오류가 발생했습니다." });
    }
  }

  // 특정 댓글이 몇 번째 페이지에 있는지 계산 (루트 댓글 기준, ASC 정렬)
  static async getCommentPage(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params as { commentId: string };
      const limit = parseInt((req.query.limit as string) || "20", 10);
      if (!commentId) {
        res
          .status(400)
          .json({ success: false, message: "댓글 ID가 필요합니다." });
        return;
      }
      const comment = await CommentModel.findById(commentId);
      if (!comment) {
        res
          .status(404)
          .json({ success: false, message: "댓글을 찾을 수 없습니다." });
        return;
      }

      // 댓글의 위치 계산: 동일 포스트의 루트 댓글 중 생성일 ASC에서 몇 번째인지
      // created_at 같을 가능성 낮으나, 같더라도 해당 시점까지 포함(<=)하여 페이지 계산
      const db = await (await import("../config/database")).pool.connect();
      try {
        const posRes = await db.query(
          `WITH target AS (
             SELECT id, post_id, created_at
             FROM comments
             WHERE id = $1
           )
           SELECT COUNT(*) AS position
           FROM comments c, target t
           WHERE c.post_id = t.post_id
             AND c.parent_id IS NULL
             AND c.created_at <= t.created_at`,
          [commentId]
        );
        const position = parseInt(posRes.rows?.[0]?.position || "1", 10);
        const page = Math.max(1, Math.ceil(position / Math.max(1, limit)));
        res.json({
          success: true,
          data: { position, page, limit, post_id: comment.post_id },
        });
      } finally {
        db.release();
      }
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "댓글 페이지 계산 중 오류가 발생했습니다.",
      });
    }
  }

  // 댓글 수정
  static async updateComment(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { commentId } = req.params;
      const { content } = req.body;
      const user_id = req.user?.id;

      if (!user_id) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      if (!commentId || !content) {
        res.status(400).json({
          success: false,
          message: "댓글 ID와 내용은 필수입니다.",
        });
        return;
      }

      if (content.trim().length === 0) {
        res.status(400).json({
          success: false,
          message: "댓글 내용을 입력해주세요.",
        });
        return;
      }

      const updatedComment = await CommentModel.update(
        commentId,
        user_id,
        content.trim()
      );

      await NotificationsController.processCommentMentionsOnUpdate({
        commentId,
        authorUserId: user_id!,
        content,
      });

      res.status(200).json({
        success: true,
        message: "댓글이 수정되었습니다.",
        data: updatedComment,
      });
    } catch (error) {
      log("ERROR", "댓글 수정 오류", error);

      if (
        error instanceof Error &&
        error.message.includes("댓글을 찾을 수 없거나")
      ) {
        res.status(404).json({
          success: false,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "댓글 수정 중 오류가 발생했습니다.",
      });
    }
  }

  // 댓글 삭제
  static async deleteComment(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { commentId } = req.params;
      const user_id = req.user?.id;

      if (!user_id) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      if (!commentId) {
        res.status(400).json({
          success: false,
          message: "댓글 ID가 필요합니다.",
        });
        return;
      }

      await CommentModel.delete(commentId, user_id);

      res.status(200).json({
        success: true,
        message: "댓글이 삭제되었습니다.",
      });
    } catch (error) {
      log("ERROR", "댓글 삭제 오류", error);

      if (
        error instanceof Error &&
        error.message.includes("댓글을 찾을 수 없거나")
      ) {
        res.status(404).json({
          success: false,
          message: error.message,
        });
        return;
      }

      res.status(500).json({
        success: false,
        message: "댓글 삭제 중 오류가 발생했습니다.",
      });
    }
  }

  // 게시글의 댓글 수 조회
  static async getCommentCount(req: Request, res: Response): Promise<void> {
    try {
      const { postId } = req.params;

      if (!postId) {
        res.status(400).json({
          success: false,
          message: "게시글 ID가 필요합니다.",
        });
        return;
      }

      const count = await CommentModel.getCommentCount(postId);

      res.status(200).json({
        success: true,
        message: "댓글 수를 가져왔습니다.",
        data: { count },
      });
    } catch (error) {
      log("ERROR", "댓글 수 조회 오류", error);
      res.status(500).json({
        success: false,
        message: "댓글 수 조회 중 오류가 발생했습니다.",
      });
    }
  }

  // 댓글 좋아요
  static async likeComment(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { commentId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      // 댓글 존재 확인
      const comment = await CommentModel.findById(commentId);

      if (!comment) {
        res.status(404).json({
          success: false,
          message: "댓글을 찾을 수 없습니다.",
        });
        return;
      }

      // 이미 좋아요를 눌렀는지 확인
      const isAlreadyLiked = await LikeModel.isLiked(
        userId,
        commentId,
        "comment"
      );

      if (!isAlreadyLiked) {
        await LikeModel.create({
          user_id: userId,
          target_id: commentId,
          target_type: "comment",
        });

        // 알림: 내 댓글에 좋아요가 눌렸을 때 (자기 자신 제외)
        if (comment.user_id && comment.user_id !== userId) {
          try {
            await NotificationModel.createManyIfNotExists([
              {
                user_id: comment.user_id,
                type: "comment_liked",
                from_user_id: userId,
                target_id: commentId,
              },
            ]);
          } catch (e) {}
        }
      }

      // 좋아요 수 조회
      const likeCount = await LikeModel.getCount(commentId, "comment");

      log("INFO", `댓글 좋아요 처리 완료: ${commentId} by user ${userId}`);

      res.json({
        success: true,
        data: {
          commentId,
          likeCount,
          isLiked: true,
        },
        message: isAlreadyLiked
          ? "이미 좋아요된 상태입니다."
          : "댓글에 좋아요를 추가했습니다.",
      });
    } catch (error) {
      log("ERROR", "댓글 좋아요 실패", error);
      res.status(500).json({
        success: false,
        message: "댓글 좋아요 처리 중 오류가 발생했습니다.",
      });
    }
  }

  // 댓글 좋아요 취소
  static async unlikeComment(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { commentId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      // 댓글 존재 확인
      const comment = await CommentModel.findById(commentId);

      if (!comment) {
        res.status(404).json({
          success: false,
          message: "댓글을 찾을 수 없습니다.",
        });
        return;
      }

      // 좋아요가 되어있는지 확인
      const isLiked = await LikeModel.isLiked(userId, commentId, "comment");

      if (isLiked) {
        await LikeModel.delete(userId, commentId, "comment");
      }

      // 좋아요 수 조회
      const likeCount = await LikeModel.getCount(commentId, "comment");

      log("INFO", `댓글 좋아요 취소 완료: ${commentId} by user ${userId}`);

      res.json({
        success: true,
        data: {
          commentId,
          likeCount,
          isLiked: false,
        },
        message: !isLiked
          ? "이미 좋아요가 취소된 상태입니다."
          : "댓글 좋아요를 취소했습니다.",
      });
    } catch (error) {
      log("ERROR", "댓글 좋아요 취소 실패", error);
      res.status(500).json({
        success: false,
        message: "댓글 좋아요 취소 중 오류가 발생했습니다.",
      });
    }
  }

  // 댓글 좋아요 사용자 목록 조회 (선택적 인증)
  static async getCommentLikes(req: Request, res: Response): Promise<void> {
    try {
      const { commentId } = req.params;
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "10", 10);

      if (!commentId) {
        res
          .status(400)
          .json({ success: false, message: "댓글 ID가 필요합니다." });
        return;
      }

      // 댓글 존재 확인
      const comment = await CommentModel.findById(commentId);
      if (!comment) {
        res
          .status(404)
          .json({ success: false, message: "댓글을 찾을 수 없습니다." });
        return;
      }

      const { users, total } = await LikeModel.getLikesUsersByTarget(
        commentId,
        "comment",
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
        message: "댓글 좋아요 사용자 목록을 성공적으로 조회했습니다.",
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: "댓글 좋아요 사용자 목록 조회 중 오류가 발생했습니다.",
      });
    }
  }
}
