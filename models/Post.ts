import { pool } from "../config/database";
import { log } from "../utils/logger";
import { getKoreanTime } from "../utils/time";
import { BlockModel } from "./Block";

export interface Post {
  id: string;
  user_id: string;
  content: string;
  thumbnail_url?: string;
  og_link?: string;
  visibility: "public" | "followers" | "private";
  hide_likes: boolean;
  hide_views: boolean;
  allow_comments: boolean;
  created_at: Date;
  updated_at: Date;
  is_edited?: boolean;
  author?: {
    id: string;
    username: string;
    nickname: string;
    profileImage?: string;
  };
}

export interface CreatePostData {
  user_id: string;
  content: string;
  thumbnail_url?: string;
  og_link?: string;
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
      const currentTime = getKoreanTime();

      const result = await client.query(
        `INSERT INTO posts (user_id, content, thumbnail_url, og_link, visibility, hide_likes, hide_views, allow_comments, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
         RETURNING *`,
        [
          postData.user_id,
          postData.content,
          postData.thumbnail_url || null,
          postData.og_link || null,
          postData.visibility || "public",
          postData.hide_likes || false,
          postData.hide_views || false,
          postData.allow_comments !== undefined
            ? postData.allow_comments
            : true,
          currentTime,
          currentTime,
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

  // 게시글 ID로 찾기
  static async findById(id: string, viewerId?: string): Promise<Post | null> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT p.*, u.username, u.nickname, u.profile_image 
         FROM posts p 
         JOIN users u ON p.user_id = u.id 
         WHERE p.id = $1`,
        [id]
      );
      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      const post = this.mapRowToPost(result.rows[0]);

      // 차단 관계 확인 (viewerId가 있는 경우)
      if (viewerId && viewerId !== post.user_id) {
        const isBlocked = await BlockModel.isBlocked(viewerId, post.user_id);
        if (isBlocked) {
          // 차단된 경우 null 반환 (투명한 차단)
          return null;
        }
      }

      return post;
    } catch (error) {
      log("ERROR", "게시글 조회 실패 (ID)", error);
      throw error;
    }
  }

  // 사용자 ID로 게시글 목록 조회
  // 오버로드: viewerId 없음
  static async findByUserId(
    userId: string,
    page?: number,
    limit?: number
  ): Promise<{ posts: Post[]; total: number }>;
  // 오버로드: viewerId 포함
  static async findByUserId(
    userId: string,
    page: number,
    limit: number,
    viewerId?: string
  ): Promise<{ posts: Post[]; total: number }>;
  static async findByUserId(
    userId: string,
    page: number = 1,
    limit: number = 10,
    viewerId?: string
  ): Promise<{ posts: Post[]; total: number }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      // 차단 관계 확인 (viewerId가 있는 경우)
      if (viewerId && viewerId !== userId) {
        const isBlocked = await BlockModel.isBlocked(viewerId, userId);
        if (isBlocked) {
          // 차단된 경우 빈 결과 반환 (투명한 차단)
          client.release();
          return { posts: [], total: 0 };
        }
      }

      const isOwner = viewerId === userId;
      const params: any[] = [userId];
      let visibilityWhere = "";
      if (!isOwner) {
        visibilityWhere = `
          AND (
            p.visibility = 'public'
            OR (
              p.visibility = 'followers' AND EXISTS (
                SELECT 1 FROM follows f
                WHERE f.follower_id = $2 AND f.following_id = p.user_id AND f.is_accepted = true
              )
            )
          )
        `;
        params.push(viewerId || "");
      }

      // 전체 개수 조회
      const countQuery = `SELECT COUNT(*) FROM posts p WHERE p.user_id = $1 ${visibilityWhere}`;
      const countResult = await client.query(countQuery, params);
      const total = parseInt(countResult.rows[0].count);

      // 게시글 조회 (사용자 정보 포함)
      const selectQuery = `
        SELECT p.*, u.username, u.nickname, u.profile_image
        FROM posts p
        JOIN users u ON p.user_id = u.id
        WHERE p.user_id = $1 ${visibilityWhere}
        ORDER BY p.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      const result = await client.query(selectQuery, [
        ...params,
        limit,
        offset,
      ]);

      client.release();

      const posts = result.rows.map((row) => this.mapRowToPost(row));

      return { posts, total };
    } catch (error) {
      log("ERROR", "사용자 게시글 목록 조회 실패", error);
      throw error;
    }
  }

