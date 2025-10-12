import express from "express";
import { ChatController, chatUpload } from "../controllers/chatController";
import { authenticateToken } from "../middleware/auth";

const router = express.Router();

// ========== 채팅방 관련 라우트 ==========

// 채팅방 생성 또는 기존 1:1 채팅방 반환
router.post("/rooms", authenticateToken, ChatController.createOrGetRoom);

// 사용자의 채팅방 목록 조회
router.get("/rooms", authenticateToken, ChatController.getUserRooms);

// 채팅방 멤버 조회
router.get(
  "/rooms/:roomId/members",
  authenticateToken,
  ChatController.getRoomMembers
);

// 채팅방에 멤버 추가 (그룹 채팅 초대)
router.post(
  "/rooms/:roomId/members",
  authenticateToken,
  ChatController.addMembersToRoom
);

// 채팅방 안읽은 메시지 수 조회
router.get(
  "/rooms/:roomId/unread-count",
  authenticateToken,
  ChatController.getUnreadCount
);

// 채팅방 나가기
router.delete(
  "/rooms/:roomId/leave",
  authenticateToken,
  ChatController.leaveRoom
);

// ========== 메시지 관련 라우트 ==========

// 메시지 전송 (HTTP API - 백업용, 주로 Socket.io 사용)
router.post("/messages", authenticateToken, ChatController.sendMessage);

// 채팅방 메시지 목록 조회
router.get(
  "/rooms/:roomId/messages",
  authenticateToken,
  ChatController.getRoomMessages
);

// 메시지 읽음 처리
router.post(
  "/messages/:messageId/read",
  authenticateToken,
  ChatController.markMessageAsRead
);

// 메시지 삭제
router.delete(
  "/messages/:messageId",
  authenticateToken,
  ChatController.deleteMessage
);

// ========== 검색 관련 라우트 ==========

// 모든 채팅방에서 검색
router.get(
  "/search/rooms",
  authenticateToken,
  ChatController.searchAllChatRooms
);

// 특정 채팅방에서 메시지 검색
router.get(
  "/search/messages/:roomId",
  authenticateToken,
  ChatController.searchMessagesInRoom
);

// 메시지 검색 (기존 - 호환성 유지)
router.get(
  "/rooms/:roomId/search",
  authenticateToken,
  ChatController.searchMessages
);

// ========== 사용자 채팅 설정 관련 라우트 ==========

// 사용자 채팅 설정 조회
router.get("/settings", authenticateToken, ChatController.getChatSettings);

// 사용자 채팅 설정 업데이트
router.put("/settings", authenticateToken, ChatController.updateChatSettings);

// ========== 파일 업로드 관련 라우트 ==========

// 채팅 파일 업로드
router.post(
  "/upload",
  authenticateToken,
  chatUpload.single("file"),
  ChatController.uploadChatFile
);

export default router;
