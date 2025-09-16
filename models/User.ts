import { pool } from "../config/database";
import { log } from "../utils/logger";
import { getKoreanTime } from "../utils/time";

// NextAuth에서 전송하는 Google 사용자 정보
export interface NextAuthGoogleUser {
  googleId: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified: boolean;
}

export interface NotificationPreferences {
  follow: boolean; // 팔로우 알림
  followee_post: boolean; // 팔로잉 게시물 알림
  post_liked: boolean; // 게시물 좋아요 알림
  comment_liked: boolean; // 댓글 좋아요 알림
  post_commented: boolean; // 게시물 댓글 알림
  mention_comment: boolean; // 멘션 알림
}

export interface User {
  id: string; // Google ID를 직접 사용
  email: string;
  username: string;
  nickname?: string;
  bio?: string;
  profileImage?: string;
  isCustomProfileImage: boolean; // 사용자가 직접 설정한 프로필 이미지인지 여부
  visibility: string;
  followApprovalMode?: string; // 팔로우 승인 방식 ('auto' | 'manual')
  showMutualFollow?: boolean; // 상호 팔로우 표시 여부
  notificationPreferences?: NotificationPreferences; // 알림 설정
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

      const koreanTime = getKoreanTime();

      const result = await client.query(
        `INSERT INTO users (id, email, username, nickname, bio, profile_image, is_custom_profile_image, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) 
         RETURNING *`,
        [
          userData.googleId, // Google ID를 직접 id로 사용
          userData.email,
          username,
          userData.name, // nickname으로 사용
          "", // bio 기본값으로 빈 문자열
          userData.picture || null,
          false, // is_custom_profile_image 기본값은 false (구글 기본 이미지)
          koreanTime, // 한국시간으로 created_at 설정
          koreanTime, // 한국시간으로 updated_at 설정
        ]
      );
      client.release();

      log("INFO", "새 사용자 생성 (한국시간)", {
        id: userData.googleId,
        email: userData.email,
        username: username,
        nickname: userData.name,
        createdAt: koreanTime,
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
      if (updates.isCustomProfileImage !== undefined) {
        setParts.push(`is_custom_profile_image = $${paramIndex++}`);
        values.push(updates.isCustomProfileImage);
      }
      if (updates.visibility !== undefined) {
        setParts.push(`visibility = $${paramIndex++}`);
        values.push(updates.visibility);
      }
      if (updates.followApprovalMode !== undefined) {
        setParts.push(`follow_approval_mode = $${paramIndex++}`);
        values.push(updates.followApprovalMode);
      }
      if (updates.showMutualFollow !== undefined) {
        setParts.push(`show_mutual_follow = $${paramIndex++}`);
        values.push(updates.showMutualFollow);
      }
      if (updates.notificationPreferences !== undefined) {
        setParts.push(`notification_preferences = $${paramIndex++}`);
        values.push(JSON.stringify(updates.notificationPreferences));
      }

      if (setParts.length === 0) {
        client.release();
        return this.findById(id);
      }

      // updated_at을 한국시간으로 설정
      const koreanTime = getKoreanTime();
      setParts.push(`updated_at = $${paramIndex++}`);
      values.push(koreanTime);

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

      log("INFO", "사용자 정보 업데이트 (한국시간)", {
        id: id,
        updatedAt: koreanTime,
        updates: updates,
      });

      return this.mapRowToUser(result.rows[0]);
    } catch (error) {
      log("ERROR", "사용자 업데이트 실패", error);
      throw error;
    }
  }

  // 추천 유저(팔로우하지 않은 인기 유저 + 친구의 친구) + 차단 필터링
  static async getSuggestedUsers(
    userId: string,
    limit: number = 10
  ): Promise<any[]> {
    try {
      const client = await pool.connect();

      // 차단된 사용자 목록 조회
      const { BlockModel } = await import("./Block");
      const blockedUserIds = await BlockModel.getAllBlockedRelationUserIds(
        userId
      );

      // 차단된 사용자 제외 조건 생성
      let blockFilter = "";
      let queryParams = [userId, limit];

      if (blockedUserIds.length > 0) {
        const placeholders = blockedUserIds
          .map((_, index) => `$${index + 3}`)
          .join(", ");
        blockFilter = ` AND u.id NOT IN (${placeholders})`;
        queryParams.push(...blockedUserIds);
      }

      const result = await client.query(
        `
        WITH my_follows AS (
          SELECT following_id
          FROM follows
          WHERE follower_id = $1 AND is_accepted = true
        ),
        friends_follows AS (
          SELECT f2.following_id AS user_id
          FROM follows f1
          JOIN follows f2 ON f1.following_id = f2.follower_id
          WHERE f1.follower_id = $1
            AND f2.is_accepted = true
            AND f2.following_id != $1
            AND f2.following_id NOT IN (SELECT following_id FROM my_follows)
        ),
        popular_users AS (
          SELECT u.id
          FROM users u
          LEFT JOIN follows f ON u.id = f.following_id AND f.is_accepted = true
          WHERE u.id != $1
            AND u.id NOT IN (SELECT following_id FROM my_follows)
            ${blockFilter}
          GROUP BY u.id
          ORDER BY COUNT(f.follower_id) DESC
          LIMIT $2
        )
        SELECT
          u.id,
          u.username,
          u.nickname,
          u.profile_image,
          COUNT(f2.follower_id) AS followers,
          CASE
            WHEN u.id IN (SELECT user_id FROM friends_follows) THEN 'friend_of_friend'
            ELSE 'popular'
          END AS reason
        FROM users u
        LEFT JOIN follows f2 ON u.id = f2.following_id AND f2.is_accepted = true
        WHERE u.id IN (
            SELECT user_id FROM friends_follows
            UNION
            SELECT id FROM popular_users
        )
        ${blockFilter}
        GROUP BY u.id, u.username, u.nickname, u.profile_image
        ORDER BY reason, followers DESC
        LIMIT $2;
      `,
        queryParams
      );
      client.release();
      return result.rows;
    } catch (error) {
      log("ERROR", "추천 유저 조회 실패", error);
      throw error;
    }
  }

