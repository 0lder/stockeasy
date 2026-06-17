import { Router } from "express";
import { queryWencai } from "../wencai.js";
import { getStrategies, getStrategyById, createStrategy, updateStrategy, deleteStrategy, createSnapshot, replaceSnapshot, getSnapshots, getSnapshotStocks, recordQuery } from "../database.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

// --- Helper ---
function parseStocks(data: any[]) {
  return data.map((r: any) => ({
    code: r.股票代码 || r.code || r.stock_code,
    name: r.股票简称 || r.name || r.stock_name || "",
    price: parseFloat(r.最新价 || r.price || 0),
  })).filter((r: any) => r.code && r.name);
}

// --- CRUD ---

router.get("/api/strategies", requireAuth, asyncHandler(async (req, res) => {
  res.json(getStrategies(req.user!.userId));
}));

router.post("/api/strategies", requireAuth, asyncHandler(async (req, res) => {
  const { name, query_text, description, tags, group_name } = req.body;
  if (!name || !query_text) { res.status(400).json({ error: "名称和查询条件不能为空" }); return; }
  const userId = req.user!.userId;
  const id = createStrategy(userId, name, query_text, description || "", tags || [], group_name || "默认");
  let snapshot_id: number | null = null, stocks = 0;
  try {
    const result = await queryWencai(query_text, 50);
    const list = parseStocks(result.data || []);
    if (list.length > 0) { snapshot_id = createSnapshot(id, list); stocks = list.length; }
  } catch { /* optional */ }
  recordQuery(userId, query_text, stocks);
  res.json({ success: true, id, snapshot: { id: snapshot_id, stocks } });
}));

router.put("/api/strategies/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效的 ID" }); return; }
  const userId = req.user!.userId;
  updateStrategy(userId, id, req.body);
  let snapshot_id: number | null = null, stocks = 0;
  if (req.body.query_text) {
    try {
      const result = await queryWencai(req.body.query_text, 50);
      const list = parseStocks(result.data || []);
      if (list.length > 0) { snapshot_id = replaceSnapshot(id, list); stocks = list.length; }
    } catch { /* optional */ }
  }
  res.json({ success: true, snapshot: snapshot_id ? { id: snapshot_id, stocks } : null });
}));

router.delete("/api/strategies/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效的 ID" }); return; }
  deleteStrategy(req.user!.userId, id);
  res.json({ success: true });
}));

// --- Run strategy ---

router.post("/api/strategies/:id/run", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效的 ID" }); return; }
  const userId = req.user!.userId;
  const strategy = getStrategyById(userId, id);
  if (!strategy) { res.status(404).json({ error: "策略不存在" }); return; }
  const startTime = Date.now();
  const result = await queryWencai(strategy.query_text, 50);
  const elapsed = Date.now() - startTime;
  const list = parseStocks(result.data || []);
  let snapshot_id: number | null = null;
  if (list.length > 0) snapshot_id = replaceSnapshot(id, list);
  recordQuery(userId, strategy.query_text, result.total, "success", undefined, elapsed);
  res.json({ ...result, snapshot: { id: snapshot_id, stocks: list.length } });
}));

// --- Snapshots ---

router.get("/api/strategies/:id/snapshots", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效的 ID" }); return; }
  const strategy = getStrategyById(req.user!.userId, id);
  if (!strategy) { res.status(404).json({ error: "策略不存在" }); return; }
  res.json(getSnapshots(id));
}));

router.get("/api/snapshots/:id/stocks", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效的 ID" }); return; }
  res.json(getSnapshotStocks(id));
}));

export default router;
