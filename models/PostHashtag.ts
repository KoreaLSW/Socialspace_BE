import { pool } from "../config/database";
import { log } from "../utils/logger";

export interface PostHashtag {
  post_id: string;
  hashtag_id: string;
}

export interface CreatePostHashtagData {
  post_id: string;
  hashtag_id: string;
}

export class PostHashtagModel {
  // 게시글-해시태그 연결 생성
  static async create(data: CreatePostHashtagData): Promise<PostHashtag> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `INSERT INTO post_hashtags (post_id, hashtag_id) 
         VALUES ($1, $2) 
         RETURNING *`,
        [data.post_id, data.hashtag_id]
      );

      client.release();

      if (result.rows.length === 0) {
        throw new Error("게시글-해시태그 연결 생성 실패");
      }

      return this.mapRowToPostHashtag(result.rows[0]);
    } catch (error) {
      log("ERROR", "게시글-해시태그 연결 생성 실패", error);
      throw error;
    }
  }

  // 여러 해시태그를 게시글에 연결
  static async createMultiple(
    postId: string,
    hashtagIds: string[]
  ): Promise<PostHashtag[]> {
    try {
      const client = await pool.connect();
      const connections: PostHashtag[] = [];

      for (const hashtagId of hashtagIds) {
        const result = await client.query(
          `INSERT INTO post_hashtags (post_id, hashtag_id) 
           VALUES ($1, $2) 
           RETURNING *`,
          [postId, hashtagId]
        );

        if (result.rows.length > 0) {
          connections.push(this.mapRowToPostHashtag(result.rows[0]));
        }
      }

      client.release();
      return connections;
    } catch (error) {
      log("ERROR", "다중 해시태그 연결 생성 실패", error);
      throw error;
    }
  }

  // 게시글의 해시태그 조회
  static async findByPostId(postId: string): Promise<PostHashtag[]> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT * FROM post_hashtags WHERE post_id = $1",
        [postId]
      );
      client.release();

      return result.rows.map((row) => this.mapRowToPostHashtag(row));
    } catch (error) {
      log("ERROR", "게시글 해시태그 조회 실패", error);
      throw error;
    }
  }

  // 해시태그가 사용된 게시글 조회
  static async findByHashtagId(hashtagId: string): Promise<PostHashtag[]> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT * FROM post_hashtags WHERE hashtag_id = $1",
        [hashtagId]
      );
      client.release();

      return result.rows.map((row) => this.mapRowToPostHashtag(row));
    } catch (error) {
      log("ERROR", "해시태그 게시글 조회 실패", error);
      throw error;
    }
  }

  // 게시글의 해시태그 정보 조회 (JOIN)
  static async getHashtagsByPostId(postId: string): Promise<any[]> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT h.id, h.tag, h.created_at
         FROM hashtags h
         INNER JOIN post_hashtags ph ON h.id = ph.hashtag_id
         WHERE ph.post_id = $1
         ORDER BY h.tag`,
        [postId]
      );
      client.release();

      return result.rows;
    } catch (error) {
      log("ERROR", "게시글 해시태그 정보 조회 실패", error);
      throw error;
    }
  }

  // 해시태그로 게시글 조회 (JOIN)
  // 오버로드 시그니처 (viewerId 없음)
  static async getPostsByHashtagId(
    hashtagId: string,
    page?: number,
    limit?: number
  ): Promise<{ posts: any[]; total: number }>;
  // 오버로드 시그니처 (viewerId 포함)
  static async getPostsByHashtagId(
    hashtagId: string,
    page: number,
    limit: number,
    viewerId?: string
  ): Promise<{ posts: any[]; total: number }>;
  static async getPostsByHashtagId(
    hashtagId: string,
    page: number = 1,
    limit: number = 10,
    viewerId?: string
  ): Promise<{ posts: any[]; total: number }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      const params: any[] = [hashtagId];
      let visibilityWhere = " AND p.visibility = 'public'";
      if (viewerId) {
        visibilityWhere = `
          AND (
            p.visibility = 'public'
            OR (p.visibility = 'followers' AND (
              p.user_id = $2 OR EXISTS (
                SELECT 1 FROM follows f
                WHERE f.follower_id = $2 AND f.following_id = p.user_id AND f.is_accepted = true
              )
            ))
            OR (p.visibility = 'private' AND p.user_id = $2)
          )
        `;
        params.push(viewerId);
      }

      // 전체 개수 조회
      const countQuery = `
        SELECT COUNT(*) FROM posts p
        INNER JOIN post_hashtags ph ON p.id = ph.post_id
        WHERE ph.hashtag_id = $1 ${visibilityWhere}
      `;
      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // 게시글 조회
      const selectQuery = `
        SELECT p.*, u.username, u.nickname, u.profile_image
        FROM posts p
        INNER JOIN post_hashtags ph ON p.id = ph.post_id
        INNER JOIN users u ON p.user_id = u.id
        WHERE ph.hashtag_id = $1 ${visibilityWhere}
        ORDER BY p.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      const result = await client.query(selectQuery, [
        ...params,
        limit,
        offset,
      ]);

      client.release();

      return { posts: result.rows, total };
    } catch (error) {
      log("ERROR", "해시태그 게시글 조회 실패", error);
      throw error;
    }
  }

  // 특정 연결 삭제
  static async delete(postId: string, hashtagId: string): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "DELETE FROM post_hashtags WHERE post_id = $1 AND hashtag_id = $2",
        [postId, hashtagId]
      );
      client.release();

      return (result.rowCount || 0) > 0;
    } catch (error) {
      log("ERROR", "게시글-해시태그 연결 삭제 실패", error);
      throw error;
    }
  }

  // 게시글의 모든 해시태그 연결 삭제
  static async deleteByPostId(postId: string): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "DELETE FROM post_hashtags WHERE post_id = $1",
        [postId]
      );
      client.release();

      return (result.rowCount || 0) > 0;
    } catch (error) {
      log("ERROR", "게시글 해시태그 전체 삭제 실패", error);
      throw error;
    }
  }

  // 해시태그의 모든 게시글 연결 삭제
  static async deleteByHashtagId(hashtagId: string): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "DELETE FROM post_hashtags WHERE hashtag_id = $1",
        [hashtagId]
      );
      client.release();

      return (result.rowCount || 0) > 0;
    } catch (error) {
      log("ERROR", "해시태그 게시글 전체 삭제 실패", error);
      throw error;
    }
  }

  // 연결 존재 여부 확인
  static async exists(postId: string, hashtagId: string): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT 1 FROM post_hashtags WHERE post_id = $1 AND hashtag_id = $2",
        [postId, hashtagId]
      );
      client.release();

      return result.rows.length > 0;
    } catch (error) {
      log("ERROR", "연결 존재 확인 실패", error);
      throw error;
    }
  }

  // 데이터베이스 행을 PostHashtag 객체로 변환
  private static mapRowToPostHashtag(row: any): PostHashtag {
    return {
      post_id: row.post_id,
      hashtag_id: row.hashtag_id,
    };
  }
}
