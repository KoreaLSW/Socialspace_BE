import { Request, Response } from "express";
import { UserModel, User } from "../models/User";
import { log } from "../utils/logger";

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
    const { googleId, email, name, image } = req.body;

    // 필수 데이터 검증
    if (!googleId || !email || !name) {
      res.status(400).json({
        success: false,
        message: "필수 사용자 정보가 누락되었습니다",
      });
      return;
    }
    log("INFO", "NextAuth에서 Google 로그인 요청");

    // 기존 사용자 확인 (Google ID 또는 이메일로)
    let user = await UserModel.findById(googleId);

    // Google ID로 찾지 못했다면 이메일로도 찾아보기
    if (!user) {
      user = await UserModel.findByEmail(email);

      if (user) {
        // 기존 사용자 정보 업데이트 (현재 사용자 ID 사용)
        const updatedUser = await UserModel.update(user.id, {
          nickname: name,
          profileImage: image || undefined,
          emailVerified: true,
        });

        if (updatedUser) {
          user = updatedUser;
          log("INFO", "기존 사용자 정보 업데이트 완료");
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
          log("INFO", "기존 사용자 로그인");
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
      log("INFO", "새 사용자 등록");
    }

    // 사용자 정보만 반환 (NextAuth가 세션 관리)
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

// 로그아웃 (서버 측 정리 작업)
export const logout = async (req: Request, res: Response) => {
  try {
    log("INFO", "서버 측 로그아웃 처리");

    // 필요시 서버 측 정리 작업 수행
    // 예: 사용자 세션 무효화, 로그 기록 등

    res.json({
      success: true,
      message: "로그아웃 완료",
    });
  } catch (error) {
    log("ERROR", "로그아웃 실패", error);
    res.status(500).json({
      success: false,
      message: "로그아웃 처리 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// 사용자 프로필 업데이트
export const updateProfile = async (req: Request, res: Response) => {
  try {
    const { userId, nickname, bio, profileImage } = req.body;

    // 사용자 ID 검증
    if (!userId) {
      res.status(400).json({
        success: false,
        message: "사용자 ID가 필요합니다",
      });
      return;
    }

    // 업데이트할 데이터 구성
    const updateData: Partial<User> = {};
    if (nickname !== undefined) updateData.nickname = nickname;
    if (bio !== undefined) updateData.bio = bio;
    if (profileImage !== undefined) updateData.profileImage = profileImage;

    // 사용자 정보 업데이트
    const updatedUser = await UserModel.update(userId, updateData);

    if (!updatedUser) {
      res.status(404).json({
        success: false,
        message: "사용자를 찾을 수 없습니다",
      });
      return;
    }

    log("INFO", "사용자 프로필 업데이트 완료");

    res.json({
      success: true,
      message: "프로필 업데이트 완료",
      data: {
        user: {
          id: updatedUser.id,
          email: updatedUser.email,
          username: updatedUser.username,
          nickname: updatedUser.nickname,
          bio: updatedUser.bio,
          profileImage: updatedUser.profileImage,
          visibility: updatedUser.visibility,
          role: updatedUser.role,
          emailVerified: updatedUser.emailVerified,
          createdAt: updatedUser.createdAt,
          updatedAt: updatedUser.updatedAt,
        },
      },
    });
  } catch (error) {
    log("ERROR", "프로필 업데이트 실패");
    res.status(500).json({
      success: false,
      message: "프로필 업데이트 중 오류가 발생했습니다",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
