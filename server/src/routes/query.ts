import { Router } from "express";
import { queryWencai } from "../wencai.js";
import { recordQuery, getQueryHistory, deleteQueryHistory, clearQueryHistory } from "../database.js";

const router = Router();

router.get("/api/query", async (req, res) => {
  const query = (req.query.q as string || "").trim();
  if (!query) return res.status(400).json({ error: "请输入查询条件" });
  const limit = parseInt(req.query.limit as string) || 50;
  const startTime = Date.now();

  try {
    const result = await queryWencai(query, limit);
    const elapsed = Date.now() - startTime;
    recordQuery(query, result.total, "success", undefined, elapsed);
    res.json(result);
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    recordQuery(query, 0, "error", error.message, elapsed);
    res.status(500).json({ success: false, error: "查询失败", detail: error.message, query });
  }
});

router.get("/api/history", (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;
  try {
    res.json(getQueryHistory(page, pageSize));
  } catch (error: any) {
    res.status(500).json({ error: "获取历史记录失败", detail: error.message });
  }
});

router.delete("/api/history/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });
  try {
    deleteQueryHistory(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "删除历史记录失败", detail: error.message });
  }
});

router.delete("/api/history", (_req, res) => {
  try {
    clearQueryHistory();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "清空历史记录失败", detail: error.message });
  }
});

export default router;
