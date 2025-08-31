import { Request, Response } from "express";
import { UserModel, User, NextAuthGoogleUser } from "../models/User";
import { FollowModel } from "../models/Follow";
import { log } from "../utils/logger";
import { AuthenticatedRequest } from "../middleware/auth";
import { pool } from "../config/database";

// 이메일에서 고유한 사용자명 생성
const generateUniqueUsername = async (email: string): Promise<string> => {
  const baseUsername = email.split("@")[0];
  let username = baseUsername;
  let counter = 1;

  // 중복 확인 및 고유한 사용자명 생성
  while (await UserModel.findByUsername(username)) {
    username = `${baseUsername}${counter}`;
    counter++;
  }

  return username;
};

// 팔로워 수 조회 (Follow 모델 사용)
const getFollowersCount = async (userId: string): Promise<number> => {
  return await FollowModel.getFollowersCount(userId);
};

// 팔로잉 수 조회 (Follow 모델 사용)
const getFollowingCount = async (userId: string): Promise<number> => {
  return await FollowModel.getFollowingCount(userId);
};

// 게시물 수 조회
const getPostsCount = async (userId: string): Promise<number> => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT COUNT(*) as count FROM posts WHERE user_id = $1",
      [userId]
    );
    client.release();
    return parseInt(result.rows[0].count);
  } catch (error) {
    log("ERROR", "게시물 수 조회 실패", error);
    return 0;
  }
};

// Google OAuth 로그인 처리 (사용자 정보 생성/업데이트)
export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { googleId, email, name, image } = req.body;

    // 필수 데이터 검증
    if (!googleId || !email) {
      res.status(400).json({
        success: false,
        message: "필수 정보가 누락되었습니다 (googleId, email)",
      });
      return;
    }

    // 기존 사용자 확인
    let user = await UserModel.findByEmail(email);

    if (user) {
      // 프로필 이미지 업데이트 (사용자가 직접 설정한 이미지가 아닌 경우에만)
      if (image && user.profileImage !== image && !user.isCustomProfileImage) {
        user.profileImage = image;
        await UserModel.update(user.id, { profileImage: image });
      }
    } else {
      // 새 사용자 생성
      const newUser: NextAuthGoogleUser = {
        googleId,
        email,
        name: name || email.split("@")[0],
        picture: image,
        emailVerified: true,
      };

      user = await UserModel.create(newUser);
    }

    res.json({
      success: true,
      message: "Google 로그인 성공",
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          nickname: user.nickname,
          bio: user.bio,
          profileImage: user.profileImage,
          isCustomProfileImage: user.isCustomProfileImage,
          visibility: user.visibility,
          followApprovalMode: user.followApprovalMode,
          showMutualFollow: user.showMutualFollow,
          role: user.role,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    log("ERROR", "Google 로그인 실패", error);
    res.status(500).json({
      success: false,
      message: "로그인 처리 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// 현재 사용자 정보 조회
export const getCurrentUser = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    // 데이터베이스에서 최신 사용자 정보 조회
    const user = await UserModel.findById(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다",
      });
      return;
    }

    // 팔로워/팔로잉/게시물 수 조회
    const followersCount = await getFollowersCount(userId);
    const followingCount = await getFollowingCount(userId);
    const postsCount = await getPostsCount(userId);

    res.json({
      success: true,
      message: "사용자 정보 조회 성공",
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        nickname: user.nickname,
        bio: user.bio,
        profileImage: user.profileImage,
        visibility: user.visibility,
        followApprovalMode: user.followApprovalMode,
        showMutualFollow: user.showMutualFollow,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        followersCount,
        followingCount,
        postsCount,
      },
    });
  } catch (error) {
    log("ERROR", "사용자 정보 조회 실패", error);
    res.status(500).json({
      success: false,
      message: "사용자 정보 조회 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// 사용자 프로필 업데이트
export const updateProfile = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const {
      nickname,
      bio,
      visibility,
      profileImage,
      isCustomProfileImage,
      followApprovalMode,
      showMutualFollow,
    } = req.body;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    // 업데이트할 데이터 준비
    const updateData: Partial<User> = {};
    if (nickname !== undefined) updateData.nickname = nickname;
    if (bio !== undefined) updateData.bio = bio;
    if (visibility !== undefined) updateData.visibility = visibility;
    if (profileImage !== undefined)
      (updateData as any).profileImage = profileImage;
    if (isCustomProfileImage !== undefined)
      updateData.isCustomProfileImage = isCustomProfileImage;
    if (followApprovalMode !== undefined)
      updateData.followApprovalMode = followApprovalMode;
    if (showMutualFollow !== undefined)
      updateData.showMutualFollow = showMutualFollow;

    // 업데이트 실행
    const user = await UserModel.update(userId, updateData);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다",
      });
      return;
    }

    res.json({
      success: true,
      message: "프로필 업데이트 성공",
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          nickname: user.nickname,
          bio: user.bio,
          profileImage: user.profileImage,
          isCustomProfileImage: user.isCustomProfileImage,
          visibility: user.visibility,
          followApprovalMode: user.followApprovalMode,
          role: user.role,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    log("ERROR", "프로필 업데이트 실패", error);
    res.status(500).json({
      success: false,
      message: "프로필 업데이트 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// 로그아웃 처리 (세션 정리)
export const logout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (userId) {
      console.log("🔐 사용자 로그아웃:", userId);
      log("INFO", "사용자 로그아웃", { userId });
    }

    res.json({
      success: true,
      message: "로그아웃 성공",
    });
  } catch (error) {
    log("ERROR", "로그아웃 처리 실패", error);
    res.status(500).json({
      success: false,
      message: "로그아웃 처리 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// 추천 유저(팔로우하지 않은 인기 유저 + 친구의 친구)
export const getRecommendedUsers = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: "로그인이 필요합니다." });
      return;
    }
    const limit = parseInt(req.query.limit as string) || 10;
    const users = await UserModel.getSuggestedUsers(userId, limit);
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: "추천 유저 조회 중 오류",
      error: error instanceof Error ? error.message : error,
    });
  }
};

