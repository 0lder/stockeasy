import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { queryWencai } from "./wencai.js";
import { initDatabase, recordQuery, getQueryHistory, deleteQueryHistory, clearQueryHistory, createStrategy, getStrategies, updateStrategy, deleteStrategy, addToWatchlist, getWatchlist, updateWatchItem, removeFromWatchlist, getWatchlistGroups, createSnapshot, getSnapshots, getSnapshotStocks, deleteSnapshot, getAllSnapshots, getAlerts, createAlert, updateAlert, deleteAlert, updateAlertTriggered, createAlertsFromWatchlist } from "./database.js";

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

// 自动快照 — 运行所有策略并保存快照（用于定时任务）
app.post("/api/strategies/auto-snapshot", async (_req, res) => {
  try {
    const strategies = getStrategies();
    if (strategies.length === 0) {
      return res.json({ success: true, snapshots: [], message: "没有需要快照的策略" });
    }
    const results: any[] = [];
    for (const s of strategies) {
      try {
        const queryRes = await queryWencai(s.query_text, 50);
        const stocks = (queryRes.data || []).map((r: any) => ({
          code: r.股票代码 || r.code,
          name: r.股票简称 || r.name || "",
          price: parseFloat(r.最新价 || 0),
        })).filter((r: any) => r.code && r.name);
        if (stocks.length === 0) {
          results.push({ strategy_id: s.id, strategy_name: s.name, stocks: 0, status: "skipped" });
          continue;
        }
        const snapshotId = createSnapshot(s.id, stocks);
        results.push({ strategy_id: s.id, strategy_name: s.name, stocks: stocks.length, status: "ok", snapshot_id: snapshotId });
      } catch (err: any) {
        results.push({ strategy_id: s.id, strategy_name: s.name, status: "error", detail: err.message });
      }
    }
    res.json({ success: true, snapshots: results });
  } catch (error: any) {
    res.status(500).json({ error: "自动快照失败", detail: error.message });
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

// 快照对比 API（必须放在 :id 路由之前）
app.get("/api/snapshots/compare", async (req, res) => {
  try {
    const idsStr = req.query.ids as string;
    if (!idsStr) return res.status(400).json({ error: "请提供要对比的快照 ID，格式 ?ids=1,2" });
    const [idA, idB] = idsStr.split(",").map(Number);
    if (isNaN(idA) || isNaN(idB)) return res.status(400).json({ error: "无效的快照 ID" });

    const stocksA = getSnapshotStocks(idA);
    const stocksB = getSnapshotStocks(idB);
    if (!stocksA.length || !stocksB.length) return res.status(404).json({ error: "快照不存在" });

    // 用代码查最新行情
    const allCodes = [...new Set([...stocksA.map(s => s.stock_code), ...stocksB.map(s => s.stock_code)])];
    const priceResult = await queryWencai(allCodes.join(" "), allCodes.length);

    // 构建价格映射
    const priceMap: Record<string, number> = {};
    for (const row of (priceResult.data || [])) {
      for (const key of Object.keys(row)) {
        if (Array.isArray(row[key])) {
          for (const item of row[key]) {
            const c = (item.代码 || item.股票代码 || "").replace(/\.(SZ|SH)$/i, "");
            if (c) {
              priceMap[c] = parseFloat(item["收盘价:前复权"] || item.收盘价 || item.price || 0);
            }
          }
        }
      }
      const c = (row.股票代码 || "").replace(/\.(SZ|SH)$/i, "");
      if (c && !priceMap[c]) {
        priceMap[c] = parseFloat(row.最新价 || row.price || 0);
      }
    }

    const normalize = (code: string) => code.replace(/\.(SZ|SH)$/i, "");
    const mapStocks = (snaps: any[]) => snaps.map((s: any) => ({
      code: s.stock_code, name: s.stock_name,
      price: s.price_at_snapshot,
      current_price: priceMap[normalize(s.stock_code)] || "-",
    }));

    const mappedA = mapStocks(stocksA);
    const mappedB = mapStocks(stocksB);

    const codeSetA = new Set(stocksA.map(s => normalize(s.stock_code)));
    const codeSetB = new Set(stocksB.map(s => normalize(s.stock_code)));

    const kept = mappedA.filter(s => codeSetB.has(normalize(s.code))).map(s => {
      const b = mappedB.find(x => normalize(x.code) === normalize(s.code))!;
      const priceChg = (typeof b.price === "number" && typeof s.price === "number")
        ? ((b.price - s.price) / s.price * 100).toFixed(2) + "%"
        : "-";
      return { code: s.code, name: s.name, price_a: s.price, price_b: b.price, price_change: priceChg };
    });

    const newStocks = mappedB.filter(s => !codeSetA.has(normalize(s.code)));
    const removedStocks = mappedA.filter(s => !codeSetB.has(normalize(s.code)));

    res.json({
      a: { id: idA, stocks: mappedA },
      b: { id: idB, stocks: mappedB },
      comparison: {
        kept, new: newStocks, removed: removedStocks,
        stats: {
          kept_count: kept.length, new_count: newStocks.length,
          removed_count: removedStocks.length,
          total_a: stocksA.length, total_b: stocksB.length,
        },
      },
    });
  } catch (error: any) {
    console.error("[snapshot compare]", error);
    res.status(500).json({ error: "快照对比失败", detail: error.message });
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

    // 数据已由 wencai.ts 归一化为扁平格式（股票代码/股票简称/最新价/最新涨跌幅）
    const priceMap: Record<string, any> = {};
    for (const row of (priceResult.data || [])) {
      const code = (row.股票代码 || "").replace(/\.(SZ|SH)$/i, "");
      if (code) priceMap[code] = row;
    }

    // 合并数据
    const enriched = stocks.map(s => {
      const lookupCode = s.stock_code.replace(/\.(SZ|SH)$/i, "");
      const p = priceMap[lookupCode] || {};
      const currentPrice = parseFloat(p.最新价 || 0);
      const changePct = parseFloat(p.最新涨跌幅 || 0);

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
// API: Alerts (涨跌告警)
// ============================================================

// 获取所有告警
app.get("/api/alerts", (_req, res) => {
  try {
    res.json(getAlerts());
  } catch (error: any) {
    res.status(500).json({ error: "获取告警失败", detail: error.message });
  }
});

// 创建告警
app.post("/api/alerts", (req, res) => {
  try {
    const { stock_code, stock_name, threshold_up, threshold_down } = req.body;
    if (!stock_code || !stock_name) return res.status(400).json({ error: "请提供股票代码和名称" });
    const id = createAlert(stock_code, stock_name, threshold_up, threshold_down);
    res.json({ success: true, id });
  } catch (error: any) {
    res.status(500).json({ error: "创建告警失败", detail: error.message });
  }
});

// 更新告警
app.put("/api/alerts/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的告警 ID" });
    updateAlert(id, req.body);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "更新告警失败", detail: error.message });
  }
});

// 删除告警
app.delete("/api/alerts/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的告警 ID" });
    deleteAlert(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "删除告警失败", detail: error.message });
  }
});

