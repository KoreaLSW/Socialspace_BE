import { pool } from "../config/database";

export interface CommentMentionRecord {
  comment_id: string;
  mentioned_user_id: string;
  start_index?: number | null;
  length?: number | null;
}

export class CommentMentionModel {
  static async createMany(mentions: CommentMentionRecord[]): Promise<void> {
    if (!mentions || mentions.length === 0) return;
    const client = await pool.connect();
    try {
      const values: string[] = [];
      const params: any[] = [];
      mentions.forEach((m, idx) => {
        const base = idx * 4;
        values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4})`);
        params.push(
          m.comment_id,
          m.mentioned_user_id,
          m.start_index ?? null,
          m.length ?? null
        );
      });
      await client.query(
        `INSERT INTO comment_mentions (comment_id, mentioned_user_id, start_index, length)
         VALUES ${values.join(",")}`,
        params
      );
    } finally {
      client.release();
    }
  }

  static async getMentionedUserIdsByCommentId(
    commentId: string
  ): Promise<string[]> {
    const client = await pool.connect();
    try {
      const res = await client.query(
        `SELECT mentioned_user_id FROM comment_mentions WHERE comment_id = $1`,
        [commentId]
      );
      return res.rows.map((r) => r.mentioned_user_id);
    } finally {
      client.release();
    }
  }

  static async deleteByCommentIdAndUserIds(
    commentId: string,
    userIds: string[]
  ): Promise<void> {
    if (userIds.length === 0) return;
    const client = await pool.connect();
    try {
      await client.query(
        `DELETE FROM comment_mentions WHERE comment_id = $1 AND mentioned_user_id = ANY($2::uuid[])`,
        [commentId, userIds]
      );
    } finally {
      client.release();
    }
  }
}
