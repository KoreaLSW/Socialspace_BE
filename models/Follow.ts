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
        "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2",
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

  static async toggleFollow(
    followerId: string,
    followingId: string
  ): Promise<{ isFollowing: boolean }> {
    try {
      const client = await pool.connect();
      const existing = await client.query(
        "SELECT 1 FROM follows WHERE follower_id = $1 AND following_id = $2",
        [followerId, followingId]
      );
      if (existing.rows.length > 0) {
        await client.query(
          "DELETE FROM follows WHERE follower_id = $1 AND following_id = $2",
          [followerId, followingId]
        );
        client.release();
        return { isFollowing: false };
      }
      await client.query(
        "INSERT INTO follows (follower_id, following_id, is_accepted) VALUES ($1, $2, true)",
        [followerId, followingId]
      );
      client.release();
      return { isFollowing: true };
    } catch (error) {
      log("ERROR", "toggleFollow 실패", error);
      throw error;
    }
  }

  static async toggleFavorite(
    userId: string,
    targetUserId: string
  ): Promise<{ isFavorite: boolean }> {
    try {
      const client = await pool.connect();
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
      const client = await pool.connect();
      const existing = await client.query(
        "SELECT 1 FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2",
        [blockerId, blockedId]
      );
      if (existing.rows.length > 0) {
        await client.query(
          "DELETE FROM user_blocks WHERE blocker_id = $1 AND blocked_id = $2",
          [blockerId, blockedId]
        );
        client.release();
        return { isBlocked: false };
      }
      await client.query(
        "INSERT INTO user_blocks (blocker_id, blocked_id) VALUES ($1, $2)",
        [blockerId, blockedId]
      );
      client.release();
      return { isBlocked: true };
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
}
