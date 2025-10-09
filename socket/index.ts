import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import { ChatModel, CreateMessageData } from "../models/Chat";
import { BlockModel } from "../models/Block";
import { log } from "../utils/logger";

// NextAuth 세션 데이터 타입
interface SessionData {
  userId: string;
  email: string;
  username: string;
  nickname: string;
}

// Socket.io 인증된 소켓 타입
interface AuthenticatedSocket extends Socket {
  user?: SessionData;
}

// 연결된 사용자 관리
const connectedUsers = new Map<string, string>(); // userId -> socketId
const socketUsers = new Map<string, SessionData>(); // socketId -> user

export function initializeSocket(httpServer: HttpServer): SocketIOServer {
  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: process.env.ALLOWED_ORIGINS || "http://localhost:3000",
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  // 인증 미들웨어
  io.use(async (socket: AuthenticatedSocket, next: any) => {
    try {
      const sessionData = socket.handshake.auth.sessionData;

      if (!sessionData) {
        return next(new Error("인증 정보가 없습니다."));
      }

      // Base64 디코딩 및 JSON 파싱
      const decodedSession = JSON.parse(
        decodeURIComponent(Buffer.from(sessionData, "base64").toString())
      );

      if (!decodedSession.userId) {
        return next(new Error("유효하지 않은 세션 정보입니다."));
      }

      socket.user = decodedSession;
      next();
    } catch (error) {
      log("ERROR", "Socket.io 인증 실패", error);
      next(new Error("인증 처리 중 오류가 발생했습니다."));
    }
  });

  // 연결 이벤트
  io.on("connection", (socket: AuthenticatedSocket) => {
    if (!socket.user) return;

    const userId = socket.user.userId;
    log("INFO", `Socket 연결: ${socket.user.username} (${userId})`);

    // 사용자 연결 정보 저장
    connectedUsers.set(userId, socket.id);
    socketUsers.set(socket.id, socket.user);

    // 사용자의 채팅방에 조인
    joinUserRooms(socket, userId);

    // ========== 채팅 이벤트 핸들러 ==========

    // 메시지 전송
    socket.on("send_message", async (data, callback) => {
      try {
        await handleSendMessage(socket, data, callback);
      } catch (error) {
        log("ERROR", "메시지 전송 처리 실패", error);
        callback?.({
          success: false,
          error: "메시지 전송 중 오류가 발생했습니다.",
        });
      }
    });

    // 채팅방 참여
    socket.on("join_room", async (data, callback) => {
      try {
        await handleJoinRoom(socket, data, callback);
      } catch (error) {
        log("ERROR", "채팅방 참여 처리 실패", error);
        callback?.({
          success: false,
          error: "채팅방 참여 중 오류가 발생했습니다.",
        });
      }
    });

    // 메시지 읽음 처리
    socket.on("mark_as_read", async (data, callback) => {
      try {
        await handleMarkAsRead(socket, data, callback);
      } catch (error) {
        log("ERROR", "읽음 처리 실패", error);
        callback?.({
          success: false,
          error: "읽음 처리 중 오류가 발생했습니다.",
        });
      }
    });

    // 메시지 삭제
    socket.on("delete_message", async (data, callback) => {
      try {
        await handleDeleteMessage(socket, data, callback);
      } catch (error) {
        log("ERROR", "메시지 삭제 실패", error);
        callback?.({
          success: false,
          error: "메시지 삭제 중 오류가 발생했습니다.",
        });
      }
    });

    // 타이핑 상태 전송
    socket.on("typing", (data) => {
      handleTyping(socket, data, true);
    });

    socket.on("stop_typing", (data) => {
      handleTyping(socket, data, false);
    });

    // 연결 해제
    socket.on("disconnect", (reason) => {
      log("INFO", `Socket 연결 해제: ${socket.user?.username} (${userId})`, {
        reason,
        socketId: socket.id,
      });

      // 사용자 연결 정보 정리
      connectedUsers.delete(userId);
      socketUsers.delete(socket.id);
    });

    // 에러 이벤트
    socket.on("error", (error) => {
      log("ERROR", `Socket 에러: ${socket.user?.username} (${userId})`, {
        error: error.message,
        socketId: socket.id,
      });
    });
  });

  return io;
}

// ========== 이벤트 핸들러 함수들 ==========

/**
 * 사용자의 모든 채팅방에 조인
 */
async function joinUserRooms(socket: AuthenticatedSocket, userId: string) {
  try {
    const { rooms } = await ChatModel.getUserRooms(userId, 1, 1000);

    for (const room of rooms) {
      socket.join(room.id);
      log("DEBUG", `사용자 ${userId}가 채팅방 ${room.id}에 조인`);
    }
  } catch (error: any) {
    log("ERROR", "사용자 채팅방 조인 실패", {
      message: error?.message || "Unknown error",
      userId: userId,
    });
  }
}

/**
 * 메시지 전송 처리
 */
