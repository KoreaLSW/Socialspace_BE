import { Request, Response, NextFunction } from "express";
import { log } from "../utils/logger";
import { UserModel } from "../models/User";
import { verifyToken } from "../utils/jwt";

// 인증된 사용자 정보를 담는 Request 인터페이스 확장
export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    username: string;
    nickname?: string;
  };
}

// 통합 인증 미들웨어 (JWT 토큰 또는 NextAuth 세션)
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. JWT 토큰 확인 (로컬 회원가입/로그인)
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);

      if (decoded) {
        // JWT 토큰에서 사용자 정보 추출
        const user = await UserModel.findById(decoded.userId);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            nickname: user.nickname,
          };
          console.log("✅ JWT 토큰 인증 성공:", req.user.username);
          next();
          return;
        }
      }

      console.warn("⚠️ JWT 토큰이 유효하지 않습니다.");
      res.status(401).json({ error: "유효하지 않은 토큰입니다." });
      return;
    }

    // 2. NextAuth 세션 정보 확인 (Google OAuth)
    const sessionData = req.headers["x-session-data"];
    if (!sessionData) {
      console.warn("⚠️ 인증 정보가 없습니다.");
      res.status(401).json({ error: "인증이 필요합니다." });
      return;
    }

    let sessionInfo;
    try {
      // Base64 디코딩 후 JSON 파싱 (한글 문제 해결)
      const decodedSessionData = decodeURIComponent(
        Buffer.from(sessionData as string, "base64").toString("utf8")
      );
      console.log("🔵 디코딩된 세션 데이터 (raw):", decodedSessionData);
      sessionInfo = JSON.parse(decodedSessionData);
      console.log("🔵 파싱된 세션 정보:", sessionInfo);
    } catch (parseError) {
      console.error("🔴 세션 정보 디코딩/파싱 실패:", parseError);
      res.status(400).json({ error: "세션 정보 형식이 잘못되었습니다." });
      return;
    }

    // 필수 정보 확인 (email은 필수, userId는 선택)
    if (!sessionInfo.email) {
      console.error("🔴 필수 세션 정보가 없습니다:", {
        sessionInfo,
        hasUserId: !!sessionInfo.userId,
        hasEmail: !!sessionInfo.email,
        userId: sessionInfo.userId,
        email: sessionInfo.email,
      });
      res.status(401).json({ error: "세션 정보가 유효하지 않습니다." });
      return;
    }

    // 데이터베이스에서 사용자 확인 (userId 또는 email로 조회)
    let user;
    if (sessionInfo.userId) {
      user = await UserModel.findById(sessionInfo.userId);
    } else if (sessionInfo.email) {
      // userId가 없으면 email로 찾기 (NextAuth 세션 문제 임시 해결)
      console.warn("⚠️ userId가 없어서 email로 사용자를 찾습니다:", sessionInfo.email);
      user = await UserModel.findByEmail(sessionInfo.email);
    }

    if (!user) {
      console.error("🔴 사용자를 찾을 수 없습니다:", {
        userId: sessionInfo.userId,
        email: sessionInfo.email,
      });
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

    console.log("✅ NextAuth 세션 인증 성공:", req.user.username);
    next();
  } catch (error) {
    console.error("🔴 인증 미들웨어 예외:", error);
    log("ERROR", "인증 미들웨어 오류", error);
    res.status(500).json({ error: "인증 처리 중 오류가 발생했습니다." });
  }
};

// 선택적 인증 미들웨어 (JWT 또는 세션 정보가 있으면 인증, 없으면 넘어감)
export const optionalAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    // 1. JWT 토큰 확인
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      const decoded = verifyToken(token);

      if (decoded) {
        const user = await UserModel.findById(decoded.userId);
        if (user) {
          req.user = {
            id: user.id,
            email: user.email,
            username: user.username,
            nickname: user.nickname,
          };
        }
      }
      next();
      return;
    }

    // 2. NextAuth 세션 확인
    const sessionData = req.headers["x-session-data"];
    if (!sessionData) {
      // 인증 정보가 없어도 계속 진행
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

    if (!sessionInfo.email) {
      // 세션 정보가 불완전해도 계속 진행
      next();
      return;
    }

    // 데이터베이스에서 사용자 확인 (userId 또는 email로 조회)
    let user;
    if (sessionInfo.userId) {
      user = await UserModel.findById(sessionInfo.userId);
    } else if (sessionInfo.email) {
      user = await UserModel.findByEmail(sessionInfo.email);
    }

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
