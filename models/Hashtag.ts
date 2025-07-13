import { pool } from "../config/database";
import { log } from "../utils/logger";

export interface Hashtag {
  id: string;
  tag: string;
  created_at: Date;
}

export interface CreateHashtagData {
  tag: string;
}

export class HashtagModel {
  // 해시태그 생성
  static async create(tagData: CreateHashtagData): Promise<Hashtag> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `INSERT INTO hashtags (tag) 
         VALUES ($1) 
         RETURNING *`,
        [tagData.tag]
      );

      client.release();

      if (result.rows.length === 0) {
        throw new Error("해시태그 생성 실패");
      }

      return this.mapRowToHashtag(result.rows[0]);
    } catch (error) {
      log("ERROR", "해시태그 생성 실패", error);
      throw error;
    }
  }

  // 해시태그 찾기 또는 생성
  static async findOrCreate(tag: string): Promise<Hashtag> {
    try {
      const client = await pool.connect();

      // 먼저 기존 해시태그 찾기
      let result = await client.query("SELECT * FROM hashtags WHERE tag = $1", [
        tag,
      ]);

      if (result.rows.length > 0) {
        client.release();
        return this.mapRowToHashtag(result.rows[0]);
      }

      // 없으면 새로 생성
      result = await client.query(
        `INSERT INTO hashtags (tag) 
         VALUES ($1) 
         RETURNING *`,
        [tag]
      );

      client.release();

      if (result.rows.length === 0) {
        throw new Error("해시태그 생성 실패");
      }

      return this.mapRowToHashtag(result.rows[0]);
    } catch (error) {
      log("ERROR", "해시태그 찾기/생성 실패", error);
      throw error;
    }
  }

  // 해시태그 ID로 찾기
  static async findById(id: string): Promise<Hashtag | null> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT * FROM hashtags WHERE id = $1",
        [id]
      );
      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToHashtag(result.rows[0]);
    } catch (error) {
      log("ERROR", "해시태그 조회 실패 (ID)", error);
      throw error;
    }
  }

  // 해시태그 텍스트로 찾기
  static async findByTag(tag: string): Promise<Hashtag | null> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT * FROM hashtags WHERE tag = $1",
        [tag]
      );
      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToHashtag(result.rows[0]);
    } catch (error) {
      log("ERROR", "해시태그 조회 실패 (태그)", error);
      throw error;
    }
  }

  // 모든 해시태그 조회 (페이지네이션)
  static async findAll(
    page: number = 1,
    limit: number = 20
  ): Promise<{ hashtags: Hashtag[]; total: number }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      // 전체 개수 조회
      const countResult = await client.query("SELECT COUNT(*) FROM hashtags");
      const total = parseInt(countResult.rows[0].count);

      // 해시태그 조회
      const result = await client.query(
        `SELECT * FROM hashtags 
         ORDER BY created_at DESC 
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      client.release();

      const hashtags = result.rows.map((row) => this.mapRowToHashtag(row));

      return { hashtags, total };
    } catch (error) {
      log("ERROR", "해시태그 목록 조회 실패", error);
      throw error;
    }
  }

  // 해시태그 검색 (부분 일치)
  static async search(query: string, limit: number = 10): Promise<Hashtag[]> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT * FROM hashtags 
         WHERE tag ILIKE $1 
         ORDER BY tag 
         LIMIT $2`,
        [`%${query}%`, limit]
      );
      client.release();

      return result.rows.map((row) => this.mapRowToHashtag(row));
    } catch (error) {
      log("ERROR", "해시태그 검색 실패", error);
      throw error;
    }
  }

  // 해시태그 삭제
  static async delete(id: string): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query("DELETE FROM hashtags WHERE id = $1", [
        id,
      ]);
      client.release();

      return (result.rowCount || 0) > 0;
    } catch (error) {
      log("ERROR", "해시태그 삭제 실패", error);
      throw error;
    }
  }

  // 인기 해시태그 조회 (게시글 수 기준)
  static async getPopular(
    limit: number = 10
  ): Promise<(Hashtag & { post_count: number })[]> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT h.*, COUNT(ph.post_id) as post_count
         FROM hashtags h
         LEFT JOIN post_hashtags ph ON h.id = ph.hashtag_id
         GROUP BY h.id, h.tag, h.created_at
         ORDER BY post_count DESC, h.created_at DESC
         LIMIT $1`,
        [limit]
      );
      client.release();

      return result.rows.map((row) => ({
        ...this.mapRowToHashtag(row),
        post_count: parseInt(row.post_count),
      }));
    } catch (error) {
      log("ERROR", "인기 해시태그 조회 실패", error);
      throw error;
    }
  }

  // 데이터베이스 행을 Hashtag 객체로 변환
  private static mapRowToHashtag(row: any): Hashtag {
    return {
      id: row.id,
      tag: row.tag,
      created_at: row.created_at,
    };
  }
}
