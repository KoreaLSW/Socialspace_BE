import express from "express";
import { PostsController } from "../controllers/posts/postsController";
import { ImageController, upload } from "../controllers/posts/imageController";
import { authenticateToken, optionalAuth } from "../middleware/auth";
import { silentBlockForLikes } from "../middleware/silentBlock";

const router = express.Router();

// 이미지 업로드 라우트 (게시글 라우트보다 먼저 정의)
router.post(
  "/upload/single",
  authenticateToken,
  upload.single("image"),
  ImageController.uploadSingleImage
);
router.post(
  "/upload/multiple",
  authenticateToken,
  upload.array("images", 5),
  ImageController.uploadMultipleImages
);
router.post(
  "/upload/base64",
  authenticateToken,
  ImageController.uploadBase64Image
);
router.delete(
  "/images/:publicId",
  authenticateToken,
  ImageController.deleteImage
);

// 게시글 생성 (NextAuth 세션 인증 필요)
router.post("/", authenticateToken, PostsController.createPost);

// 내 게시글 조회 (인증 필요)
router.get("/my", authenticateToken, PostsController.getMyPosts);

// 게시글 목록 조회 (선택적 인증 - 로그인한 사용자의 경우 추가 정보 제공)
router.get("/", optionalAuth, PostsController.getPosts);

// 사용자별 게시글 조회 (선택적 인증)
router.get("/user/:userId", optionalAuth, PostsController.getUserPosts);
// 사용자가 좋아요한 게시글 조회 (선택적 인증)
router.get(
  "/user/:userId/likes",
  optionalAuth,
  PostsController.getUserLikedPosts
);

// 해시태그별 게시글 조회 (선택적 인증)
router.get(
  "/hashtag/:hashtagId",
  optionalAuth,
  PostsController.getPostsByHashtag
);

// 특정 게시글 조회 (선택적 인증)
router.get("/:id", optionalAuth, PostsController.getPost);

// 게시글 수정 (NextAuth 세션 인증 필요)
router.put("/:id", authenticateToken, PostsController.updatePost);

// 게시글 삭제 (NextAuth 세션 인증 필요)
router.delete("/:id", authenticateToken, PostsController.deletePost);

// 게시글 좋아요 (투명한 차단 처리)
router.post(
  "/:id/like",
  authenticateToken,
  silentBlockForLikes,
  PostsController.likePost
);

// 게시글 좋아요 취소 (투명한 차단 처리)
router.delete(
  "/:id/like",
  authenticateToken,
  silentBlockForLikes,
  PostsController.unlikePost
);

// 게시글 좋아요 사용자 목록 (선택적 인증)
router.get("/:id/likes", optionalAuth, PostsController.getPostLikes);

export default router;
