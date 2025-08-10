import { Request, Response } from "express";
import { UserModel } from "../models/User";
import { log } from "../utils/logger";

export class UsersController {
  static async searchUsers(req: Request, res: Response): Promise<void> {
    try {
      const q = (req.query.q as string) || "";
      const limit = parseInt((req.query.limit as string) || "5", 10);

      if (!q || q.trim().length === 0) {
        res.json({ success: true, data: [] });
        return;
      }

      const users = await UserModel.searchByQuery(q.trim(), limit);
      res.json({ success: true, data: users });
    } catch (error) {
      log("ERROR", "사용자 검색 실패", error);
      res
        .status(500)
        .json({
          success: false,
          message: "사용자 검색 중 오류가 발생했습니다.",
        });
    }
  }
}