// 检查所有告警（用于定时任务）
app.post("/api/alerts/check", async (_req, res) => {
  try {
    const alerts = getAlerts().filter(a => a.enabled);
    if (alerts.length === 0) return res.json({ triggered: [], message: "没有启用的告警" });

    // 逐个查行情（数据已由 wencai.ts 归一化）
    const priceMap: Record<string, { price: number; change: number }> = {};
    for (const alert of alerts) {
      try {
        const result = await queryWencai(`${alert.stock_code} 最新价 最新涨跌幅`, 1);
        for (const row of (result.data || [])) {
          const c = (row.股票代码 || "").replace(/\.(SZ|SH)$/i, "");
          if (c) {
            priceMap[c] = {
              price: parseFloat(row.最新价 || 0),
              change: parseFloat(row.最新涨跌幅 || 0),
            };
          }
        }
      } catch (e) { /* skip failed */ }
    }

    const triggered: any[] = [];
    for (const alert of alerts) {
      const code = alert.stock_code.replace(/\.(SZ|SH)$/i, "");
      const data = priceMap[code];
      if (!data || !data.change) continue;

      const changePct = data.change;
      if (changePct <= alert.threshold_down) {
        triggered.push({ alert_id: alert.id, stock_code: alert.stock_code, stock_name: alert.stock_name, change: changePct, threshold: alert.threshold_down, direction: "down", current_price: data.price });
        updateAlertTriggered(alert.id, data.price, changePct);
      } else if (changePct >= alert.threshold_up) {
        triggered.push({ alert_id: alert.id, stock_code: alert.stock_code, stock_name: alert.stock_name, change: changePct, threshold: alert.threshold_up, direction: "up", current_price: data.price });
        updateAlertTriggered(alert.id, data.price, changePct);
      }
    }

    res.json({ triggered, checked: alerts.length });
  } catch (error: any) {
    console.error("[alerts check]", error);
    res.status(500).json({ error: "检查告警失败", detail: error.message });
  }
});

// 从自选股批量创建告警
app.post("/api/alerts/from-watchlist", (req, res) => {
  try {
    const items = getWatchlist();
    const created = createAlertsFromWatchlist(
      items.map(i => ({ code: i.stock_code, name: i.stock_name }))
    );
    res.json({ success: true, created });
  } catch (error: any) {
    res.status(500).json({ error: "从自选股创建告警失败", detail: error.message });
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
