# SocialSpace Backend

Express.js와 TypeScript로 만든 RESTful API 서버입니다. PostgreSQL 데이터베이스와 Socket.IO를 사용해서 실시간 채팅과 알림 기능을 제공합니다.

## 기술 스택

- **Node.js** + **Express.js 5**
- **TypeScript**
- **PostgreSQL** (pg 드라이버)
- **Socket.IO** (실시간 통신)
- **TypeORM** (ORM은 사용하지 않고 raw SQL 쿼리)
- **JWT** (인증)
- **Cloudinary** (이미지 업로드)

## 폴더 구조

```
socialspace-be/
├── config/              # 설정 파일
│   ├── database.ts      # DB 연결 설정
│   └── cloudinary.ts    # 이미지 업로드 설정
├── controllers/         # 비즈니스 로직
│   ├── authController.ts
│   ├── postsController.ts
│   ├── chatController.ts
│   └── ...
├── models/             # 데이터 모델 (타입 정의)
│   ├── User.ts
│   ├── Post.ts
│   ├── Chat.ts
│   └── ...
├── routes/             # API 라우트
│   ├── auth.ts
│   ├── posts.ts
│   ├── chat.ts
│   └── ...
├── middleware/        # 미들웨어
│   ├── auth.ts        # JWT 인증
│   ├── blockCheck.ts  # 차단 확인
│   └── errorHandler.ts
├── socket/            # Socket.IO 이벤트 핸들러
│   └── index.ts
├── utils/             # 유틸리티 함수
│   ├── jwt.ts
│   └── logger.ts
└── server.ts          # 서버 진입점
```

## 주요 기능

- 사용자 인증 (JWT, Google OAuth)
- 게시물 CRUD (이미지 업로드 포함)
- 댓글 및 대댓글
- 팔로우/언팔로우, 친한친구 관리
- 실시간 채팅 (Socket.IO)
- 알림 시스템
- 차단 기능
- 게시물 추천 알고리즘

## 개발 방식

**API 설계**: RESTful API로 70개 이상의 엔드포인트를 구현했습니다. 각 기능별로 라우터를 분리해서 관리했습니다 (auth, posts, comments, chat, follow 등). 모든 응답은 일관된 포맷(success, data, message)으로 통일했습니다.

**데이터베이스**: PostgreSQL을 사용했고, TypeORM 대신 raw SQL 쿼리를 직접 작성했습니다. 트랜잭션 처리나 복잡한 JOIN 쿼리를 직접 제어할 수 있어서 성능 최적화가 수월했습니다.

**실시간 통신**: Socket.IO로 실시간 채팅을 구현했습니다. 사용자별 소켓 매핑(Map 자료구조)을 관리하고, 룸 기반 멀티캐스팅으로 메시지를 전송합니다. 메시지 읽음 상태, 타이핑 상태 같은 기능도 이벤트 핸들러로 처리했습니다.

**인증 미들웨어**: JWT 토큰 기반 인증을 미들웨어로 구현했습니다. 차단된 사용자 필터링도 미들웨어에서 처리해서 API 핸들러는 비즈니스 로직에만 집중할 수 있게 했습니다.

**에러 처리**: 통합 에러 핸들러 미들웨어를 만들어서 모든 에러를 일관되게 처리합니다. 개발 환경과 프로덕션 환경에서 다르게 에러를 노출하도록 설정했습니다.

```

## 실행 방법

```bash
npm install
npm run dev
```

프로덕션 빌드:

```bash
npm run build
npm start
```

## API 응답 형식

모든 API 응답은 다음과 같은 형식을 따릅니다:

```typescript
{
  success: boolean;
  data?: any;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  }
}
```

## 주요 엔드포인트

- `POST /auth/login` - 로그인
- `POST /auth/signup` - 회원가입
- `GET /posts` - 게시물 목록 조회
- `POST /posts` - 게시물 작성
- `GET /chat/rooms` - 채팅방 목록
- `POST /follow/:userId` - 팔로우
- `GET /notifications` - 알림 목록
