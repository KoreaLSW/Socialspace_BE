import { Request } from "express";

export function getClientIp(req: Request): string | null {
  const xForwardedFor = (req.headers["x-forwarded-for"] as string) || "";
  const xRealIp = (req.headers["x-real-ip"] as string) || "";

  const candidate =
    xForwardedFor.split(",")[0].trim() ||
    xRealIp ||
    (req.socket as any)?.remoteAddress ||
    (req as any).ip ||
    "";

  if (!candidate) return null;

  // IPv6 to IPv4 mapped address 처리
  return candidate.replace("::ffff:", "");
}
