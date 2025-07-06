import { Request, Response } from "express";
import { UserModel, User } from "../models/User";
import { log } from "../utils/logger";
import {
  generateToken,
  verifyToken,
  extractTokenFromHeader,
} from "../utils/jwt";

// NextAuth에서 전송하는 사용자 정보 인터페이스
interface NextAuthUserData {
  googleId: string;
  email: string;
  name: string;
  image?: string;
  accessToken: string;
  refreshToken: string;
}

// 이메일에서 고유한 사용자명 생성
const generateUniqueUsername = async (email: string): Promise<string> => {
  const baseUsername = email.split("@")[0];
  let username = baseUsername;
  let counter = 1;

  // 중복 확인 및 고유한 사용자명 생성
  while (await UserModel.findByUsername(username)) {
    username = `${baseUsername}${counter}`;
    counter++;
  }

  return username;
};

// Google OAuth 로그인 (NextAuth 방식)
export const googleLogin = async (req: Request, res: Response) => {
  try {
    const { googleId, email, name, image, accessToken, refreshToken } =
      req.body as NextAuthUserData;

    log("INFO1", "Google 로그인 요청", req.body);
    // 필수 데이터 검증
    if (!googleId || !email || !name) {
      res.status(400).json({
        success: false,
        message: "필수 사용자 정보가 누락되었습니다",
      });
      return;
    }

    log("INFO2", "NextAuth에서 Google 로그인 요청", { googleId, email, name });

    // 기존 사용자 확인 (Google ID 또는 이메일로)
    let user = await UserModel.findById(googleId);

    // Google ID로 찾지 못했다면 이메일로도 찾아보기
    if (!user) {
      user = await UserModel.findByEmail(email);

      if (user) {
        log("INFO", "이메일로 기존 사용자 발견, 로그인 처리", {
          existingId: user.id,
          googleId: googleId,
          email: email,
        });

        // 기존 사용자 정보 업데이트 (현재 사용자 ID 사용)
        const updatedUser = await UserModel.update(user.id, {
          nickname: name,
          profileImage: image || undefined,
          emailVerified: true,
        });

        if (updatedUser) {
          user = updatedUser;
          log("INFO", "기존 사용자 정보 업데이트 완료", { userId: user.id });
        }
      }
    }

    if (user) {
      // 기존 사용자 정보 업데이트 (Google ID로 찾은 경우)
      if (user.id === googleId) {
        const updatedUser = await UserModel.update(googleId, {
          nickname: name,
          profileImage: image || undefined,
          emailVerified: true, // NextAuth를 통해 인증되었으므로 true
        });

        if (updatedUser) {
          user = updatedUser;
          log("INFO", "기존 사용자 로그인", { userId: user.id });
        }
      }
    } else {
      // 새 사용자 생성을 위한 데이터 준비
      const newUserData = {
        googleId,
        email,
        name,
        picture: image,
        emailVerified: true, // NextAuth를 통해 인증되었으므로 true
      };

      user = await UserModel.create(newUserData);
      log("INFO", "새 사용자 등록", { userId: user.id });
    }

    // 🔐 보안 강화: Access Token + Refresh Token 생성
    const jwtAccessToken = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      nickname: user.nickname,
    });

    const jwtRefreshToken = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      nickname: user.nickname,
    });

    // 🔐 보안 강화: HttpOnly 쿠키로 토큰 저장
    res.cookie("accessToken", jwtAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15분
      path: "/",
    });

    res.cookie("refreshToken", jwtRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7일
      path: "/",
    });

    // 클라이언트에는 사용자 정보만 전송 (토큰 제외)
    res.json({
      success: true,
      message: "로그인 성공",
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          nickname: user.nickname,
          bio: user.bio,
          profileImage: user.profileImage,
          visibility: user.visibility,
          role: user.role,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
        // 🔐 보안: 토큰을 응답에 포함하지 않음 (쿠키로만 전송)
        authenticated: true,
      },
    });
  } catch (error) {
    log("ERROR", "Google 로그인 실패", error);
    res.status(500).json({
      success: false,
      message: "로그인 처리 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// 🔐 새로운 엔드포인트: 토큰 갱신
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.cookies;

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        message: "Refresh token이 필요합니다",
      });
      return;
    }

    // TODO: verifyToken 함수를 refresh 토큰 검증용으로 업데이트 필요
    // const decoded = verifyToken(refreshToken, 'refresh');

    // 임시로 현재 방식 사용
    const decoded = require("jsonwebtoken").verify(
      refreshToken,
      process.env.JWT_SECRET
    );

    // 사용자 정보 조회
    const user = await UserModel.findById(decoded.userId);

    if (!user) {
      res.status(401).json({
        success: false,
        message: "유효하지 않은 refresh token입니다",
      });
      return;
    }

    // 새 access token 생성
    const newAccessToken = generateToken({
      userId: user.id,
      email: user.email,
      username: user.username,
      nickname: user.nickname,
    });

    // 새 쿠키 설정
    res.cookie("accessToken", newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: 15 * 60 * 1000, // 15분
      path: "/",
    });

    res.json({
      success: true,
      message: "토큰 갱신 성공",
      data: {
        authenticated: true,
      },
    });
  } catch (error) {
    log("ERROR", "Token refresh failed", error);
    res.status(401).json({
      success: false,
      message: "토큰 갱신에 실패했습니다",
    });
  }
};

