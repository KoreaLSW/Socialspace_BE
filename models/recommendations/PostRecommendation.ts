import { pool } from "../../config/database";
import { log } from "../../utils/logger";
import { Post } from "../core/Post";

export interface RecommendationConfig {
  algorithm: "relationship" | "engagement" | "trending" | "hybrid";
  timeWeight: number;
  relationshipWeight: number;
  engagementWeight: number;
  diversityFactor: number;
  excludeViewed: boolean;
  maxAge: number; // hours
}

export interface PostWithScore extends Post {
  recommendation_score: number;
  reason: string;
  // 사용자 정보
  author?: {
    id: string;
    nickname: string;
    profile_image?: string;
  };
  // 해시태그 배열
  hashtags?: string[];
  // 통계 정보 (직접 속성으로)
  likes?: number;
  comments?: number;
  shares?: number;
  bookmarks?: number;
  views?: number;
  interaction_summary?: {
    likes: number;
    comments: number;
    shares: number;
    bookmarks: number;
    views: number;
  };
}

export class PostRecommendationModel {
  // 기본 추천 설정
  private static readonly DEFAULT_CONFIG: RecommendationConfig = {
    algorithm: "hybrid",
    timeWeight: 0.3,
    relationshipWeight: 0.4,
    engagementWeight: 0.3,
    diversityFactor: 0.2,
    excludeViewed: true,
    maxAge: 72, // 3일
  };

  // 사용자를 위한 추천 게시글 조회
  static async getRecommendedPosts(
    userId: string,
    page: number = 1,
    limit: number = 10,
    config?: Partial<RecommendationConfig>
  ): Promise<{ posts: PostWithScore[]; total: number }> {
    const finalConfig = { ...this.DEFAULT_CONFIG, ...config };

    try {
      switch (finalConfig.algorithm) {
        case "relationship":
          return this.getRelationshipBasedRecommendations(
            userId,
            page,
            limit,
            finalConfig
          );
        case "engagement":
          return this.getEngagementBasedRecommendations(
            userId,
            page,
            limit,
            finalConfig
          );
        case "trending":
          return this.getTrendingRecommendations(
            userId,
            page,
            limit,
            finalConfig
          );
        case "hybrid":
        default:
          return this.getHybridRecommendations(
            userId,
            page,
            limit,
            finalConfig
          );
      }
    } catch (error) {
      log("ERROR", "추천 게시글 조회 실패", error);
      throw error;
    }
  }

  // 관계 기반 추천 (팔로우한 사용자들의 게시글 우선)
  static async getRelationshipBasedRecommendations(
    userId: string,
    page: number,
    limit: number,
    config: RecommendationConfig
  ): Promise<{ posts: PostWithScore[]; total: number }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      const viewedCondition = config.excludeViewed
        ? `AND p.id NOT IN (SELECT post_id FROM post_views WHERE user_id = $1)`
        : "";

