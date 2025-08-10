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
      res.status(500).json({
        success: false,
        message: "사용자 검색 중 오류가 발생했습니다.",
      });
    }
  }

  static async getBasicById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      if (!id) {
        res.status(400).json({ success: false, message: "사용자 ID 필요" });
        return;
      }
      const user = await UserModel.findById(id);
      if (!user) {
        res
          .status(404)
          .json({ success: false, message: "사용자를 찾을 수 없습니다." });
        return;
      }
      res.json({
        success: true,
        data: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          profile_image: user.profileImage,
        },
      });
    } catch (error) {
      log("ERROR", "사용자 기본정보 조회 실패", error);
      res.status(500).json({ success: false, message: "오류가 발생했습니다." });
    }
  }
}
