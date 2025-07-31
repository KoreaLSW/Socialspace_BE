import { Request, Response, NextFunction } from "express";
import { log } from "../utils/logger";
import { UserModel } from "../models/User";

// 인증된 사용자 정보를 담는 Request 인터페이스 확장
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    nickname?: string;
  };
}

// NextAuth 세션 정보 기반 인증 미들웨어
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 요청 헤더에서 세션 정보 추출
    const sessionData = req.headers["x-session-data"];

    console.log("🔍 인증 미들웨어 시작:", {
      url: req.url,
      method: req.method,
      hasSessionData: !!sessionData,
      headers: Object.keys(req.headers),
    });

    if (!sessionData) {
      console.warn("⚠️ NextAuth 세션 정보가 없습니다.");
      res.status(401).json({ error: "인증이 필요합니다." });
      return;
    }

    let sessionInfo;
    try {
      // Base64 디코딩 후 JSON 파싱 (한글 문제 해결)
      const decodedSessionData = decodeURIComponent(
        Buffer.from(sessionData as string, "base64").toString("utf8")
      );
      sessionInfo = JSON.parse(decodedSessionData);
    } catch (parseError) {
      console.error("🔴 세션 정보 디코딩/파싱 실패:", parseError);
      res.status(400).json({ error: "세션 정보 형식이 잘못되었습니다." });
      return;
    }

    console.log("🔍 NextAuth 세션 정보 확인:", {
      hasUserId: !!sessionInfo.userId,
      hasEmail: !!sessionInfo.email,
      email: sessionInfo.email,
    });

    // 필수 정보 확인
    if (!sessionInfo.userId || !sessionInfo.email) {
      console.error("🔴 필수 세션 정보가 없습니다:", sessionInfo);
      res.status(401).json({ error: "세션 정보가 유효하지 않습니다." });
      return;
    }

    // 데이터베이스에서 사용자 확인
    const user = await UserModel.findById(sessionInfo.userId);
    if (!user) {
      console.error("🔴 사용자를 찾을 수 없습니다:", sessionInfo.userId);
      res.status(404).json({ error: "사용자를 찾을 수 없습니다." });
      return;
    }

    // 인증된 사용자 정보 설정
    req.user = {
      id: user.id,
      email: user.email,
      username: user.username,
      nickname: user.nickname,
    };

    console.log("✅ NextAuth 세션 인증 성공:", req.user);
    next();
  } catch (error) {
    console.error("🔴 인증 미들웨어 예외:", error);
    log("ERROR", "인증 미들웨어 오류", error);
    res.status(500).json({ error: "인증 처리 중 오류가 발생했습니다." });
  }
};

// 선택적 인증 미들웨어 (세션 정보가 있으면 인증, 없으면 넘어감)
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const sessionData = req.headers["x-session-data"];

    if (!sessionData) {
      // 세션 정보가 없어도 계속 진행
      next();
      return;
    }

    let sessionInfo;
    try {
      // Base64 디코딩 후 JSON 파싱 (한글 문제 해결)
      const decodedSessionData = decodeURIComponent(
        Buffer.from(sessionData as string, "base64").toString("utf8")
      );
      sessionInfo = JSON.parse(decodedSessionData);
    } catch (parseError) {
      log("WARN", "세션 정보 디코딩/파싱 실패 (선택적 인증)", parseError);
      next();
      return;
    }

    if (!sessionInfo.userId || !sessionInfo.email) {
      // 세션 정보가 불완전해도 계속 진행
      next();
      return;
    }

    // 데이터베이스에서 사용자 확인
    const user = await UserModel.findById(sessionInfo.userId);
    if (user) {
      req.user = {
        id: user.id,
        email: user.email,
        username: user.username,
        nickname: user.nickname,
      };
    }

    next();
  } catch (error) {
    log("ERROR", "선택적 인증 미들웨어 오류", error);
    next();
  }
};
