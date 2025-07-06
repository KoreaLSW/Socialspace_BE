import jwt from "jsonwebtoken";
import { log } from "./logger";

const JWT_SECRET = process.env.JWT_SECRET || "your-secret-key";
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "24h";

export interface JwtPayload {
  userId: string; // Google ID
  email: string;
  username: string;
  nickname?: string;
}

// JWT 토큰 생성
export const generateToken = (payload: JwtPayload): string => {
  try {
    // 타입 단언을 통해 JWT 타입 오류 해결
    return (jwt.sign as any)(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });
  } catch (error) {
    log("ERROR", "JWT 토큰 생성 실패", error);
    throw new Error("토큰 생성에 실패했습니다");
  }
};

// JWT 토큰 검증
export const verifyToken = (token: string): JwtPayload | null => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    log("ERROR", "JWT 토큰 검증 실패", error);
    return null;
  }
};

// Authorization 헤더에서 토큰 추출
export const extractTokenFromHeader = (
  authHeader: string | undefined
): string | null => {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }
  return authHeader.substring(7);
};
