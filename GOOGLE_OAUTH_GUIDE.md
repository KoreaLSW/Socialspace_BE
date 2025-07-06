# Google OAuth 로그인 구현 가이드

## 📋 개요

이 가이드는 **NextAuth.js 없이** NextJS 프론트엔드와 Node.js 백엔드에서 Google OAuth 로그인을 간단하게 구현하는 방법을 설명합니다.

## 🔧 백엔드 설정

### 1. 데이터베이스 테이블 생성

```sql
-- sql/create_users_table.sql 파일 실행
psql -d your_database < sql/create_users_table.sql
```

**테이블 구조:**

```sql
CREATE TABLE users (
    id VARCHAR(255) PRIMARY KEY, -- Google ID를 직접 사용
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    nickname VARCHAR(50),
    bio TEXT,
    profile_image TEXT,
    visibility VARCHAR(20) DEFAULT 'public',
    role VARCHAR(20) DEFAULT 'user',
    email_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 2. 환경 변수 설정

`.env` 파일에 다음 변수들을 추가하세요:

```env
# 데이터베이스
DATABASE_URL=postgresql://username:password@localhost:5432/socialspace

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
```

### 3. Google Cloud Console 설정

1. [Google Cloud Console](https://console.cloud.google.com/)에 접속
2. 프로젝트 생성 또는 기존 프로젝트 선택
3. "APIs & Services" > "Credentials" 이동
4. "Create Credentials" > "OAuth 2.0 Client IDs" 선택
5. Application type: Web application
6. Authorized JavaScript origins: `http://localhost:3000` (NextJS 개발 서버)
7. Authorized redirect URIs는 **설정하지 않아도 됨** (클라이언트사이드 토큰 방식)

## 🚀 API 엔드포인트

### 1. Google 로그인 (🔐 보안 강화)

```http
POST /auth/google
Content-Type: application/json

{
  "idToken": "Google ID Token from frontend"
}
```

**응답:** (🔐 토큰은 HttpOnly 쿠키로 전송)

```json
{
  "success": true,
  "message": "로그인 성공",
  "data": {
    "user": {
      "id": "116945451865234567890",
      "email": "user@example.com",
      "username": "user123",
      "nickname": "사용자 이름",
      "bio": null,
      "profileImage": "https://...",
      "visibility": "public",
      "role": "user",
      "emailVerified": true,
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    },
    "authenticated": true
  }
}

Set-Cookie: accessToken=jwt-token; HttpOnly; Secure; SameSite=Strict; Max-Age=900
Set-Cookie: refreshToken=jwt-refresh-token; HttpOnly; Secure; SameSite=Strict; Max-Age=604800
```

### 2. 토큰 갱신 (🔐 새로운 엔드포인트)

```http
POST /auth/refresh
Cookie: refreshToken=jwt-refresh-token
```

**응답:**

```json
{
  "success": true,
  "message": "토큰 갱신 성공",
  "data": {
    "authenticated": true
  }
}

Set-Cookie: accessToken=new-jwt-token; HttpOnly; Secure; SameSite=Strict; Max-Age=900
```

### 3. 사용자 정보 조회 (🔐 쿠키 자동 전송)

```http
GET /auth/me
Cookie: accessToken=jwt-token
```

### 4. 프로필 업데이트

```http
PUT /auth/profile
Cookie: accessToken=jwt-token
Content-Type: application/json

{
  "nickname": "새로운 닉네임",
  "bio": "새로운 자기소개",
  "visibility": "private"
}
```

### 5. 로그아웃 (🔐 쿠키 삭제)

```http
POST /auth/logout
Cookie: accessToken=jwt-token
```

## 💻 프론트엔드 설정 (NextJS) - 🔐 보안 강화 버전

### 방법 1: Google JavaScript API 사용 (권장)

#### 1. HTML Head에 Google Script 추가

```jsx
// pages/_document.js 또는 _app.js
import Head from "next/head";

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <script
          src="https://accounts.google.com/gsi/client"
          async
          defer
        ></script>
      </Head>
      <Component {...pageProps} />
    </>
  );
}
```

#### 2. 환경 변수 설정

```env
# .env.local
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
NEXT_PUBLIC_API_URL=http://localhost:4000
```

#### 3. 로그인 컴포넌트 (🔐 쿠키 기반)

