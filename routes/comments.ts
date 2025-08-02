import express from "express";
import { CommentsController } from "../controllers/commentsController";
import { authenticateToken, optionalAuth } from "../middleware/auth";

const router = express.Router();

// 댓글 생성
router.post("/", authenticateToken, CommentsController.createComment);

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

export default router;
