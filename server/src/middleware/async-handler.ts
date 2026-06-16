/**
 * Async handler wrapper for Express routes.
 * Eliminates the need for manual try/catch in every route.
 *
 * Usage:
 *   router.get("/path", asyncHandler(async (req, res) => { ... }));
 *
 * When the handler throws, the error is forwarded to Express
 * error-handling middleware via next().
 */

import { Request, Response, NextFunction, RequestHandler } from "express";

export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<void>
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
