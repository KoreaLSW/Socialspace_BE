import { pool } from "../config/database";
import { log } from "../utils/logger";

// NextAuth에서 전송하는 Google 사용자 정보
export interface NextAuthGoogleUser {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

export interface User {
  id: string; // Google ID를 직접 사용
  email: string;
  username: string;
  nickname?: string;
  bio?: string;
  profileImage?: string;
  visibility: string;
  role: string;
  emailVerified: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export class UserModel {
  // 사용자 ID로 찾기 (Google ID)
  static async findById(id: string): Promise<User | null> {
    try {
      const client = await pool.connect();
      const result = await client.query("SELECT * FROM users WHERE id = $1", [
        id,
      ]);
      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      log("ERROR", "사용자 조회 실패 (ID)", error);
      throw error;
    }
  }

  // 이메일로 사용자 찾기
  static async findByEmail(email: string): Promise<User | null> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT * FROM users WHERE email = $1",
        [email]
      );
      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      log("ERROR", "사용자 조회 실패 (이메일)", error);
      throw error;
    }
  }

  // 사용자명으로 찾기
  static async findByUsername(username: string): Promise<User | null> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT * FROM users WHERE username = $1",
        [username]
      );
      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      log("ERROR", "사용자 조회 실패 (사용자명)", error);
      throw error;
    }
  }

  // 새 사용자 생성 (NextAuth 방식)
  static async create(userData: NextAuthGoogleUser): Promise<User> {
    try {
      const client = await pool.connect();

      // 이메일에서 기본 사용자명 생성
      const baseUsername = userData.email.split("@")[0];
      let username = baseUsername;

      // 사용자명이 이미 존재하면 숫자 추가
      let counter = 1;
      while (await this.findByUsername(username)) {
        username = `${baseUsername}${counter}`;
        counter++;
      }

      const result = await client.query(
        `INSERT INTO users (id, email, username, nickname, bio, profile_image) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         RETURNING *`,
        [
          userData.googleId, // Google ID를 직접 id로 사용
          userData.email,
          username,
          userData.name, // nickname으로 사용
          "", // bio 기본값으로 빈 문자열
          userData.picture || null,
        ]
      );
      client.release();

      log("INFO", "새 사용자 생성", {
        id: userData.googleId,
        email: userData.email,
        username: username,
        nickname: userData.name,
      });

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      log("ERROR", "사용자 생성 실패", error);
      throw error;
    }
  }

  // 사용자 정보 업데이트
  static async update(
    id: string,
    updates: Partial<User>
  ): Promise<User | null> {
    try {
      const client = await pool.connect();

      const setParts: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (updates.nickname !== undefined) {
        setParts.push(`nickname = $${paramIndex++}`);
        values.push(updates.nickname);
      }
      if (updates.bio !== undefined) {
        setParts.push(`bio = $${paramIndex++}`);
        values.push(updates.bio);
      }
      if (updates.profileImage !== undefined) {
        setParts.push(`profile_image = $${paramIndex++}`);
        values.push(updates.profileImage);
      }
      if (updates.visibility !== undefined) {
        setParts.push(`visibility = $${paramIndex++}`);
        values.push(updates.visibility);
      }

      if (setParts.length === 0) {
        client.release();
        return this.findById(id);
      }

      values.push(id);
      const result = await client.query(
        `UPDATE users SET ${setParts.join(
          ", "
        )} WHERE id = $${paramIndex} RETURNING *`,
        values
      );
      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      log("ERROR", "사용자 업데이트 실패", error);
      throw error;
    }
  }

  // 데이터베이스 행을 User 객체로 변환
  private static mapRowToUser(row: any): User {
    return {
      id: row.id, // Google ID
      email: row.email,
      username: row.username,
      nickname: row.nickname,
      bio: row.bio,
      profileImage: row.profile_image,
      visibility: row.visibility,
      role: row.role,
      emailVerified: row.email_verified,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
