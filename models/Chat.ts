import { pool } from "../config/database";
import { log } from "../utils/logger";
import { getKoreanTime } from "../utils/time";
import { BlockModel } from "./Block";

// ========== 인터페이스 정의 ==========

export interface ChatRoom {
  id: string;
  is_group: boolean;
  name?: string;
  last_message_at: Date;
  created_at: Date;
  updated_at: Date;
  members?: ChatRoomMember[];
  last_message?: ChatMessage;
  unread_count?: number;
}

export interface ChatRoomMember {
  room_id: string;
  user_id: string;
  joined_at: Date;
  role: "owner" | "admin" | "member";
  is_muted: boolean;
  last_read_at: Date;
  user?: {
    id: string;
    username: string;
    nickname: string;
    profile_image?: string;
  };
}

export interface ChatMessage {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  message_type: "text" | "image" | "file" | "system";
  file_url?: string;
  file_name?: string;
  file_size?: number;
  created_at: Date;
  sender?: {
    id: string;
    username: string;
    nickname: string;
    profile_image?: string;
  };
  read_by?: MessageReadStatus[];
}

export interface MessageReadStatus {
  message_id: string;
  user_id: string;
  read_at: Date;
  user?: {
    id: string;
    username: string;
    nickname: string;
    profile_image?: string;
  };
}

export interface UserChatSettings {
  user_id: string;
  allow_messages_from: "everyone" | "followers" | "none";
  show_online_status: boolean;
  notification_enabled: boolean;
  created_at: Date;
  updated_at: Date;
}

// ========== 생성 데이터 타입 ==========

export interface CreateChatRoomData {
  is_group?: boolean;
  name?: string;
  member_ids: string[]; // 참여자 ID 배열
}

export interface CreateMessageData {
  room_id: string;
  sender_id: string;
  content: string;
  message_type?: "text" | "image" | "file" | "system";
  file_url?: string;
  file_name?: string;
  file_size?: number;
}

// ========== 통합 Chat 모델 클래스 ==========

export class ChatModel {
  // ========== 채팅방 관련 메서드 ==========

  /**
   * 채팅방 생성 (1:1 또는 그룹)
   */
  static async createRoom(roomData: CreateChatRoomData): Promise<ChatRoom> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentTime = getKoreanTime();

      // 1:1 채팅의 경우 기존 방이 있는지 확인
      if (!roomData.is_group && roomData.member_ids.length === 2) {
        const existingRoom = await this.findDirectRoom(
          roomData.member_ids[0],
          roomData.member_ids[1],
          client
        );
        if (existingRoom) {
          await client.query("COMMIT");
          return existingRoom;
        }
      }

      // 새 채팅방 생성
      const roomResult = await client.query(
        `INSERT INTO chat_rooms (is_group, name, last_message_at, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING *`,
        [
          roomData.is_group || false,
          roomData.name || null,
          currentTime,
          currentTime,
          currentTime,
        ]
      );

      const room = roomResult.rows[0];

      // 멤버 추가
      for (let i = 0; i < roomData.member_ids.length; i++) {
        const userId = roomData.member_ids[i];
        const role = i === 0 ? "owner" : "member"; // 첫 번째 멤버를 owner로

        await client.query(
          `INSERT INTO chat_room_members (room_id, user_id, role, joined_at, last_read_at) 
           VALUES ($1, $2, $3, $4, $5)`,
          [room.id, userId, role, currentTime, currentTime]
        );
      }