async function handleSendMessage(
  socket: AuthenticatedSocket,
  data: any,
  callback?: Function
) {
  if (!socket.user) return;

  const {
    room_id,
    content,
    message_type = "text",
    file_url,
    file_name,
    file_size,
  } = data;
  const userId = socket.user.userId;

  if (!room_id || !content) {
    callback?.({
      success: false,
      error: "채팅방 ID와 메시지 내용이 필요합니다.",
    });
    return;
  }

  // 채팅방 접근 권한 확인
  const userRooms = await ChatModel.getUserRooms(userId, 1, 1000);
  const targetRoom = userRooms.rooms.find((room) => room.id === room_id);

  if (!targetRoom) {
    // 투명 차단: 가짜 성공 응답
    callback?.({
      success: true,
      message: {
        id: `fake-${Date.now()}`,
        room_id,
        sender_id: userId,
        content,
        message_type,
        created_at: new Date(),
        sender: socket.user,
      },
    });
    return;
  }

  // 메시지 생성
  const messageData: CreateMessageData = {
    room_id,
    sender_id: userId,
    content: content.trim(),
    message_type,
    file_url,
    file_name,
    file_size,
  };

  const message = await ChatModel.createMessage(messageData);
  log("INFO", `메시지 생성 완료: ${message.id}`, { message, room_id });

  // 채팅방의 모든 멤버들에게 실시간 전송 (발송자 포함)
  socket.nsp.to(room_id).emit("new_message", {
    message,
    room_id,
  });

  log(
    "INFO",
    `실시간 메시지 브로드캐스트 완료: ${message.id} in room ${room_id}`,
    {
      roomId: room_id,
      messageId: message.id,
      content: message.content,
    }
  );

  // 발송자에게 성공 응답
  callback?.({
    success: true,
    message,
  });

  log("INFO", `메시지 전송 완료: ${message.id} in room ${room_id}`);
}

/**
 * 채팅방 참여 처리
 */
async function handleJoinRoom(
  socket: AuthenticatedSocket,
  data: any,
  callback?: Function
) {
  if (!socket.user) return;

  const { room_id } = data;
  const userId = socket.user.userId;

  if (!room_id) {
    callback?.({
      success: false,
      error: "채팅방 ID가 필요합니다.",
    });
    return;
  }

  // 채팅방 접근 권한 확인
  const userRooms = await ChatModel.getUserRooms(userId, 1, 1000);
  const hasAccess = userRooms.rooms.some((room) => room.id === room_id);

  if (!hasAccess) {
    callback?.({
      success: false,
      error: "채팅방에 접근 권한이 없습니다.",
    });
    return;
  }

  // 채팅방 조인
  socket.join(room_id);

  callback?.({
    success: true,
    message: "채팅방에 참여했습니다.",
  });

  log("INFO", `사용자 ${userId}가 채팅방 ${room_id}에 참여`);
}

/**
 * 메시지 읽음 처리
 */
async function handleMarkAsRead(
  socket: AuthenticatedSocket,
  data: any,
  callback?: Function
) {
  if (!socket.user) return;

  const { message_id, room_id } = data;
  const userId = socket.user.userId;

  if (!message_id) {
    callback?.({
      success: false,
      error: "메시지 ID가 필요합니다.",
    });
    return;
  }

  await ChatModel.markMessageAsRead(message_id, userId);

  // 채팅방의 모든 멤버들에게 읽음 상태 전송 (자신 포함)
  if (room_id) {
    socket.nsp.to(room_id).emit("message_read", {
      message_id,
      user_id: userId,
      room_id, // room_id 포함
      user: socket.user,
      read_at: new Date(),
    });

    log(
      "INFO",
      `실시간 읽음 상태 브로드캐스트: ${message_id} by ${userId} in room ${room_id}`
    );
  }

  callback?.({
    success: true,
    message: "메시지를 읽음 처리했습니다.",
  });

  log("INFO", `메시지 읽음 처리 완료: ${message_id} by ${userId}`);
}

/**
 * 메시지 삭제 처리
 */
async function handleDeleteMessage(
  socket: AuthenticatedSocket,
  data: any,
  callback?: Function
) {
  if (!socket.user) return;

  const { message_id, room_id } = data;
  const userId = socket.user.userId;

  if (!message_id) {
    callback?.({
      success: false,
      error: "메시지 ID가 필요합니다.",
    });
    return;
  }

  try {
    await ChatModel.deleteMessage(message_id, userId);

    // 채팅방의 모든 멤버들에게 삭제 이벤트 전송 (자신 포함)
    if (room_id) {
      socket.nsp.to(room_id).emit("message_deleted", {
        message_id,
        room_id,
        deleted_by: userId,
      });

      log(
        "INFO",
        `실시간 삭제 이벤트 브로드캐스트: ${message_id} by ${userId} in room ${room_id}`
      );
    }

    callback?.({
      success: true,
      message: "메시지가 삭제되었습니다.",
    });

    log("INFO", `메시지 삭제 완료: ${message_id} by ${userId}`);
  } catch (error: any) {
    log("ERROR", "메시지 삭제 실패", error);
    callback?.({
      success: false,
      error: error.message || "메시지 삭제에 실패했습니다.",
    });
  }
}

/**
 * 타이핑 상태 처리
 */
function handleTyping(
  socket: AuthenticatedSocket,
  data: any,
  isTyping: boolean
) {
  if (!socket.user) return;

  const { room_id } = data;
  if (!room_id) return;

  // 채팅방의 다른 멤버들에게 타이핑 상태 전송
  socket.to(room_id).emit("user_typing", {
    user_id: socket.user.userId,
    user: socket.user,
    room_id,
    is_typing: isTyping,
  });
}

// 전역에서 사용할 수 있도록 export
export { connectedUsers, socketUsers };
