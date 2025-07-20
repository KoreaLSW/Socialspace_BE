import { pool } from "../../config/database";
import { log } from "../../utils/logger";

export interface PostInteractionSummary {
  post_id: string;
  total_views: number;
  unique_views: number;
  total_likes: number;
  total_comments: number;
  total_shares: number;
  total_bookmarks: number;
  avg_view_duration: number;
  engagement_score: number;
  last_updated: Date;
}

export interface InteractionWeights {
  view: number;
  like: number;
  comment: number;
  share: number;
  bookmark: number;
  view_duration: number;
}

export class InteractionSummaryModel {
  // 기본 상호작용 가중치
  private static readonly DEFAULT_WEIGHTS: InteractionWeights = {
    view: 0.1,
    like: 1.0,
    comment: 3.0,
    share: 5.0,
    bookmark: 7.0,
    view_duration: 0.01, // 초당 점수
  };

  // 특정 게시글의 상호작용 통계 업데이트
  static async updatePostSummary(
    postId: string
  ): Promise<PostInteractionSummary> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `INSERT INTO post_interaction_summary (
          post_id, total_views, unique_views, total_likes, 
          total_comments, total_shares, total_bookmarks, 
          avg_view_duration, engagement_score, last_updated
        )
        SELECT 
          $1,
          COALESCE(v.total_views, 0)::INTEGER,
          COALESCE(v.unique_views, 0)::INTEGER,
          COALESCE(l.like_count, 0)::INTEGER,
          COALESCE(c.comment_count, 0)::INTEGER,
          COALESCE(s.share_count, 0)::INTEGER,
          COALESCE(b.bookmark_count, 0)::INTEGER,
          COALESCE(v.avg_duration, 0)::DECIMAL,
          -- 종합 점수 계산 (모든 값을 DECIMAL로 명시적 캐스팅)
          (COALESCE(v.total_views, 0)::DECIMAL * $2::DECIMAL + 
           COALESCE(l.like_count, 0)::DECIMAL * $3::DECIMAL + 
           COALESCE(c.comment_count, 0)::DECIMAL * $4::DECIMAL + 
           COALESCE(s.share_count, 0)::DECIMAL * $5::DECIMAL + 
           COALESCE(b.bookmark_count, 0)::DECIMAL * $6::DECIMAL +
           COALESCE(v.total_duration, 0)::DECIMAL * $7::DECIMAL)::DECIMAL as engagement_score,
          NOW()
        FROM (SELECT $1 as post_id) p
        LEFT JOIN (
          SELECT 
            post_id,
            COUNT(*) as total_views,
            COUNT(DISTINCT COALESCE(user_id, ip_address)) as unique_views,
            AVG(view_duration) as avg_duration,
            SUM(view_duration) as total_duration
          FROM post_views 
          WHERE post_id = $1 AND view_duration > 3  -- 3초 이상만 유효한 조회로 간주
          GROUP BY post_id
        ) v ON p.post_id = v.post_id
        LEFT JOIN (
          SELECT target_id, COUNT(*) as like_count 
          FROM likes 
          WHERE target_id = $1 AND target_type = 'post'
          GROUP BY target_id
        ) l ON p.post_id = l.target_id
        LEFT JOIN (
          SELECT post_id, COUNT(*) as comment_count 
          FROM comments 
          WHERE post_id = $1
          GROUP BY post_id
        ) c ON p.post_id = c.post_id
        LEFT JOIN (
          SELECT post_id, COUNT(*) as share_count 
          FROM shares 
          WHERE post_id = $1
          GROUP BY post_id
        ) s ON p.post_id = s.post_id
        LEFT JOIN (
          SELECT post_id, COUNT(*) as bookmark_count 
          FROM bookmarks 
          WHERE post_id = $1
          GROUP BY post_id
        ) b ON p.post_id = b.post_id
        ON CONFLICT (post_id) DO UPDATE SET
          total_views = EXCLUDED.total_views,
          unique_views = EXCLUDED.unique_views,
          total_likes = EXCLUDED.total_likes,
          total_comments = EXCLUDED.total_comments,
          total_shares = EXCLUDED.total_shares,
          total_bookmarks = EXCLUDED.total_bookmarks,
          avg_view_duration = EXCLUDED.avg_view_duration,
          engagement_score = EXCLUDED.engagement_score,
          last_updated = EXCLUDED.last_updated
        RETURNING *`,
        [
          postId,
          this.DEFAULT_WEIGHTS.view,
          this.DEFAULT_WEIGHTS.like,
          this.DEFAULT_WEIGHTS.comment,
          this.DEFAULT_WEIGHTS.share,
          this.DEFAULT_WEIGHTS.bookmark,
          this.DEFAULT_WEIGHTS.view_duration,
        ]
      );

      client.release();

      if (result.rows.length === 0) {
        throw new Error("상호작용 통계 업데이트 실패");
      }

      return this.mapRowToSummary(result.rows[0]);
    } catch (error) {
      log("ERROR", "상호작용 통계 업데이트 실패", error);
      throw error;
    }
  }

  // 게시글의 현재 종합 점수 조회
  static async getPostScore(postId: string): Promise<number> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        "SELECT engagement_score FROM post_interaction_summary WHERE post_id = $1",
        [postId]
      );

      client.release();

      if (result.rows.length === 0) {
        // 통계가 없으면 실시간으로 계산해서 반환
        await this.updatePostSummary(postId);
        return this.getPostScore(postId);
      }

      return parseFloat(result.rows[0].engagement_score) || 0;
    } catch (error) {
      log("ERROR", "게시글 점수 조회 실패", error);
      throw error;
    }
  }

  // 게시글의 상세 통계 조회
  static async getPostSummary(
    postId: string
  ): Promise<PostInteractionSummary | null> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        "SELECT * FROM post_interaction_summary WHERE post_id = $1",
        [postId]
      );

      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToSummary(result.rows[0]);
    } catch (error) {
      log("ERROR", "게시글 통계 조회 실패", error);
      throw error;
    }
  }

  // 여러 게시글의 통계를 한 번에 조회
  static async getMultiplePostSummaries(
    postIds: string[]
  ): Promise<Map<string, PostInteractionSummary>> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        "SELECT * FROM post_interaction_summary WHERE post_id = ANY($1)",
        [postIds]
      );

      client.release();

      const summaryMap = new Map<string, PostInteractionSummary>();
      result.rows.forEach((row) => {
        summaryMap.set(row.post_id, this.mapRowToSummary(row));
      });

      return summaryMap;
    } catch (error) {
      log("ERROR", "여러 게시글 통계 조회 실패", error);
      throw error;
    }
  }

  // 상위 참여도 게시글 조회
  static async getTopEngagementPosts(
    limit: number = 10,
    timeRange: "day" | "week" | "month" | "all" = "week"
  ): Promise<PostInteractionSummary[]> {
    try {
      const client = await pool.connect();

      let timeCondition = "";
      if (timeRange !== "all") {
        const intervals = {
          day: "1 day",
          week: "7 days",
          month: "30 days",
        };
        timeCondition = `AND p.created_at > NOW() - INTERVAL '${intervals[timeRange]}'`;
      }

      const result = await client.query(
        `SELECT pis.* 
         FROM post_interaction_summary pis
         JOIN posts p ON pis.post_id = p.id
         WHERE p.visibility = 'public' ${timeCondition}
         ORDER BY pis.engagement_score DESC
         LIMIT $1`,
        [limit]
      );

      client.release();

      return result.rows.map((row) => this.mapRowToSummary(row));
    } catch (error) {
      log("ERROR", "상위 참여도 게시글 조회 실패", error);
      throw error;
    }
  }

  // 전체 통계 일괄 업데이트 (배치 작업용)
  static async batchUpdateAllSummaries(
    olderThanHours: number = 1,
    batchSize: number = 100
  ): Promise<number> {
    try {
      const client = await pool.connect();

      // 업데이트가 필요한 게시글 ID 조회
      const postsToUpdate = await client.query(
        `SELECT DISTINCT p.id
         FROM posts p
         LEFT JOIN post_interaction_summary pis ON p.id = pis.post_id
         WHERE pis.last_updated IS NULL 
            OR pis.last_updated < NOW() - INTERVAL '${olderThanHours} hours'
         ORDER BY p.created_at DESC
         LIMIT $1`,
        [batchSize]
      );

      let updatedCount = 0;

      // 배치 단위로 업데이트
      for (const row of postsToUpdate.rows) {
        try {
          await this.updatePostSummary(row.id);
          updatedCount++;
        } catch (error) {
          log("ERROR", `게시글 ${row.id} 통계 업데이트 실패`, error);
        }
      }

      client.release();

      if (updatedCount > 0) {
        log(
          "INFO",
          `${updatedCount}개 게시글의 상호작용 통계가 업데이트되었습니다.`
        );
      }

      return updatedCount;
    } catch (error) {
      log("ERROR", "일괄 통계 업데이트 실패", error);
      throw error;
    }
  }

  // 오래된 통계 정리 (성능 최적화)
  static async cleanupOldSummaries(daysToKeep: number = 180): Promise<number> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `DELETE FROM post_interaction_summary 
         WHERE post_id IN (
           SELECT p.id FROM posts p
           WHERE p.created_at < NOW() - INTERVAL '${daysToKeep} days'
         )`
      );

      client.release();

      const deletedCount = result.rowCount || 0;
      if (deletedCount > 0) {
        log(
          "INFO",
          `${deletedCount}개의 오래된 상호작용 통계가 정리되었습니다.`
        );
      }

      return deletedCount;
    } catch (error) {
      log("ERROR", "오래된 통계 정리 실패", error);
      throw error;
    }
  }

  // 사용자 정의 가중치로 점수 재계산
  static calculateCustomEngagementScore(
    summary: PostInteractionSummary,
    customWeights?: Partial<InteractionWeights>
  ): number {
    const weights = { ...this.DEFAULT_WEIGHTS, ...customWeights };

    return (
      summary.total_views * weights.view +
      summary.total_likes * weights.like +
      summary.total_comments * weights.comment +
      summary.total_shares * weights.share +
      summary.total_bookmarks * weights.bookmark +
      summary.avg_view_duration * summary.total_views * weights.view_duration
    );
  }

  // DB 행을 PostInteractionSummary 객체로 변환
  private static mapRowToSummary(row: any): PostInteractionSummary {
    return {
      post_id: row.post_id,
      total_views: parseInt(row.total_views),
      unique_views: parseInt(row.unique_views),
      total_likes: parseInt(row.total_likes),
      total_comments: parseInt(row.total_comments),
      total_shares: parseInt(row.total_shares),
      total_bookmarks: parseInt(row.total_bookmarks),
      avg_view_duration: parseFloat(row.avg_view_duration),
      engagement_score: parseFloat(row.engagement_score),
      last_updated: row.last_updated,
    };
  }
}
