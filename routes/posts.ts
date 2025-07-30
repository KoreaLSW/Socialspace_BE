import express from "express";
import { PostsController } from "../controllers/posts/postsController";
import { ImageController, upload } from "../controllers/posts/imageController";
import { authenticateToken, optionalAuth } from "../middleware/auth";

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

<<<<<<< HEAD
=======
// 게시글 좋아요 (NextAuth 세션 인증 필요)
router.post("/:id/like", authenticateToken, PostsController.likePost);

// 게시글 좋아요 취소 (NextAuth 세션 인증 필요)
router.delete("/:id/like", authenticateToken, PostsController.unlikePost);

>>>>>>> 86c2461 (좋아요 기능 추가)
export default router;
