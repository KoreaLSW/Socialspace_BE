import { Pool } from "pg";
import dotenv from "dotenv";
import { log } from "../utils/logger";

// 환경변수 로드
dotenv.config();

// PostgreSQL 연결 풀 설정
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
  // 한국시간 timezone 설정
  options: "-c timezone=Asia/Seoul",
});

// 데이터베이스 연결 테스트
export const PostgreSQLConnection = async () => {
  try {
    log("INFO", "Attempting database connection...", {
      connectionString: process.env.DATABASE_URL ? "설정됨" : "설정되지 않음",
      nodeEnv: process.env.NODE_ENV,
    });

    const client = await pool.connect();

    // 타임존 설정 확인
    await client.query("SET timezone = 'Asia/Seoul'");

    const result = await client.query(
      "SELECT NOW() as current_time, version() as version, current_setting('timezone') as timezone"
    );

    log("INFO", "Database connection successful", {
      currentTime: result.rows[0].current_time,
      version: result.rows[0].version.split(" ")[0],
      timezone: result.rows[0].timezone,
    });

    client.release();
    return true;
  } catch (error) {
    log("ERROR", "Database connection failed", {
      error: error instanceof Error ? error.message : "Unknown error",
      code: (error as any)?.code,
      connectionString: process.env.DATABASE_URL ? "설정됨" : "설정되지 않음",
    });
    return false;
  }
};
