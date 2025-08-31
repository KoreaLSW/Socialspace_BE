import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { pool, PostgreSQLConnection } from "./config/database";
import { errorHandler } from "./middleware/errorHandler";
import { log } from "./utils/logger";
import routes from "./routes";

const app = express();
const port = process.env.PORT || 4000;

// 프록시 환경에서 실제 클라이언트 IP 추출을 위해 신뢰 프록시 설정
app.set("trust proxy", true);

// 🔧 CORS 설정 추가
app.use(
  cors({
    origin: [
      "http://localhost:3000", // NextJS 개발 서버
      "http://localhost:3001", // NextJS 개발 서버
    ],
    credentials: true, // 쿠키 포함 허용
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-CSRF-Token",
      "Cookie",
      "x-session-data",
    ],
    exposedHeaders: ["Set-Cookie"], // 쿠키 설정 헤더 노출
    // 🔧 프리플라이트 응답 캐시 시간 추가
    optionsSuccessStatus: 200,
    preflightContinue: false,
  })
);

// 미들웨어
// 본문 크기 제한 상향 (Base64 이미지 업로드 대응)
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser()); // 🔧 쿠키 파서 미들웨어 추가

// 라우트 설정
app.use("/", routes);

// 에러 핸들링 미들웨어
app.use(errorHandler);

// 서버 시작
const startServer = async () => {
  try {
    // 데이터베이스 연결 테스트
    const dbConnected = await PostgreSQLConnection();

    // 서버 시작
    app.listen(port, () => {
      log("INFO", `🚀 Server running on port ${port}`, {
        url: `http://localhost:${port}`,
        database: dbConnected ? "connected" : "disconnected",
      });
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      log("INFO", "🛑 Shutting down server...");
      await pool.end();
      log("INFO", "✅ Database connections closed");
      process.exit(0);
    });
  } catch (error) {
    log("ERROR", "Failed to start server", error);
    process.exit(1);
  }
};

startServer();

export { pool };
