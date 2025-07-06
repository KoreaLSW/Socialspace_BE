# 🔐 보안 강화 가이드 (직접 구현 방식)

## 📋 현재 구조의 보안 강화 방법

### 1. 📱 클라이언트사이드 보안 강화

#### **토큰 저장 방식 개선**

```typescript
// ❌ 취약한 방식
localStorage.setItem("token", jwt);

// ✅ 권장 방식 1: HttpOnly 쿠키 (가장 안전)
// 백엔드에서 쿠키 설정
res.cookie("token", jwt, {
  httpOnly: true, // JavaScript 접근 불가
  secure: true, // HTTPS만
  sameSite: "strict", // CSRF 보호
  maxAge: 24 * 60 * 60 * 1000, // 24시간
});

// ✅ 권장 방식 2: 세션 스토리지 (중간 수준)
sessionStorage.setItem("token", jwt); // 탭 닫으면 자동 삭제

// ✅ 권장 방식 3: 메모리 저장 (높은 보안)
// React Context나 상태 관리 라이브러리 사용
```

#### **XSS 공격 방지**

```typescript
// 1. CSP 헤더 설정
// next.config.js
module.exports = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'self'; script-src 'self' accounts.google.com;",
          },
        ],
      },
    ];
  },
};

// 2. 입력 데이터 검증
import DOMPurify from "dompurify";

const sanitizeInput = (input: string) => {
  return DOMPurify.sanitize(input);
};
```

### 2. 🔒 백엔드 보안 강화

#### **JWT 토큰 보안**

```typescript
// utils/jwt.ts - 개선된 버전
import jwt from "jsonwebtoken";
import crypto from "crypto";

interface JWTPayload {
  userId: string;
  email: string;
  role: string;
  tokenVersion: number; // 토큰 무효화를 위한 버전
}

// 토큰 생성 (더 안전한 방식)
export const generateTokens = (payload: JWTPayload) => {
  const accessToken = jwt.sign(payload, process.env.JWT_SECRET!, {
    expiresIn: "15m", // 짧은 만료 시간
    issuer: "socialspace-be",
    audience: "socialspace-fe",
  });

  const refreshToken = jwt.sign(
    { userId: payload.userId, tokenVersion: payload.tokenVersion },
    process.env.JWT_REFRESH_SECRET!,
    {
      expiresIn: "7d", // 긴 만료 시간
      issuer: "socialspace-be",
      audience: "socialspace-fe",
    }
  );

  return { accessToken, refreshToken };
};

// 토큰 검증 (더 엄격한 방식)
export const verifyToken = (
  token: string,
  type: "access" | "refresh" = "access"
) => {
  try {
    const secret =
      type === "access"
        ? process.env.JWT_SECRET!
        : process.env.JWT_REFRESH_SECRET!;

    return jwt.verify(token, secret, {
      issuer: "socialspace-be",
      audience: "socialspace-fe",
    }) as JWTPayload;
  } catch (error) {
    throw new Error("유효하지 않은 토큰입니다");
  }
};
```

#### **CSRF 보호 구현**

```typescript
// middleware/csrfProtection.ts
import { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export const csrfProtection = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  if (req.method === "GET") {
    // CSRF 토큰 생성
    const csrfToken = crypto.randomBytes(32).toString("hex");
    res.cookie("csrf-token", csrfToken, {
      httpOnly: false, // JavaScript에서 읽을 수 있어야 함
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });
    next();
  } else {
    // POST/PUT/DELETE 요청에서 CSRF 토큰 검증
    const csrfToken = req.headers["x-csrf-token"];
    const cookieToken = req.cookies["csrf-token"];

    if (!csrfToken || csrfToken !== cookieToken) {
      res.status(403).json({
        success: false,
        message: "CSRF 토큰이 유효하지 않습니다",
      });
      return;
    }
    next();
  }
};
```

#### **Rate Limiting 구현**

```typescript
// middleware/rateLimit.ts
import rateLimit from "express-rate-limit";

export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 10, // 최대 10회 시도
  message: {
    success: false,
    message: "너무 많은 로그인 시도입니다. 잠시 후 다시 시도해주세요.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// 사용법
// routes/auth.ts
import { authRateLimit } from "../middleware/rateLimit";

router.post("/google", authRateLimit, verifyGoogleToken, googleLogin);
```

### 3. 🔄 토큰 갱신 시스템

#### **Refresh Token 패턴**

```typescript
// controllers/authController.ts - 토큰 갱신 로직 추가
export const refreshToken = async (req: Request, res: Response) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      res.status(401).json({
        success: false,
        message: "Refresh token이 필요합니다",
      });
      return;
    }

    // Refresh token 검증
    const decoded = verifyToken(refreshToken, "refresh");

    // 사용자 정보 조회
    const user = await User.findById(decoded.userId);

    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      res.status(401).json({
        success: false,
        message: "유효하지 않은 refresh token입니다",
      });
      return;
    }

    // 새 토큰 생성
    const tokens = generateTokens({
      userId: user.id,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    });

    res.json({
      success: true,
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
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
```

#### **자동 토큰 갱신 (프론트엔드)**

```typescript
// hooks/useAutoRefresh.ts
import { useEffect, useRef } from "react";

export const useAutoRefresh = (token: string) => {
  const refreshTimer = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!token) return;

    // JWT 디코딩하여 만료 시간 확인
    const payload = JSON.parse(atob(token.split(".")[1]));
    const expiryTime = payload.exp * 1000; // 밀리초로 변환
    const currentTime = Date.now();
    const timeUntilExpiry = expiryTime - currentTime;

    // 만료 5분 전에 갱신
    const refreshTime = Math.max(timeUntilExpiry - 5 * 60 * 1000, 0);

    refreshTimer.current = setTimeout(async () => {
      try {
        const refreshToken = localStorage.getItem("refreshToken");
        const response = await fetch("/auth/refresh", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refreshToken }),
        });

        if (response.ok) {
          const data = await response.json();
          localStorage.setItem("token", data.data.accessToken);
          localStorage.setItem("refreshToken", data.data.refreshToken);
        }
      } catch (error) {
        console.error("토큰 갱신 실패:", error);
        // 로그아웃 처리
        localStorage.removeItem("token");
        localStorage.removeItem("refreshToken");
      }
    }, refreshTime);

    return () => {
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current);
      }
    };
  }, [token]);
};
```

## 🎯 보안 등급별 권장사항

### **🔴 최고 보안 (금융, 의료)**

- NextAuth.js 사용
- HttpOnly 쿠키
- 짧은 토큰 만료 시간 (5-15분)
- 2FA 인증
- 세션 관리 서버사이드

### **🟡 중간 보안 (일반 웹앱)**

- 직접 구현 + 보안 강화
- HttpOnly 쿠키 또는 세션 스토리지
- Refresh Token 패턴
- CSRF 보호
- Rate Limiting

### **🟢 기본 보안 (개인 프로젝트)**

- 현재 구현 방식
- LocalStorage + JWT
- 기본 토큰 검증
- HTTPS 사용

## 📝 결론

**현재 프로젝트 (SocialSpace)**에는 **중간 보안 수준**이 적합합니다:

1. **직접 구현 방식 유지** + 보안 강화
2. **HttpOnly 쿠키**로 토큰 저장 개선
3. **Refresh Token 패턴** 도입
4. **CSRF 보호** 및 **Rate Limiting** 추가

이렇게 하면 NextAuth.js의 복잡성 없이도 **충분한 보안**을 확보할 수 있습니다! 🔐
