import { createHmac, timingSafeEqual } from "node:crypto";
import type { Request, Response, NextFunction } from "express";

export const adminSessionCookie = "reparts_admin_session";
export const adminSessionDurationSeconds = 8 * 60 * 60;
const cookiePath = "/api";

function sessionSecret(): string | null {
  const value = process.env.ADMIN_SESSION_SECRET;
  return value && Buffer.byteLength(value, "utf8") >= 32 ? value : null;
}

function secureCookie(): boolean {
  return process.env.NODE_ENV === "production";
}

function cookieSameSite(): "strict" | "none" {
  return secureCookie() ? "none" : "strict";
}

function signature(value: string, secret: string): Buffer {
  return createHmac("sha256", secret).update(value).digest();
}

export function createAdminSession(username: string): string | null {
  const secret = sessionSecret();
  if (!secret) return null;
  const expiresAt = Math.floor(Date.now() / 1000) + adminSessionDurationSeconds;
  const payload = `${Buffer.from(username, "utf8").toString("base64url")}.${expiresAt}`;
  const mac = signature(payload, secret).toString("base64url");
  return `${payload}.${mac}`;
}

function sessionUsername(token: string | undefined): string | null {
  const secret = sessionSecret();
  if (!secret || !token) return null;
  const [encodedUsername, expiresText, suppliedMac, ...rest] = token.split(".");
  if (!encodedUsername || !expiresText || !suppliedMac || rest.length > 0 || !/^\d+$/.test(expiresText)) return null;
  const payload = `${encodedUsername}.${expiresText}`;
  const expectedMac = signature(payload, secret);
  let receivedMac: Buffer;
  try {
    receivedMac = Buffer.from(suppliedMac, "base64url");
  } catch {
    return null;
  }
  if (receivedMac.length !== expectedMac.length || !timingSafeEqual(receivedMac, expectedMac)) return null;
  if (Number(expiresText) <= Math.floor(Date.now() / 1000)) return null;
  try {
    const username = Buffer.from(encodedUsername, "base64url").toString("utf8");
    return username && Buffer.from(username, "utf8").toString("base64url") === encodedUsername
      ? username
      : null;
  } catch {
    return null;
  }
}

function readCookie(request: Request, name: string): string | undefined {
  const cookieHeader = request.headers.cookie;
  if (!cookieHeader) return undefined;
  for (const item of cookieHeader.split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0 || item.slice(0, separator).trim() !== name) continue;
    try {
      return decodeURIComponent(item.slice(separator + 1).trim());
    } catch {
      return undefined;
    }
  }
  return undefined;
}

export function getAuthenticatedAdmin(request: Request): string | null {
  return sessionUsername(readCookie(request, adminSessionCookie));
}

export function setAdminSessionCookie(response: Response, token: string): void {
  response.cookie(adminSessionCookie, token, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: cookieSameSite(),
    path: cookiePath,
    maxAge: adminSessionDurationSeconds * 1000
  });
}

export function clearAdminSessionCookie(response: Response): void {
  response.clearCookie(adminSessionCookie, {
    httpOnly: true,
    secure: secureCookie(),
    sameSite: cookieSameSite(),
    path: cookiePath
  });
}

export function requireAdmin(request: Request, response: Response, next: NextFunction): void {
  const username = getAuthenticatedAdmin(request);
  if (!username) {
    response.status(401).json({ error: "Administrator authentication is required." });
    return;
  }
  response.locals.adminUsername = username;
  next();
}

export function requireSameOrigin(request: Request, response: Response, next: NextFunction): void {
  const configuredOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5173";
  const requestOrigin = request.get("origin");
  if (!requestOrigin || requestOrigin !== configuredOrigin) {
    response.status(403).json({ error: "The request origin is not allowed." });
    return;
  }
  next();
}
