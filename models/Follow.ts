import { pool } from "../config/database";
import { log } from "../utils/logger";

export interface FollowListItem {
  id: string;
  username: string;
  nickname: string;
  profile_image?: string;
  followers?: number;
}

export class FollowModel {
  static async isFollowing(
    followerId: string,
    followingId: string
  ): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND is_accepted = true",
        [followerId, followingId]
      );
      client.release();
      return result.rows.length > 0;
    } catch (error) {
      log("ERROR", "isFollowing 실패", error);
      throw error;
    }
  }

  static async isFavorite(
    userId: string,
    targetUserId: string
  ): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT 1 FROM user_favorites WHERE user_id = $1 AND favorite_id = $2",
        [userId, targetUserId]
      );
      client.release();
      return result.rows.length > 0;
    } catch (error) {
      log("ERROR", "isFavorite 실패", error);
      throw error;
    }
  }

  static async isBlocked(
    blockerId: string,
    blockedId: string
  ): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2",
        [blockerId, blockedId]
      );
      client.release();
      return result.rows.length > 0;
    } catch (error) {
      log("ERROR", "isBlocked 실패", error);
      throw error;
    }
  }

  static async getAcceptedFollowingIds(
    followerId: string
  ): Promise<Set<string>> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT following_id FROM follows WHERE follower_id = $1 AND is_accepted = true",
        [followerId]
      );
      client.release();
      const ids = result.rows.map((r) => r.following_id as string);
      return new Set(ids);
    } catch (error) {
      log("ERROR", "getAcceptedFollowingIds 실패", error);
      throw error;
    }
  }

  static async toggleFollow(
    followerId: string,
    followingId: string
  ): Promise<{ isFollowing: boolean; isPending?: boolean }> {
    try {
      if (followerId === followingId) {
        throw new Error("자기 자신을 팔로우할 수 없습니다");
      }

      const client = await pool.connect();
      const existing = await client.query(
        "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2",
        [followerId, followingId]
      );

      if (existing.rows.length > 0) {
        // 언팔로우 시 트랜잭션으로 친한친구 관계도 함께 삭제
        await client.query("BEGIN");

        // 팔로우 관계 삭제
        await client.query(
          "DELETE FROM follows WHERE follower_id = $1 AND following_id = $2",
          [followerId, followingId]
        );

        // 친한친구 관계도 삭제 (양방향)
        await client.query(
          "DELETE FROM user_favorites WHERE (user_id = $1 AND favorite_id = $2) OR (user_id = $2 AND favorite_id = $1)",
          [followerId, followingId]
        );

        await client.query("COMMIT");
        client.release();
        return { isFollowing: false, isPending: false };
      } else {
        // 팔로우 - 대상 사용자의 승인 방식에 따라 처리
        // 대상 사용자의 승인 방식 확인
        const targetUserResult = await client.query(
          "SELECT follow_approval_mode FROM users WHERE id = $1",
          [followingId]
        );

        const approvalMode =
          targetUserResult.rows[0]?.follow_approval_mode || "auto";
        const isAccepted = approvalMode === "auto"; // auto면 즉시 승인, manual이면 대기

        await client.query(
          "INSERT INTO follows (follower_id, following_id, is_accepted) VALUES ($1, $2, $3)",
          [followerId, followingId, isAccepted]
        );
        client.release();

        return {
          isFollowing: isAccepted,
          isPending: !isAccepted,
        };
      }
    } catch (error) {
      log("ERROR", "toggleFollow 실패", error);
      throw error;
    }
  }

  // 팔로우 요청 승인
  static async approveFollowRequest(
    targetUserId: string, // 승인하는 사람 (요청을 받은 사람)
    requesterId: string // 요청한 사람
  ): Promise<{ success: boolean }> {
    try {
      const client = await pool.connect();

      // 팔로우 요청이 존재하고 대기 상태인지 확인
      const requestResult = await client.query(
        "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND is_accepted = false",
        [requesterId, targetUserId]
      );

      if (requestResult.rows.length === 0) {
        client.release();
        throw new Error("승인할 팔로우 요청이 없습니다");
      }

      // 승인 처리 (is_accepted를 true로 변경)
      await client.query(
        "UPDATE follows SET is_accepted = true WHERE follower_id = $1 AND following_id = $2",
        [requesterId, targetUserId]
      );

      client.release();
      return { success: true };
    } catch (error) {
      log("ERROR", "팔로우 요청 승인 실패", error);
      throw error;
    }
  }

  // 팔로우 요청 거절 (삭제)
  static async rejectFollowRequest(
    targetUserId: string, // 거절하는 사람 (요청을 받은 사람)
    requesterId: string // 요청한 사람
  ): Promise<{ success: boolean }> {
    try {
      const client = await pool.connect();

      // 팔로우 요청 삭제
      const result = await client.query(
        "DELETE FROM follows WHERE follower_id = $1 AND following_id = $2 AND is_accepted = false",
        [requesterId, targetUserId]
      );

      if (result.rowCount === 0) {
        client.release();
        throw new Error("거절할 팔로우 요청이 없습니다");
      }

      client.release();
      return { success: true };
    } catch (error) {
      log("ERROR", "팔로우 요청 거절 실패", error);
      throw error;
    }
  }

  // 받은 팔로우 요청 목록 조회
  static async getFollowRequests(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    requests: Array<{
      id: string;
      username: string;
      nickname: string;
      profile_image?: string;
      followers_count: number;
      requested_at: string;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      // 총 요청 수 조회
      const countResult = await client.query(
        "SELECT COUNT(*) FROM follows WHERE following_id = $1 AND is_accepted = false",
        [userId]
      );
      const total = parseInt(countResult.rows[0].count, 10) || 0;

      // 팔로우 요청 목록 조회 (요청한 사용자 정보 포함)
      const result = await client.query(
        `SELECT 
           u.id, 
           u.username, 
           u.nickname, 
           u.profile_image,
           f.created_at as requested_at,
           (SELECT COUNT(*) FROM follows f2 WHERE f2.following_id = u.id AND f2.is_accepted = true) AS followers_count
         FROM follows f
         JOIN users u ON f.follower_id = u.id
         WHERE f.following_id = $1 AND f.is_accepted = false
         ORDER BY f.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      client.release();

      return {
        requests: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      log("ERROR", "팔로우 요청 목록 조회 실패", error);
      throw error;
    }
  }

  static async toggleFavorite(
    userId: string,
    targetUserId: string
  ): Promise<{ isFavorite: boolean }> {
    try {
      if (userId === targetUserId) {
        throw new Error("자기 자신을 친한친구로 설정할 수 없습니다");
      }

      const client = await pool.connect();

      // 팔로잉 상태 확인
      const followResult = await client.query(
        "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2 AND is_accepted = true",
        [userId, targetUserId]
      );

      if (followResult.rows.length === 0) {
        client.release();
        throw new Error("팔로잉 상태인 사용자만 친한친구로 설정할 수 있습니다");
      }

      const existing = await client.query(
        "SELECT 1 FROM user_favorites WHERE user_id = $1 AND favorite_id = $2",
        [userId, targetUserId]
      );

      if (existing.rows.length > 0) {
        await client.query(
          "DELETE FROM user_favorites WHERE user_id = $1 AND favorite_id = $2",
          [userId, targetUserId]
        );
        client.release();
        return { isFavorite: false };
      }

      await client.query(
        "INSERT INTO user_favorites (user_id, favorite_id) VALUES ($1, $2)",
        [userId, targetUserId]
      );
      client.release();
      return { isFavorite: true };
    } catch (error) {
      log("ERROR", "toggleFavorite 실패", error);
      throw error;
    }
  }

  static async toggleBlock(
    blockerId: string,
    blockedId: string
  ): Promise<{ isBlocked: boolean }> {
    try {
      if (blockerId === blockedId) {
        throw new Error("자기 자신을 차단할 수 없습니다");
      }

      const client = await pool.connect();
      const existing = await client.query(
        "SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2",
        [blockerId, blockedId]
      );

      if (existing.rows.length > 0) {
        // 차단 해제
        await client.query(
          "DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2",
          [blockerId, blockedId]
        );
        client.release();
        return { isBlocked: false };
      } else {
        // 차단하기 (친한친구 관계만 삭제, 팔로우 관계는 유지)
        await client.query("BEGIN");

        // 친한친구 관계 삭제 (양방향)
        await client.query(
          "DELETE FROM user_favorites WHERE (user_id = $1 AND favorite_id = $2) OR (user_id = $2 AND favorite_id = $1)",
          [blockerId, blockedId]
        );

        // 차단 추가
        await client.query(
          "INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)",
          [blockerId, blockedId]
        );

        await client.query("COMMIT");
        client.release();
        return { isBlocked: true };
      }
    } catch (error) {
      log("ERROR", "toggleBlock 실패", error);
      throw error;
    }
  }

  static async getFollowers(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ users: FollowListItem[]; total: number }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;
      const countResult = await client.query(
        "SELECT COUNT(*) FROM follows WHERE following_id = $1 AND is_accepted = true",
        [userId]
      );
      const total = parseInt(countResult.rows[0].count, 10) || 0;
      const result = await client.query(
        `SELECT u.id, u.username, u.nickname, u.profile_image,
                (SELECT COUNT(*) FROM follows f2 WHERE f2.following_id = u.id AND f2.is_accepted = true) AS followers
           FROM follows f
           JOIN users u ON u.id = f.follower_id
          WHERE f.following_id = $1 AND f.is_accepted = true
          ORDER BY f.created_at DESC
          LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      client.release();
      return { users: result.rows, total };
    } catch (error) {
      log("ERROR", "getFollowers 실패", error);
      throw error;
    }
  }

  static async getFollowing(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ users: FollowListItem[]; total: number }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;
      const countResult = await client.query(
        "SELECT COUNT(*) FROM follows WHERE follower_id = $1 AND is_accepted = true",
        [userId]
      );
      const total = parseInt(countResult.rows[0].count, 10) || 0;
      const result = await client.query(
        `SELECT u.id, u.username, u.nickname, u.profile_image,
                (SELECT COUNT(*) FROM follows f2 WHERE f2.following_id = u.id AND f2.is_accepted = true) AS followers
           FROM follows f
           JOIN users u ON u.id = f.following_id
          WHERE f.follower_id = $1 AND f.is_accepted = true
          ORDER BY f.created_at DESC
          LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      client.release();
      return { users: result.rows, total };
    } catch (error) {
      log("ERROR", "getFollowing 실패", error);
      throw error;
    }
  }

  // 팔로우 상태 종합 확인
  static async checkFollowStatus(
    userId: string,
    targetUserId: string
  ): Promise<{
    isFollowing: boolean;
    isPending?: boolean;
    isFavorite: boolean;
    isBlocked: boolean;
  }> {
    try {
      const client = await pool.connect();

      // 팔로우 상태 확인
      const followResult = await client.query(
        "SELECT is_accepted FROM follows WHERE follower_id = $1 AND following_id = $2",
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

      const followRow = followResult.rows[0];
      const hasFollowRecord = followResult.rows.length > 0;
      const isAccepted = followRow?.is_accepted === true;
      const isPending = followRow?.is_accepted === false;

      const status = {
        isFollowing: hasFollowRecord && isAccepted,
        isPending: hasFollowRecord && isPending,
        isFavorite: favoriteResult.rows.length > 0,
        isBlocked: blockResult.rows.length > 0,
      };

      return status;
    } catch (error) {
      log("ERROR", "checkFollowStatus 실패", error);
      throw error;
    }
  }

  // 팔로워 수 조회
  static async getFollowersCount(userId: string): Promise<number> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT COUNT(*) as count FROM follows WHERE following_id = $1 AND is_accepted = true",
        [userId]
      );
      client.release();
      return parseInt(result.rows[0].count, 10) || 0;
    } catch (error) {
      log("ERROR", "팔로워 수 조회 실패", error);
      return 0;
    }
  }

  // 팔로잉 수 조회
  static async getFollowingCount(userId: string): Promise<number> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT COUNT(*) as count FROM follows WHERE follower_id = $1 AND is_accepted = true",
        [userId]
      );
      client.release();
      return parseInt(result.rows[0].count, 10) || 0;
    } catch (error) {
      log("ERROR", "팔로잉 수 조회 실패", error);
      return 0;
    }
  }

  // 친한친구 목록 조회
  static async getFavorites(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    users: Array<{
      id: string;
      username: string;
      nickname: string;
      profile_image?: string;
      favorite_since: string;
      followers_count: number;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      // 총 친한친구 수 조회
      const countResult = await client.query(
        "SELECT COUNT(*) FROM user_favorites WHERE user_id = $1",
        [userId]
      );
      const total = parseInt(countResult.rows[0].count, 10) || 0;

      // 친한친구 목록 조회 (사용자 정보 포함)
      const result = await client.query(
        `SELECT 
           u.id, 
           u.username, 
           u.nickname, 
           u.profile_image,
           uf.created_at as favorite_since,
           (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id AND f.is_accepted = true) AS followers_count
         FROM user_favorites uf
         JOIN users u ON uf.favorite_id = u.id
         WHERE uf.user_id = $1
         ORDER BY uf.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      client.release();

      return {
        users: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      log("ERROR", "친한친구 목록 조회 실패", error);
      throw error;
    }
  }

  // 차단된 사용자 목록 조회
  static async getBlockedUsers(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    users: Array<{
      id: string;
      username: string;
      nickname: string;
      profile_image?: string;
      blocked_since: string;
      followers_count: number;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      // 총 차단된 사용자 수 조회
      const countResult = await client.query(
        "SELECT COUNT(*) FROM user_blocks WHERE blocker_id = $1",
        [userId]
      );
      const total = parseInt(countResult.rows[0].count, 10) || 0;

      // 차단된 사용자 목록 조회 (사용자 정보 포함)
      const result = await client.query(
        `SELECT 
           u.id, 
           u.username, 
           u.nickname, 
           u.profile_image,
           ub.created_at as blocked_since,
           (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id AND f.is_accepted = true) AS followers_count
         FROM user_blocks ub
         JOIN users u ON ub.blocked_id = u.id
         WHERE ub.blocker_id = $1
         ORDER BY ub.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      client.release();

      return {
        users: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      log("ERROR", "차단된 사용자 목록 조회 실패", error);
      throw error;
    }
  }

  // 상호 팔로우 관계 확인
  static async isMutualFollow(
    userId1: string,
    userId2: string
  ): Promise<boolean> {
    try {
      const client = await pool.connect();

      // 양방향 팔로우 관계 확인
      const result = await client.query(
        `SELECT 
          (SELECT COUNT(*) FROM follows WHERE follower_id = $1 AND following_id = $2 AND is_accepted = true) as user1_follows_user2,
          (SELECT COUNT(*) FROM follows WHERE follower_id = $2 AND following_id = $1 AND is_accepted = true) as user2_follows_user1
        `,
        [userId1, userId2]
      );

      client.release();

      const { user1_follows_user2, user2_follows_user1 } = result.rows[0];

      // 둘 다 서로를 팔로우하고 있는 경우
      return user1_follows_user2 > 0 && user2_follows_user1 > 0;
    } catch (error) {
      log("ERROR", "상호 팔로우 관계 확인 실패", error);
      throw error;
    }
  }

  // 상호 팔로우 목록 조회
  static async getMutualFollows(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{
    users: Array<{
      id: string;
      username: string;
      nickname: string;
      profile_image?: string;
      mutual_since: string;
      followers_count: number;
    }>;
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      // 총 상호 팔로우 수 조회
      const countResult = await client.query(
        `SELECT COUNT(DISTINCT u.id)
         FROM users u
         JOIN follows f1 ON f1.following_id = u.id AND f1.follower_id = $1 AND f1.is_accepted = true
         JOIN follows f2 ON f2.follower_id = u.id AND f2.following_id = $1 AND f2.is_accepted = true
         WHERE u.id != $1`,
        [userId]
      );
      const total = parseInt(countResult.rows[0].count, 10) || 0;

      // 상호 팔로우 목록 조회
      const result = await client.query(
        `SELECT 
           u.id, 
           u.username, 
           u.nickname, 
           u.profile_image,
           GREATEST(f1.created_at, f2.created_at) as mutual_since,
           (SELECT COUNT(*) FROM follows f WHERE f.following_id = u.id AND f.is_accepted = true) AS followers_count
         FROM users u
         JOIN follows f1 ON f1.following_id = u.id AND f1.follower_id = $1 AND f1.is_accepted = true
         JOIN follows f2 ON f2.follower_id = u.id AND f2.following_id = $1 AND f2.is_accepted = true
         WHERE u.id != $1
         ORDER BY mutual_since DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      client.release();

      return {
        users: result.rows,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      log("ERROR", "상호 팔로우 목록 조회 실패", error);
      throw error;
    }
  }
}
