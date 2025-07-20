import { pool } from "../../config/database";
import { log } from "../../utils/logger";

export interface Post {
  id: string;
  user_id: string;
  content: string;
  thumbnail_url?: string;
  og_link?: string;
  created_at: Date;
  updated_at: Date;
  visibility: "public" | "followers" | "private";
  hide_likes: boolean;
  hide_views: boolean;
  allow_comments: boolean;
}

export interface CreatePostData {
  user_id: string;
  content: string;
  visibility?: "public" | "followers" | "private";
  hide_likes?: boolean;
  hide_views?: boolean;
  allow_comments?: boolean;
}

export interface UpdatePostData {
  content?: string;
  visibility?: "public" | "followers" | "private";
  hide_likes?: boolean;
  hide_views?: boolean;
  allow_comments?: boolean;
}

export class PostModel {
  // 게시글 생성
  static async create(postData: CreatePostData): Promise<Post> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `INSERT INTO posts (user_id, content, visibility, hide_likes, hide_views, allow_comments) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [
          postData.user_id,
          postData.content,
          postData.visibility || "public",
          postData.hide_likes || false,
          postData.hide_views || false,
          postData.allow_comments !== undefined
            ? postData.allow_comments
            : true,
        ]
      );

      client.release();

      if (result.rows.length === 0) {
        throw new Error("게시글 생성 실패");
      }

      return this.mapRowToPost(result.rows[0]);
    } catch (error) {
      log("ERROR", "게시글 생성 실패", error);
      throw error;
    }
  }

  // ID로 게시글 조회
  static async findById(id: string): Promise<Post | null> {
    try {
      const client = await pool.connect();

      const result = await client.query("SELECT * FROM posts WHERE id = $1", [
        id,
      ]);

      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToPost(result.rows[0]);
    } catch (error) {
      log("ERROR", "게시글 조회 실패", error);
      throw error;
    }
  }

  // 전체 게시글 목록 조회 (기본 최신순)
  static async findAll(
    page: number = 1,
    limit: number = 10,
    visibility?: string
  ): Promise<{ posts: Post[]; total: number }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      let countQuery = "SELECT COUNT(*) FROM posts";
      let selectQuery = "SELECT * FROM posts";
      const queryParams: any[] = [];

      if (visibility) {
        countQuery += " WHERE visibility = $1";
        selectQuery += " WHERE visibility = $1";
        queryParams.push(visibility);
      }

      selectQuery +=
        " ORDER BY created_at DESC LIMIT $" +
        (queryParams.length + 1) +
        " OFFSET $" +
        (queryParams.length + 2);
      queryParams.push(limit, offset);

      // 전체 개수 조회
      const countResult = await client.query(
        countQuery,
        visibility ? [visibility] : []
      );
      const total = parseInt(countResult.rows[0].count);

      // 게시글 조회
      const result = await client.query(selectQuery, queryParams);

      client.release();

      const posts = result.rows.map((row) => this.mapRowToPost(row));

      return { posts, total };
    } catch (error) {
      log("ERROR", "게시글 목록 조회 실패", error);
      throw error;
    }
  }

  // 게시글 수정
  static async update(id: string, data: UpdatePostData): Promise<Post> {
    try {
      const client = await pool.connect();

      const updateFields = [];
      const values = [];
      let paramIndex = 1;

      if (data.content !== undefined) {
        updateFields.push(`content = $${paramIndex++}`);
        values.push(data.content);
      }
      if (data.visibility !== undefined) {
        updateFields.push(`visibility = $${paramIndex++}`);
        values.push(data.visibility);
      }
      if (data.hide_likes !== undefined) {
        updateFields.push(`hide_likes = $${paramIndex++}`);
        values.push(data.hide_likes);
      }
      if (data.hide_views !== undefined) {
        updateFields.push(`hide_views = $${paramIndex++}`);
        values.push(data.hide_views);
      }
      if (data.allow_comments !== undefined) {
        updateFields.push(`allow_comments = $${paramIndex++}`);
        values.push(data.allow_comments);
      }

      updateFields.push(`updated_at = $${paramIndex++}`);
      values.push(new Date());
      values.push(id);

      const query = `
        UPDATE posts 
        SET ${updateFields.join(", ")} 
        WHERE id = $${paramIndex} 
        RETURNING *
      `;

      const result = await client.query(query, values);

      client.release();

      if (result.rows.length === 0) {
        throw new Error("게시글을 찾을 수 없습니다.");
      }

      return this.mapRowToPost(result.rows[0]);
    } catch (error) {
      log("ERROR", "게시글 수정 실패", error);
      throw error;
    }
  }

  // 게시글 삭제
  static async delete(id: string): Promise<boolean> {
    try {
      const client = await pool.connect();

      const result = await client.query("DELETE FROM posts WHERE id = $1", [
        id,
      ]);

      client.release();

      return (result.rowCount || 0) > 0;
    } catch (error) {
      log("ERROR", "게시글 삭제 실패", error);
      throw error;
    }
  }

  // DB 행을 Post 객체로 변환
  private static mapRowToPost(row: any): Post {
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
    };
  }
}
