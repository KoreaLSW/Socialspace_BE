import { pool } from "../config/database";
import { log } from "../utils/logger";

export interface PostImage {
  id: string;
  post_id: string;
  image_url: string;
  order_index: number;
}

export interface CreatePostImageData {
  post_id: string;
  image_url: string;
  order_index: number;
}

export class PostImageModel {
  // 게시글 이미지 생성
  static async create(imageData: CreatePostImageData): Promise<PostImage> {
    try {
      const client = await pool.connect();

      const result = await client.query(
        `INSERT INTO post_images (post_id, image_url, order_index) 
         VALUES ($1, $2, $3) 
         RETURNING *`,
        [imageData.post_id, imageData.image_url, imageData.order_index]
      );

      client.release();

      if (result.rows.length === 0) {
        throw new Error("이미지 생성 실패");
      }

      return this.mapRowToPostImage(result.rows[0]);
    } catch (error) {
      log("ERROR", "게시글 이미지 생성 실패", error);
      throw error;
    }
  }

  // 여러 이미지 한번에 생성
  static async createMultiple(
    postId: string,
    imageUrls: string[]
  ): Promise<PostImage[]> {
    try {
      const client = await pool.connect();
      const images: PostImage[] = [];

      for (let i = 0; i < imageUrls.length; i++) {
        const result = await client.query(
          `INSERT INTO post_images (post_id, image_url, order_index) 
           VALUES ($1, $2, $3) 
           RETURNING *`,
          [postId, imageUrls[i], i + 1]
        );

        if (result.rows.length > 0) {
          images.push(this.mapRowToPostImage(result.rows[0]));
        }
      }

      client.release();
      return images;
    } catch (error) {
      log("ERROR", "다중 이미지 생성 실패", error);
      throw error;
    }
  }

  // 게시글 ID로 이미지 목록 조회
  static async findByPostId(postId: string): Promise<PostImage[]> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT * FROM post_images WHERE post_id = $1 ORDER BY order_index",
        [postId]
      );
      client.release();

      return result.rows.map((row) => this.mapRowToPostImage(row));
    } catch (error) {
      log("ERROR", "게시글 이미지 조회 실패", error);
      throw error;
    }
  }

  // 이미지 ID로 찾기
  static async findById(id: string): Promise<PostImage | null> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT * FROM post_images WHERE id = $1",
        [id]
      );
      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToPostImage(result.rows[0]);
    } catch (error) {
      log("ERROR", "이미지 조회 실패 (ID)", error);
      throw error;
    }
  }

  // 이미지 삭제
  static async delete(id: string): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "DELETE FROM post_images WHERE id = $1",
        [id]
      );
      client.release();

      return (result.rowCount || 0) > 0;
    } catch (error) {
      log("ERROR", "이미지 삭제 실패", error);
      throw error;
    }
  }

  // 게시글의 모든 이미지 삭제
  static async deleteByPostId(postId: string): Promise<boolean> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "DELETE FROM post_images WHERE post_id = $1",
        [postId]
      );
      client.release();

      return (result.rowCount || 0) > 0;
    } catch (error) {
      log("ERROR", "게시글 이미지 전체 삭제 실패", error);
      throw error;
    }
  }

  // 이미지 순서 업데이트
  static async updateOrder(
    id: string,
    newOrder: number
  ): Promise<PostImage | null> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "UPDATE post_images SET order_index = $1 WHERE id = $2 RETURNING *",
        [newOrder, id]
      );
      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToPostImage(result.rows[0]);
    } catch (error) {
      log("ERROR", "이미지 순서 업데이트 실패", error);
      throw error;
    }
  }

  // 데이터베이스 행을 PostImage 객체로 변환
  private static mapRowToPostImage(row: any): PostImage {
    return {
      id: row.id,
      post_id: row.post_id,
      image_url: row.image_url,
      order_index: row.order_index,
    };
  }
}
