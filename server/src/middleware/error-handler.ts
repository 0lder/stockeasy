/**
 * Global error handler middleware.
 *
 * Catches errors forwarded via next(error) or thrown in asyncHandler-wrapped routes.
 * Forwards 4xx as-is; wraps others as 500 with safe message.
 */

import { Request, Response, NextFunction } from "express";

interface HttpError extends Error {
  status?: number;
  statusCode?: number;
}

export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const status = err.status || err.statusCode || 500;
  const message =
    status === 500
      ? "服务器内部错误"
      : err.message || "请求错误";

  if (status === 500) {
    console.error(`[500] ${err.message}`);
    if (process.env.NODE_ENV === "development") {
      console.error(err.stack);
    }
  }

  res.status(status).json({
    error: message,
    ...(status === 500 && process.env.NODE_ENV === "development"
      ? { detail: err.message }
      : {}),
  });
}

/** 404 not found handler (mounted after all routes) */
export function notFound(_req: Request, res: Response): void {
  res.status(404).json({ error: "接口不存在" });
}
