import { Router } from "express";
import { queryWencai } from "../wencai.js";
import {
  getStrategies, createStrategy, updateStrategy, deleteStrategy,
  createSnapshot, replaceSnapshot, getSnapshots, getSnapshotStocks,
  recordQuery,
} from "../database.js";

const router = Router();

// --- Helper: extract stock list from wencai response ---
function parseStocks(data: any[]) {
  return data.map((r: any) => ({
    code: r.股票代码 || r.code || r.stock_code,
    name: r.股票简称 || r.name || r.stock_name || "",
    price: parseFloat(r.最新价 || r.price || 0),
  })).filter((r: any) => r.code && r.name);
}

// --- CRUD ---

router.get("/api/strategies", (_req, res) => {
  try { res.json(getStrategies()); }
  catch (e: any) { res.status(500).json({ error: "获取策略失败", detail: e.message }); }
});

router.post("/api/strategies", async (req, res) => {
  try {
    const { name, query_text, description, tags, group_name } = req.body;
    if (!name || !query_text) return res.status(400).json({ error: "名称和查询条件不能为空" });
    const id = createStrategy(name, query_text, description || "", tags || [], group_name || "默认");
    let snapshot_id = null, stocks = 0;
    try {
      const result = await queryWencai(query_text, 50);
      const list = parseStocks(result.data || []);
      if (list.length > 0) { snapshot_id = createSnapshot(id, list); stocks = list.length; }
    } catch (_) { /* snapshot optional */ }
    res.json({ success: true, id, snapshot: { id: snapshot_id, stocks } });
  } catch (e: any) { res.status(500).json({ error: "创建策略失败", detail: e.message }); }
});

router.put("/api/strategies/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });
    updateStrategy(id, req.body);
    let snapshot_id = null, stocks = 0;
    if (req.body.query_text) {
      try {
        const result = await queryWencai(req.body.query_text, 50);
        const list = parseStocks(result.data || []);
        if (list.length > 0) { snapshot_id = replaceSnapshot(id, list); stocks = list.length; }
      } catch (_) { /* snapshot optional */ }
    }
    res.json({ success: true, snapshot: snapshot_id ? { id: snapshot_id, stocks } : null });
  } catch (e: any) { res.status(500).json({ error: "更新策略失败", detail: e.message }); }
});

router.delete("/api/strategies/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });
    deleteStrategy(id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: "删除策略失败", detail: e.message }); }
});

// --- Run ---

router.post("/api/strategies/:id/run", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });
    const strategy = getStrategies().find(s => s.id === id);
    if (!strategy) return res.status(404).json({ error: "策略不存在" });
    const limit = parseInt(req.body.limit as string) || 50;
    const start = Date.now();
    const result = await queryWencai(strategy.query_text, limit);
    recordQuery(strategy.query_text, result.total, "success", undefined, Date.now() - start);
    res.json({ ...result, strategy_name: strategy.name, elapsed_ms: Date.now() - start });
  } catch (e: any) { res.status(500).json({ error: "运行策略失败", detail: e.message }); }
});

// --- Auto-snapshot (cron trigger) ---

function previousPriceMap(stocks: any[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const s of stocks) {
    const c = (s.stock_code || "").replace(/\.(SZ|SH)$/i, "");
    if (s.price_at_snapshot) m[c] = s.price_at_snapshot;
  }
  return m;
}

function computeSnapshotStats(prevStocks: any[], currStocks: any[], prevPriceMap: Record<string, number>): any {
  const norm = (c: string) => (c || "").replace(/\.(SZ|SH)$/i, "");
  const cm = new Map(currStocks.map(s => [norm(s.code), s]));
  const changes: any[] = [];
  for (const p of prevStocks) {
    const c = norm(p.stock_code);
    const cur = cm.get(c);
    if (cur && p.price_at_snapshot && cur.price) {
      changes.push({ ...cur, changePct: (cur.price - p.price_at_snapshot) / p.price_at_snapshot * 100 });
    }
  }
  changes.sort((a, b) => b.changePct - a.changePct);
  const up = changes.filter(c => c.changePct > 0);
  const avgChange = changes.length > 0 ? changes.reduce((s, c) => s + c.changePct, 0) / changes.length : 0;
  return {
    kept_count: changes.length,
    new_count: currStocks.filter(s => !prevStocks.some(p => norm(p.stock_code) === norm(s.code))).length,
    removed_count: prevStocks.filter(p => !currStocks.some(s => norm(s.code) === norm(p.stock_code))).length,
    up_count: up.length, down_count: changes.length - up.length, flat_count: 0,
    up_ratio: changes.length > 0 ? (up.length / changes.length * 100).toFixed(1) + "%" : "-",
    avg_change: avgChange.toFixed(2) + "%",
    best_5: changes.slice(0, 5).map(c => ({ name: c.name, change: c.changePct.toFixed(2) + "%" })),
    worst_5: changes.slice(-5).reverse().map(c => ({ name: c.name, change: c.changePct.toFixed(2) + "%" })),
  };
}

router.post("/api/strategies/auto-snapshot", async (_req, res) => {
  try {
    const strategies = getStrategies();
    if (!strategies.length) return res.json({ success: true, snapshots: [], message: "没有需要快照的策略" });
    const results: any[] = [];
    for (const s of strategies) {
      try {
        const result = await queryWencai(s.query_text, 50);
        const stocks = parseStocks(result.data || []);
        if (!stocks.length) { results.push({ strategy_id: s.id, strategy_name: s.name, stocks: 0, status: "skipped" }); continue; }
        const sid = createSnapshot(s.id, stocks);
        const snaps = getSnapshots(s.id);
        let stats: any = null;
        if (snaps.length >= 2) {
          const curDate = snaps[0].snapshot_date;
          const prev = snaps.find((ss: any) => ss.snapshot_date !== curDate);
          if (prev) { const ps = getSnapshotStocks(prev.id); if (ps.length) stats = computeSnapshotStats(ps, stocks, previousPriceMap(ps)); }
        }
        results.push({ strategy_id: s.id, strategy_name: s.name, stocks: stocks.length, status: "ok", snapshot_id: sid, stats });
      } catch (err: any) { results.push({ strategy_id: s.id, strategy_name: s.name, status: "error", detail: err.message }); }
    }
    res.json({ success: true, snapshots: results });
  } catch (e: any) { res.status(500).json({ error: "自动快照失败", detail: e.message }); }
});

// --- Snapshot sub-resources ---

router.post("/api/strategies/:id/snapshot", async (req, res) => {
  try {
    const strategyId = parseInt(req.params.id);
    if (isNaN(strategyId)) return res.status(400).json({ error: "无效的策略 ID" });
    const strategy = getStrategies().find(s => s.id === strategyId);
    if (!strategy) return res.status(404).json({ error: "策略不存在" });
    const { stocks } = req.body;
    if (!stocks || !Array.isArray(stocks) || !stocks.length)
      return res.status(400).json({ error: "股票列表不能为空" });
    const sid = replaceSnapshot(strategyId, parseStocks(stocks));
    res.json({ success: true, id: sid, stock_count: stocks.length });
  } catch (e: any) { res.status(500).json({ error: "重新生成快照失败", detail: e.message }); }
});

router.get("/api/strategies/:id/snapshots", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的策略 ID" });
    res.json(getSnapshots(id));
  } catch (e: any) { res.status(500).json({ error: "获取快照失败", detail: e.message }); }
});

export default router;
