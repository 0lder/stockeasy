import { Router } from "express";
import { addToWatchlist, getWatchlist, updateWatchItem, removeFromWatchlist, getWatchlistGroups } from "../database.js";
import { queryWencai } from "../wencai.js";

const router = Router();

router.get("/api/watchlist", (_req, res) => {
  try {
    const items = getWatchlist();
    const groups = getWatchlistGroups();
    res.json({ items, groups });
  } catch (e: any) { res.status(500).json({ error: "获取自选股失败", detail: e.message }); }
});

router.post("/api/watchlist", (req, res) => {
  try {
    const { stock_code, stock_name, group_name, note } = req.body;
    if (!stock_code || !stock_name) return res.status(400).json({ error: "股票代码和名称不能为空" });
    const id = addToWatchlist(stock_code, stock_name, group_name || "默认", note || "");
    res.json({ success: true, id });
  } catch (e: any) { res.status(500).json({ error: "添加自选股失败", detail: e.message }); }
});

router.put("/api/watchlist/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });
    updateWatchItem(id, req.body);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: "更新自选股失败", detail: e.message }); }
});

router.delete("/api/watchlist/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });
    removeFromWatchlist(id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: "删除自选股失败", detail: e.message }); }
});

router.post("/api/watchlist/refresh", async (req, res) => {
  try {
    const items = getWatchlist();
    if (!items.length) return res.json({ data: [] });
    const BATCH = 10, all: any[] = [];
    for (let i = 0; i < items.length; i += BATCH) {
      const batch = items.slice(i, i + BATCH);
      const result = await queryWencai(batch.map(s => s.stock_code).join(","), BATCH);
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
  } catch (e: any) { res.status(500).json({ error: "刷新行情失败", detail: e.message }); }
});

export default router;