  // 멘션/검색용 간단 사용자 검색 (username, nickname LIKE)
  static async searchByQuery(q: string, limit: number = 5): Promise<any[]> {
    try {
      const client = await pool.connect();
      const like = `%${q}%`;
      const result = await client.query(
        `SELECT id, username, nickname, profile_image
         FROM users
         WHERE username ILIKE $1 OR nickname ILIKE $1
         ORDER BY username ASC
         LIMIT $2`,
        [like, limit]
      );
      client.release();
      return result.rows;
    } catch (error) {
      log("ERROR", "사용자 검색 실패 (query)", error);
      throw error;
    }
  }

  // 알림 설정 조회
  static async getNotificationPreferences(
    userId: string
  ): Promise<NotificationPreferences | null> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        "SELECT notification_preferences FROM users WHERE id = $1",
        [userId]
      );
      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      const preferences = result.rows[0].notification_preferences;
      // 기본값 설정
      const defaultPreferences: NotificationPreferences = {
        follow: true,
        followee_post: true,
        post_liked: true,
        comment_liked: true,
        post_commented: true,
        mention_comment: true,
      };

      return preferences
        ? { ...defaultPreferences, ...preferences }
        : defaultPreferences;
    } catch (error) {
      log("ERROR", "알림 설정 조회 실패", error);
      throw error;
    }
  }

  // 알림 설정 업데이트
  static async updateNotificationPreferences(
    userId: string,
    preferences: Partial<NotificationPreferences>
  ): Promise<NotificationPreferences | null> {
    try {
      const client = await pool.connect();

      // 현재 설정 조회
      const currentPreferences = await this.getNotificationPreferences(userId);
      if (!currentPreferences) {
        client.release();
        return null;
      }

      // 새로운 설정 병합
      const updatedPreferences = { ...currentPreferences, ...preferences };

      const koreanTime = getKoreanTime();
      const result = await client.query(
        `UPDATE users 
         SET notification_preferences = $1, updated_at = $2 
         WHERE id = $3 
         RETURNING notification_preferences`,
        [JSON.stringify(updatedPreferences), koreanTime, userId]
      );
      client.release();

      if (result.rows.length === 0) {
        return null;
      }

      log("INFO", "알림 설정 업데이트", {
        userId,
        preferences: updatedPreferences,
        updatedAt: koreanTime,
      });

      return result.rows[0].notification_preferences;
    } catch (error) {
      log("ERROR", "알림 설정 업데이트 실패", error);
      throw error;
    }
  }

  // 특정 알림 타입 토글
  static async toggleNotificationPreference(
    userId: string,
    type: keyof NotificationPreferences
  ): Promise<NotificationPreferences | null> {
    try {
      const currentPreferences = await this.getNotificationPreferences(userId);
      if (!currentPreferences) {
        return null;
      }

      const updatedPreferences = {
        ...currentPreferences,
        [type]: !currentPreferences[type],
      };

      return await this.updateNotificationPreferences(
        userId,
        updatedPreferences
      );
    } catch (error) {
      log("ERROR", "알림 설정 토글 실패", error);
      throw error;
    }
  }

  // 특정 알림 타입이 활성화되어 있는지 확인
  static async isNotificationEnabled(
    userId: string,
    type: keyof NotificationPreferences
  ): Promise<boolean> {
    try {
      const preferences = await this.getNotificationPreferences(userId);
      return preferences ? preferences[type] : true; // 기본값은 true
    } catch (error) {
      log("ERROR", "알림 설정 확인 실패", error);
      return true; // 에러 시 기본값 true
    }
  }

  // 데이터베이스 행을 User 객체로 변환
  private static mapRowToUser(row: any): User {
    // 알림 설정 기본값
    const defaultNotificationPreferences: NotificationPreferences = {
      follow: true,
      followee_post: true,
      post_liked: true,
      comment_liked: true,
      post_commented: true,
      mention_comment: true,
    };

    return {
      id: row.id, // Google ID
      email: row.email,
      username: row.username,
      nickname: row.nickname,
      bio: row.bio,
      profileImage: row.profile_image,
      isCustomProfileImage: row.is_custom_profile_image || false,
      visibility: row.visibility,
      followApprovalMode: row.follow_approval_mode || "auto",
      showMutualFollow: row.show_mutual_follow !== false, // 기본값 true
      notificationPreferences: row.notification_preferences
        ? { ...defaultNotificationPreferences, ...row.notification_preferences }
        : defaultNotificationPreferences,
      role: row.role,
      emailVerified: row.email_verified,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }
}
