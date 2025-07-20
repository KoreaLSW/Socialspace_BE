import { pool } from "../../config/database";
import { log } from "../../utils/logger";

export interface Share {
  id: string;
  user_id: string;
  post_id: string;
  share_type: "internal" | "external" | "copy_link";
  created_at: Date;
}

export interface CreateShareData {
  user_id: string;
  post_id: string;
  share_type?: "internal" | "external" | "copy_link";
}

export class ShareModel {
  // 공유 생성
  static async create(shareData: CreateShareData): Promise<Share> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `INSERT INTO shares (user_id, post_id, share_type) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (user_id, post_id) DO UPDATE SET 
           share_type = $3, 
           created_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          shareData.user_id,
          shareData.post_id,
          shareData.share_type || "internal",
        ]
      );

      client.release();

      if (result.rows.length === 0) {
        throw new Error("공유 생성 실패");
      }

      return this.mapRowToShare(result.rows[0]);
    } catch (error) {
      log("ERROR", "공유 생성 실패", error);
      throw error;
    }
  }

  // 게시글별 공유 목록 조회
  static async findByPostId(postId: string): Promise<Share[]> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        "SELECT * FROM shares WHERE post_id = $1 ORDER BY created_at DESC",
        [postId]
      );

      client.release();

      return result.rows.map((row) => this.mapRowToShare(row));
    } catch (error) {
      log("ERROR", "게시글별 공유 목록 조회 실패", error);
      throw error;
    }
  }

  // 사용자별 공유 목록 조회
  static async findByUserId(userId: string): Promise<Share[]> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        "SELECT * FROM shares WHERE user_id = $1 ORDER BY created_at DESC",
        [userId]
      );

      client.release();

      return result.rows.map((row) => this.mapRowToShare(row));
    } catch (error) {
      log("ERROR", "사용자별 공유 목록 조회 실패", error);
      throw error;
    }
  }

  // 게시글의 공유 수 조회
  static async getShareCount(postId: string): Promise<number> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        "SELECT COUNT(*) FROM shares WHERE post_id = $1",
        [postId]
      );

      client.release();

      return parseInt(result.rows[0].count);
    } catch (error) {
      log("ERROR", "공유 수 조회 실패", error);
      throw error;
    }
  }

  // 공유 타입별 통계 조회
  static async getShareStatsByType(postId: string): Promise<{
    internal: number;
    external: number;
    copy_link: number;
    total: number;
  }> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `SELECT 
          share_type,
          COUNT(*) as count
         FROM shares 
         WHERE post_id = $1 
         GROUP BY share_type`,
        [postId]
      );

      client.release();

      const stats = {
        internal: 0,
        external: 0,
        copy_link: 0,
        total: 0,
      };

      result.rows.forEach((row) => {
        stats[row.share_type as keyof typeof stats] = parseInt(row.count);
        stats.total += parseInt(row.count);
      });

      return stats;
    } catch (error) {
      log("ERROR", "공유 타입별 통계 조회 실패", error);
      throw error;
    }
  }

  // 공유 삭제 (사용자가 공유 취소)
  static async delete(userId: string, postId: string): Promise<boolean> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        "DELETE FROM shares WHERE user_id = $1 AND post_id = $2",
        [userId, postId]
      );

      client.release();

      return (result.rowCount || 0) > 0;
    } catch (error) {
      log("ERROR", "공유 삭제 실패", error);
      throw error;
    }
  }

  // 특정 사용자가 특정 게시글을 공유했는지 확인
  static async exists(userId: string, postId: string): Promise<boolean> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        "SELECT 1 FROM shares WHERE user_id = $1 AND post_id = $2",
        [userId, postId]
      );

      client.release();

      return result.rows.length > 0;
    } catch (error) {
      log("ERROR", "공유 존재 확인 실패", error);
      throw error;
    }
  }

  // DB 행을 Share 객체로 변환
  private static mapRowToShare(row: any): Share {
    return {
      id: row.id,
      user_id: row.user_id,
      post_id: row.post_id,
      share_type: row.share_type,
      created_at: row.created_at,
    };
  }
}
