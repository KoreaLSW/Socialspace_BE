import { Request, Response } from "express";
import { PostModel } from "../../models/Post";
import { PostImageModel } from "../../models/PostImage";
import { HashtagModel } from "../../models/Hashtag";
import { PostHashtagModel } from "../../models/PostHashtag";
import { LikeModel } from "../../models/Like"; // 좋아요 기능 추가
import { CommentModel } from "../../models/Comment"; // 댓글 수 기능 추가
import { UserModel } from "../../models/User"; // 알림 설정 확인용
import { log } from "../../utils/logger";
import { AuthenticatedRequest } from "../../middleware/auth";
import { pool } from "../../config/database";
import { NotificationModel } from "../../models/Notification";
import { PostViewModel } from "../../models/PostView";
import { FollowModel } from "../../models/Follow";
import { deleteMultipleImages } from "../../config/cloudinary";
import { getClientIp } from "../../utils/ip";

export class PostsController {
  // 게시글 생성
  static async createPost(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const {
        content,
        visibility,
        hide_likes,
        hide_views,
        allow_comments,
        images,
        hashtags,
      } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: "로그인이 필요합니다." });
        return;
      }

      // 내용 길이 검증
      if (!content || content.length > 2000) {
        res
          .status(400)
          .json({ error: "게시글 내용은 1자 이상 2000자 이하여야 합니다." });
        return;
      }

      // 게시글 생성
      const newPost = await PostModel.create({
        user_id: userId,
        content,
        visibility: visibility || "public",
        hide_likes: hide_likes || false,
        hide_views: hide_views || false,
        allow_comments: allow_comments !== undefined ? allow_comments : true,
      });

      // 이미지 저장
      if (images && Array.isArray(images) && images.length > 0) {
        await PostImageModel.createMultiple(newPost.id, images);
      }

      // 해시태그 처리
      if (hashtags && Array.isArray(hashtags) && hashtags.length > 0) {
        for (const tag of hashtags) {
          const hashtag = await HashtagModel.findOrCreate(tag);
          await PostHashtagModel.create({
            post_id: newPost.id,
            hashtag_id: hashtag.id,
          });
        }
      }

      log("INFO", `게시글 생성 성공: ${newPost.id} by user ${userId}`);

      // 알림: 내가 팔로우한 유저에게 새 게시글 알림
      try {
        const client = await pool.connect();
        const res = await client.query(
          `SELECT follower_id FROM follows WHERE following_id = $1 AND is_accepted = true`,
          [userId]
        );
        client.release();
        const followerIds: string[] = res.rows.map((r) => r.follower_id);
        // 각 팔로워의 알림 설정을 확인하여 알림 생성
        const notifRecords = [];
        for (const followerId of followerIds.filter((fid) => fid !== userId)) {
          const isNotificationEnabled = await UserModel.isNotificationEnabled(
            followerId,
            "followee_post"
          );
          if (isNotificationEnabled) {
            notifRecords.push({
              user_id: followerId,
              type: "followee_post",
              from_user_id: userId,
              target_id: newPost.id,
            });
          }
        }
        if (notifRecords.length > 0) {
          await NotificationModel.createManyIfNotExists(notifRecords);
        }
      } catch (e) {
        log("ERROR", "팔로워 새 게시글 알림 생성 실패", e);
      }

      res.status(201).json({
        success: true,
        data: newPost,
        message: "게시글이 성공적으로 생성되었습니다.",
      });
    } catch (error) {
      log("ERROR", "게시글 생성 실패", error);
      res.status(500).json({ error: "게시글 생성 중 오류가 발생했습니다." });
    }
  }

  // 게시글 목록 조회
  static async getPosts(req: Request, res: Response): Promise<void> {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      console.log("page", page);
      console.log("limit", limit);
      // 로그인 유저 정보 활용
      const userId = (req as any).user?.id;

      const { posts, total } = await PostModel.findAll(page, limit, userId);

      // 각 게시글의 이미지와 해시태그 정보 가져오기 + 조회수 비공개 처리
      const postsWithDetails = await Promise.all(
        posts.map(async (post) => {
          const images = await PostImageModel.findByPostId(post.id);
          const hashtags = await PostHashtagModel.getHashtagsByPostId(post.id);
          // 좋아요 정보 가져오기
          const likeCount = await LikeModel.getCount(post.id, "post");
          const isLiked = userId
            ? await LikeModel.isLiked(userId, post.id, "post")
            : false;

          // 댓글 수 가져오기
          const commentCount = await CommentModel.getCommentCount(post.id);

          // view_count 조회
          let viewCount: number | undefined = undefined;
          try {
            viewCount = await PostViewModel.getViewCount(post.id);
          } catch (e) {
            log("WARN", "view_count 조회 경고", e);
          }

          // 조회수 비공개 처리
          let filteredPost: any = {
            ...post,
            images,
            hashtags,
            like_count: likeCount,
            is_liked: isLiked,
            comment_count: commentCount,
            view_count: viewCount,
          };
          if (post.hide_views) {
            delete filteredPost.view_count;
          }
          return filteredPost;
        })
      );

      res.json({
        success: true,
        data: postsWithDetails,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        message: "게시글 목록을 성공적으로 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "게시글 목록 조회 실패", error);
      res
        .status(500)
        .json({ error: "게시글 목록 조회 중 오류가 발생했습니다." });
    }
  }

  // 특정 게시글 조회
  static async getPost(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const userId = (req as any).user?.id as string | undefined;

      const post = await PostModel.findById(id, userId);
      if (!post) {
        // 차단된 게시물이거나 존재하지 않는 게시물
        res.status(404).json({
          success: false,
          error: "게시글을 찾을 수 없습니다.",
        });
        return;
      }

      // 가시성 접근 제어
      const isOwner = userId && post.user_id === userId;
      let canView = false;
      if (post.visibility === "public") {
        canView = true;
      } else if (post.visibility === "followers") {
        const isFollowing = userId
          ? await FollowModel.isFollowing(userId, post.user_id)
          : false;
        canView = !!isOwner || isFollowing;
      } else if (post.visibility === "private") {
        canView = !!isOwner;
      }
      if (!canView) {
        res.status(403).json({
          success: false,
          message: "게시글을 볼 수 있는 권한이 없습니다.",
        });
        return;
      }

      // 이미지와 해시태그 정보 가져오기
      const images = await PostImageModel.findByPostId(post.id);
      const hashtags = await PostHashtagModel.getHashtagsByPostId(post.id);
      // 좋아요 정보 가져오기
      const likeCount = await LikeModel.getCount(post.id, "post");
      const isLiked = userId
        ? await LikeModel.isLiked(userId, post.id, "post")
        : false;

      // 댓글 수 가져오기
      const commentCount = await CommentModel.getCommentCount(post.id);

      // 조회 기록 남기기 (최초 1회만)
      try {
        if (userId) {
          await PostViewModel.recordView({
            post_id: post.id,
            user_id: userId,
            ip_address: null,
            view_duration: 0,
          });
        } else {
          const ip = getClientIp(req);
          if (ip) {
            await PostViewModel.recordView({
              post_id: post.id,
              user_id: null,
              ip_address: ip,
              view_duration: 0,
            });
          }
        }
      } catch (e) {
        log("WARN", "조회 기록 처리 중 경고", e);
      }

      // view_count 계산
      let viewCount: number | undefined = undefined;
      try {
        viewCount = await PostViewModel.getViewCount(post.id);
      } catch (e) {
        log("WARN", "view_count 계산 중 경고", e);
      }

      // 조회수 비공개 처리
      let filteredPost: any = {
        ...post,
        images,
        hashtags,
        like_count: likeCount,
        is_liked: isLiked,
        comment_count: commentCount,
        view_count: viewCount,
      };
      if (post.hide_views) {
        delete filteredPost.view_count;
      }

      res.json({
        success: true,
        data: filteredPost,
        message: "게시글을 성공적으로 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "게시글 조회 실패", error);
      res.status(500).json({ error: "게시글 조회 중 오류가 발생했습니다." });
    }
  }

  // 게시글 수정
  static async updatePost(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params;
      const {
        content,
        visibility,
        hide_likes,
        hide_views,
        allow_comments,
        images,
        hashtags,
      } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: "로그인이 필요합니다." });
        return;
      }

      // 게시글 존재 확인
      const existingPost = await PostModel.findById(id);
      if (!existingPost) {
        res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
        return;
      }

      // 작성자 확인
      if (existingPost.user_id !== userId) {
        res.status(403).json({ error: "게시글 수정 권한이 없습니다." });
        return;
      }

      // 내용 길이 검증
      if (content && content.length > 2000) {
        res
          .status(400)
          .json({ error: "게시글 내용은 2000자 이하여야 합니다." });
        return;
      }

      // 업데이트할 데이터 준비
      const updates: any = {};
      if (content !== undefined) updates.content = content;
      if (visibility !== undefined) updates.visibility = visibility;
      if (hide_likes !== undefined) updates.hide_likes = hide_likes;
      if (hide_views !== undefined) updates.hide_views = hide_views;
      if (allow_comments !== undefined) updates.allow_comments = allow_comments;

      // 게시글 수정
      const updatedPost = await PostModel.update(id, updates);

      // 이미지 업데이트 (기존 이미지 삭제 후 새로 추가)
      // 이미지 업데이트는 이번 스펙에서 미지원 → 무시

      log("INFO", `게시글 수정 성공: ${id} by user ${userId}`);

      res.json({
        success: true,
        data: updatedPost,
        message: "게시글이 성공적으로 수정되었습니다.",
      });
    } catch (error) {
      log("ERROR", "게시글 수정 실패", error);
      res.status(500).json({ error: "게시글 수정 중 오류가 발생했습니다." });
    }
  }

  // 게시글 삭제
  static async deletePost(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: "로그인이 필요합니다." });
        return;
      }

      // 게시글 존재 확인
      const existingPost = await PostModel.findById(id);
      if (!existingPost) {
        res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
        return;
      }

      // 작성자 확인
      if (existingPost.user_id !== userId) {
        res.status(403).json({ error: "게시글 삭제 권한이 없습니다." });
        return;
      }

      // Cloudinary 이미지 먼저 삭제 시도
      try {
        const images = await PostImageModel.findByPostId(id);
        const publicIds: string[] = [];
        for (const img of images) {
          const url = img?.image_url || "";
          if (!url) continue;
          try {
            const u = new URL(url);
            const segments = u.pathname.split("/");
            const uploadIdx = segments.findIndex((p) => p === "upload");
            if (uploadIdx >= 0) {
              let after = segments.slice(uploadIdx + 1);
              if (after[0]?.startsWith("v")) {
                after = after.slice(1);
              }
              const joined = after.join("/");
              const withoutExt = joined.replace(/\.[^/.]+$/, "");
              if (withoutExt) publicIds.push(withoutExt);
            }
          } catch (e) {
            // URL 파싱 실패는 무시
          }
        }
        if (publicIds.length > 0) {
          try {
            await deleteMultipleImages(publicIds);
          } catch (e) {
            log("WARN", "Cloudinary 이미지 삭제 실패", e);
          }
        }
      } catch (e) {
        log("WARN", "게시글 이미지 조회/삭제 중 경고", e);
      }

      // 관련 데이터 삭제 (DB)
      await PostImageModel.deleteByPostId(id);
      await PostHashtagModel.deleteByPostId(id);
      await PostModel.delete(id);

      log("INFO", `게시글 삭제 성공: ${id} by user ${userId}`);

      res.json({
        success: true,
        message: "게시글이 성공적으로 삭제되었습니다.",
      });
    } catch (error) {
      log("ERROR", "게시글 삭제 실패", error);
      res.status(500).json({ error: "게시글 삭제 중 오류가 발생했습니다." });
    }
  }

  // 사용자별 게시글 조회
  static async getUserPosts(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const viewerId = (req as any).user?.id as string | undefined;
      const { posts, total } = await PostModel.findByUserId(
        userId,
        page,
        limit,
        viewerId
      );

      // 각 게시글의 이미지와 해시태그 정보 가져오기
      const postsWithDetails = await Promise.all(
        posts.map(async (post) => {
          const images = await PostImageModel.findByPostId(post.id);
          const hashtags = await PostHashtagModel.getHashtagsByPostId(post.id);
          // 좋아요 정보 가져오기 (로그인한 사용자의 경우)
          const currentUserId = (req as any).user?.id;
          const likeCount = await LikeModel.getCount(post.id, "post");
          const isLiked = currentUserId
            ? await LikeModel.isLiked(currentUserId, post.id, "post")
            : false;

          // 댓글 수 가져오기
          const commentCount = await CommentModel.getCommentCount(post.id);

          return {
            ...post,
            images,
            hashtags,
            like_count: likeCount,
            is_liked: isLiked,
            comment_count: commentCount,
          };
        })
      );

      res.json({
        success: true,
        data: postsWithDetails,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        message: "사용자 게시글 목록을 성공적으로 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "사용자 게시글 조회 실패", error);
      res
        .status(500)
        .json({ error: "사용자 게시글 조회 중 오류가 발생했습니다." });
    }
  }

  // 내 게시글 조회
  static async getMyPosts(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ error: "로그인이 필요합니다." });
        return;
      }

      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;

      const { posts, total } = await PostModel.findByUserId(
        userId,
        page,
        limit
      );

      // 각 게시글의 이미지와 해시태그 정보 가져오기
      const postsWithDetails = await Promise.all(
        posts.map(async (post) => {
          const images = await PostImageModel.findByPostId(post.id);
          const hashtags = await PostHashtagModel.getHashtagsByPostId(post.id);
          return {
            ...post,
            images,
            hashtags,
          };
        })
      );

      res.json({
        success: true,
        data: postsWithDetails,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        message: "내 게시글 목록을 성공적으로 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "내 게시글 조회 실패", error);
      res.status(500).json({ error: "내 게시글 조회 중 오류가 발생했습니다." });
    }
  }

  // 해시태그별 게시글 조회
  static async getPostsByHashtag(req: Request, res: Response): Promise<void> {
    try {
      const { hashtagId } = req.params;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10;
      const viewerId = (req as any).user?.id as string | undefined;

      // 해시태그 존재 확인
      const hashtag = await HashtagModel.findById(hashtagId);
      if (!hashtag) {
        res.status(404).json({ error: "해시태그를 찾을 수 없습니다." });
        return;
      }

      const { posts, total } = await PostHashtagModel.getPostsByHashtagId(
        hashtagId,
        page,
        limit,
        viewerId
      );

      // 각 게시글의 이미지와 해시태그 정보 가져오기
      const postsWithDetails = await Promise.all(
        posts.map(async (post) => {
          const images = await PostImageModel.findByPostId(post.id);
          const hashtags = await PostHashtagModel.getHashtagsByPostId(post.id);

          // 좋아요 정보 가져오기 (로그인한 사용자의 경우)
          const currentUserId = (req as any).user?.id;
          const likeCount = await LikeModel.getCount(post.id, "post");
          const isLiked = currentUserId
            ? await LikeModel.isLiked(currentUserId, post.id, "post")
            : false;

          return {
            ...post,
            images,
            hashtags,
            like_count: likeCount,
            is_liked: isLiked,
          };
        })
      );

      res.json({
        success: true,
        data: postsWithDetails,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        message: "해시태그 게시글 목록을 성공적으로 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "해시태그 게시글 조회 실패", error);
      res
        .status(500)
        .json({ error: "해시태그 게시글 조회 중 오류가 발생했습니다." });
    }
  }

  // 게시글 좋아요
  static async likePost(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id: postId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: "로그인이 필요합니다." });
        return;
      }

      // 게시글 존재 확인
      const post = await PostModel.findById(postId);
      if (!post) {
        res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
        return;
      }

      // 이미 좋아요를 눌렀는지 확인
      const isAlreadyLiked = await LikeModel.isLiked(userId, postId, "post");

      // 좋아요가 이미 되어있다면 아무 것도 하지 않음
      if (!isAlreadyLiked) {
        await LikeModel.create({
          user_id: userId,
          target_id: postId,
          target_type: "post",
        });

        // 알림: 내 게시물에 좋아요가 눌렸을 때 (자기 자신 제외)
        if (post.user_id && post.user_id !== userId) {
          try {
            // 게시물 작성자의 좋아요 알림 설정 확인
            const isLikeNotificationEnabled =
              await UserModel.isNotificationEnabled(post.user_id, "post_liked");

            if (isLikeNotificationEnabled) {
              await NotificationModel.createManyIfNotExists([
                {
                  user_id: post.user_id,
                  type: "post_liked",
                  from_user_id: userId,
                  target_id: postId,
                },
              ]);
            }
          } catch (e) {
            log("ERROR", "게시물 좋아요 알림 생성 실패", e);
          }
        }
      }

      // 좋아요 수 조회
      const likeCount = await LikeModel.getCount(postId, "post");

      log("INFO", `게시글 좋아요 처리 완료: ${postId} by user ${userId}`);

      res.json({
        success: true,
        data: {
          postId,
          likeCount,
          isLiked: true,
        },
        message: isAlreadyLiked
          ? "이미 좋아요된 상태입니다."
          : "게시글에 좋아요를 추가했습니다.",
      });
    } catch (error) {
      log("ERROR", "게시글 좋아요 실패", error);
      res.status(500).json({ error: "좋아요 처리 중 오류가 발생했습니다." });
    }
  }

  // 게시글 좋아요 취소
  static async unlikePost(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { id: postId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: "로그인이 필요합니다." });
        return;
      }

      const post = await PostModel.findById(postId);
      if (!post) {
        res.status(404).json({ error: "게시글을 찾을 수 없습니다." });
        return;
      }

      const isLiked = await LikeModel.isLiked(userId, postId, "post");

      // 이미 좋아요가 없는 상태면 아무 것도 하지 않음
      if (isLiked) {
        await LikeModel.delete(userId, postId, "post");
      }

      const likeCount = await LikeModel.getCount(postId, "post");

      log("INFO", `게시글 좋아요 취소 처리 완료: ${postId} by user ${userId}`);

      res.json({
        success: true,
        data: {
          postId,
          likeCount,
          isLiked: false,
        },
        message: isLiked
          ? "게시글 좋아요를 취소했습니다."
          : "이미 좋아요가 취소된 상태입니다.",
      });
    } catch (error) {
      log("ERROR", "게시글 좋아요 취소 실패", error);
      res
        .status(500)
        .json({ error: "좋아요 취소 처리 중 오류가 발생했습니다." });
    }
  }

  // 게시글 좋아요 사용자 목록 조회
  static async getPostLikes(req: Request, res: Response): Promise<void> {
    try {
      const { id: postId } = req.params;
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "10", 10);

      // 게시글 존재 확인
      const post = await PostModel.findById(postId);
      if (!post) {
        res
          .status(404)
          .json({ success: false, message: "게시글을 찾을 수 없습니다." });
        return;
      }

      const { users, total } = await LikeModel.getLikesUsersByTarget(
        postId,
        "post",
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
        message: "게시글 좋아요 사용자 목록을 성공적으로 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "게시글 좋아요 사용자 목록 조회 실패", error);
      res
        .status(500)
        .json({ success: false, message: "목록 조회 중 오류가 발생했습니다." });
    }
  }

  // 사용자가 좋아요한 게시글 조회 (선택적 인증)
  static async getUserLikedPosts(req: Request, res: Response): Promise<void> {
    try {
      const { userId } = req.params;
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "10", 10);

      const client = await pool.connect();

      const viewerId = (req as any).user?.id as string | undefined;
      const params: any[] = [userId];
      // viewer 기준으로 visibility 필터링
      let visibilityWhere = " AND p.visibility = 'public'";
      if (viewerId) {
        visibilityWhere = `
          AND (
            p.visibility = 'public'
            OR (p.visibility = 'followers' AND (
              p.user_id = $2 OR EXISTS (
                SELECT 1 FROM follows f
                WHERE f.follower_id = $2 AND f.following_id = p.user_id AND f.is_accepted = true
              )
            ))
            OR (p.visibility = 'private' AND p.user_id = $2)
          )
        `;
        params.push(viewerId);
      }

      // 전체 개수 조회
      const countQuery = `
        SELECT COUNT(*) FROM likes l
        JOIN posts p ON p.id = l.target_id
        WHERE l.user_id = $1 AND l.target_type = 'post' ${visibilityWhere}
      `;
      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0]?.count || "0", 10);

      const offset = (page - 1) * limit;
      const selectQuery = `
        SELECT p.*, u.username, u.nickname, u.profile_image
        FROM likes l
        JOIN posts p ON p.id = l.target_id
        JOIN users u ON p.user_id = u.id
        WHERE l.user_id = $1 AND l.target_type = 'post' ${visibilityWhere}
        ORDER BY l.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      const result = await client.query(selectQuery, [
        ...params,
        limit,
        offset,
      ]);
      client.release();

      const rawPosts = result.rows.map((row) => ({
        id: row.id,
        user_id: row.user_id,
        content: row.content,
        thumbnail_url: row.thumbnail_url,
        og_link: row.og_link,
        visibility: row.visibility,
        hide_likes: row.hide_likes,
        hide_views: row.hide_views,
        allow_comments: row.allow_comments,
        created_at: row.created_at,
        updated_at: row.updated_at,
        is_edited: row.is_edited,
        author: {
          id: row.user_id,
          username: row.username,
          nickname: row.nickname,
          profileImage: row.profile_image,
        },
      }));

      // 각 게시글의 이미지, 해시태그, 좋아요/댓글 수, is_liked 보강
      const postsWithDetails = await Promise.all(
        rawPosts.map(async (post: any) => {
          const images = await PostImageModel.findByPostId(post.id);
          const hashtags = await PostHashtagModel.getHashtagsByPostId(post.id);
          const currentUserId = (req as any).user?.id;
          const likeCount = await LikeModel.getCount(post.id, "post");
          const isLiked = currentUserId
            ? await LikeModel.isLiked(currentUserId, post.id, "post")
            : false;
          const commentCount = await CommentModel.getCommentCount(post.id);

          return {
            ...post,
            images,
            hashtags,
            like_count: likeCount,
            is_liked: isLiked,
            comment_count: commentCount,
          };
        })
      );

      res.json({
        success: true,
        data: postsWithDetails,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        message: "사용자가 좋아요한 게시글을 성공적으로 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "사용자 좋아요 게시글 조회 실패", error);
      res.status(500).json({
        success: false,
        message: "사용자 좋아요 게시글 조회 중 오류가 발생했습니다.",
      });
    }
  }
}
