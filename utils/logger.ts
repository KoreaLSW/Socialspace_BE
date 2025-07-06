// 로깅 함수
export const log = (level: string, message: string, meta?: any) => {
  const timestamp = new Date().toISOString();
  console.log(
    `[${timestamp}] ${level}: ${message}`,
    meta ? JSON.stringify(meta) : ""
  );
};
