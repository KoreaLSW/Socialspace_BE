// 한국시간 유틸리티 함수들

/**
 * 현재 한국시간을 PostgreSQL TIMESTAMP 형식으로 반환
 * @returns PostgreSQL TIMESTAMP 형식의 한국시간 문자열
 */
export const getKoreanTime = (): string => {
  const now = new Date();
  const koreanTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  return koreanTime.toISOString().slice(0, 19).replace("T", " ");
};

/**
 * 한국시간을 ISO 문자열로 반환
 * @returns ISO 형식의 한국시간 문자열
 */
export const getKoreanTimeISO = (): string => {
  const now = new Date();
  return now.toLocaleString("sv-SE", { timeZone: "Asia/Seoul" });
};

/**
 * 한국시간을 사용자 친화적인 형태로 반환
 * @returns YYYY-MM-DD HH:mm:ss 형식의 한국시간 문자열
 */
export const getKoreanTimeFormatted = (): string => {
  const now = new Date();
  return now.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
};

/**
 * 주어진 UTC 시간을 한국시간으로 변환
 * @param utcTime UTC 시간 문자열 또는 Date 객체
 * @returns 한국시간으로 변환된 Date 객체
 */
export const convertToKoreanTime = (utcTime: string | Date): Date => {
  const date = typeof utcTime === "string" ? new Date(utcTime) : utcTime;
  return new Date(date.toLocaleString("en-US", { timeZone: "Asia/Seoul" }));
};

/**
 * 현재 한국시간대 정보 확인
 * @returns 타임존 정보 객체
 */
export const getKoreanTimezoneInfo = () => {
  const now = new Date();
  const koreanTime = new Date(
    now.toLocaleString("en-US", { timeZone: "Asia/Seoul" })
  );
  const utcTime = new Date(now.toISOString());

  return {
    timezone: "Asia/Seoul",
    koreanTime: koreanTime.toISOString(),
    utcTime: utcTime.toISOString(),
    offset: "+09:00",
    formatted: getKoreanTimeFormatted(),
  };
};