// 🔐 보안 강화: 안전한 로그아웃
export const logout = async (req: Request, res: Response) => {
  try {
    // 쿠키 삭제
    res.clearCookie("accessToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
    });

    res.json({
      success: true,
      message: "로그아웃 성공",
    });
  } catch (error) {
    log("ERROR", "로그아웃 실패", error);
    res.status(500).json({
      success: false,
      message: "로그아웃 처리 중 오류가 발생했습니다",
    });
  }
};

// 사용자 정보 조회
export const getMe = async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        success: false,
        message: "인증 토큰이 필요합니다",
      });
      return;
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      res.status(401).json({
        success: false,
        message: "유효하지 않은 토큰입니다",
      });
      return;
    }

    const user = await UserModel.findById(decoded.userId);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다",
      });
      return;
    }

    res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          nickname: user.nickname,
          bio: user.bio,
          profileImage: user.profileImage,
          visibility: user.visibility,
          role: user.role,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    log("ERROR", "사용자 정보 조회 실패", error);
    res.status(500).json({
      success: false,
      message: "사용자 정보 조회 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// 사용자 프로필 업데이트
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const token = extractTokenFromHeader(req.headers.authorization);

    if (!token) {
      res.status(401).json({
        success: false,
        message: "인증 토큰이 필요합니다",
      });
      return;
    }

    const decoded = verifyToken(token);

    if (!decoded) {
      res.status(401).json({
        success: false,
        message: "유효하지 않은 토큰입니다",
      });
      return;
    }

    const { nickname, bio, visibility } = req.body;

    const updates: Partial<User> = {};
    if (nickname !== undefined) updates.nickname = nickname;
    if (bio !== undefined) updates.bio = bio;
    if (visibility !== undefined) updates.visibility = visibility;

    const user = await UserModel.update(decoded.userId, updates);

    if (!user) {
      res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다",
      });
      return;
    }

    res.json({
      success: true,
      message: "프로필이 업데이트되었습니다",
      data: {
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          nickname: user.nickname,
          bio: user.bio,
          profileImage: user.profileImage,
          visibility: user.visibility,
          role: user.role,
          emailVerified: user.emailVerified,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
        },
      },
    });
  } catch (error) {
    log("ERROR", "프로필 업데이트 실패", error);
    res.status(500).json({
      success: false,
      message: "프로필 업데이트 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
