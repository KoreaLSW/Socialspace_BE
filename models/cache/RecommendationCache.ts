import { log } from "../../utils/logger";
import { PostWithScore } from "../recommendations/PostRecommendation";

export interface CacheEntry {
  userId: string;
  algorithm: string;
  data: PostWithScore[];
  timestamp: number;
  ttl: number; // Time to live in milliseconds
  metadata?: {
    page: number;
    limit: number;
    total: number;
  };
}

export interface CacheStats {
  totalEntries: number;
  hitCount: number;
  missCount: number;
  hitRate: number;
  memoryUsage: number;
}

export class RecommendationCacheModel {
  private static cache = new Map<string, CacheEntry>();
  private static stats = {
    hitCount: 0,
    missCount: 0,
  };

  // 기본 TTL 설정 (밀리초)
  private static readonly DEFAULT_TTL = {
    relationship: 15 * 60 * 1000, // 15분
    engagement: 10 * 60 * 1000, // 10분
    trending: 5 * 60 * 1000, // 5분
    hybrid: 12 * 60 * 1000, // 12분
  };

  // 캐시 키 생성
  private static generateCacheKey(
    userId: string,
    algorithm: string,
    page: number,
    limit: number,
    config?: any
  ): string {
    const configHash = config ? JSON.stringify(config) : "";
    return `rec:${userId}:${algorithm}:${page}:${limit}:${Buffer.from(
      configHash
    ).toString("base64")}`;
  }

  // 캐시에서 추천 결과 조회
  static async get(
    userId: string,
    algorithm: string,
    page: number = 1,
    limit: number = 10,
    config?: any
  ): Promise<{ posts: PostWithScore[]; total: number } | null> {
    try {
      const key = this.generateCacheKey(userId, algorithm, page, limit, config);
      const entry = this.cache.get(key);

      if (!entry) {
        this.stats.missCount++;
        log("DEBUG", `캐시 미스: ${key}`);
        return null;
      }

      // TTL 확인
      if (Date.now() - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        this.stats.missCount++;
        log("DEBUG", `캐시 만료: ${key}`);
        return null;
      }

      this.stats.hitCount++;
      log("DEBUG", `캐시 히트: ${key}`);

      return {
        posts: entry.data,
        total: entry.metadata?.total || entry.data.length,
      };
    } catch (error) {
      log("ERROR", "캐시 조회 실패", error);
      return null;
    }
  }

  // 캐시에 추천 결과 저장
  static async set(
    userId: string,
    algorithm: string,
    page: number,
    limit: number,
    data: PostWithScore[],
    total: number,
    config?: any,
    customTtl?: number
  ): Promise<void> {
    try {
      const key = this.generateCacheKey(userId, algorithm, page, limit, config);
      const ttl =
        customTtl ||
        this.DEFAULT_TTL[algorithm as keyof typeof this.DEFAULT_TTL] ||
        this.DEFAULT_TTL.hybrid;

      const entry: CacheEntry = {
        userId,
        algorithm,
        data,
        timestamp: Date.now(),
        ttl,
        metadata: {
          page,
          limit,
          total,
        },
      };

      this.cache.set(key, entry);
      log("DEBUG", `캐시 저장: ${key}, TTL: ${ttl}ms`);

      // 메모리 사용량 체크 및 정리
      this.checkMemoryUsage();
    } catch (error) {
      log("ERROR", "캐시 저장 실패", error);
    }
  }

  // 특정 사용자의 모든 캐시 무효화
  static async invalidateUser(userId: string): Promise<void> {
    try {
      const keysToDelete: string[] = [];

      this.cache.forEach((entry, key) => {
        if (entry.userId === userId) {
          keysToDelete.push(key);
        }
      });

      keysToDelete.forEach((key) => this.cache.delete(key));

      if (keysToDelete.length > 0) {
        log("INFO", `사용자 ${userId}의 캐시 ${keysToDelete.length}개 무효화`);
      }
    } catch (error) {
      log("ERROR", "사용자 캐시 무효화 실패", error);
    }
  }

  // 특정 알고리즘의 모든 캐시 무효화
  static async invalidateAlgorithm(algorithm: string): Promise<void> {
    try {
      const keysToDelete: string[] = [];

      this.cache.forEach((entry, key) => {
        if (entry.algorithm === algorithm) {
          keysToDelete.push(key);
        }
      });

      keysToDelete.forEach((key) => this.cache.delete(key));

      if (keysToDelete.length > 0) {
        log(
          "INFO",
          `${algorithm} 알고리즘 캐시 ${keysToDelete.length}개 무효화`
        );
      }
    } catch (error) {
      log("ERROR", "알고리즘 캐시 무효화 실패", error);
    }
  }

  // 만료된 캐시 정리
  static async cleanupExpired(): Promise<number> {
    try {
      const keysToDelete: string[] = [];
      const now = Date.now();

      this.cache.forEach((entry, key) => {
        if (now - entry.timestamp > entry.ttl) {
          keysToDelete.push(key);
        }
      });

      keysToDelete.forEach((key) => this.cache.delete(key));

      if (keysToDelete.length > 0) {
        log("INFO", `만료된 캐시 ${keysToDelete.length}개 정리`);
      }

      return keysToDelete.length;
    } catch (error) {
      log("ERROR", "만료된 캐시 정리 실패", error);
      return 0;
    }
  }

