import { pool } from "../config/database";
import { log } from "../utils/logger";
import { getKoreanTime } from "../utils/time";

export interface Comment {
  id: string;
  post_id: string;
  user_id: string;
  parent_id?: string;
  content: string;
  is_edited: boolean;
  created_at: Date;
  author?: {
    id: string;
    username: string;
    nickname: string;
    profileImage?: string;
  };
  replies?: Comment[];
  like_count?: number;
  is_liked?: boolean;
}

export interface CreateCommentData {
  post_id: string;
  user_id: string;
  content: string;
  parent_id?: string;
}

export class CommentModel {
  // 댓글 생성
  static async create(commentData: CreateCommentData): Promise<Comment> {
    try {
      const client = await pool.connect();
      const currentTime = getKoreanTime();

      const result = await client.query(
        `INSERT INTO comments (post_id, user_id, parent_id, content, created_at) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [
          commentData.post_id,
          commentData.user_id,
          commentData.parent_id || null,
          commentData.content,
          currentTime,
        ]
      );

      client.release();
      return this.mapRowToComment(result.rows[0]);
    } catch (error) {
      log("ERROR", "댓글 생성 실패", error);
      throw error;
    }
  }

  // 게시글의 댓글 목록 조회 (작성자 정보 포함)
  static async findByPostId(
    postId: string,
    currentUserId?: string
  ): Promise<Comment[]> {
    try {
      const client = await pool.connect();

      const query = `
        SELECT 
          c.*,
          u.username as author_username,
          u.nickname as author_nickname,
          u.profile_image as author_profile_image,
          COUNT(l.id) as like_count,
          CASE WHEN ul.user_id IS NOT NULL THEN true ELSE false END as is_liked
        FROM comments c
        JOIN users u ON c.user_id = u.id
        LEFT JOIN likes l ON l.target_id = c.id AND l.target_type = 'comment'
        LEFT JOIN likes ul ON ul.target_id = c.id AND ul.target_type = 'comment' AND ul.user_id = $2
        WHERE c.post_id = $1 AND c.parent_id IS NULL
        GROUP BY c.id, u.username, u.nickname, u.profile_image, ul.user_id
        ORDER BY c.created_at ASC
      `;

      const result = await client.query(query, [postId, currentUserId || null]);
      client.release();

      return result.rows.map((row) => this.mapRowToCommentWithAuthor(row));
    } catch (error) {
      log("ERROR", "댓글 목록 조회 실패", error);
      throw error;
    }
  }

  // 댓글의 대댓글 조회
  static async findRepliesByParentId(
    parentId: string,
    currentUserId?: string
  ): Promise<Comment[]> {
    try {
      const client = await pool.connect();

      const query = `
        SELECT 
          c.*,
          u.username as author_username,
          u.nickname as author_nickname,
          u.profile_image as author_profile_image,
          COUNT(l.id) as like_count,
          CASE WHEN ul.user_id IS NOT NULL THEN true ELSE false END as is_liked
        FROM comments c
        JOIN users u ON c.user_id = u.id
        LEFT JOIN likes l ON l.target_id = c.id AND l.target_type = 'comment'
        LEFT JOIN likes ul ON ul.target_id = c.id AND ul.target_type = 'comment' AND ul.user_id = $2
        WHERE c.parent_id = $1
        GROUP BY c.id, u.username, u.nickname, u.profile_image, ul.user_id
        ORDER BY c.created_at ASC
      `;

      const result = await client.query(query, [
        parentId,
        currentUserId || null,
      ]);
      client.release();

      return result.rows.map((row) => this.mapRowToCommentWithAuthor(row));
    } catch (error) {
      log("ERROR", "대댓글 조회 실패", error);
      throw error;
    }
  }

  // 댓글 수정
  static async update(
    commentId: string,
    userId: string,
    content: string
  ): Promise<Comment> {
    try {
      const client = await pool.connect();
      const currentTime = getKoreanTime();

      const result = await client.query(
        `UPDATE comments 
         SET content = $1, is_edited = true 
         WHERE id = $2 AND user_id = $3 
         RETURNING *`,
        [content, commentId, userId]
      );

      client.release();

      if (result.rows.length === 0) {
        throw new Error("댓글을 찾을 수 없거나 수정 권한이 없습니다.");
      }

      return this.mapRowToComment(result.rows[0]);
    } catch (error) {
      log("ERROR", "댓글 수정 실패", error);
      throw error;
    }
  }

  // 댓글 삭제
  static async delete(commentId: string, userId: string): Promise<void> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `DELETE FROM comments WHERE id = $1 AND user_id = $2`,
        [commentId, userId]
      );

      client.release();

      if (result.rowCount === 0) {
        throw new Error("댓글을 찾을 수 없거나 삭제 권한이 없습니다.");
      }
    } catch (error) {
      log("ERROR", "댓글 삭제 실패", error);
      throw error;
    }
  }

  // 게시글의 댓글 수 조회
  static async getCommentCount(postId: string): Promise<number> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT COUNT(*) as count FROM comments WHERE post_id = $1`,
        [postId]
      );
      client.release();

      return parseInt(result.rows[0].count, 10);
    } catch (error) {
      log("ERROR", "댓글 수 조회 실패", error);
      throw error;
    }
  }

  // DB 행을 Comment 객체로 변환
  private static mapRowToComment(row: any): Comment {
    return {
      id: row.id,
      post_id: row.post_id,
      user_id: row.user_id,
      parent_id: row.parent_id,
      content: row.content,
      is_edited: row.is_edited,
      created_at: new Date(row.created_at),
    };
  }

  // DB 행을 작성자 정보가 포함된 Comment 객체로 변환
  private static mapRowToCommentWithAuthor(row: any): Comment {
    return {
      id: row.id,
      post_id: row.post_id,
      user_id: row.user_id,
      parent_id: row.parent_id,
      content: row.content,
      is_edited: row.is_edited,
      created_at: new Date(row.created_at),
      author: {
        id: row.user_id,
        username: row.author_username,
        nickname: row.author_nickname,
        profileImage: row.author_profile_image,
      },
      like_count: parseInt(row.like_count, 10) || 0,
      is_liked: row.is_liked || false,
    };
  }
}
