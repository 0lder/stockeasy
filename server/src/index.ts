import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { queryWencai } from "./wencai.js";
import { initDatabase, recordQuery, getQueryHistory, deleteQueryHistory, clearQueryHistory, createStrategy, getStrategies, updateStrategy, deleteStrategy, addToWatchlist, getWatchlist, updateWatchItem, removeFromWatchlist, getWatchlistGroups, createSnapshot, getSnapshots, getSnapshotStocks, deleteSnapshot, getAllSnapshots } from "./database.js";

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
// API: Strategy Snapshots (策略快照)
// ============================================================

// 创建快照
app.post("/api/strategies/:id/snapshot", async (req, res) => {
  try {
    const strategyId = parseInt(req.params.id);
    if (isNaN(strategyId)) return res.status(400).json({ error: "无效的策略 ID" });

    const strategies = getStrategies();
    const strategy = strategies.find(s => s.id === strategyId);
    if (!strategy) return res.status(404).json({ error: "策略不存在" });

    const { stocks } = req.body;
    if (!stocks || !Array.isArray(stocks) || stocks.length === 0) {
      return res.status(400).json({ error: "股票列表不能为空" });
    }

    const snapshotId = createSnapshot(strategyId, stocks.map((s: any) => ({
      code: s.股票代码 || s.code || s.stock_code,
      name: s.股票简称 || s.name || s.stock_name,
      price: parseFloat(s.最新价 || s.price || 0),
    })));

    res.json({ success: true, id: snapshotId, stock_count: stocks.length });
  } catch (error: any) {
    res.status(500).json({ error: "创建快照失败", detail: error.message });
  }
});

// 获取策略的所有快照
app.get("/api/strategies/:id/snapshots", (req, res) => {
  try {
    const strategyId = parseInt(req.params.id);
    if (isNaN(strategyId)) return res.status(400).json({ error: "无效的策略 ID" });
    const snapshots = getSnapshots(strategyId);
    res.json(snapshots);
  } catch (error: any) {
    res.status(500).json({ error: "获取快照失败", detail: error.message });
  }
});

// 获取所有快照
app.get("/api/snapshots", (_req, res) => {
  try {
    const snapshots = getAllSnapshots();
    res.json(snapshots);
  } catch (error: any) {
    res.status(500).json({ error: "获取快照列表失败", detail: error.message });
  }
});

// 获取快照详情（含股票 + 表现分析）
app.get("/api/snapshots/:id", async (req, res) => {
  try {
    const snapshotId = parseInt(req.params.id);
    if (isNaN(snapshotId)) return res.status(400).json({ error: "无效的快照 ID" });

    const stocks = getSnapshotStocks(snapshotId);
    if (stocks.length === 0) return res.json({ stocks: [], stats: {} });

    // 重新执行策略查询获取最新行情（平铺格式，含 最新价 最新涨跌幅）
    const strategy = getStrategies().find(s => s.id === parseInt(req.params.id));
    const queryText = strategy?.query_text || stocks.map(s => s.stock_code).join(" ");
    const priceResult = await queryWencai(queryText, stocks.length * 2);

    // 辅助函数：从任意格式提取股票数据
    const extractFromRow = (row: any): any[] => {
      const results: any[] = [];
      // format 1: flat data with 股票代码 (策略查询格式)
      if (row.股票代码) {
        results.push(row);
      }
      // format 2: tableV1 array (单股查询格式)
      if (row.tableV1 && Array.isArray(row.tableV1)) {
        results.push(...row.tableV1);
      }
      // format 3: compound-key arrays (多股联合查询格式)
      for (const key of Object.keys(row)) {
        if (Array.isArray(row[key]) && key !== "tableV1") {
          for (const item of row[key]) {
            if (item.代码 || item.股票代码) {
              results.push(item);
            }
          }
        }
      }
      return results;
    };

    // 构建最新价映射（代码归一化）
    const priceMap: Record<string, any> = {};
    for (const row of (priceResult.data || [])) {
      for (const item of extractFromRow(row)) {
        const code = (item.股票代码 || item.代码 || "").replace(/\.(SZ|SH)$/i, "");
        if (code) priceMap[code] = { ...priceMap[code], ...item };
      }
    }

    // 合并数据
    const enriched = stocks.map(s => {
      const lookupCode = s.stock_code.replace(/\.(SZ|SH)$/i, "");
      const p = priceMap[lookupCode] || {};
      // 表格式可能有不同字段名
      const currentPrice = parseFloat(p.最新价 || p["收盘价:前复权"] || p.latest_price || 0);
      const changePct = parseFloat(p.最新涨跌幅 || p["涨跌幅:前复权"] || p.change_pct || 0);

      return {
        stock_code: s.stock_code,
        stock_name: s.stock_name,
        price_at_snapshot: s.price_at_snapshot,
        current_price: currentPrice || "-",
        change_pct: changePct || "-",
      };
    });

    // 简化统计：只算从快照到现在的涨跌幅
    const calcStats = () => {
      let up = 0, down = 0, flat = 0;
      enriched.forEach(s => {
        const snapPrice = s.price_at_snapshot;
        const curPrice = s.current_price;
        if (snapPrice && curPrice !== "-") {
          const chg = (Number(curPrice) - Number(snapPrice)) / Number(snapPrice) * 100;
          if (chg > 0) up++;
          else if (chg < 0) down++;
          else flat++;
        }
      });
      const total = up + down + flat;
      return {
        snapshot_today: { up, total, ratio: total > 0 ? `${(up / total * 100).toFixed(1)}%` : "-" },
      };
    };

    res.json({ stocks: enriched, stats: calcStats() });
  } catch (error: any) {
    console.error("[snapshot detail]", error);
    res.status(500).json({ error: "获取快照详情失败", detail: error.message });
  }
});

// 删除快照
app.delete("/api/snapshots/:id", (req, res) => {
  try {
    const snapshotId = parseInt(req.params.id);
    if (isNaN(snapshotId)) return res.status(400).json({ error: "无效的快照 ID" });
    deleteSnapshot(snapshotId);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "删除快照失败", detail: error.message });
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