```jsx
// components/GoogleLogin.jsx
import { useEffect, useState } from "react";

export default function GoogleLogin() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 🔐 로그인 상태 확인 (쿠키 기반)
    checkAuthStatus();

    // Google 로그인 초기화
    if (typeof window !== "undefined" && window.google) {
      window.google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        callback: handleCredentialResponse,
      });

      window.google.accounts.id.renderButton(
        document.getElementById("google-signin-button"),
        {
          theme: "outline",
          size: "large",
          text: "signin_with",
          locale: "ko",
        }
      );
    }
  }, []);

  // 🔐 로그인 상태 확인 함수
  const checkAuthStatus = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/me`,
        {
          credentials: "include", // 쿠키 자동 전송
        }
      );

      if (response.ok) {
        const data = await response.json();
        setUser(data.data.user);
      }
    } catch (error) {
      console.log("로그인 상태 확인 실패:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleCredentialResponse = async (response) => {
    try {
      setLoading(true);
      console.log("Google ID Token:", response.credential);

      // 🔐 백엔드로 ID 토큰 전송 (쿠키 자동 설정)
      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/google`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          credentials: "include", // 쿠키 자동 수신
          body: JSON.stringify({
            idToken: response.credential,
          }),
        }
      );

      const data = await res.json();

      if (data.success) {
        setUser(data.data.user);
        console.log("로그인 성공:", data.data.user);
      } else {
        console.error("로그인 실패:", data.message);
      }
    } catch (error) {
      console.error("로그인 오류:", error);
    } finally {
      setLoading(false);
    }
  };

  // 🔐 자동 토큰 갱신 (선택적)
  const refreshToken = async () => {
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/auth/refresh`,
        {
          method: "POST",
          credentials: "include", // 쿠키 자동 전송
        }
      );

      if (response.ok) {
        console.log("토큰 갱신 성공");
        return true;
      } else {
        console.log("토큰 갱신 실패");
        return false;
      }
    } catch (error) {
      console.error("토큰 갱신 오류:", error);
      return false;
    }
  };

  const handleLogout = async () => {
    try {
      setLoading(true);

      // 🔐 백엔드 로그아웃 (쿠키 삭제)
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/auth/logout`, {
        method: "POST",
        credentials: "include", // 쿠키 자동 전송
      });

      setUser(null);
      console.log("로그아웃 성공");
    } catch (error) {
      console.error("로그아웃 오류:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div>로딩 중...</div>;
  }

  if (user) {
    return (
      <div className="user-profile">
        <img src={user.profileImage} alt="Profile" width="50" height="50" />
        <div>
          <h3>{user.nickname}</h3>
          <p>@{user.username}</p>
          <p>{user.email}</p>
          {user.bio && <p>{user.bio}</p>}
        </div>
        <button onClick={handleLogout} disabled={loading}>
          {loading ? "로그아웃 중..." : "로그아웃"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <h2>Google로 로그인</h2>
      <div id="google-signin-button"></div>
    </div>
  );
}
```

#### 4. API 호출 유틸리티 (🔐 쿠키 기반)

```jsx
// utils/api.js
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;

export const apiCall = async (endpoint, options = {}) => {
  const config = {
    credentials: "include", // 🔐 쿠키 자동 전송
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
    ...options,
  };

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, config);

    // 🔐 토큰 만료 시 자동 갱신
    if (response.status === 401) {
      const refreshSuccess = await refreshToken();
      if (refreshSuccess) {
        // 다시 시도
        return await fetch(`${API_BASE_URL}${endpoint}`, config);
      }
    }

    return response;
  } catch (error) {
    console.error("API 호출 오류:", error);
    throw error;
  }
};

const refreshToken = async () => {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
      method: "POST",
      credentials: "include",
    });
    return response.ok;
  } catch (error) {
    return false;
  }
};

// 사용 예시
export const getUserProfile = () => apiCall("/auth/me");
export const updateProfile = (data) =>
  apiCall("/auth/profile", {
    method: "PUT",
    body: JSON.stringify(data),
  });
```

#### 5. NextJS 설정 (CORS 및 쿠키 설정)

```js
// next.config.js
module.exports = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: "http://localhost:4000/:path*",
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // 🔐 보안 헤더 설정
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
        ],
      },
    ];
  },
};
```

## 🎯 사용자 로그인 플로우 (🔐 보안 강화)

### **클라이언트사이드 플로우:**

1. **Google 로그인 버튼 클릭**
2. **Google OAuth 팝업 → ID 토큰 받음**
3. **백엔드 `/auth/google`로 ID 토큰 전송**
4. **백엔드에서 토큰 검증 → HttpOnly 쿠키로 JWT 전송**
5. **쿠키 자동 저장 (JavaScript 접근 불가)**
6. **이후 API 호출 시 쿠키 자동 전송**

### **백엔드 처리:**

1. **Google API로 ID 토큰 검증**
2. **사용자 정보 추출 → DB 확인/생성**
3. **Access Token (15분) + Refresh Token (7일) 생성**
4. **HttpOnly 쿠키로 토큰 전송**

### **🔐 보안 기능:**

- **XSS 방지**: HttpOnly 쿠키로 토큰 저장
- **CSRF 방지**: SameSite=Strict 설정
- **토큰 갱신**: 15분 만료 + 자동 갱신
- **안전한 로그아웃**: 서버사이드 쿠키 삭제

## ✅ 이 방식의 장점 (🔐 보안 강화)

1. **높은 보안**: HttpOnly 쿠키로 XSS 공격 방지
2. **자동 관리**: 쿠키 자동 전송/수신
3. **토큰 갱신**: 짧은 만료 시간 + 자동 갱신
4. **CSRF 방지**: SameSite 설정
5. **단순함**: NextAuth.js 없이도 높은 보안
6. **제어권**: 인증 플로우 완전 제어

## 🚦 테스트 방법

1. 백엔드 서버 실행: `npm run dev`
2. 프론트엔드 NextJS 서버 실행
3. Google 로그인 버튼 클릭
4. 브라우저 개발자 도구에서 쿠키 확인 (Application > Cookies)
5. 네트워크 탭에서 쿠키 자동 전송 확인

## 📝 주요 차이점

| 방식             | NextAuth.js | 직접 구현 (LocalStorage) | 직접 구현 (쿠키) |
| ---------------- | ----------- | ------------------------ | ---------------- |
| **보안**         | 🟢 높음     | 🔴 낮음                  | 🟢 높음          |
| **복잡도**       | 🔴 높음     | 🟢 낮음                  | 🟡 중간          |
| **XSS 방지**     | 🟢 우수     | 🔴 취약                  | 🟢 우수          |
| **CSRF 방지**    | 🟢 우수     | 🔴 취약                  | 🟢 우수          |
| **자동 갱신**    | 🟢 내장     | 🔴 수동                  | 🟢 구현 가능     |
| **커스터마이징** | 🔴 제한적   | 🟢 자유                  | 🟢 자유          |

**🎯 결론**: 현재 구현은 **직접 구현 (쿠키)** 방식으로 **높은 보안**과 **단순함**을 모두 달성했습니다! 🔐✨
