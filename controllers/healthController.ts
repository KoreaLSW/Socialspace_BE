import { Request, Response } from "express";
import { PostgreSQLConnection } from "../config/database";
import { log } from "../utils/logger";
import {
  getKoreanTimezoneInfo,
  getKoreanTime,
  getKoreanTimeFormatted,
} from "../utils/time";

// 간단한 헬스 체크 엔드포인트
export const getHealth = async (req: Request, res: Response) => {
  try {
    const health = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || "development",
      version: "1.0.0",
    };

    res.json(health);
  } catch (error) {
    log("ERROR", "Health check failed", error);
    res.status(500).json({
      status: "unhealthy",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};

// 데이터베이스 연결 테스트
export const testDatabase = async (req: Request, res: Response) => {
  try {
    const isConnected = await PostgreSQLConnection();

    if (isConnected) {
      res.json({
        status: "success",
        message: "Database connection successful",
        timestamp: new Date().toISOString(),
      });
    } else {
      res.status(500).json({
        status: "error",
        message: "Database connection failed",
        timestamp: new Date().toISOString(),
      });
    }
  } catch (error) {
    log("ERROR", "Database test failed", error);
    res.status(500).json({
      status: "error",
      message: "Database test failed",
      error: error instanceof Error ? error.message : "Unknown error",
      timestamp: new Date().toISOString(),
    });
  }
};

// 한국시간 설정 확인 테스트
export const testKoreanTime = async (req: Request, res: Response) => {
  try {
    const timezoneInfo = getKoreanTimezoneInfo();

    res.json({
      status: "success",
      message: "한국시간 설정 확인",
      data: {
        ...timezoneInfo,
        dbFormatTime: getKoreanTime(),
        displayTime: getKoreanTimeFormatted(),
        jsTime: new Date().toISOString(),
        jsKoreanTime: new Date().toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
        }),
      },
    });
  } catch (error) {
    log("ERROR", "Korean time test failed", error);
    res.status(500).json({
      status: "error",
      message: "Korean time test failed",
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
};
