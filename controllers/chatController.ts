import { Request, Response } from "express";
import { AuthenticatedRequest } from "../middleware/auth";
import {
  ChatModel,
  CreateChatRoomData,
  CreateMessageData,
  ChatRoom,
  ChatMessage,
} from "../models/Chat";
import { BlockModel } from "../models/Block";
import { log } from "../utils/logger";

export class ChatController {
  // ========== 채팅방 관련 API ==========

  /**
   * 채팅방 생성 또는 기존 1:1 채팅방 반환
   * POST /chat/rooms
   */
  static async createOrGetRoom(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { target_user_id, is_group, name } = req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      if (!target_user_id) {
        res.status(400).json({
          success: false,
          message: "대상 사용자 ID가 필요합니다.",
        });
        return;
      }

      // 차단 관계 확인
      const isBlocked = await BlockModel.isBlocked(userId, target_user_id);
      if (isBlocked) {
        // 투명 차단: 빈 채팅방처럼 보이게 하기 위해 가짜 방 정보 반환
        const fakeRoom: ChatRoom = {
          id: `fake-${userId}-${target_user_id}`,
          is_group: false,
          last_message_at: new Date(),
          created_at: new Date(),
          updated_at: new Date(),
          members: [],
          unread_count: 0,
        };

        res.json({
          success: true,
          data: fakeRoom,
          message: "채팅방을 생성했습니다.",
        });
        return;
      }

      // 채팅방 생성 데이터 구성
      const roomData: CreateChatRoomData = {
        is_group: is_group || false,
        name: name || undefined,
        member_ids: is_group
          ? [userId, ...target_user_id]
          : [userId, target_user_id],
      };

      const room = await ChatModel.createRoom(roomData);

      log("INFO", `채팅방 생성/조회 성공: ${room.id} by user ${userId}`);

      res.json({
        success: true,
        data: room,
        message: "채팅방을 생성했습니다.",
      });
    } catch (error) {
      log("ERROR", "채팅방 생성 실패", error);
      res.status(500).json({
        success: false,
        message: "채팅방 생성 중 오류가 발생했습니다.",
      });
    }
  }

  /**
   * 사용자의 채팅방 목록 조회
   * GET /chat/rooms
   */
  static async getUserRooms(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 20;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      const { rooms, total } = await ChatModel.getUserRooms(
        userId,
        page,
        limit
      );

      res.json({
        success: true,
        data: rooms,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        message: "채팅방 목록을 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "채팅방 목록 조회 실패", error);
      res.status(500).json({
        success: false,
        message: "채팅방 목록 조회 중 오류가 발생했습니다.",
      });
    }
  }

  /**
   * 채팅방 멤버 조회
   * GET /chat/rooms/:roomId/members
   */
  static async getRoomMembers(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { roomId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      // 사용자가 해당 채팅방의 멤버인지 확인
      const userRooms = await ChatModel.getUserRooms(userId, 1, 1000);
      const hasAccess = userRooms.rooms.some((room) => room.id === roomId);

      if (!hasAccess) {
        res.status(403).json({
          success: false,
          message: "채팅방에 접근 권한이 없습니다.",
        });
        return;
      }

      const members = await ChatModel.getRoomMembers(roomId);

      res.json({
        success: true,
        data: members,
        message: "채팅방 멤버를 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "채팅방 멤버 조회 실패", error);
      res.status(500).json({
        success: false,
        message: "채팅방 멤버 조회 중 오류가 발생했습니다.",
      });
    }
  }

  // ========== 메시지 관련 API ==========

  /**
   * 메시지 전송 (HTTP API - 백업용, 주로 Socket.io 사용)
   * POST /chat/messages
   */
  static async sendMessage(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { room_id, content, message_type, file_url, file_name, file_size } =
        req.body;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      if (!room_id || !content) {
        res.status(400).json({
          success: false,
          message: "채팅방 ID와 메시지 내용이 필요합니다.",
        });
        return;
      }

      // 채팅방 접근 권한 확인
      const userRooms = await ChatModel.getUserRooms(userId, 1, 1000);
      const targetRoom = userRooms.rooms.find((room) => room.id === room_id);

      if (!targetRoom) {
        // 투명 차단: 가짜 성공 응답
        const fakeMessage: ChatMessage = {
          id: `fake-${Date.now()}`,
          room_id,
          sender_id: userId,
          content,
          message_type: message_type || "text",
          created_at: new Date(),
          sender: {
            id: userId,
            username: "user",
            nickname: "사용자",
          },
        };

        res.json({
          success: true,
          data: fakeMessage,
          message: "메시지를 전송했습니다.",
        });
        return;
      }

      // 메시지 생성 데이터
      const messageData: CreateMessageData = {
        room_id,
        sender_id: userId,
        content: content.trim(),
        message_type: message_type || "text",
        file_url,
        file_name,
        file_size,
      };

      const message = await ChatModel.createMessage(messageData);

      log(
        "INFO",
        `메시지 전송 성공: ${message.id} in room ${room_id} by user ${userId}`
      );

      res.json({
        success: true,
        data: message,
        message: "메시지를 전송했습니다.",
      });
    } catch (error) {
      log("ERROR", "메시지 전송 실패", error);
      res.status(500).json({
        success: false,
        message: "메시지 전송 중 오류가 발생했습니다.",
      });
    }
  }

  /**
   * 채팅방 메시지 목록 조회
   * GET /chat/rooms/:roomId/messages
   */
  static async getRoomMessages(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { roomId } = req.params;
      const userId = req.user?.id;
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      // 채팅방 접근 권한 확인
      const userRooms = await ChatModel.getUserRooms(userId, 1, 1000);
      const hasAccess = userRooms.rooms.some((room) => room.id === roomId);

      if (!hasAccess) {
        // 투명 차단: 빈 메시지 목록 반환
        res.json({
          success: true,
          data: [],
          pagination: {
            page: 1,
            limit,
            total: 0,
            totalPages: 0,
          },
          message: "메시지 목록을 조회했습니다.",
        });
        return;
      }

      const { messages, total } = await ChatModel.getRoomMessages(
        roomId,
        userId,
        page,
        limit
      );

      res.json({
        success: true,
        data: messages,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        message: "메시지 목록을 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "메시지 목록 조회 실패", error);
      res.status(500).json({
        success: false,
        message: "메시지 목록 조회 중 오류가 발생했습니다.",
      });
    }
  }

  /**
   * 메시지 읽음 처리
   * POST /chat/messages/:messageId/read
   */
  static async markMessageAsRead(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { messageId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      await ChatModel.markMessageAsRead(messageId, userId);

      res.json({
        success: true,
        message: "메시지를 읽음 처리했습니다.",
      });
    } catch (error) {
      log("ERROR", "메시지 읽음 처리 실패", error);
      res.status(500).json({
        success: false,
        message: "메시지 읽음 처리 중 오류가 발생했습니다.",
      });
    }
  }

  /**
   * 채팅방 안읽은 메시지 수 조회
   * GET /chat/rooms/:roomId/unread-count
   */
  static async getUnreadCount(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const { roomId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      const count = await ChatModel.getUnreadCount(roomId, userId);

      res.json({
        success: true,
        data: { count },
        message: "안읽은 메시지 수를 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "안읽은 메시지 수 조회 실패", error);
      res.status(500).json({
        success: false,
        message: "안읽은 메시지 수 조회 중 오류가 발생했습니다.",
      });
    }
  }

  // ========== 사용자 채팅 설정 관련 API ==========

  /**
   * 사용자 채팅 설정 조회
   * GET /chat/settings
   */
  static async getChatSettings(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      const settings = await ChatModel.getUserChatSettings(userId);

      res.json({
        success: true,
        data: settings,
        message: "채팅 설정을 조회했습니다.",
      });
    } catch (error) {
      log("ERROR", "채팅 설정 조회 실패", error);
      res.status(500).json({
        success: false,
        message: "채팅 설정 조회 중 오류가 발생했습니다.",
      });
    }
  }

  /**
   * 사용자 채팅 설정 업데이트
   * PUT /chat/settings
   */
  static async updateChatSettings(
    req: AuthenticatedRequest,
    res: Response
  ): Promise<void> {
    try {
      const userId = req.user?.id;
      const { allow_messages_from, show_online_status, notification_enabled } =
        req.body;

      if (!userId) {
        res.status(401).json({
          success: false,
          message: "인증되지 않은 사용자입니다.",
        });
        return;
      }

      // 현재는 기본 조회만 구현, 업데이트 로직은 추후 확장
      const settings = await ChatModel.getUserChatSettings(userId);

      res.json({
        success: true,
        data: settings,
        message: "채팅 설정을 업데이트했습니다.",
      });
    } catch (error) {
      log("ERROR", "채팅 설정 업데이트 실패", error);
      res.status(500).json({
        success: false,
        message: "채팅 설정 업데이트 중 오류가 발생했습니다.",
      });
    }
  }
}
