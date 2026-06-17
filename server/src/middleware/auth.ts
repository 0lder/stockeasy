/**
 * JWT Authentication middleware.
 *
 * Usage:
 *   router.get("/path", requireAuth, asyncHandler(async (req, res) => { ... }));
 *
 * On success, req.user = { userId: number, username: string }
 */

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

// Extend Express Request
declare global {
  namespace Express {
    interface Request {
      user?: { userId: number; username: string };
    }
  }
}

const JWT_SECRET = process.env.JWT_SECRET || "stockeasy-dev-secret-change-in-production";
const TOKEN_EXPIRY = "7d";
const CRON_SECRET = process.env.CRON_SECRET || "stockeasy-cron-secret";

// ============================================================
// Token helpers
// ============================================================

export function signToken(payload: { userId: number; username: string }): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY });
}

export function verifyToken(token: string): { userId: number; username: string } {
  return jwt.verify(token, JWT_SECRET) as { userId: number; username: string };
}

// ============================================================
// Middleware: requireAuth
// ============================================================

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Cron secret bypass — skips JWT, sets system user
  const cronHeader = req.headers["x-cron-secret"];
  if (cronHeader === CRON_SECRET) {
    req.user = { userId: 0, username: "cron" };
    next();
    return;
  }

  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    res.status(401).json({ error: "请先登录" });
    return;
  }

  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: "登录已过期，请重新登录" });
  }
}

// ============================================================
// Middleware: optionalAuth (doesn't fail, just sets req.user if token present)
// ============================================================

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (header && header.startsWith("Bearer ")) {
    try {
      req.user = verifyToken(header.slice(7));
    } catch { /* ignore invalid token */ }
  }
  next();
}
