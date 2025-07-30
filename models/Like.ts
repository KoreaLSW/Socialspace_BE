import { pool } from "../config/database";

export interface Like {
  id: string;
  user_id: string;
  target_id: string;
  target_type: "post" | "comment";
  created_at: Date;
}

export interface CreateLikeData {
  user_id: string;
  target_id: string;
  target_type: "post" | "comment";
}

export class LikeModel {
  // 좋아요 추가
  static async create(data: CreateLikeData): Promise<Like> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO likes (user_id, target_id, target_type) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [data.user_id, data.target_id, data.target_type]
      );
      
      return result.rows[0];
    } finally {
      client.release();
    }
  }

  // 좋아요 삭제
  static async delete(userId: string, targetId: string, targetType: "post" | "comment"): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM likes 
         WHERE user_id = $1 AND target_id = $2 AND target_type = $3`,
        [userId, targetId, targetType]
      );
      
      return (result.rowCount || 0) > 0;
    } finally {
      client.release();
    }
  }

  // 좋아요 상태 확인
  static async isLiked(userId: string, targetId: string, targetType: "post" | "comment"): Promise<boolean> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT 1 FROM likes 
         WHERE user_id = $1 AND target_id = $2 AND target_type = $3 
         LIMIT 1`,
        [userId, targetId, targetType]
      );
      
      return result.rows.length > 0;
    } finally {
      client.release();
    }
  }

  // 특정 대상의 좋아요 수 조회
  static async getCount(targetId: string, targetType: "post" | "comment"): Promise<number> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT COUNT(*) as count FROM likes 
         WHERE target_id = $1 AND target_type = $2`,
        [targetId, targetType]
      );
      
      return parseInt(result.rows[0].count);
    } finally {
      client.release();
    }
  }

  // 특정 게시글에 좋아요한 사용자 목록 조회
  static async getLikesByTarget(targetId: string, targetType: "post" | "comment"): Promise<Like[]> {
    const client = await pool.connect();
    try {
      const result = await client.query(
        `SELECT l.*, u.username, u.nickname, u.profile_image 
         FROM likes l
         JOIN users u ON l.user_id = u.id
         WHERE l.target_id = $1 AND l.target_type = $2 
         ORDER BY l.created_at DESC`,
        [targetId, targetType]
      );
      
      return result.rows;
    } finally {
      client.release();
    }
  }
} 