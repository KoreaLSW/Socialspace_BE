import { pool } from "../config/database";
import { log } from "../utils/logger";

export class BlockModel {
  /**
   * 두 사용자 간 차단 관계 확인 (양방향)
   * A가 B를 차단했거나, B가 A를 차단한 경우 true 반환
   */
  static async isBlocked(userId1: string, userId2: string): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT 1 FROM user_blocks 
         WHERE (blocker_id = $1 AND blocked_id = $2) 
            OR (blocker_id = $2 AND blocked_id = $1)`,
        [userId1, userId2]
      );
      client.release();

      return result.rows.length > 0;
    } catch (error) {
      log("ERROR", "차단 관계 확인 실패", error);
      return false; // 에러 시 안전하게 false 반환
    }
  }

  /**
   * 특정 사용자가 차단한 사용자 ID 목록 조회
   */
  static async getBlockedUserIds(userId: string): Promise<string[]> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT blocked_id FROM user_blocks WHERE blocker_id = $1",
        [userId]
      );
      client.release();

      return result.rows.map((row) => row.blocked_id);
    } catch (error) {
      log("ERROR", "차단한 사용자 목록 조회 실패", error);
      return [];
    }
  }

  /**
   * 특정 사용자를 차단한 사용자 ID 목록 조회
   */
  static async getBlockerUserIds(userId: string): Promise<string[]> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT blocker_id FROM user_blocks WHERE blocked_id = $1",
        [userId]
      );
      client.release();

      return result.rows.map((row) => row.blocker_id);
    } catch (error) {
      log("ERROR", "차단한 사용자 목록 조회 실패", error);
      return [];
    }
  }

  /**
   * 사용자가 차단되었거나 차단한 모든 사용자 ID 목록 조회 (양방향)
   */
  static async getAllBlockedRelationUserIds(userId: string): Promise<string[]> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT 
           CASE 
             WHEN blocker_id = $1 THEN blocked_id 
             ELSE blocker_id 
           END as user_id
         FROM user_blocks 
         WHERE blocker_id = $1 OR blocked_id = $1`,
        [userId]
      );
      client.release();

      return result.rows.map((row) => row.user_id);
    } catch (error: any) {
      log("ERROR", "차단 관계 사용자 목록 조회 실패", {
        message: error?.message || "Unknown error",
        userId: userId,
      });
      return [];
    }
  }

  /**
   * 특정 사용자가 다른 사용자를 차단했는지 확인 (단방향)
   */
  static async hasBlocked(
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
      log("ERROR", "단방향 차단 확인 실패", error);
      return false;
    }
  }
}
