import { UserModel } from "../models/User";
import { CommentMentionModel } from "../models/CommentMention";
import { NotificationModel } from "../models/Notification";
import { AuthenticatedRequest } from "../middleware/auth";
import { Response } from "express";

// 댓글 멘션 처리 전용 컨트롤러 (엔드포인트용이 아닌 내부 호출용)
export class NotificationsController {
  // 댓글 생성 시 멘션 저장 및 알림 생성
  static async processCommentMentionsOnCreate(params: {
    commentId: string;
    authorUserId: string;
    content: string;
  }): Promise<void> {
    const { commentId, authorUserId, content } = params;

    const mentionRegex = /@([A-Za-z0-9._가-힣]{1,20})/g;
    const mentions: { username: string; start: number; length: number }[] = [];
    for (const match of content.matchAll(mentionRegex)) {
      const start = match.index ?? -1;
      if (start < 0) continue;
      const username = match[1];
      mentions.push({ username, start, length: match[0].length });
    }

    if (mentions.length === 0) return;

    const uniqueUsernames = Array.from(
      new Set(mentions.map((m) => m.username))
    );
    const userIdByUsername: Record<string, string> = {};
    for (const uname of uniqueUsernames) {
      const u = await UserModel.findByUsername(uname);
      if (u) userIdByUsername[uname] = u.id;
    }

    const records = mentions
      .map((m) => {
        const uid = userIdByUsername[m.username];
        if (!uid) return null;
        if (uid === authorUserId) return null; // 자기 자신은 제외 (정책에 맞게 조정 가능)
        return {
          comment_id: commentId,
          mentioned_user_id: uid,
          start_index: m.start,
          length: m.length,
        };
      })
      .filter(Boolean) as any[];

    await CommentMentionModel.createMany(records);

    const notifRecords = Array.from(
      new Map(records.map((r) => [r.mentioned_user_id, r])).values()
    ).map((r) => ({
      user_id: r.mentioned_user_id,
      type: "mention_comment",
      from_user_id: authorUserId,
      target_id: commentId,
    }));
    await NotificationModel.createManyIfNotExists(notifRecords);
  }

  // 댓글 수정 시 멘션 동기화 및 신규 알림 생성
  static async processCommentMentionsOnUpdate(params: {
    commentId: string;
    authorUserId: string;
    content: string;
  }): Promise<void> {
    const { commentId, authorUserId, content } = params;

    const existingUserIds =
      await CommentMentionModel.getMentionedUserIdsByCommentId(commentId);

    const mentionRegex = /@([A-Za-z0-9._가-힣]{1,20})/g;
    const mentions: { username: string; start: number; length: number }[] = [];
    for (const match of content.matchAll(mentionRegex)) {
      const start = match.index ?? -1;
      if (start < 0) continue;
      const username = match[1];
      mentions.push({ username, start, length: match[0].length });
    }

    const uniqueUsernames = Array.from(
      new Set(mentions.map((m) => m.username))
    );
    const userIdByUsername: Record<string, string> = {};
    for (const uname of uniqueUsernames) {
      const u = await UserModel.findByUsername(uname);
      if (u) userIdByUsername[uname] = u.id;
    }
    const newUserIds = Array.from(
      new Set(mentions.map((m) => userIdByUsername[m.username]).filter(Boolean))
    );

    // 삭제 대상 멘션 제거
    const toDelete = existingUserIds.filter((id) => !newUserIds.includes(id));
    await CommentMentionModel.deleteByCommentIdAndUserIds(commentId, toDelete);

    // 추가 대상 멘션 저장
    const toAdd = mentions
      .map((m) => {
        const uid = userIdByUsername[m.username];
        if (!uid) return null;
        if (existingUserIds.includes(uid)) return null;
        if (uid === authorUserId) return null;
        return {
          comment_id: commentId,
          mentioned_user_id: uid,
          start_index: m.start,
          length: m.length,
        };
      })
      .filter(Boolean) as any[];
    await CommentMentionModel.createMany(toAdd);

    // 신규 멘션 알림 생성
    const notifRecords = Array.from(
      new Set(toAdd.map((r) => r.mentioned_user_id))
    ).map((uid) => ({
      user_id: uid,
      type: "mention_comment",
      from_user_id: authorUserId,
      target_id: commentId,
    }));
    await NotificationModel.createManyIfNotExists(notifRecords);
  }

  // ===== API Endpoints =====
  static async list(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: "인증이 필요합니다" });
        return;
      }
      const page = parseInt((req.query.page as string) || "1", 10);
      const limit = parseInt((req.query.limit as string) || "20", 10);
      const { notifications, total } = await NotificationModel.getByUser(
        userId,
        page,
        limit
      );
      // 응답에 요약 정보 포함
      const data = notifications.map((n: any) => ({
        id: n.id,
        user_id: n.user_id,
        type: n.type,
        from_user_id: n.from_user_id,
        target_id: n.target_id,
        is_read: n.is_read,
        created_at: n.created_at,
        from_user: {
          id: n.from_user_id,
          username: n.from_username,
          nickname: n.from_nickname,
          profile_image: n.from_profile_image,
        },
        post: n.post_id
          ? {
              id: n.post_id,
              content: n.post_content,
              thumbnail_url:
                n.post_thumbnail_url || n.comment_post_thumbnail_url || null,
            }
          : undefined,
        comment: n.comment_id
          ? {
              id: n.comment_id,
              content: n.comment_content,
              post_id: n.comment_post_id,
            }
          : undefined,
      }));
      res.json({
        success: true,
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (e) {
      res.status(500).json({ success: false, message: "알림 조회 오류" });
    }
  }

  static async unreadCount(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: "인증이 필요합니다" });
        return;
      }
      const count = await NotificationModel.countUnread(userId);
      res.json({ success: true, data: { count } });
    } catch (e) {
      res.status(500).json({ success: false, message: "알림 카운트 오류" });
    }
  }

  static async markRead(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      const { id } = req.params as { id: string };
      if (!userId) {
        res.status(401).json({ success: false, message: "인증이 필요합니다" });
        return;
      }
      await NotificationModel.markRead(userId, id);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: "읽음 처리 오류" });
    }
  }

  static async markAllRead(req: AuthenticatedRequest, res: Response) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        res.status(401).json({ success: false, message: "인증이 필요합니다" });
        return;
      }
      await NotificationModel.markAllRead(userId);
      res.json({ success: true });
    } catch (e) {
      res.status(500).json({ success: false, message: "전체 읽음 처리 오류" });
    }
  }
}
