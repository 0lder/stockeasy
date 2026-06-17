import { Router } from "express";
import { queryWencai } from "../wencai.js";
import { recordQuery, getQueryHistory, deleteQueryHistory, clearQueryHistory } from "../database.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

router.get("/api/query", requireAuth, asyncHandler(async (req, res) => {
  const query = (req.query.q as string || "").trim();
  if (!query) { res.status(400).json({ error: "请输入查询条件" }); return; }
  const limit = parseInt(req.query.limit as string) || 50;
  const startTime = Date.now();

  const result = await queryWencai(query, limit);
  const elapsed = Date.now() - startTime;
  recordQuery(req.user!.userId, query, result.total, "success", undefined, elapsed);
  res.json(result);
}));

router.get("/api/history", requireAuth, asyncHandler(async (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  res.json(getQueryHistory(req.user!.userId, page, pageSize));
}));

router.delete("/api/history/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效的 ID" }); return; }
  deleteQueryHistory(req.user!.userId, id);
  res.json({ success: true });
}));

router.delete("/api/history", requireAuth, asyncHandler(async (_req, res) => {
  clearQueryHistory(req.user!.userId);
  res.json({ success: true });
}));

export default router;