      await client.query("COMMIT");
      return this.mapRowToChatRoom(room);
    } catch (error) {
      await client.query("ROLLBACK");
      log("ERROR", "채팅방 생성 실패", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 1:1 채팅방 찾기
   */
  static async findDirectRoom(
    userId1: string,
    userId2: string,
    client?: any
  ): Promise<ChatRoom | null> {
    const dbClient = client || (await pool.connect());
    try {
      const result = await dbClient.query(
        `SELECT cr.* FROM chat_rooms cr
         WHERE cr.is_group = false
         AND EXISTS (SELECT 1 FROM chat_room_members crm1 WHERE crm1.room_id = cr.id AND crm1.user_id = $1)
         AND EXISTS (SELECT 1 FROM chat_room_members crm2 WHERE crm2.room_id = cr.id AND crm2.user_id = $2)
         AND (SELECT COUNT(*) FROM chat_room_members WHERE room_id = cr.id) = 2`,
        [userId1, userId2]
      );

      if (result.rows.length === 0) return null;
      return this.mapRowToChatRoom(result.rows[0]);
    } catch (error) {
      log("ERROR", "1:1 채팅방 조회 실패", error);
      throw error;
    } finally {
      if (!client) dbClient.release();
    }
  }

  /**
   * 사용자의 채팅방 목록 조회
   */
  static async getUserRooms(
    userId: string,
    page: number = 1,
    limit: number = 20,
    search: string = ""
  ): Promise<{ rooms: ChatRoom[]; total: number }> {
    const client = await pool.connect();
    try {
      const offset = (page - 1) * limit;

      // 차단된 사용자 목록 조회
      const blockedUserIds = await BlockModel.getAllBlockedRelationUserIds(
        userId
      );

      // 차단 필터링 조건 생성
      let blockFilter = "";
      const params: any[] = [userId];

      if (blockedUserIds.length > 0) {
        const blockPlaceholders = blockedUserIds
          .map((_, index) => `$${params.length + index + 1}`)
          .join(", ");
        blockFilter = `
          AND NOT EXISTS (
            SELECT 1 FROM chat_room_members crm_blocked 
            WHERE crm_blocked.room_id = cr.id 
            AND crm_blocked.user_id != $1
            AND crm_blocked.user_id IN (${blockPlaceholders})
          )
        `;
        params.push(...blockedUserIds);
      }

      // 검색 조건 추가
      let searchFilter = "";
      if (search && search.trim()) {
        const searchParam = `%${search.trim()}%`;
        params.push(searchParam);
        const searchParamIndex = params.length;

        searchFilter = `
          AND (
            -- 그룹 채팅방 이름 검색
            (cr.is_group = true AND cr.name ILIKE $${searchParamIndex})
            OR
            -- 1:1 채팅 상대방 이름 검색
            EXISTS (
              SELECT 1 FROM chat_room_members crm_other
              JOIN users u ON crm_other.user_id = u.id
              WHERE crm_other.room_id = cr.id 
              AND crm_other.user_id != $1
              AND (u.nickname ILIKE $${searchParamIndex} OR u.username ILIKE $${searchParamIndex})
            )
            OR
            -- 메시지 내용 검색 (전체 대화 검색)
            EXISTS (
              SELECT 1 FROM chat_messages cm_search
              WHERE cm_search.room_id = cr.id
              AND cm_search.content ILIKE $${searchParamIndex}
            )
          )
        `;
      }

      // 전체 카운트 조회
      const countResult = await client.query(
        `SELECT COUNT(DISTINCT cr.id) FROM chat_rooms cr
         JOIN chat_room_members crm ON cr.id = crm.room_id
         WHERE crm.user_id = $1 ${blockFilter} ${searchFilter}`,
        params
      );

      // 채팅방 목록 조회 (최근 메시지 순)
      params.push(limit, offset);
      const roomsResult = await client.query(
        `SELECT DISTINCT cr.*, 
                cm.content as last_message_content,
                cm.message_type as last_message_type,
                cm.created_at as last_message_created_at,
                sender.username as last_message_sender_username,
                sender.nickname as last_message_sender_nickname
         FROM chat_rooms cr
         JOIN chat_room_members crm ON cr.id = crm.room_id
         LEFT JOIN chat_messages cm ON cr.id = cm.room_id 
           AND cm.created_at = cr.last_message_at
         LEFT JOIN users sender ON cm.sender_id = sender.id
         WHERE crm.user_id = $1 ${blockFilter} ${searchFilter}
         ORDER BY cr.last_message_at DESC
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params
      );

      const rooms = await Promise.all(
        roomsResult.rows.map(async (row) => {
          const room = this.mapRowToChatRoom(row);

          // 마지막 메시지 정보 추가
          if (row.last_message_content) {
            room.last_message = {
              id: "", // 실제 구현에서는 메시지 ID도 조회
              room_id: room.id,
              sender_id: "",
              content: row.last_message_content,
              message_type: row.last_message_type,
              created_at: row.last_message_created_at,
              sender: {
                id: "",
                username: row.last_message_sender_username,
                nickname: row.last_message_sender_nickname,
              },
            };
          }

          // 멤버 정보 조회 (차단된 사용자 제외)
          room.members = await this.getRoomMembers(room.id, blockedUserIds);

          // 안읽은 메시지 수 조회
          room.unread_count = await this.getUnreadCount(room.id, userId);

          return room;
        })
      );

      return {
        rooms,
        total: parseInt(countResult.rows[0].count),
      };
    } catch (error: any) {
      log("ERROR", "사용자 채팅방 목록 조회 실패", {
        message: error?.message || "Unknown error",
        stack: error?.stack,
        userId: userId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 채팅방 멤버 조회
   */
  static async getRoomMembers(
    roomId: string,
    excludeUserIds: string[] = []
  ): Promise<ChatRoomMember[]> {
    const client = await pool.connect();
    try {
      let excludeFilter = "";
      const params = [roomId];

      if (excludeUserIds.length > 0) {
        const excludePlaceholders = excludeUserIds
          .map((_, index) => `$${params.length + index + 1}`)
          .join(", ");
        excludeFilter = `AND crm.user_id NOT IN (${excludePlaceholders})`;
        params.push(...excludeUserIds);
      }

      const result = await client.query(
        `SELECT crm.*, u.username, u.nickname, u.profile_image
         FROM chat_room_members crm
         JOIN users u ON crm.user_id = u.id
         WHERE crm.room_id = $1 ${excludeFilter}
         ORDER BY crm.joined_at ASC`,
        params
      );

      return result.rows.map(this.mapRowToChatRoomMember);
    } catch (error: any) {
      log("ERROR", "채팅방 멤버 조회 실패", {
        message: error?.message || "Unknown error",
        roomId: roomId,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  // ========== 메시지 관련 메서드 ==========

  /**
   * 메시지 생성
   */
  static async createMessage(
    messageData: CreateMessageData
  ): Promise<ChatMessage> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentTime = getKoreanTime();

      // 메시지 생성
      const result = await client.query(
        `INSERT INTO chat_messages (room_id, sender_id, content, message_type, file_url, file_name, file_size, created_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         RETURNING *`,
        [
          messageData.room_id,
          messageData.sender_id,
          messageData.content,
          messageData.message_type || "text",
          messageData.file_url || null,
          messageData.file_name || null,
          messageData.file_size || null,
          currentTime,
        ]
      );

      const message = result.rows[0];

      // 채팅방의 last_message_at 업데이트 (트리거가 있지만 명시적으로)
      await client.query(
        `UPDATE chat_rooms SET last_message_at = $1, updated_at = $2 WHERE id = $3`,
        [currentTime, currentTime, messageData.room_id]
      );

      await client.query("COMMIT");

      // 발송자 정보 포함해서 반환
      return await this.getMessageWithSender(message.id);
    } catch (error) {
      await client.query("ROLLBACK");
      log("ERROR", "메시지 생성 실패", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 채팅방의 메시지 목록 조회 (페이지네이션)
   */
  static async getRoomMessages(
    roomId: string,
    userId: string,
    page: number = 1,
    limit: number = 50
  ): Promise<{ messages: ChatMessage[]; total: number }> {
    const client = await pool.connect();
    try {
      const offset = (page - 1) * limit;

      // 사용자가 해당 채팅방의 멤버인지 확인
      const memberCheck = await client.query(
        `SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );

      if (memberCheck.rows.length === 0) {
        throw new Error("채팅방에 접근 권한이 없습니다.");
      }

      // 전체 메시지 수 조회
      const countResult = await client.query(
        `SELECT COUNT(*) FROM chat_messages WHERE room_id = $1`,
        [roomId]
      );

      // 메시지 목록 조회 (최신순)
      const messagesResult = await client.query(
        `SELECT cm.*, u.username, u.nickname, u.profile_image
         FROM chat_messages cm
         JOIN users u ON cm.sender_id = u.id
         WHERE cm.room_id = $1
         ORDER BY cm.created_at DESC
         LIMIT $2 OFFSET $3`,
        [roomId, limit, offset]
      );

      // 메시지에 읽음 상태 정보 추가
      const messages = await Promise.all(
        messagesResult.rows.map(async (row) => {
          const message = this.mapRowToChatMessage(row);
          // 각 메시지의 읽음 상태 조회
          message.read_by = await this.getReadStatusForMessage(
            message.id,
            client
          );
          return message;
        })
      );

      // 시간순으로 정렬
      messages.reverse();

      return {
        messages,
        total: parseInt(countResult.rows[0].count),
      };
    } catch (error: any) {
      log("ERROR", "채팅방 메시지 조회 실패", {
        message: error?.message || "Unknown error",
        roomId: roomId,
        userId: userId,
        page: page,
        limit: limit,
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 발송자 정보가 포함된 메시지 조회
   */
  static async getMessageWithSender(messageId: string): Promise<ChatMessage> {
    try {
      const client = await pool.connect();
      const result = await client.query(
        `SELECT cm.*, u.username, u.nickname, u.profile_image
         FROM chat_messages cm
         JOIN users u ON cm.sender_id = u.id
         WHERE cm.id = $1`,
        [messageId]
      );

      client.release();

      if (result.rows.length === 0) {
        throw new Error("메시지를 찾을 수 없습니다.");
      }

      return this.mapRowToChatMessage(result.rows[0]);
    } catch (error) {
      log("ERROR", "메시지 상세 조회 실패", error);
      throw error;
    }
  }

  // ========== 읽음 상태 관련 메서드 ==========

  /**
   * 메시지 읽음 처리
   */
  static async markMessageAsRead(
    messageId: string,
    userId: string
  ): Promise<void> {
    try {
      const client = await pool.connect();
      const currentTime = getKoreanTime();

      // 이미 읽었는지 확인
      const existingRead = await client.query(
        `SELECT 1 FROM message_read_status WHERE message_id = $1 AND user_id = $2`,
        [messageId, userId]
      );

      if (existingRead.rows.length === 0) {
        // 읽음 상태 추가
        await client.query(
          `INSERT INTO message_read_status (message_id, user_id, read_at) VALUES ($1, $2, $3)`,
          [messageId, userId, currentTime]
        );

        // 채팅방 멤버의 last_read_at 업데이트
        await client.query(
          `UPDATE chat_room_members 
           SET last_read_at = $3
           WHERE room_id = (SELECT room_id FROM chat_messages WHERE id = $1) 
           AND user_id = $2`,
          [messageId, userId, currentTime]
        );
      }

      client.release();
    } catch (error) {
      log("ERROR", "메시지 읽음 처리 실패", error);
      throw error;
    }
  }

  /**
   * 채팅방의 모든 안읽은 메시지를 읽음 처리
   */
  static async markAllMessagesAsRead(
    roomId: string,
    userId: string
  ): Promise<void> {
    try {
      const client = await pool.connect();
      const currentTime = getKoreanTime();

      // 사용자가 해당 채팅방의 멤버인지 확인
      const memberCheck = await client.query(
        `SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );

      if (memberCheck.rows.length === 0) {
        throw new Error("채팅방에 접근 권한이 없습니다.");
      }

      // 사용자의 마지막 읽은 시간 조회
      const memberResult = await client.query(
        `SELECT last_read_at FROM chat_room_members WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );

      if (memberResult.rows.length === 0) {
        client.release();
        return;
      }

      const lastReadAt = memberResult.rows[0].last_read_at;

      // 마지막 읽은 시간 이후의 모든 메시지를 읽음 처리 (본인 메시지 제외)
      const unreadMessages = await client.query(
        `SELECT id FROM chat_messages 
         WHERE room_id = $1 
         AND sender_id != $2 
         AND created_at > $3`,
        [roomId, userId, lastReadAt]
      );

      // 각 메시지에 대해 읽음 상태 추가
      for (const message of unreadMessages.rows) {
        const existingRead = await client.query(
          `SELECT 1 FROM message_read_status WHERE message_id = $1 AND user_id = $2`,
          [message.id, userId]
        );

        if (existingRead.rows.length === 0) {
          await client.query(
            `INSERT INTO message_read_status (message_id, user_id, read_at) VALUES ($1, $2, $3)`,
            [message.id, userId, currentTime]
          );
        }
      }

      // 채팅방 멤버의 last_read_at을 현재 시간으로 업데이트
      await client.query(
        `UPDATE chat_room_members 
         SET last_read_at = $3
         WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId, currentTime]
      );

      client.release();
      log(
        "INFO",
        `채팅방 ${roomId}의 모든 메시지를 읽음 처리: ${unreadMessages.rows.length}개`
      );
    } catch (error) {
      log("ERROR", "채팅방 메시지 읽음 처리 실패", error);
      throw error;
    }
  }

  /**
   * 메시지의 읽음 상태 조회 (헬퍼 메서드)
   */
  private static async getReadStatusForMessage(
    messageId: string,
    client: any
  ): Promise<MessageReadStatus[]> {
    try {
      const result = await client.query(
        `SELECT mrs.*, u.username, u.nickname, u.profile_image
         FROM message_read_status mrs
         JOIN users u ON mrs.user_id = u.id
         WHERE mrs.message_id = $1
         ORDER BY mrs.read_at ASC`,
        [messageId]
      );

      return result.rows.map((row: any) => ({
        message_id: row.message_id,
        user_id: row.user_id,
        read_at: row.read_at,
        user: {
          id: row.user_id,
          username: row.username,
          nickname: row.nickname,
          profile_image: row.profile_image,
        },
      }));
    } catch (error) {
      log("ERROR", "메시지 읽음 상태 조회 실패", error);
      return []; // 에러 시 빈 배열 반환
    }
  }

  /**
   * 채팅방의 안읽은 메시지 목록 조회
   */
  static async getUnreadMessages(
    roomId: string,
    userId: string
  ): Promise<ChatMessage[]> {
    const client = await pool.connect();
    try {
      // 사용자의 마지막 읽은 시간 조회
      const memberResult = await client.query(
        `SELECT last_read_at FROM chat_room_members WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );

      if (memberResult.rows.length === 0) {
        client.release();
        return [];
      }

      const lastReadAt = memberResult.rows[0].last_read_at;

      // 마지막 읽은 시간 이후의 메시지들 조회 (본인 메시지 제외)
      const result = await client.query(
        `SELECT cm.*, u.username, u.nickname, u.profile_image
         FROM chat_messages cm
         JOIN users u ON cm.sender_id = u.id
         WHERE cm.room_id = $1 
         AND cm.sender_id != $2 
         AND cm.created_at > $3
         ORDER BY cm.created_at ASC`,
        [roomId, userId, lastReadAt]
      );

      return result.rows.map(this.mapRowToChatMessage);
    } catch (error: any) {
      log("ERROR", "안읽은 메시지 목록 조회 실패", {
        message: error?.message || "Unknown error",
        roomId: roomId,
        userId: userId,
      });
      return [];
    } finally {
      client.release();
    }
  }

  /**
   * 채팅방의 안읽은 메시지 수 조회
   */
  static async getUnreadCount(roomId: string, userId: string): Promise<number> {
    const client = await pool.connect();
    try {
      // 사용자의 마지막 읽은 시간 조회
      const memberResult = await client.query(
        `SELECT last_read_at FROM chat_room_members WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );

      if (memberResult.rows.length === 0) {
        client.release();
        return 0;
      }

      const lastReadAt = memberResult.rows[0].last_read_at;

      // 마지막 읽은 시간 이후의 메시지 수 (본인 메시지 제외)
      const countResult = await client.query(
        `SELECT COUNT(*) FROM chat_messages 
         WHERE room_id = $1 
         AND sender_id != $2 
         AND created_at > $3`,
        [roomId, userId, lastReadAt]
      );

      return parseInt(countResult.rows[0].count);
    } catch (error: any) {
      log("ERROR", "안읽은 메시지 수 조회 실패", {
        message: error?.message || "Unknown error",
        roomId: roomId,
        userId: userId,
      });
      return 0;
    } finally {
      client.release();
    }
  }

  // ========== 사용자 채팅 설정 관련 메서드 ==========

  /**
   * 사용자 채팅 설정 조회 (없으면 기본값 생성)
   */
  static async getUserChatSettings(userId: string): Promise<UserChatSettings> {
    try {
      const client = await pool.connect();

      let result = await client.query(
        `SELECT * FROM user_chat_settings WHERE user_id = $1`,
        [userId]
      );

      if (result.rows.length === 0) {
        // 기본 설정 생성
        const currentTime = getKoreanTime();
        const createResult = await client.query(
          `INSERT INTO user_chat_settings (user_id, allow_messages_from, show_online_status, notification_enabled, created_at, updated_at)
           VALUES ($1, 'everyone', true, true, $2, $3)
           RETURNING *`,
          [userId, currentTime, currentTime]
        );
        result = createResult;
      }

      client.release();
      return this.mapRowToUserChatSettings(result.rows[0]);
    } catch (error) {
      log("ERROR", "사용자 채팅 설정 조회 실패", error);
      throw error;
    }
  }

  // ========== 유틸리티 메서드 (Row Mapping) ==========

  private static mapRowToChatRoom(row: any): ChatRoom {
    return {
      id: row.id,
      is_group: row.is_group,
      name: row.name,
      last_message_at: row.last_message_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  private static mapRowToChatRoomMember(row: any): ChatRoomMember {
    return {
      room_id: row.room_id,
      user_id: row.user_id,
      joined_at: row.joined_at,
      role: row.role,
      is_muted: row.is_muted,
      last_read_at: row.last_read_at,
      user: {
        id: row.user_id,
        username: row.username,
        nickname: row.nickname,
        profile_image: row.profile_image,
      },
    };
  }

  private static mapRowToChatMessage(row: any): ChatMessage {
    return {
      id: row.id,
      room_id: row.room_id,
      sender_id: row.sender_id,
      content: row.content,
      message_type: row.message_type,
      file_url: row.file_url,
      file_name: row.file_name,
      file_size: row.file_size,
      created_at: row.created_at,
      sender: {
        id: row.sender_id,
        username: row.username,
        nickname: row.nickname,
        profile_image: row.profile_image,
      },
    };
  }

  private static mapRowToUserChatSettings(row: any): UserChatSettings {
    return {
      user_id: row.user_id,
      allow_messages_from: row.allow_messages_from,
      show_online_status: row.show_online_status,
      notification_enabled: row.notification_enabled,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  /**
   * 메시지 삭제 (soft delete)
   */
  static async deleteMessage(messageId: string, userId: string): Promise<void> {
    const client = await pool.connect();
    try {
      // 메시지 작성자 확인
      const messageResult = await client.query(
        `SELECT sender_id FROM chat_messages WHERE id = $1`,
        [messageId]
      );

      if (messageResult.rows.length === 0) {
        throw new Error("메시지를 찾을 수 없습니다.");
      }

      const senderId = messageResult.rows[0].sender_id;
      if (senderId !== userId) {
        throw new Error("본인이 작성한 메시지만 삭제할 수 있습니다.");
      }

      // 메시지 삭제 (실제로는 내용을 변경)
      await client.query(
        `UPDATE chat_messages 
         SET content = '삭제된 메시지입니다', 
             message_type = 'system',
             file_url = NULL,
             file_name = NULL,
             file_size = NULL
         WHERE id = $1`,
        [messageId]
      );

      log("INFO", `메시지 삭제: ${messageId} by user ${userId}`);
    } catch (error) {
      log("ERROR", "메시지 삭제 실패", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 채팅방 메시지 검색
   */
  static async searchMessages(
    roomId: string,
    userId: string,
    query: string,
    limit: number = 50
  ): Promise<ChatMessage[]> {
    const client = await pool.connect();
    try {
      // 사용자가 해당 채팅방의 멤버인지 확인
      const memberCheck = await client.query(
        `SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );

      if (memberCheck.rows.length === 0) {
        throw new Error("채팅방에 접근 권한이 없습니다.");
      }

      // 메시지 검색 (내용에 검색어 포함)
      const result = await client.query(
        `SELECT cm.*, u.username, u.nickname, u.profile_image
         FROM chat_messages cm
         JOIN users u ON cm.sender_id = u.id
         WHERE cm.room_id = $1 
         AND cm.content ILIKE $2
         AND cm.message_type != 'system'
         ORDER BY cm.created_at DESC
         LIMIT $3`,
        [roomId, `%${query}%`, limit]
      );

      return result.rows.map(this.mapRowToChatMessage);
    } catch (error) {
      log("ERROR", "메시지 검색 실패", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 채팅방에서 나가기 (멤버 삭제)
   */
  static async leaveRoom(roomId: string, userId: string): Promise<void> {
    const client = await pool.connect();

    try {
      await client.query("BEGIN");

      // 채팅방 멤버에서 삭제
      await client.query(
        `DELETE FROM chat_room_members 
         WHERE room_id = $1 AND user_id = $2`,
        [roomId, userId]
      );

      // 해당 사용자의 메시지 읽음 상태 삭제
      await client.query(
        `DELETE FROM message_read_status 
         WHERE user_id = $1 AND message_id IN (
           SELECT id FROM chat_messages WHERE room_id = $2
         )`,
        [userId, roomId]
      );

      // 채팅방에 남은 멤버 수 확인
      const memberCountResult = await client.query(
        `SELECT COUNT(*) as count FROM chat_room_members WHERE room_id = $1`,
        [roomId]
      );

      const memberCount = parseInt(memberCountResult.rows[0].count);

      // 채팅방에 멤버가 없으면 채팅방과 관련 데이터 삭제
      if (memberCount === 0) {
        // 메시지 읽음 상태 삭제
        await client.query(
          `DELETE FROM message_read_status 
           WHERE message_id IN (
             SELECT id FROM chat_messages WHERE room_id = $1
           )`,
          [roomId]
        );

        // 채팅 메시지 삭제
        await client.query(`DELETE FROM chat_messages WHERE room_id = $1`, [
          roomId,
        ]);

        // 채팅방 삭제
        await client.query(`DELETE FROM chat_rooms WHERE id = $1`, [roomId]);

        console.log(`빈 채팅방 ${roomId} 삭제 완료`);
      }

      await client.query("COMMIT");
      console.log(`사용자 ${userId}가 채팅방 ${roomId}에서 나감`);
    } catch (error) {
      await client.query("ROLLBACK");
      console.error("채팅방 나가기 실패:", error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * 채팅방에 멤버 추가 (그룹 채팅 초대)
   */
  static async addMembersToRoom(
    roomId: string,
    userIds: string[],
    invitedBy: string
  ): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const currentTime = getKoreanTime();

      // 채팅방이 그룹 채팅인지 확인
      const roomResult = await client.query(
        `SELECT is_group FROM chat_rooms WHERE id = $1`,
        [roomId]
      );

      if (roomResult.rows.length === 0) {
        throw new Error("채팅방을 찾을 수 없습니다.");
      }

      if (!roomResult.rows[0].is_group) {
        throw new Error("1:1 채팅방에는 멤버를 추가할 수 없습니다.");
      }

      // 초대하는 사용자가 채팅방 멤버인지 확인
      const inviterCheck = await client.query(
        `SELECT role FROM chat_room_members WHERE room_id = $1 AND user_id = $2`,
        [roomId, invitedBy]
      );

      if (inviterCheck.rows.length === 0) {
        throw new Error("채팅방에 접근 권한이 없습니다.");
      }

      // 각 사용자 추가
      for (const userId of userIds) {
        // 이미 멤버인지 확인
        const existingMember = await client.query(
          `SELECT 1 FROM chat_room_members WHERE room_id = $1 AND user_id = $2`,
          [roomId, userId]
        );

        if (existingMember.rows.length === 0) {
          // 멤버 추가
          await client.query(
            `INSERT INTO chat_room_members (room_id, user_id, role, joined_at, last_read_at) 
             VALUES ($1, $2, 'member', $3, $4)`,
            [roomId, userId, currentTime, currentTime]
          );

          // 시스템 메시지 생성 (누가 누구를 초대했는지)
          const inviterInfo = await client.query(
            `SELECT nickname, username FROM users WHERE id = $1`,
            [invitedBy]
          );
          const invitedInfo = await client.query(
            `SELECT nickname, username FROM users WHERE id = $1`,
            [userId]
          );

          const inviterName =
            inviterInfo.rows[0]?.nickname || inviterInfo.rows[0]?.username;
          const invitedName =
            invitedInfo.rows[0]?.nickname || invitedInfo.rows[0]?.username;

          await client.query(
            `INSERT INTO chat_messages (room_id, sender_id, content, message_type, created_at) 
             VALUES ($1, $2, $3, 'system', $4)`,
            [
              roomId,
              invitedBy,
              `${inviterName}님이 ${invitedName}님을 초대했습니다.`,
              currentTime,
            ]
          );

          // 채팅방 last_message_at 업데이트
          await client.query(
            `UPDATE chat_rooms SET last_message_at = $1, updated_at = $2 WHERE id = $3`,
            [currentTime, currentTime, roomId]
          );

          log(
            "INFO",
            `채팅방 ${roomId}에 사용자 ${userId} 추가됨 (초대자: ${invitedBy})`
          );
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      log("ERROR", "채팅방 멤버 추가 실패", error);
      throw error;
    } finally {
      client.release();
    }
  }
}