// username으로 사용자 프로필 조회
export const getUserProfileByUsername = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const { username } = req.params;
    const viewerId = req.user?.id;

    if (!username) {
      res.status(400).json({
        success: false,
        message: "사용자명이 필요합니다",
      });
      return;
    }

    // 데이터베이스에서 사용자 정보 조회
    const user = await UserModel.findByUsername(username);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다",
      });
      return;
    }

    // 프로필 접근 권한 확인
    const isOwner = viewerId === user.id;
    let hasAccess = isOwner || user.visibility === "public";

    if (user.visibility === "followers" && viewerId && !isOwner) {
      // 팔로우 상태 확인
      hasAccess = await FollowModel.isFollowing(viewerId, user.id);
    }

    // 디버깅 로그 추가
    log("INFO", "프로필 접근 권한 확인", {
      username,
      viewerId,
      userId: user.id,
      visibility: user.visibility,
      isOwner,
      hasAccess,
    });

    if (!hasAccess) {
      // 접근 제한 시에도 성공 응답으로 처리 (기본 프로필 정보 포함)
      res.json({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          username: user.username,
          nickname: user.nickname,
          bio: user.bio,
          profileImage: user.profileImage,
          isCustomProfileImage: user.isCustomProfileImage,
          visibility: user.visibility,
          followApprovalMode: user.followApprovalMode,
          showMutualFollow: user.showMutualFollow,
          role: user.role,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          followersCount: await getFollowersCount(user.id),
          followingCount: await getFollowingCount(user.id),
          postsCount: await getPostsCount(user.id),
          accessDenied: true,
          message: "이 프로필에 접근할 수 없습니다",
        },
      });
      return;
    }

    // 팔로워/팔로잉/게시물 수 조회
    const followersCount = await getFollowersCount(user.id);
    const followingCount = await getFollowingCount(user.id);
    const postsCount = await getPostsCount(user.id);

    res.json({
      success: true,
      message: "사용자 프로필 조회 성공",
      data: {
        id: user.id,
        email: user.email,
        username: user.username,
        nickname: user.nickname,
        bio: user.bio,
        profileImage: user.profileImage,
        isCustomProfileImage: user.isCustomProfileImage,
        visibility: user.visibility,
        followApprovalMode: user.followApprovalMode,
        showMutualFollow: user.showMutualFollow,
        role: user.role,
        emailVerified: user.emailVerified,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        followersCount,
        followingCount,
        postsCount,
      },
    });
  } catch (error) {
    log("ERROR", "사용자 프로필 조회 실패 (username)", error);
    res.status(500).json({
      success: false,
      message: "사용자 프로필 조회 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// 팔로우 상태 확인
export const checkFollowStatus = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { targetUserId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    const data = await FollowModel.checkFollowStatus(userId, targetUserId);

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    log("ERROR", "팔로우 상태 확인 실패", error);
    res.status(500).json({
      success: false,
      message: "팔로우 상태 확인 중 오류가 발생했습니다",
    });
  }
};

// 팔로우/언팔로우
export const toggleFollow = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { targetUserId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    if (userId === targetUserId) {
      res.status(400).json({
        success: false,
        message: "자기 자신을 팔로우할 수 없습니다",
      });
      return;
    }

    const result = await FollowModel.toggleFollow(userId, targetUserId);

    res.json({
      success: true,
      message: result.isFollowing ? "팔로우했습니다" : "팔로우를 취소했습니다",
      data: result,
    });
  } catch (error) {
    log("ERROR", "팔로우/언팔로우 실패", error);
    res.status(500).json({
      success: false,
      message: "팔로우 처리 중 오류가 발생했습니다",
    });
  }
};

// 친한친구 추가/제거
export const toggleFavorite = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { targetUserId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    const result = await FollowModel.toggleFavorite(userId, targetUserId);

    res.json({
      success: true,
      message: result.isFavorite
        ? "친한친구에 추가했습니다"
        : "친한친구에서 제거했습니다",
      data: result,
    });
  } catch (error) {
    log("ERROR", "친한친구 처리 실패", error);
    res.status(500).json({
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "친한친구 처리 중 오류가 발생했습니다",
    });
  }
};

