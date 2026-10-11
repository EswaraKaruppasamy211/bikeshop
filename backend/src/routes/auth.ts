import { promisify } from "node:util";
import { scrypt, timingSafeEqual } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import {
  adminSessionDurationSeconds,
  clearAdminSessionCookie,
  createAdminSession,
  getAuthenticatedAdmin,
  requireSameOrigin,
  setAdminSessionCookie
} from "../middleware/admin-auth.js";

const scryptAsync = promisify(scrypt);
const loginSchema = z.object({
  username: z.string().trim().min(1).max(128),
  password: z.string().min(1).max(1024)
});
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: "Too many sign-in attempts. Try again later." }
});

function provisionedCredentials(): { username: string; salt: Buffer; hash: Buffer } | null {
  const username = process.env.ADMIN_USERNAME?.trim();
  const encoded = process.env.ADMIN_PASSWORD_HASH;
  if (!username || !encoded) return null;
  const parts = encoded.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt" ||
      !/^[a-f0-9]{32,128}$/i.test(parts[1]) || !/^[a-f0-9]{128}$/i.test(parts[2])) return null;
  return { username, salt: Buffer.from(parts[1], "hex"), hash: Buffer.from(parts[2], "hex") };
}

async function verifyPassword(password: string, credentials: NonNullable<ReturnType<typeof provisionedCredentials>>) {
  const candidate = await scryptAsync(password, credentials.salt, credentials.hash.length) as Buffer;
  return timingSafeEqual(candidate, credentials.hash);
}

export const authRouter = Router();

authRouter.post("/login", loginLimiter, requireSameOrigin, async (request, response) => {
  const parsed = loginSchema.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "Enter a valid username and password." });
    return;
  }
  const credentials = provisionedCredentials();
  const sessionSecret = process.env.ADMIN_SESSION_SECRET;
  if (!credentials || !sessionSecret || Buffer.byteLength(sessionSecret, "utf8") < 32) {
    response.status(503).json({ error: "Administrator sign-in is not configured." });
    return;
  }

  const usernameMatches = parsed.data.username.localeCompare(credentials.username, undefined, { sensitivity: "accent" }) === 0;
  const passwordMatches = await verifyPassword(parsed.data.password, credentials);
  if (!usernameMatches || !passwordMatches) {
    response.status(401).json({ error: "Invalid username or password." });
    return;
  }

  const token = createAdminSession(credentials.username);
  if (!token) {
    response.status(503).json({ error: "Administrator sign-in is not configured." });
    return;
  }
  setAdminSessionCookie(response, token);
  response.json({ authenticated: true, username: credentials.username, expiresIn: adminSessionDurationSeconds });
});

authRouter.post("/logout", requireSameOrigin, (_request, response) => {
  clearAdminSessionCookie(response);
  response.json({ authenticated: false });
});

authRouter.get("/session", (request, response) => {
  const username = getAuthenticatedAdmin(request);
  response.json(username
    ? { authenticated: true, username, expiresIn: adminSessionDurationSeconds }
    : { authenticated: false });
});
