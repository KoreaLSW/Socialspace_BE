import express from "express";
import { UsersController } from "../controllers/usersController";

const router = express.Router();

// 사용자 검색 (멘션 자동완성용)
router.get("/search", UsersController.searchUsers);

export default router;