// 친한친구 목록 조회
export const getFavorites = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    const result = await FollowModel.getFavorites(userId, page, limit);

    res.json({
      success: true,
      data: result.users,
      pagination: result.pagination,
    });
  } catch (error) {
    log("ERROR", "친한친구 목록 조회 실패", error);
    res.status(500).json({
      success: false,
      message: "친한친구 목록 조회 중 오류가 발생했습니다",
    });
  }
};

// 차단하기/차단해제
export const toggleBlock = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { targetUserId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    if (userId === targetUserId) {
      res.status(400).json({
        success: false,
        message: "자기 자신을 차단할 수 없습니다",
      });
      return;
    }

    const result = await FollowModel.toggleBlock(userId, targetUserId);

    res.json({
      success: true,
      message: result.isBlocked
        ? "사용자를 차단했습니다"
        : "차단을 해제했습니다",
      data: result,
    });
  } catch (error) {
    log("ERROR", "차단 처리 실패", error);
    res.status(500).json({
      success: false,
      message: "차단 처리 중 오류가 발생했습니다",
    });
  }
};

// 차단된 사용자 목록 조회
export const getBlockedUsers = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    const result = await FollowModel.getBlockedUsers(userId, page, limit);

    res.json({
      success: true,
      data: result.users,
      pagination: result.pagination,
    });
  } catch (error) {
    log("ERROR", "차단된 사용자 목록 조회 실패", error);
    res.status(500).json({
      success: false,
      message: "차단된 사용자 목록 조회 중 오류가 발생했습니다",
    });
  }
};

// 받은 팔로우 요청 목록 조회
export const getFollowRequests = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const page = parseInt((req.query.page as string) || "1", 10);
    const limit = parseInt((req.query.limit as string) || "20", 10);

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    const result = await FollowModel.getFollowRequests(userId, page, limit);

    res.json({
      success: true,
      data: result.requests,
      pagination: result.pagination,
    });
  } catch (error) {
    log("ERROR", "팔로우 요청 목록 조회 실패", error);
    res.status(500).json({
      success: false,
      message: "팔로우 요청 목록 조회 중 오류가 발생했습니다",
    });
  }
};

// 팔로우 요청 승인
export const approveFollowRequest = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { requesterId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    await FollowModel.approveFollowRequest(userId, requesterId);

    res.json({
      success: true,
      message: "팔로우 요청을 승인했습니다",
    });
  } catch (error: any) {
    log("ERROR", "팔로우 요청 승인 실패", error);
    res.status(400).json({
      success: false,
      message: error.message || "팔로우 요청 승인 중 오류가 발생했습니다",
    });
  }
};

// 팔로우 요청 거절
export const rejectFollowRequest = async (
  req: AuthenticatedRequest,
  res: Response
) => {
  try {
    const userId = req.user?.id;
    const { requesterId } = req.params;

    if (!userId) {
      res.status(401).json({
        success: false,
        message: "인증이 필요합니다",
      });
      return;
    }

    await FollowModel.rejectFollowRequest(userId, requesterId);

    res.json({
      success: true,
      message: "팔로우 요청을 거절했습니다",
    });
  } catch (error: any) {
    log("ERROR", "팔로우 요청 거절 실패", error);
    res.status(400).json({
      success: false,
      message: error.message || "팔로우 요청 거절 중 오류가 발생했습니다",
    });
  }
};
