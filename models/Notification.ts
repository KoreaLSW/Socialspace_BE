import { pool } from "../config/database";
import { BlockModel } from "./Block";
import { log } from "../utils/logger";

export interface NotificationRecord {
  user_id: string; // 알림 수신자
  type: string; // 예: 'mention_comment'
  from_user_id: string;
  target_id: string; // 댓글 ID
}

export class NotificationModel {
  /**
   * 차단 관계를 확인하여 알림을 생성하는 메서드
   */
  static async createManyIfNotExists(
    records: NotificationRecord[]
  ): Promise<void> {
    if (!records || records.length === 0) return;

    // 차단 관계 확인 후 필터링
    const filteredRecords = [];
    for (const record of records) {
      try {
        // 알림 수신자와 발신자 간 차단 관계 확인
        const isBlocked = await BlockModel.isBlocked(
          record.user_id,
          record.from_user_id
        );
        if (!isBlocked) {
          filteredRecords.push(record);
        } else {
          log(
            "INFO",
            `차단된 사용자 알림 필터링: ${record.from_user_id} -> ${record.user_id}`
          );
        }
      } catch (error) {
        log("ERROR", "알림 차단 관계 확인 실패", error);
        // 에러 시 안전하게 알림 생성 (기존 동작 유지)
        filteredRecords.push(record);
      }
    }

    if (filteredRecords.length === 0) return;

    const client = await pool.connect();
    try {
      for (const r of filteredRecords) {
        // 단순 존재 검사 후 삽입 (낮은 빈도라 루프 허용)
        const found = await client.query(
          `SELECT 1 FROM notifications WHERE user_id = $1 AND type = $2 AND from_user_id = $3 AND target_id = $4 LIMIT 1`,
          [r.user_id, r.type, r.from_user_id, r.target_id]
        );
        if (found.rows.length === 0) {
          await client.query(
            `INSERT INTO notifications (user_id, type, from_user_id, target_id) VALUES ($1, $2, $3, $4)`,
            [r.user_id, r.type, r.from_user_id, r.target_id]
          );
        }
      }
    } finally {
      client.release();
    }
  }

  static async getByUser(
    userId: string,
    page: number = 1,
    limit: number = 20
  ): Promise<{ notifications: any[]; total: number }> {
    const client = await pool.connect();
    try {
      const offset = (page - 1) * limit;

      // 차단된 사용자들의 알림 필터링
      const countRes = await client.query(
        `SELECT COUNT(*) as count 
         FROM notifications n 
         WHERE n.user_id = $1 
           AND n.from_user_id NOT IN (
             SELECT blocker_id FROM user_blocks WHERE blocked_id = $1
             UNION
             SELECT blocked_id FROM user_blocks WHERE blocker_id = $1
           )`,
        [userId]
      );
      const total = parseInt(countRes.rows[0].count, 10) || 0;

      const res = await client.query(
        `SELECT 
            n.id, n.user_id, n.type, n.from_user_id, n.target_id, n.is_read, n.created_at,
            u.username AS from_username, u.nickname AS from_nickname, u.profile_image AS from_profile_image,
            p.id AS post_id, p.content AS post_content, p.thumbnail_url AS post_thumbnail_url,
            c.id AS comment_id, c.content AS comment_content, c.post_id AS comment_post_id,
            p2.thumbnail_url AS comment_post_thumbnail_url
         FROM notifications n
         JOIN users u ON n.from_user_id = u.id
         LEFT JOIN posts p ON n.target_id = p.id
         LEFT JOIN comments c ON n.target_id = c.id
         LEFT JOIN posts p2 ON c.post_id = p2.id
         WHERE n.user_id = $1
           AND n.from_user_id NOT IN (
             SELECT blocker_id FROM user_blocks WHERE blocked_id = $1
             UNION
             SELECT blocked_id FROM user_blocks WHERE blocker_id = $1
           )
         ORDER BY n.created_at DESC
         LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );
      return { notifications: res.rows, total };
    } finally {
      client.release();
    }
  }

  static async countUnread(userId: string): Promise<number> {
    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT COUNT(*) as cnt 
         FROM notifications n 
         WHERE n.user_id = $1 
           AND n.is_read = false
           AND n.from_user_id NOT IN (
             SELECT blocker_id FROM user_blocks WHERE blocked_id = $1
             UNION
             SELECT blocked_id FROM user_blocks WHERE blocker_id = $1
           )`,
        [userId]
      );
      return parseInt(res.rows[0].cnt, 10) || 0;
    } finally {
      client.release();
    }
  }

  static async markRead(userId: string, notificationId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE notifications SET is_read = true WHERE id = $1 AND user_id = $2`,
        [notificationId, userId]
      );
    } finally {
      client.release();
    }
  }

  static async markAllRead(userId: string): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query(
        `UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false`,
        [userId]
      );
    } finally {
      client.release();
    }
  }
}
