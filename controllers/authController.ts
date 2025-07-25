import { Request, Response } from "express";
import { UserModel, User, NextAuthGoogleUser } from "../models/User";
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

// 팔로워 수 조회
const getFollowersCount = async (userId: string): Promise<number> => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT COUNT(*) as count FROM follows WHERE following_id = $1 AND is_accepted = true",
      [userId]
    );
    client.release();
    return parseInt(result.rows[0].count);
  } catch (error) {
    log("ERROR", "팔로워 수 조회 실패", error);
    return 0;
  }
};

// 팔로잉 수 조회
const getFollowingCount = async (userId: string): Promise<number> => {
  try {
    const client = await pool.connect();
    const result = await client.query(
      "SELECT COUNT(*) as count FROM follows WHERE follower_id = $1 AND is_accepted = true",
      [userId]
    );
    client.release();
    return parseInt(result.rows[0].count);
  } catch (error) {
    log("ERROR", "팔로잉 수 조회 실패", error);
    return 0;
  }
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

    console.log("🔍 Google 로그인 요청:", {
      googleId,
      email,
      name,
      hasImage: !!image,
    });

    // 기존 사용자 확인
    let user = await UserModel.findByEmail(email);

    if (user) {
      // 기존 사용자 정보 업데이트
      console.log("✅ 기존 사용자 로그인:", user.email);

      // 프로필 이미지 업데이트 (변경된 경우)
      if (image && user.profileImage !== image) {
        user.profileImage = image;
        await UserModel.update(user.id, { profileImage: image });
      }
    } else {
      // 새 사용자 생성
      console.log("🆕 새 사용자 생성:", email);

      const newUser: NextAuthGoogleUser = {
        googleId,
        email,
        name: name || email.split("@")[0],
        picture: image,
        emailVerified: true,
      };

      user = await UserModel.create(newUser);
      console.log("✅ 새 사용자 생성 완료:", user.username);
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
          visibility: user.visibility,
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
    const { nickname, bio, visibility } = req.body;

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
          visibility: user.visibility,
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
    console.log("getRecommendedUsers", userId);
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
export const getUserProfileByUsername = async (req: Request, res: Response) => {
  try {
    const { username } = req.params;

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
        visibility: user.visibility,
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

    const client = await pool.connect();

    // 팔로우 상태 확인
    const followResult = await client.query(
      "SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2",
      [userId, targetUserId]
    );

    // 친한친구 상태 확인
    const favoriteResult = await client.query(
      "SELECT * FROM user_favorites WHERE user_id = $1 AND favorite_id = $2",
      [userId, targetUserId]
    );

    // 차단 상태 확인
    const blockResult = await client.query(
      "SELECT * FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2",
      [userId, targetUserId]
    );

    client.release();

    res.json({
      success: true,
      data: {
        isFollowing: followResult.rows.length > 0,
        isFavorite: favoriteResult.rows.length > 0,
        isBlocked: blockResult.rows.length > 0,
      },
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

    const client = await pool.connect();

    // 현재 팔로우 상태 확인
    const existingFollow = await client.query(
      "SELECT * FROM follows WHERE follower_id = $1 AND following_id = $2",
      [userId, targetUserId]
    );

    if (existingFollow.rows.length > 0) {
      // 언팔로우
      await client.query(
        "DELETE FROM follows WHERE follower_id = $1 AND following_id = $2",
        [userId, targetUserId]
      );
      client.release();

      res.json({
        success: true,
        message: "팔로우를 취소했습니다",
        data: { isFollowing: false },
      });
    } else {
      // 팔로우
      await client.query(
        "INSERT INTO follows (follower_id, following_id) VALUES ($1, $2)",
        [userId, targetUserId]
      );
      client.release();

      res.json({
        success: true,
        message: "팔로우했습니다",
        data: { isFollowing: true },
      });
    }
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

    const client = await pool.connect();

    // 현재 친한친구 상태 확인
    const existingFavorite = await client.query(
      "SELECT * FROM user_favorites WHERE user_id = $1 AND favorite_id = $2",
      [userId, targetUserId]
    );

    if (existingFavorite.rows.length > 0) {
      // 친한친구 제거
      await client.query(
        "DELETE FROM user_favorites WHERE user_id = $1 AND favorite_id = $2",
        [userId, targetUserId]
      );
      client.release();

      res.json({
        success: true,
        message: "친한친구에서 제거했습니다",
        data: { isFavorite: false },
      });
    } else {
      // 친한친구 추가
      await client.query(
        "INSERT INTO user_favorites (user_id, favorite_id) VALUES ($1, $2)",
        [userId, targetUserId]
      );
      client.release();

      res.json({
        success: true,
        message: "친한친구에 추가했습니다",
        data: { isFavorite: true },
      });
    }
  } catch (error) {
    log("ERROR", "친한친구 처리 실패", error);
    res.status(500).json({
      success: false,
      message: "친한친구 처리 중 오류가 발생했습니다",
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

    const client = await pool.connect();

    // 현재 차단 상태 확인
    const existingBlock = await client.query(
      "SELECT * FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2",
      [userId, targetUserId]
    );

    if (existingBlock.rows.length > 0) {
      // 차단 해제
      await client.query(
        "DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2",
        [userId, targetUserId]
      );
      client.release();

      res.json({
        success: true,
        message: "차단을 해제했습니다",
        data: { isBlocked: false },
      });
    } else {
      // 차단하기 (팔로우 관계도 자동 삭제)
      await client.query("BEGIN");

      // 팔로우 관계 삭제
      await client.query(
        "DELETE FROM follows WHERE (follower_id = $1 AND following_id = $2) OR (follower_id = $2 AND following_id = $1)",
        [userId, targetUserId]
      );

      // 친한친구 관계 삭제
      await client.query(
        "DELETE FROM user_favorites WHERE (user_id = $1 AND favorite_id = $2) OR (user_id = $2 AND favorite_id = $1)",
        [userId, targetUserId]
      );

      // 차단 추가
      await client.query(
        "INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)",
        [userId, targetUserId]
      );

      await client.query("COMMIT");
      client.release();

      res.json({
        success: true,
        message: "사용자를 차단했습니다",
        data: { isBlocked: true },
      });
    }
  } catch (error) {
    log("ERROR", "차단 처리 실패", error);
    res.status(500).json({
      success: false,
      message: "차단 처리 중 오류가 발생했습니다",
    });
  }
};
