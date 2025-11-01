import jwt, { SignOptions } from "jsonwebtoken";
import { log } from "./logger";

// JWT 시크릿 키 (환경변수에서 가져오기)
const JWT_SECRET: string =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

export interface JwtPayload {
  userId: string;
  email: string;
  username: string;
  authProvider: "local" | "google";
}

// JWT 토큰 생성
export const generateToken = (payload: JwtPayload): string => {
  try {
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: (process.env.JWT_EXPIRES_IN || "7d") as any,
    });
    log("INFO", "JWT 토큰 생성", {
      userId: payload.userId,
      email: payload.email,
    });
    return token;
  } catch (error) {
    log("ERROR", "JWT 토큰 생성 실패", error);
    throw new Error("토큰 생성 중 오류가 발생했습니다");
  }
};

// JWT 토큰 검증
export const verifyToken = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      log("WARN", "JWT 토큰 만료", error);
    } else if (error instanceof jwt.JsonWebTokenError) {
      log("WARN", "JWT 토큰 검증 실패", error);
    } else {
      log("ERROR", "JWT 토큰 검증 중 오류", error);
    }
    return null;
  }
};

// 리프레시 토큰 생성 (선택사항 - 나중에 추가 가능)
export const generateRefreshToken = (payload: JwtPayload): string => {
  try {
    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: "30d" as any, // 리프레시 토큰은 30일
    });
    return token;
  } catch (error) {
    log("ERROR", "리프레시 토큰 생성 실패", error);
    throw new Error("리프레시 토큰 생성 중 오류가 발생했습니다");
  }
};
