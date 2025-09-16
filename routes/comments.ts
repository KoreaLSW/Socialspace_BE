import express from "express";
import { CommentsController } from "../controllers/commentsController";
import { authenticateToken, optionalAuth } from "../middleware/auth";
import {
  silentBlockForComments,
  silentBlockForLikes,
} from "../middleware/silentBlock";

const router = express.Router();

// 댓글 생성 (투명한 차단 처리)
router.post(
  "/",
  authenticateToken,
  silentBlockForComments,
  CommentsController.createComment
);

// 게시글의 댓글 목록 조회 (선택적 인증)
router.get(
  "/post/:postId",
  optionalAuth,
  CommentsController.getCommentsByPostId
);

// 댓글의 대댓글 조회 (선택적 인증)
router.get(
  "/:commentId/replies",
  optionalAuth,
  CommentsController.getRepliesByCommentId
);

// 댓글 수정
router.put("/:commentId", authenticateToken, CommentsController.updateComment);

// 댓글 삭제
router.delete(
  "/:commentId",
  authenticateToken,
  CommentsController.deleteComment
);

// 게시글의 댓글 수 조회
router.get("/post/:postId/count", CommentsController.getCommentCount);

// 댓글 좋아요 (투명한 차단 처리)
router.post(
  "/:commentId/like",
  authenticateToken,
  silentBlockForLikes,
  CommentsController.likeComment
);

// 댓글 좋아요 취소 (투명한 차단 처리)
router.delete(
  "/:commentId/like",
  authenticateToken,
  silentBlockForLikes,
  CommentsController.unlikeComment
);

// 댓글 좋아요 사용자 목록 (선택적 인증)
router.get(
  "/:commentId/likes",
  optionalAuth,
  CommentsController.getCommentLikes
);

// 댓글 기본정보 조회 (포스트 매핑용)
router.get("/:commentId/basic", CommentsController.getCommentBasic);

// 특정 댓글의 페이지 계산 (limit 쿼리 사용 가능)
router.get("/:commentId/page", CommentsController.getCommentPage);

// 단일 댓글 조회 (선택적 인증)
router.get("/:commentId", optionalAuth, CommentsController.getCommentById);

export default router;