  // 전체 게시글 목록 조회 (공개범위/팔로우/비공개 반영 + 차단 필터링)
  static async findAll(
    page: number = 1,
    limit: number = 10,
    userId?: string // 로그인 유저 ID(없으면 public만)
  ): Promise<{ posts: Post[]; total: number }> {
    try {
      const client = await pool.connect();
      const offset = (page - 1) * limit;

      let whereClause = "";
      let countWhereClause = "";
      let params: any[] = [];

      // 차단된 사용자 목록 조회 (로그인된 경우)
      let blockedUserIds: string[] = [];
      if (userId) {
        blockedUserIds = await BlockModel.getAllBlockedRelationUserIds(userId);
      }

      if (userId) {
        let blockFilter = "";
        if (blockedUserIds.length > 0) {
          const blockPlaceholders = blockedUserIds
            .map((_, index) => `$${params.length + index + 2}`)
            .join(", ");
          blockFilter = ` AND p.user_id NOT IN (${blockPlaceholders})`;
        }

        whereClause = `
          WHERE (
            p.visibility = 'public'
            OR (p.visibility = 'followers' AND (
              p.user_id = $1
              OR EXISTS (
                SELECT 1 FROM follows
                WHERE follower_id = $1
                  AND following_id = p.user_id
                  AND is_accepted = true
              )
            ))
            OR (p.visibility = 'private' AND p.user_id = $1)
          )${blockFilter}
        `;
        countWhereClause = whereClause;
        params.push(userId);
        params.push(...blockedUserIds);
      } else {
        whereClause = "WHERE p.visibility = 'public'";
        countWhereClause = whereClause;
      }

      const countQuery = `SELECT COUNT(*) FROM posts p ${countWhereClause}`;
      const selectQuery = `SELECT p.*, u.username, u.nickname, u.profile_image FROM posts p JOIN users u ON p.user_id = u.id ${whereClause} ORDER BY p.created_at DESC LIMIT $${
        params.length + 1
      } OFFSET $${params.length + 2}`;
      params.push(limit, offset);

      const countResult = await client.query(
        countQuery,
        userId ? [userId, ...blockedUserIds] : []
      );
      const total = parseInt(countResult.rows[0].count);

      const result = await client.query(selectQuery, params);

      client.release();

      const posts = result.rows.map((row) => this.mapRowToPost(row));
      return { posts, total };
    } catch (error) {
      log("ERROR", "게시글 목록 조회 실패", error);
      throw error;
    }
  }

  // 게시글 수정
  static async update(
    id: string,
    updates: Partial<CreatePostData>
  ): Promise<Post | null> {
    try {
      const client = await pool.connect();
      const currentTime = getKoreanTime();

      const updateFields = [];
      const queryParams = [];
      let paramIndex = 1;

      if (updates.content !== undefined) {
        updateFields.push(`content = $${paramIndex++}`);
        queryParams.push(updates.content);
      }

      if (updates.thumbnail_url !== undefined) {
        updateFields.push(`thumbnail_url = $${paramIndex++}`);
        queryParams.push(updates.thumbnail_url);
      }

      if (updates.og_link !== undefined) {
        updateFields.push(`og_link = $${paramIndex++}`);
        queryParams.push(updates.og_link);
      }

      if (updates.visibility !== undefined) {
        updateFields.push(`visibility = $${paramIndex++}`);
        queryParams.push(updates.visibility);
      }

      if (updates.hide_likes !== undefined) {
        updateFields.push(`hide_likes = $${paramIndex++}`);
        queryParams.push(updates.hide_likes);
      }

      if (updates.hide_views !== undefined) {
        updateFields.push(`hide_views = $${paramIndex++}`);
        queryParams.push(updates.hide_views);
      }

      if (updates.allow_comments !== undefined) {
        updateFields.push(`allow_comments = $${paramIndex++}`);
        queryParams.push(updates.allow_comments);
      }

      // updated_at 항상 업데이트 + is_edited 표시
      updateFields.push(`updated_at = $${paramIndex++}`);
      queryParams.push(currentTime);
      updateFields.push(`is_edited = true`);

      // WHERE 조건의 id 파라미터
      queryParams.push(id);

      const query = `UPDATE posts SET ${updateFields.join(
        ", "
      )} WHERE id = $${paramIndex} RETURNING *`;

      const result = await client.query(query, queryParams);
      client.release();

      if (result.rows.length === 0) {
        return null;
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

  // 게시글 존재 여부 확인
  static async exists(id: string): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query("SELECT id FROM posts WHERE id = $1", [
        id,
      ]);
      client.release();

      return result.rows.length > 0;
    } catch (error) {
      log("ERROR", "게시글 존재 확인 실패", error);
      throw error;
    }
  }

  // 게시글 소유자 확인
  static async isOwner(id: string, userId: string): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT user_id FROM posts WHERE id = $1",
        [id]
      );
      client.release();

      return result.rows.length > 0 && result.rows[0].user_id === userId;
    } catch (error) {
      log("ERROR", "게시글 소유자 확인 실패", error);
      throw error;
    }
  }

  // 데이터베이스 행을 Post 객체로 변환
  private static mapRowToPost(row: any): Post {
    return {
      id: row.id,
      user_id: row.user_id,
      content: row.content,
      thumbnail_url: row.thumbnail_url,
      og_link: row.og_link,
      visibility: row.visibility,
      hide_likes: row.hide_likes,
      hide_views: row.hide_views,
      allow_comments: row.allow_comments,
      created_at: row.created_at,
      updated_at: row.updated_at,
      is_edited: row.is_edited,
      author: {
        id: row.user_id,
        username: row.username,
        nickname: row.nickname,
        profileImage: row.profile_image,
      },
    };
  }
}