  // 전체 캐시 클리어
  static async clear(): Promise<void> {
    try {
      const size = this.cache.size;
      this.cache.clear();
      this.stats.hitCount = 0;
      this.stats.missCount = 0;
      log("INFO", `전체 캐시 ${size}개 클리어`);
    } catch (error) {
      log("ERROR", "캐시 클리어 실패", error);
    }
  }

  // 캐시 통계 조회
  static getStats(): CacheStats {
    const totalRequests = this.stats.hitCount + this.stats.missCount;
    const hitRate =
      totalRequests > 0 ? (this.stats.hitCount / totalRequests) * 100 : 0;

    // 메모리 사용량 추정 (대략적)
    const memoryUsage = Array.from(this.cache.values()).reduce(
      (total, entry) => {
        return total + JSON.stringify(entry).length;
      },
      0
    );

    return {
      totalEntries: this.cache.size,
      hitCount: this.stats.hitCount,
      missCount: this.stats.missCount,
      hitRate: Math.round(hitRate * 100) / 100,
      memoryUsage,
    };
  }

  // 인기 캐시 키 조회 (디버깅용)
  static getPopularKeys(
    limit: number = 10
  ): Array<{ key: string; algorithm: string; userId: string; age: number }> {
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      algorithm: entry.algorithm,
      userId: entry.userId,
      age: Date.now() - entry.timestamp,
    }));

    return entries
      .sort((a, b) => a.age - b.age) // 최근 것부터
      .slice(0, limit);
  }

  // 캐시 예열 (인기 사용자들의 추천 미리 계산)
  static async warmup(
    userIds: string[],
    algorithms: string[] = ["hybrid"]
  ): Promise<void> {
    try {
      log(
        "INFO",
        `캐시 예열 시작: ${userIds.length}명의 사용자, ${algorithms.length}개 알고리즘`
      );

      // 실제 구현에서는 PostRecommendationModel을 import해서 사용
      // 여기서는 인터페이스만 정의
      const warmupTasks = [];

      for (const userId of userIds) {
        for (const algorithm of algorithms) {
          warmupTasks.push(this.warmupUserAlgorithm(userId, algorithm));
        }
      }

      await Promise.allSettled(warmupTasks);
      log("INFO", "캐시 예열 완료");
    } catch (error) {
      log("ERROR", "캐시 예열 실패", error);
    }
  }

  // 개별 사용자-알고리즘 조합 예열
  private static async warmupUserAlgorithm(
    userId: string,
    algorithm: string
  ): Promise<void> {
    try {
      // 실제로는 PostRecommendationModel.getRecommendedPosts를 호출하고
      // 그 결과를 캐시에 저장하는 로직이 들어감
      log("DEBUG", `캐시 예열: 사용자 ${userId}, 알고리즘 ${algorithm}`);
    } catch (error) {
      log(
        "ERROR",
        `캐시 예열 실패: 사용자 ${userId}, 알고리즘 ${algorithm}`,
        error
      );
    }
  }

  // 메모리 사용량 체크 및 LRU 정리
  private static checkMemoryUsage(): void {
    const MAX_ENTRIES = 1000; // 최대 캐시 엔트리 수

    if (this.cache.size > MAX_ENTRIES) {
      // LRU 방식으로 오래된 캐시 제거
      const entries = Array.from(this.cache.entries());
      entries.sort(([, a], [, b]) => a.timestamp - b.timestamp);

      const toRemove = entries.slice(0, this.cache.size - MAX_ENTRIES + 100);
      toRemove.forEach(([key]) => this.cache.delete(key));

      log("INFO", `LRU 정리: ${toRemove.length}개 캐시 엔트리 제거`);
    }
  }

  // 주기적 유지보수 (cron job에서 호출)
  static async maintenance(): Promise<void> {
    try {
      log("INFO", "캐시 유지보수 시작");

      const cleanedCount = await this.cleanupExpired();
      const stats = this.getStats();

      log(
        "INFO",
        `캐시 유지보수 완료: 정리된 항목 ${cleanedCount}개, 현재 히트율 ${stats.hitRate}%`
      );
    } catch (error) {
      log("ERROR", "캐시 유지보수 실패", error);
    }
  }

  // 캐시 성능 최적화를 위한 분석 데이터
  static async getAnalytics(): Promise<{
    algorithmStats: Record<string, number>;
    userStats: Record<string, number>;
    timeDistribution: Record<string, number>;
  }> {
    try {
      const algorithmStats: Record<string, number> = {};
      const userStats: Record<string, number> = {};
      const timeDistribution: Record<string, number> = {};

      this.cache.forEach((entry) => {
        // 알고리즘별 통계
        algorithmStats[entry.algorithm] =
          (algorithmStats[entry.algorithm] || 0) + 1;

        // 사용자별 통계
        userStats[entry.userId] = (userStats[entry.userId] || 0) + 1;

        // 캐시 생성 시간 분포
        const hourKey = new Date(entry.timestamp).getHours().toString();
        timeDistribution[hourKey] = (timeDistribution[hourKey] || 0) + 1;
      });

      return {
        algorithmStats,
        userStats,
        timeDistribution,
      };
    } catch (error) {
      log("ERROR", "캐시 분석 데이터 조회 실패", error);
      return {
        algorithmStats: {},
        userStats: {},
        timeDistribution: {},
      };
    }
  }
}
