import { Router } from "express";
import { getWatchlist, getWatchlistGroups, addToWatchlist, updateWatchItem, removeFromWatchlist } from "../database.js";
import { queryWencai } from "../wencai.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

router.get("/api/watchlist", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const items = getWatchlist(userId);
  const groups = getWatchlistGroups(userId);
  res.json({ items, groups });
}));

router.post("/api/watchlist", requireAuth, asyncHandler(async (req, res) => {
  const { stock_code, stock_name, group_name, note } = req.body;
  if (!stock_code || !stock_name) { res.status(400).json({ error: "股票代码和名称不能为空" }); return; }
  const id = addToWatchlist(req.user!.userId, stock_code, stock_name, group_name || "默认", note || "");
  res.json({ success: true, id });
}));

router.put("/api/watchlist/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效的 ID" }); return; }
  updateWatchItem(req.user!.userId, id, req.body);
  res.json({ success: true });
}));

router.delete("/api/watchlist/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效的 ID" }); return; }
  removeFromWatchlist(req.user!.userId, id);
  res.json({ success: true });
}));

router.post("/api/watchlist/refresh", requireAuth, asyncHandler(async (req, res) => {
  const items = getWatchlist(req.user!.userId);
  if (!items.length) { res.json({ data: [] }); return; }
  const BATCH = 10;
  const all: any[] = [];
  for (let i = 0; i < items.length; i += BATCH) {
    const batch = items.slice(i, i + BATCH);
    const result = await queryWencai(batch.map((s: any) => s.stock_code).join(","), BATCH);
    if (result.data) {
      for (const row of result.data) {
        if (row["最新价"] === "" || row["最新价"] === undefined) row["最新价"] = null;
        else if (typeof row["最新价"] === "string") row["最新价"] = parseFloat(row["最新价"]) || null;
        if (row["最新涨跌幅"] === "" || row["最新涨跌幅"] === undefined) row["最新涨跌幅"] = null;
        else if (typeof row["最新涨跌幅"] === "string") row["最新涨跌幅"] = parseFloat(row["最新涨跌幅"]) || 0;
      }
      all.push(...result.data);
    }
    if (i + BATCH < items.length) await new Promise(r => setTimeout(r, 500));
  }
  res.json({ data: all, total: all.length });
}));

export default router;
