import { pool } from "../../config/database";
import { log } from "../../utils/logger";

export interface PostView {
  post_id: string;
  user_id: string;
  ip_address: string;
  viewed_at: Date;
  view_duration: number;
}

export interface CreatePostViewData {
  post_id: string;
  user_id: string;
  ip_address: string;
  view_duration?: number;
}

export interface ViewStats {
  total_views: number;
  unique_views: number;
  avg_view_duration: number;
  total_view_time: number;
}

export class PostViewModel {
  // 조회 기록 생성/업데이트
  static async recordView(viewData: CreatePostViewData): Promise<PostView> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `INSERT INTO post_views (post_id, user_id, ip_address, view_duration, viewed_at) 
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP) 
         ON CONFLICT (post_id, user_id, ip_address) DO UPDATE SET 
           view_duration = GREATEST(post_views.view_duration, $4),
           viewed_at = CURRENT_TIMESTAMP
         RETURNING *`,
        [
          viewData.post_id,
          viewData.user_id,
          viewData.ip_address,
          viewData.view_duration || 0,
        ]
      );

      client.release();

      if (result.rows.length === 0) {
        throw new Error("조회 기록 생성 실패");
      }

      return this.mapRowToPostView(result.rows[0]);
    } catch (error) {
      log("ERROR", "조회 기록 생성 실패", error);
      throw error;
    }
  }

  // 게시글별 조회 통계 조회
  static async getViewStats(postId: string): Promise<ViewStats> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `SELECT 
          COUNT(*) as total_views,
          COUNT(DISTINCT COALESCE(user_id, ip_address)) as unique_views,
          AVG(view_duration) as avg_view_duration,
          SUM(view_duration) as total_view_time
         FROM post_views 
         WHERE post_id = $1 AND view_duration > 0`,
        [postId]
      );

      client.release();

      const row = result.rows[0];
      return {
        total_views: parseInt(row.total_views),
        unique_views: parseInt(row.unique_views),
        avg_view_duration: parseFloat(row.avg_view_duration) || 0,
        total_view_time: parseInt(row.total_view_time) || 0,
      };
    } catch (error) {
      log("ERROR", "조회 통계 조회 실패", error);
      throw error;
    }
  }

  // 사용자별 조회 기록 조회
  static async findByUserId(
    userId: string,
    limit: number = 50
  ): Promise<PostView[]> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `SELECT * FROM post_views 
         WHERE user_id = $1 
         ORDER BY viewed_at DESC 
         LIMIT $2`,
        [userId, limit]
      );

      client.release();

      return result.rows.map((row) => this.mapRowToPostView(row));
    } catch (error) {
      log("ERROR", "사용자별 조회 기록 조회 실패", error);
      throw error;
    }
  }

  // 게시글별 조회 기록 조회 (상세)
  static async findByPostId(
    postId: string,
    limit: number = 100
  ): Promise<PostView[]> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `SELECT * FROM post_views 
         WHERE post_id = $1 
         ORDER BY viewed_at DESC 
         LIMIT $2`,
        [postId, limit]
      );

      client.release();

      return result.rows.map((row) => this.mapRowToPostView(row));
    } catch (error) {
      log("ERROR", "게시글별 조회 기록 조회 실패", error);
      throw error;
    }
  }

  // 특정 사용자가 특정 게시글을 조회했는지 확인
  static async hasViewed(userId: string, postId: string): Promise<boolean> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        "SELECT 1 FROM post_views WHERE user_id = $1 AND post_id = $2",
        [userId, postId]
      );

      client.release();

      return result.rows.length > 0;
    } catch (error) {
      log("ERROR", "조회 여부 확인 실패", error);
      throw error;
    }
  }

  // 시간대별 조회 통계 (24시간 기준)
  static async getHourlyViewStats(
    postId: string
  ): Promise<Array<{ hour: number; views: number }>> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `SELECT 
          EXTRACT(hour FROM viewed_at) as hour,
          COUNT(*) as views
         FROM post_views 
         WHERE post_id = $1 
           AND viewed_at > NOW() - INTERVAL '24 hours'
         GROUP BY EXTRACT(hour FROM viewed_at)
         ORDER BY hour`,
        [postId]
      );

      client.release();

      return result.rows.map((row) => ({
        hour: parseInt(row.hour),
        views: parseInt(row.views),
      }));
    } catch (error) {
      log("ERROR", "시간대별 조회 통계 조회 실패", error);
      throw error;
    }
  }

  // 조회 지속 시간별 분포
  static async getViewDurationDistribution(postId: string): Promise<{
    quick: number; // 0-5초
    normal: number; // 5-30초
    engaged: number; // 30-120초
    deep: number; // 120초+
  }> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `SELECT 
          COUNT(CASE WHEN view_duration BETWEEN 0 AND 5 THEN 1 END) as quick,
          COUNT(CASE WHEN view_duration BETWEEN 6 AND 30 THEN 1 END) as normal,
          COUNT(CASE WHEN view_duration BETWEEN 31 AND 120 THEN 1 END) as engaged,
          COUNT(CASE WHEN view_duration > 120 THEN 1 END) as deep
         FROM post_views 
         WHERE post_id = $1 AND view_duration > 0`,
        [postId]
      );

      client.release();

      const row = result.rows[0];
      return {
        quick: parseInt(row.quick),
        normal: parseInt(row.normal),
        engaged: parseInt(row.engaged),
        deep: parseInt(row.deep),
      };
    } catch (error) {
      log("ERROR", "조회 지속 시간 분포 조회 실패", error);
      throw error;
    }
  }

  // 일정 기간 이전 조회 기록 정리 (GDPR 준수)
  static async cleanupOldViews(daysToKeep: number = 90): Promise<number> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `DELETE FROM post_views 
         WHERE viewed_at < NOW() - INTERVAL '${daysToKeep} days'`
      );

      client.release();

      const deletedCount = result.rowCount || 0;
      log("INFO", `${deletedCount}개의 오래된 조회 기록이 정리되었습니다.`);

      return deletedCount;
    } catch (error) {
      log("ERROR", "조회 기록 정리 실패", error);
      throw error;
    }
  }

  // DB 행을 PostView 객체로 변환
  private static mapRowToPostView(row: any): PostView {
    return {
      post_id: row.post_id,
      user_id: row.user_id,
      ip_address: row.ip_address,
      viewed_at: row.viewed_at,
      view_duration: row.view_duration,
    };
  }
}
