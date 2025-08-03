import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import { CommentModel, Comment, CreateCommentData } from "../models/Comment";
import { LikeModel } from "../models/Like";
import { log } from "../utils/logger";

export class CommentsController {
  // 댓글 생성
  static async createComment(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { post_id, content, parent_id } = req.body;
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
      };

      const comment = await CommentModel.create(commentData);

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

      if (!postId) {
        res.status(400).json({
          success: false,
          message: "게시글 ID가 필요합니다.",
        });
        return;
      }

      const comments = await CommentModel.findByPostId(postId, user_id);

      res.status(200).json({
        success: true,
        message: "댓글 목록을 가져왔습니다.",
        data: comments,
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

      if (!commentId) {
        res.status(400).json({
          success: false,
          message: "댓글 ID가 필요합니다.",
        });
        return;
      }

      const replies = await CommentModel.findRepliesByParentId(
        commentId,
        user_id
      );

      res.status(200).json({
        success: true,
        message: "대댓글 목록을 가져왔습니다.",
        data: replies,
      });
    } catch (error) {
      log("ERROR", "대댓글 조회 오류", error);
      res.status(500).json({
        success: false,
        message: "대댓글 조회 중 오류가 발생했습니다.",
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
}
