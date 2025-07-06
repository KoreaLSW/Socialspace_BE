import express from "express";
import cors from "cors";
import { pool, PostgreSQLConnection } from "./config/database";
import { errorHandler } from "./middleware/errorHandler";
import { log } from "./utils/logger";
import routes from "./routes";

const app = express();
const port = process.env.PORT || 4000;

// 🔧 CORS 설정 추가
app.use(
  cors({
    origin: [
      "http://localhost:3000", // NextJS 개발 서버
      "http://localhost:8080", // 테스트 HTTP 서버
      "file://", // 로컬 파일에서 테스트
      /^http:\/\/localhost:\d+$/, // 모든 localhost 포트
    ],
    credentials: true, // 쿠키 포함 허용
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-CSRF-Token"],
  })
);

// 미들웨어
app.use(express.json());

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