      const result = await client.query(
        `WITH user_network AS (
          -- 직접 팔로우하는 사용자들
          SELECT followed_id as user_id, 1.0 as relationship_score
          FROM follows 
          WHERE follower_id = $1
          
          UNION
          
          -- 친구의 친구들 (2차 연결)
          SELECT f2.followed_id as user_id, 0.5 as relationship_score
          FROM follows f1
          JOIN follows f2 ON f1.followed_id = f2.follower_id
          WHERE f1.follower_id = $1 
            AND f2.followed_id != $1
            AND f2.followed_id NOT IN (
              SELECT followed_id FROM follows WHERE follower_id = $1
            )
          
          UNION
          
          -- 좋아요를 많이 주고받은 사용자들
          SELECT l.user_id, 0.3 as relationship_score
          FROM likes l
          JOIN posts p ON l.target_id = p.id
          WHERE p.user_id = $1 AND l.target_type = 'post'
          GROUP BY l.user_id
          HAVING COUNT(*) >= 3
        ),
        scored_posts AS (
          SELECT 
            p.*,
            pis.engagement_score,
            COALESCE(un.relationship_score, 0) as relationship_score,
            -- 시간 가중치 (최근일수록 높은 점수) - 타입 명시적 캐스팅
            EXP(-EXTRACT(EPOCH FROM (NOW() - p.created_at))::DECIMAL / 3600.0 / $4::DECIMAL)::DECIMAL as time_score,
            -- 종합 점수 계산 (타입 명시적 캐스팅)
            (COALESCE(pis.engagement_score, 0)::DECIMAL * $5::DECIMAL + 
             COALESCE(un.relationship_score, 0)::DECIMAL * 100::DECIMAL * $6::DECIMAL +
             EXP(-EXTRACT(EPOCH FROM (NOW() - p.created_at))::DECIMAL / 3600.0 / $4::DECIMAL)::DECIMAL * 50::DECIMAL * $7::DECIMAL)::DECIMAL as recommendation_score
          FROM posts p
          LEFT JOIN post_interaction_summary pis ON p.id = pis.post_id
          LEFT JOIN user_network un ON p.user_id = un.user_id
          WHERE p.visibility = 'public'
            AND p.created_at > NOW() - INTERVAL '${config.maxAge} hours'
            AND p.user_id != $1
            ${viewedCondition}
        )
        SELECT 
          sp.*,
          u.username,
          u.nickname,
          u.profile_image,
          COALESCE(sp.engagement_score, 0) as likes,
          0 as comments,
          0 as shares,
          0 as bookmarks,
          0 as views,
          CASE 
            WHEN sp.relationship_score > 0.8 THEN '팔로우하는 사용자의 게시글'
            WHEN sp.relationship_score > 0.4 THEN '네트워크 연결된 사용자의 게시글'
            WHEN sp.relationship_score > 0.2 THEN '관심 있을 만한 사용자의 게시글'
            ELSE '인기 게시글'
          END as reason,
          -- 해시태그 배열 (JSON 형태로 집계)
          COALESCE(
            (SELECT JSON_AGG(h.tag) 
             FROM post_hashtags ph 
             JOIN hashtags h ON ph.hashtag_id = h.id 
             WHERE ph.post_id = sp.id), 
            '[]'::json
          ) as hashtags
        FROM scored_posts sp
        LEFT JOIN users u ON sp.user_id = u.id
        ORDER BY sp.recommendation_score DESC
        LIMIT $2 OFFSET $3`,
        [
          userId,
          limit,
          offset,
          config.maxAge,
          config.engagementWeight,
          config.relationshipWeight,
          config.timeWeight,
        ]
      );

      // 전체 개수 조회
      const countResult = await client.query(
        `SELECT COUNT(DISTINCT p.id) as total
         FROM posts p
         LEFT JOIN post_interaction_summary pis ON p.id = pis.post_id
         WHERE p.visibility = 'public'
           AND p.created_at > NOW() - INTERVAL '${config.maxAge} hours'
           AND p.user_id != $1
           ${viewedCondition}`,
        [userId]
      );

      client.release();

      const posts = result.rows.map((row) => this.mapRowToPostWithScore(row));
      const total = parseInt(countResult.rows[0].total);

