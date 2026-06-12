import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { queryWencai } from "./wencai.js";
import { initDatabase, recordQuery, getQueryHistory, deleteQueryHistory, clearQueryHistory, createStrategy, getStrategies, updateStrategy, deleteStrategy, addToWatchlist, getWatchlist, updateWatchItem, removeFromWatchlist, getWatchlistGroups } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve built frontend
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// ============================================================
// API: Query
// ============================================================

app.get("/api/query", async (req, res) => {
  const query = (req.query.q as string || "").trim();
  if (!query) {
    return res.status(400).json({ error: "请输入查询条件" });
  }

  const limit = parseInt(req.query.limit as string) || 50;

  console.log(`[query] "${query}" (limit=${limit})`);

  const startTime = Date.now();

  try {
    const result = await queryWencai(query, limit);
    const elapsed = Date.now() - startTime;

    console.log(`[query] Done in ${elapsed}ms, ${result.total} results`);

    // 记录到历史
    recordQuery(query, result.total, "success", undefined, elapsed);

    res.json(result);
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[query] Failed: "${query}"`, error.message);

    // 记录失败历史
    recordQuery(query, 0, "error", error.message, elapsed);

    res.status(500).json({
      success: false,
      error: "查询失败",
      detail: error.message,
      query,
    });
  }
});

// ============================================================
// API: Query History
// ============================================================

// 获取历史记录
app.get("/api/history", (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;

  try {
    const result = getQueryHistory(page, pageSize);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "获取历史记录失败", detail: error.message });
  }
});

// 删除单条历史
app.delete("/api/history/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "无效的 ID" });
  }

  try {
    deleteQueryHistory(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "删除失败", detail: error.message });
  }
});

// 清空全部历史
app.delete("/api/history", (_req, res) => {
  try {
    clearQueryHistory();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "清空失败", detail: error.message });
  }
});

// ============================================================
// API: Strategies (策略管理)
// ============================================================

// 获取所有策略
app.get("/api/strategies", (_req, res) => {
  try {
    const strategies = getStrategies();
    res.json(strategies);
  } catch (error: any) {
    res.status(500).json({ error: "获取策略失败", detail: error.message });
  }
});

// 创建策略
app.post("/api/strategies", (req, res) => {
  try {
    const { name, query_text, description, tags, group_name } = req.body;
    if (!name || !query_text) {
      return res.status(400).json({ error: "名称和查询条件不能为空" });
    }
    const id = createStrategy(name, query_text, description || "", tags || [], group_name || "默认");
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: "创建策略失败", detail: error.message });
  }
});

// 更新策略
app.put("/api/strategies/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });
    updateStrategy(id, req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "更新策略失败", detail: error.message });
  }
});

// 删除策略
app.delete("/api/strategies/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });
    deleteStrategy(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "删除策略失败", detail: error.message });
  }
});

// 运行策略
app.post("/api/strategies/:id/run", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });

    const strategies = getStrategies();
    const strategy = strategies.find(s => s.id === id);
    if (!strategy) return res.status(404).json({ error: "策略不存在" });

    const limit = parseInt(req.body.limit as string) || 50;
    const startTime = Date.now();

    const result = await queryWencai(strategy.query_text, limit);
    const elapsed = Date.now() - startTime;

    recordQuery(strategy.query_text, result.total, "success", undefined, elapsed);
    res.json({ ...result, strategy_name: strategy.name, elapsed_ms: elapsed });
  } catch (error: any) {
    res.status(500).json({ error: "运行策略失败", detail: error.message });
  }
});

// ============================================================
// API: Watchlist (自选股)
// ============================================================

// 获取自选股列表
app.get("/api/watchlist", (_req, res) => {
  try {
    const items = getWatchlist();
    const groups = getWatchlistGroups();
    res.json({ items, groups });
  } catch (error: any) {
    res.status(500).json({ error: "获取自选股失败", detail: error.message });
  }
});

// 添加自选股
app.post("/api/watchlist", (req, res) => {
  try {
    const { stock_code, stock_name, note, group_name } = req.body;
    if (!stock_code || !stock_name) {
      return res.status(400).json({ error: "股票代码和名称不能为空" });
    }
    const id = addToWatchlist(stock_code, stock_name, note || "", group_name || "默认");
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: "添加自选股失败", detail: error.message });
  }
});

// 更新自选股
app.put("/api/watchlist/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });
    updateWatchItem(id, req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "更新自选股失败", detail: error.message });
  }
});

// 删除自选股
app.delete("/api/watchlist/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });
    removeFromWatchlist(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "删除自选股失败", detail: error.message });
  }
});

// 刷新自选股行情
app.post("/api/watchlist/refresh", async (req, res) => {
  try {
    const items = getWatchlist();
    if (items.length === 0) return res.json({ data: [] });

    // 分批查询，每批最多10只
    const batchSize = 10;
    const allResults: any[] = [];

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const queryText = batch.map(s => s.stock_code).join(",");
      const result = await queryWencai(queryText, batchSize);
      if (result.data) allResults.push(...result.data);
      // 间隔一下避免触发风控
      if (i + batchSize < items.length) await new Promise(r => setTimeout(r, 500));
    }

    res.json({ data: allResults, total: allResults.length });
  } catch (error: any) {
    res.status(500).json({ error: "刷新行情失败", detail: error.message });
  }
});

// ============================================================
// Health
// ============================================================

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ============================================================
// SPA fallback
// ============================================================

app.get("*", (_req, res) => {
  const indexHtml = path.resolve(clientDist, "index.html");
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(404).json({ error: "Frontend not built yet. Run: cd client && npm run build" });
  }
});

// ============================================================
// Start
// ============================================================

async function start() {
  // 初始化数据库
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`🚀 StockEasy server running at http://localhost:${PORT}`);
    console.log(`📡 纯 Node.js 引擎, 无需 Python 依赖`);
    console.log(`📦 SQLite 查询历史已启用`);
  });
}

start();