      return { posts, total };
    } catch (error) {
      log("ERROR", "관계 기반 추천 조회 실패", error);
      throw error;
    }
  }

  // 참여도 기반 추천 (높은 참여도의 게시글 우선)
  static async getEngagementBasedRecommendations(
    userId: string,
    page: number,
    limit: number,
    config: RecommendationConfig
  ): Promise<{ posts: PostWithScore[]; total: number }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      const viewedCondition = config.excludeViewed
        ? `AND p.id NOT IN (SELECT post_id FROM post_views WHERE user_id = $1)`
        : "";

      const result = await client.query(
        `SELECT 
          p.*,
          u.username,
          u.nickname,
          u.profile_image,
          COALESCE(pis.engagement_score, 0) as engagement_score,
          COALESCE(pis.total_likes, 0) as likes,
          COALESCE(pis.total_comments, 0) as comments,
          COALESCE(pis.total_shares, 0) as shares,
          COALESCE(pis.total_bookmarks, 0) as bookmarks,
          COALESCE(pis.total_views, 0) as views,
          -- 시간 가중 참여도 점수 (타입 명시적 캐스팅)
          COALESCE(pis.engagement_score, 0)::DECIMAL * 
          EXP(-EXTRACT(EPOCH FROM (NOW() - p.created_at))::DECIMAL / 3600.0 / $3::DECIMAL)::DECIMAL as recommendation_score,
          '높은 참여도 게시글' as reason,
          -- 해시태그 배열 (JSON 형태로 집계)
          COALESCE(
            (SELECT JSON_AGG(h.tag) 
             FROM post_hashtags ph 
             JOIN hashtags h ON ph.hashtag_id = h.id 
             WHERE ph.post_id = p.id), 
            '[]'::json
          ) as hashtags
         FROM posts p
         LEFT JOIN users u ON p.user_id = u.id
         LEFT JOIN post_interaction_summary pis ON p.id = pis.post_id
         WHERE p.visibility = 'public'
           AND p.created_at > NOW() - INTERVAL '${config.maxAge} hours'
           AND p.user_id != $1
           ${viewedCondition}
         ORDER BY recommendation_score DESC
         LIMIT $2 OFFSET $4`,
        [userId, limit, config.maxAge, offset]
      );

      const countResult = await client.query(
        `SELECT COUNT(*) as total
         FROM posts p
         WHERE p.visibility = 'public'
           AND p.created_at > NOW() - INTERVAL '${config.maxAge} hours'
           AND p.user_id != $1
           ${viewedCondition}`,
        [userId]
      );

      client.release();

      const posts = result.rows.map((row) => this.mapRowToPostWithScore(row));
      const total = parseInt(countResult.rows[0].total);

      return { posts, total };
    } catch (error) {
      log("ERROR", "참여도 기반 추천 조회 실패", error);
      throw error;
    }
  }

  // 트렌딩 추천 (최근 급상승 게시글)
  static async getTrendingRecommendations(
    userId: string,
    page: number,
    limit: number,
    config: RecommendationConfig
  ): Promise<{ posts: PostWithScore[]; total: number }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      const result = await client.query(
        `WITH recent_interactions AS (
          SELECT 
            post_id,
            COUNT(*) as recent_interactions
          FROM (
            SELECT target_id as post_id FROM likes 
            WHERE target_type = 'post' AND created_at > NOW() - INTERVAL '2 hours'
            UNION ALL
            SELECT post_id FROM comments 
            WHERE created_at > NOW() - INTERVAL '2 hours'
            UNION ALL
            SELECT post_id FROM shares 
            WHERE created_at > NOW() - INTERVAL '2 hours'
          ) recent
          GROUP BY post_id
        )
        SELECT 
          p.*,
          u.username,
          u.nickname,
          u.profile_image,
          COALESCE(ri.recent_interactions, 0) as recent_interactions,
          COALESCE(pis.engagement_score, 0) as engagement_score,
          COALESCE(pis.total_likes, 0) as likes,
          COALESCE(pis.total_comments, 0) as comments,
          COALESCE(pis.total_shares, 0) as shares,
          COALESCE(pis.total_bookmarks, 0) as bookmarks,
          COALESCE(pis.total_views, 0) as views,
          -- 트렌딩 점수: 최근 상호작용 + 전체 참여도 + 시간 가중치 (타입 명시적 캐스팅)
          (COALESCE(ri.recent_interactions, 0)::DECIMAL * 10::DECIMAL + 
           COALESCE(pis.engagement_score, 0)::DECIMAL * 0.5::DECIMAL) *
          EXP(-EXTRACT(EPOCH FROM (NOW() - p.created_at))::DECIMAL / 3600.0 / 12::DECIMAL)::DECIMAL as recommendation_score,
          CASE 
            WHEN COALESCE(ri.recent_interactions, 0) > 10 THEN '인기 급상승 게시글'
            WHEN COALESCE(ri.recent_interactions, 0) > 5 THEN '주목받는 게시글'
            ELSE '트렌딩 게시글'
          END as reason,
          -- 해시태그 배열 (JSON 형태로 집계)
          COALESCE(
            (SELECT JSON_AGG(h.tag) 
             FROM post_hashtags ph 
             JOIN hashtags h ON ph.hashtag_id = h.id 
             WHERE ph.post_id = p.id), 
            '[]'::json
          ) as hashtags
        FROM posts p
        LEFT JOIN users u ON p.user_id = u.id
        LEFT JOIN post_interaction_summary pis ON p.id = pis.post_id
        LEFT JOIN recent_interactions ri ON p.id = ri.post_id
        WHERE p.visibility = 'public'
          AND p.created_at > NOW() - INTERVAL '24 hours'
          AND p.user_id != $1
        ORDER BY recommendation_score DESC
        LIMIT $2 OFFSET $3`,
        [userId, limit, offset]
      );

      client.release();

      const posts = result.rows.map((row) => this.mapRowToPostWithScore(row));

      return { posts, total: posts.length };
    } catch (error) {
      log("ERROR", "트렌딩 추천 조회 실패", error);
      throw error;
    }
  }

  // 하이브리드 추천 (여러 알고리즘 결합)
  static async getHybridRecommendations(
    userId: string,
    page: number,
    limit: number,
    config: RecommendationConfig
  ): Promise<{ posts: PostWithScore[]; total: number }> {
    try {
      // 각 알고리즘에서 일부씩 가져와서 결합
      const relationshipLimit = Math.ceil(limit * 0.4);
      const engagementLimit = Math.ceil(limit * 0.3);
      const trendingLimit = Math.ceil(limit * 0.3);

      const [relationshipPosts, engagementPosts, trendingPosts] =
        await Promise.all([
          this.getRelationshipBasedRecommendations(
            userId,
            1,
            relationshipLimit,
            config
          ),
          this.getEngagementBasedRecommendations(
            userId,
            1,
            engagementLimit,
            config
          ),
          this.getTrendingRecommendations(userId, 1, trendingLimit, config),
        ]);

      // 중복 제거 및 점수 재계산
      const postMap = new Map<string, PostWithScore>();

      // 관계 기반 게시글 (가중치 높음)
      relationshipPosts.posts.forEach((post) => {
        post.recommendation_score *= 1.2;
        post.reason = `[관계] ${post.reason}`;
        postMap.set(post.id, post);
      });

      // 참여도 기반 게시글
      engagementPosts.posts.forEach((post) => {
        if (!postMap.has(post.id)) {
          post.reason = `[참여도] ${post.reason}`;
          postMap.set(post.id, post);
        }
      });

      // 트렌딩 게시글
      trendingPosts.posts.forEach((post) => {
        if (!postMap.has(post.id)) {
          post.reason = `[트렌딩] ${post.reason}`;
          postMap.set(post.id, post);
        }
      });

      // 점수순 정렬 및 페이징
      const allPosts = Array.from(postMap.values()).sort(
        (a, b) => b.recommendation_score - a.recommendation_score
      );

      const startIndex = (page - 1) * limit;
      const endIndex = startIndex + limit;
      const paginatedPosts = allPosts.slice(startIndex, endIndex);

      return {
        posts: paginatedPosts,
        total: allPosts.length,
      };
    } catch (error) {
      log("ERROR", "하이브리드 추천 조회 실패", error);
      throw error;
    }
  }

  // 사용자 행동 기반 개인화 점수 조정
  static async adjustScoresByUserBehavior(
    userId: string,
    posts: PostWithScore[]
  ): Promise<PostWithScore[]> {
    try {
      const client = await pool.connect();

      // 사용자의 최근 행동 패턴 분석
      const behaviorResult = await client.query(
        `SELECT 
          -- 좋아요한 게시글의 해시태그
          array_agg(DISTINCT h.name) FILTER (WHERE l.user_id IS NOT NULL) as liked_hashtags,
          -- 댓글 단 게시글의 해시태그
          array_agg(DISTINCT h2.name) FILTER (WHERE c.user_id IS NOT NULL) as commented_hashtags,
          -- 활동 시간대
          EXTRACT(hour FROM l.created_at) as active_hour
         FROM posts p
         LEFT JOIN likes l ON p.id = l.target_id AND l.target_type = 'post' AND l.user_id = $1
         LEFT JOIN comments c ON p.id = c.post_id AND c.user_id = $1
         LEFT JOIN post_hashtags ph ON p.id = ph.post_id
         LEFT JOIN hashtags h ON ph.hashtag_id = h.id
         LEFT JOIN post_hashtags ph2 ON p.id = ph2.post_id
         LEFT JOIN hashtags h2 ON ph2.hashtag_id = h2.id
         WHERE l.created_at > NOW() - INTERVAL '30 days'
            OR c.created_at > NOW() - INTERVAL '30 days'
         GROUP BY EXTRACT(hour FROM l.created_at)`,
        [userId]
      );

      client.release();

      // 게시글별 개인화 점수 조정
      const adjustedPosts = posts.map((post) => {
        let personalizedScore = post.recommendation_score;

        // 여기서 사용자 행동 패턴에 따른 점수 조정 로직을 구현
        // 예: 자주 좋아요하는 해시태그가 포함된 게시글 점수 증가

        return {
          ...post,
          recommendation_score: personalizedScore,
        };
      });

      return adjustedPosts.sort(
        (a, b) => b.recommendation_score - a.recommendation_score
      );
    } catch (error) {
      log("ERROR", "개인화 점수 조정 실패", error);
      return posts; // 실패 시 원본 반환
    }
  }

  // DB 행을 PostWithScore 객체로 변환
  private static mapRowToPostWithScore(row: any): PostWithScore {
    return {
      id: row.id,
      user_id: row.user_id,
      content: row.content,
      thumbnail_url: row.thumbnail_url,
      og_link: row.og_link,
      created_at: row.created_at,
      updated_at: row.updated_at,
      visibility: row.visibility,
      hide_likes: row.hide_likes,
      hide_views: row.hide_views,
      allow_comments: row.allow_comments,
      recommendation_score: parseFloat(row.recommendation_score) || 0,
      reason: row.reason || "추천 게시글",
      // 사용자 정보 추가
      author: {
        id: row.user_id,
        nickname: row.nickname || row.username || "익명",
        profile_image: row.profile_image,
      },
      // 해시태그 정보 추가 (JSON 배열을 파싱)
      hashtags: Array.isArray(row.hashtags)
        ? row.hashtags
        : row.hashtags
        ? JSON.parse(row.hashtags)
        : [],
      // 통계 정보를 직접 속성으로 추가
      likes: parseInt(row.likes) || 0,
      comments: parseInt(row.comments) || 0,
      shares: parseInt(row.shares) || 0,
      bookmarks: parseInt(row.bookmarks) || 0,
      views: parseInt(row.views) || 0,
      interaction_summary: {
        likes: parseInt(row.likes) || 0,
        comments: parseInt(row.comments) || 0,
        shares: parseInt(row.shares) || 0,
        bookmarks: parseInt(row.bookmarks) || 0,
        views: parseInt(row.views) || 0,
      },
    };
  }
}
