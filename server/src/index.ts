import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import ExcelJS from "exceljs";
import { queryWencai } from "./wencai.js";
import { initDatabase, recordQuery, getQueryHistory, deleteQueryHistory, clearQueryHistory, createStrategy, getStrategies, updateStrategy, deleteStrategy, addToWatchlist, getWatchlist, updateWatchItem, removeFromWatchlist, getWatchlistGroups, createSnapshot, getSnapshots, getSnapshotStocks, deleteSnapshot, getAllSnapshots, getAlerts, createAlert, updateAlert, deleteAlert, updateAlertTriggered, createAlertsFromWatchlist, getSetting, setSetting, deleteSetting, addHolding, getHoldings, updateHolding, deleteHolding, getCachedPrices, setCachedPrice, clearPriceCache } from "./database.js";
import Iconv from "iconv-lite";

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

// 创建策略（自动生成初始快照）
app.post("/api/strategies", async (req, res) => {
  try {
    const { name, query_text, description, tags, group_name } = req.body;
    if (!name || !query_text) {
      return res.status(400).json({ error: "名称和查询条件不能为空" });
    }
    const id = createStrategy(name, query_text, description || "", tags || [], group_name || "默认");
    // 自动生成初始快照
    let snapshot_id = null;
    let stocks = 0;
    try {
      const queryRes = await queryWencai(query_text, 50);
      const stockList = (queryRes.data || []).map((r: any) => ({
        code: r.股票代码 || r.code,
        name: r.股票简称 || r.name || "",
        price: parseFloat(r.最新价 || 0),
      })).filter((r: any) => r.code && r.name);
      if (stockList.length > 0) {
        snapshot_id = createSnapshot(id, stockList);
        stocks = stockList.length;
      }
    } catch (_e) {
      // 快照生成失败不影响策略创建
    }
    res.json({ success: true, id, snapshot: { id: snapshot_id, stocks } });
  } catch (error: any) {
    res.status(500).json({ error: "创建策略失败", detail: error.message });
  }
});

// 更新策略（自动重新生成快照）
app.put("/api/strategies/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的 ID" });
    updateStrategy(id, req.body);
    // 如果查询条件变了，重新生成快照
    let snapshot_id = null;
    let stocks = 0;
    const query_text = req.body.query_text;
    if (query_text) {
      try {
        const queryRes = await queryWencai(query_text, 50);
        const stockList = (queryRes.data || []).map((r: any) => ({
          code: r.股票代码 || r.code,
          name: r.股票简称 || r.name || "",
          price: parseFloat(r.最新价 || 0),
        })).filter((r: any) => r.code && r.name);
        if (stockList.length > 0) {
          snapshot_id = createSnapshot(id, stockList);
          stocks = stockList.length;
        }
      } catch (_e) {
        // 快照生成失败不影响策略更新
      }
    }
    res.json({ success: true, snapshot: snapshot_id ? { id: snapshot_id, stocks } : null });
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

        // 计算与上期快照的涨跌对比
        const snapshots = getSnapshots(s.id);
        let stats: any = null;
        if (snapshots.length >= 2) {
          // 用最新快照的日期筛选：找到上一个不同日期的快照作为对比基准
          const currentDate = snapshots[0].snapshot_date;
          const prev = snapshots.find((ss: any) => ss.snapshot_date !== currentDate);
          if (prev) {
            const prevStocks = getSnapshotStocks(prev.id);
            if (prevStocks.length > 0) {
              stats = computeSnapshotStats(prevStocks, stocks, previousPriceMap(prevStocks));
            }
          }
        }

        results.push({
          strategy_id: s.id, strategy_name: s.name,
          stocks: stocks.length, status: "ok", snapshot_id: snapshotId,
          stats: stats ? {
            kept_count: stats.kept_count,
            new_count: stats.new_count,
            removed_count: stats.removed_count,
            up_count: stats.up_count,
            down_count: stats.down_count,
            flat_count: stats.flat_count,
            up_ratio: stats.up_ratio,
            avg_change: stats.avg_change,
            best_5: stats.best_5,
            worst_5: stats.worst_5,
          } : null,
        });
      } catch (err: any) {
        results.push({ strategy_id: s.id, strategy_name: s.name, status: "error", detail: err.message });
      }
    }
    res.json({ success: true, snapshots: results });
  } catch (error: any) {
    res.status(500).json({ error: "自动快照失败", detail: error.message });
  }
});

// 辅助函数：构建价格映射
function previousPriceMap(stocks: any[]): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of stocks) {
    const code = (s.stock_code || "").replace(/\.(SZ|SH)$/i, "");
    if (s.price_at_snapshot) map[code] = s.price_at_snapshot;
  }
  return map;
}

// 辅助函数：计算快照对比统计
function computeSnapshotStats(prevStocks: any[], currStocks: { code: string; name: string; price: number }[], prevPriceMap: Record<string, number>): any {
  const normalize = (code: string) => (code || "").replace(/\.(SZ|SH)$/i, "");
  const currMap = new Map(currStocks.map(s => [normalize(s.code), s]));

  // 找出保留股票并计算涨跌
  const changes: { name: string; from: number; to: number; changePct: number }[] = [];
  for (const prev of prevStocks) {
    const code = normalize(prev.stock_code);
    const curr = currMap.get(code);
    if (curr && prev.price_at_snapshot && curr.price) {
      const changePct = (curr.price - prev.price_at_snapshot) / prev.price_at_snapshot * 100;
      changes.push({ name: prev.stock_name, from: prev.price_at_snapshot, to: curr.price, changePct });
    }
  }

  changes.sort((a, b) => b.changePct - a.changePct);

  const up = changes.filter(c => c.changePct > 0);
  const down = changes.filter(c => c.changePct < 0);
  const flat = changes.filter(c => c.changePct === 0);
  const avgChange = changes.length > 0 ? changes.reduce((s, c) => s + c.changePct, 0) / changes.length : 0;

  const prevCodeSet = new Set(prevStocks.map(s => normalize(s.stock_code)));
  const newCount = currStocks.filter(s => !prevCodeSet.has(normalize(s.code))).length;
  const currCodeSet = new Set(currStocks.map(s => normalize(s.code)));
  const removedCount = prevStocks.filter(s => !currCodeSet.has(normalize(s.stock_code))).length;

  return {
    kept_count: changes.length,
    new_count: newCount,
    removed_count: removedCount,
    up_count: up.length,
    down_count: down.length,
    flat_count: flat.length,
    up_ratio: changes.length > 0 ? (up.length / changes.length * 100).toFixed(1) + "%" : "-",
    avg_change: avgChange.toFixed(2) + "%",
    best_5: changes.slice(0, 5).map(c => ({ name: c.name, change: c.changePct.toFixed(2) + "%", from: c.from.toFixed(2), to: c.to.toFixed(2) })),
    worst_5: changes.slice(-5).reverse().map(c => ({ name: c.name, change: c.changePct.toFixed(2) + "%", from: c.from.toFixed(2), to: c.to.toFixed(2) })),
  };
}

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

// 快照统计对比 — 基于两期快照价格计算涨跌统计
app.get("/api/snapshots/compare-stats", async (req, res) => {
  try {
    const idsStr = req.query.ids as string;
    if (!idsStr) return res.status(400).json({ error: "请提供快照 ID，格式 ?ids=a,b" });
    const [idA, idB] = idsStr.split(",").map(Number);
    if (isNaN(idA) || isNaN(idB)) return res.status(400).json({ error: "无效的快照 ID" });

    const stocksA = getSnapshotStocks(idA);
    const stocksB = getSnapshotStocks(idB);
    if (!stocksA.length || !stocksB.length) return res.status(404).json({ error: "快照不存在" });

    const normalize = (code: string) => code.replace(/\.(SZ|SH)$/i, "");

    // 构建 B 的价格映射
    const priceBMap: Record<string, number> = {};
    for (const s of stocksB) {
      if (s.price_at_snapshot) priceBMap[normalize(s.stock_code)] = s.price_at_snapshot;
    }

    // 找出两期都有的股票，计算从 A 到 B 的价格变化
    const changes: { code: string; name: string; priceA: number; priceB: number; changePct: number }[] = [];
    for (const s of stocksA) {
      const code = normalize(s.stock_code);
      const priceA = s.price_at_snapshot;
      const priceB = priceBMap[code];
      if (priceA && priceB) {
        const changePct = (priceB - priceA) / priceA * 100;
        changes.push({ code: s.stock_code, name: s.stock_name, priceA, priceB, changePct });
      }
    }

    changes.sort((a, b) => b.changePct - a.changePct);

    const up = changes.filter(c => c.changePct > 0);
    const down = changes.filter(c => c.changePct < 0);
    const flat = changes.filter(c => c.changePct === 0);
    const avgChange = changes.length > 0 ? changes.reduce((s, c) => s + c.changePct, 0) / changes.length : 0;
    const totalReturn = changes.length > 0 ? changes.reduce((s, c) => s + (c.changePct / 100), 0) : 0;

    res.json({
      snapshot_a: idA, snapshot_b: idB,
      total_common: changes.length,
      up_count: up.length,
      down_count: down.length,
      flat_count: flat.length,
      up_ratio: changes.length > 0 ? (up.length / changes.length * 100).toFixed(1) + "%" : "-",
      avg_change: avgChange.toFixed(2) + "%",
      total_return: (totalReturn / changes.length * 100).toFixed(2) + "%",
      best_5: changes.slice(0, 5).map(c => ({
        name: c.name, change: c.changePct.toFixed(2) + "%",
        from: c.priceA.toFixed(2), to: c.priceB.toFixed(2)
      })),
      worst_5: changes.slice(-5).reverse().map(c => ({
        name: c.name, change: c.changePct.toFixed(2) + "%",
        from: c.priceA.toFixed(2), to: c.priceB.toFixed(2)
      })),
      kept_count: changes.length,
      new_count: stocksB.filter(s => !stocksA.some(a => normalize(a.stock_code) === normalize(s.stock_code))).length,
      removed_count: stocksA.filter(s => !stocksB.some(b => normalize(b.stock_code) === normalize(s.stock_code))).length,
    });
  } catch (error: any) {
    res.status(500).json({ error: "统计失败", detail: error.message });
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

      const currentPrice = data.price;
      const changePct = data.change;
      if (currentPrice <= alert.threshold_down) {
        triggered.push({ alert_id: alert.id, stock_code: alert.stock_code, stock_name: alert.stock_name, change: changePct, threshold: alert.threshold_down, direction: "down", current_price: currentPrice });
        updateAlertTriggered(alert.id, currentPrice, changePct);
      } else if (currentPrice >= alert.threshold_up) {
        triggered.push({ alert_id: alert.id, stock_code: alert.stock_code, stock_name: alert.stock_name, change: changePct, threshold: alert.threshold_up, direction: "up", current_price: currentPrice });
        updateAlertTriggered(alert.id, currentPrice, changePct);
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
// Export
// ============================================================

// 通用 Excel 生成函数
async function generateExcel(data: any[], sheetName = "Sheet1", columns?: string[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "StockEasy";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet(sheetName);

  // 自动探测列
  const cols = columns || (data.length > 0 ? Object.keys(data[0]) : []);
  if (cols.length === 0) throw new Error("没有数据可导出");

  // 列定义
  const colDefs = cols.map(c => ({
    header: c,
    key: c,
    width: Math.max(c.length * 2 + 2, 12),
  }));
  sheet.columns = colDefs;

  // 写数据
  data.forEach(row => sheet.addRow(row));

  // 样式：表头
  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Arial" };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF007AFF" } };
  headerRow.alignment = { horizontal: "center", vertical: "middle" };
  headerRow.height = 24;

  // 冻结首行
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  // 奇偶行着色
  for (let i = 2; i <= data.length + 1; i++) {
    const row = sheet.getRow(i);
    row.alignment = { vertical: "middle" };
    if (i % 2 === 0) {
      row.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF5F5F7" } };
    }
  }

  // Buffer
  const buf = await workbook.xlsx.writeBuffer();
  return Buffer.from(buf);
}

// POST /api/export — 通用数据导出
app.post("/api/export", async (req, res) => {
  try {
    const { data, filename = "export.xlsx", sheetName = "Sheet1", columns } = req.body;
    if (!data || !Array.isArray(data) || data.length === 0) {
      return res.status(400).json({ error: "没有数据可导出" });
    }
    const buf = await generateExcel(data, sheetName, columns);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buf);
  } catch (error: any) {
    console.error("[export error]", error);
    res.status(500).json({ error: "导出失败", detail: error.message });
  }
});

// GET /api/export/query — 导出查询结果
app.get("/api/export/query", async (req, res) => {
  try {
    const q = (req.query.q as string || "").trim();
    const limit = parseInt(req.query.limit as string) || 50;
    if (!q) return res.status(400).json({ error: "请输入查询条件" });

    const result = await queryWencai(q, limit);
    if (!result.data || result.data.length === 0) {
      return res.status(400).json({ error: "查询结果为空" });
    }

    const buf = await generateExcel(result.data, "查询结果");
    const filename = `${q.slice(0, 20)}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buf);
  } catch (error: any) {
    console.error("[export query]", error);
    res.status(500).json({ error: "导出失败", detail: error.message });
  }
});

// GET /api/export/snapshot/:id — 导出快照
app.get("/api/export/snapshot/:id", async (req, res) => {
  try {
    const snapshotId = parseInt(req.params.id);
    if (isNaN(snapshotId)) return res.status(400).json({ error: "无效的快照 ID" });

    const stocks = getSnapshotStocks(snapshotId);
    if (stocks.length === 0) return res.status(400).json({ error: "快照数据为空" });

    // 获取最新行情
    const queryText = stocks.map(s => s.stock_code).join(" ");
    const priceResult = await queryWencai(queryText, stocks.length * 2);
    const priceMap: Record<string, any> = {};
    for (const row of (priceResult.data || [])) {
      const code = (row.股票代码 || "").replace(/\.(SZ|SH)$/i, "");
      if (code) priceMap[code] = row;
    }

    const enriched = stocks.map(s => {
      const p = priceMap[s.stock_code.replace(/\.(SZ|SH)$/i, "")] || {};
      const curPrice = parseFloat(p.最新价 || 0);
      const snapPrice = parseFloat(s.price_at_snapshot as string);
      const chgPct = curPrice && snapPrice ? ((curPrice - snapPrice) / snapPrice * 100) : 0;
      return {
        股票代码: s.stock_code,
        股票名称: s.stock_name,
        快照价格: snapPrice || "-",
        最新价: curPrice || "-",
        涨跌幅: chgPct ? `${chgPct.toFixed(2)}%` : "-",
      };
    });

    const buf = await generateExcel(enriched, "快照数据", ["股票代码", "股票名称", "快照价格", "最新价", "涨跌幅"]);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="snapshot_${snapshotId}.xlsx"`);
    res.send(buf);
  } catch (error: any) {
    console.error("[export snapshot]", error);
    res.status(500).json({ error: "导出快照失败", detail: error.message });
  }
});

// GET /api/export/watchlist — 导出自选股
app.get("/api/export/watchlist", async (_req, res) => {
  try {
    const items = getWatchlist();
    if (items.length === 0) return res.status(400).json({ error: "自选股为空" });

    // 获取最新行情
    const queryText = items.map(s => s.stock_code).join(",");
    const priceResult = await queryWencai(queryText, items.length * 2);
    const priceMap: Record<string, any> = {};
    for (const row of (priceResult.data || [])) {
      const code = (row.股票代码 || "").replace(/\.(SZ|SH)$/i, "");
      if (code) priceMap[code] = row;
    }

    const enriched = items.map(s => {
      const p = priceMap[s.stock_code.replace(/\.(SZ|SH)$/i, "")] || {};
      return {
        股票代码: s.stock_code,
        股票名称: s.stock_name,
        分组: s.group_name || "默认",
        最新价: parseFloat(p.最新价 || 0) || "-",
        最新涨跌幅: p.最新涨跌幅 ? `${parseFloat(p.最新涨跌幅).toFixed(2)}%` : "-",
      };
    });

    const buf = await generateExcel(enriched, "自选股", ["股票代码", "股票名称", "分组", "最新价", "最新涨跌幅"]);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="watchlist.xlsx"`);
    res.send(buf);
  } catch (error: any) {
    console.error("[export watchlist]", error);
    res.status(500).json({ error: "导出自选股失败", detail: error.message });
  }
});

// ============================================================
// Stock Search (autocomplete)
// ============================================================

import { searchStocks } from "./stock_index.js";

app.get("/api/stocks/search", async (req, res) => {
  try {
    const q = (req.query.q as string || "").trim();
    if (!q || q.length < 1) return res.json([]);
    const results = await searchStocks(q);
    res.json(results);
  } catch (error: any) {
    console.error("[stock search]", error.message);
    res.json([]);
  }
});

// ============================================================
// AI Config
// ============================================================

app.get("/api/config/ai", (_req, res) => {
  try {
    const apiKey = getSetting("ai_api_key") || "";
    const baseUrl = getSetting("ai_base_url") || "https://api.openai.com/v1";
    const model = getSetting("ai_model") || "gpt-4o-mini";
    res.json({ apiKey: apiKey ? "***已设置***" : "", baseUrl, model, hasKey: !!apiKey });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.put("/api/config/ai", (req, res) => {
  try {
    const { apiKey, baseUrl, model } = req.body;
    if (apiKey !== undefined && apiKey !== "***已设置***") {
      setSetting("ai_api_key", apiKey);
    }
    if (baseUrl) setSetting("ai_base_url", baseUrl);
    if (model) setSetting("ai_model", model);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================
// API: Portfolio Holdings 持仓管理 + 日报推送
// ============================================================

app.get("/api/holdings", (_req, res) => {
  try {
    res.json(getHoldings());
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/holdings", (req, res) => {
  const { stock_code, stock_name, cost_price, quantity, note } = req.body;
  if (!stock_code || !stock_name || !cost_price) {
    return res.status(400).json({ error: "缺少必填字段: stock_code, stock_name, cost_price" });
  }
  try {
    const result = addHolding(stock_code, stock_name, cost_price, quantity || 1, note || "");
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.put("/api/holdings/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "无效 ID" });
  try {
    updateHolding(id, req.body);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/holdings/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "无效 ID" });
  try {
    deleteHolding(id);
    res.json({ success: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// 日报摘要：查询持仓最新行情并生成涨跌汇总
app.get("/api/daily-summary", async (_req, res) => {
  try {
    const holdings = getHoldings();
    if (!holdings.length) {
      return res.json({ summary: "📋 当前无持仓记录", items: [], totalPnl: 0 });
    }

    // 批量查询行情
    const codes = holdings.map((h: any) => h.stock_code).join(",");
    const queryText = `${codes} 最新价 最新涨跌幅 总市值`;
    const quoteResult = await queryWencai(queryText, 20);

    // 构建行情映射
    const quoteMap: Record<string, any> = {};
    if (quoteResult.data) {
      for (const row of quoteResult.data) {
        const code = (row.股票代码 || "").replace(/\.(SZ|SH)$/i, "");
        quoteMap[code] = {
          price: parseFloat(row.最新价) || 0,
          change: parseFloat(row.最新涨跌幅) || 0,
        };
      }
    }

    const items: any[] = [];
    let totalCost = 0;
    let totalMarketValue = 0;
    let totalPnl = 0;

    for (const h of holdings) {
      const code = h.stock_code.replace(/\.(SZ|SH)$/i, "");
      const quote = quoteMap[code] || { price: 0, change: 0 };
      const costPrice = h.cost_price;
      const qty = h.quantity || 1;
      const currentPrice = quote.price;
      const itemCost = costPrice * qty;
      const itemValue = currentPrice * qty;
      const itemPnl = itemValue - itemCost;
      const itemPnlPercent = costPrice > 0 ? ((currentPrice - costPrice) / costPrice) * 100 : 0;

      totalCost += itemCost;
      totalMarketValue += itemValue;
      totalPnl += itemPnl;

      items.push({
        stock_code: code,
        stock_name: h.stock_name,
        cost_price: costPrice,
        current_price: currentPrice,
        change_percent: quote.change,
        pnl: itemPnl,
        pnl_percent: itemPnlPercent,
        quantity: qty,
      });
    }

    const totalPnlPercent = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;

    res.json({
      summary: buildDailySummary(items, totalPnl, totalPnlPercent),
      items,
      totalPnl,
      totalPnlPercent,
      totalCost,
      totalMarketValue,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

function buildDailySummary(items: any[], totalPnl: number, totalPnlPercent: number): string {
  const date = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" });
  const pnlSymbol = totalPnl >= 0 ? "📈" : "📉";
  const pnlStr = `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}`;
  const pnlPctStr = `${totalPnlPercent >= 0 ? "+" : ""}${totalPnlPercent.toFixed(2)}%`;

  let lines = [
    `📊 持仓日报 | ${date}`,
    `━━━━━━━━━━━━━━━━━━`,
    `总盈亏: ${pnlSymbol} ${pnlStr} (${pnlPctStr})`,
    `━━━━━━━━━━━━━━━━━━`,
  ];

  for (const item of items) {
    const emoji = item.pnl >= 0 ? "🟢" : "🔴";
    const pnlS = `${item.pnl >= 0 ? "+" : ""}${item.pnl.toFixed(2)}`;
    const pctS = `${item.pnl_percent >= 0 ? "+" : ""}${item.pnl_percent.toFixed(2)}%`;
    const dayS = `${item.change_percent >= 0 ? "+" : ""}${item.change_percent.toFixed(2)}%`;
    lines.push(`${emoji} ${item.stock_name}(${item.stock_code})`);
    lines.push(`   成本 ${item.cost_price.toFixed(2)} → 现价 ${item.current_price.toFixed(2)}  (${dayS})`);
    lines.push(`   浮盈: ${pnlS} | ${pctS}`);
  }

  lines.push(`━━━━━━━━━━━━━━━━━━`);
  lines.push(`💡 StockEasy 每日收盘播报`);
  return lines.join("\n");
}

// ============================================================
// Stock Diagnosis
// ============================================================

async function gatherNews(code: string, name: string): Promise<string> {
  try {
    // 尝试通过浏览器抓取 CNBC 新闻 / 或新浪财经新闻
    // 这里使用东方财富的新闻搜索作为轻量方案
    const url = `https://searchapi.eastmoney.com/bgsearch/api?client=app&keyword=${encodeURIComponent(name + " " + code)}&page=1&size=5`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const data = await res.json();
    if (data?.Data?.list) {
      return data.Data.list.slice(0, 5).map((item: any) => {
        return `[${item.date || "近期"}] ${item.title || ""}`;
      }).join("\n");
    }
    return "";
  } catch {
    return "";
  }
}

app.post("/api/diagnose/:code", async (req, res) => {
  try {
    const code = req.params.code.replace(/\.(SZ|SH|BJ)$/i, "");
    const name = (req.body?.name || code) as string;

    // 1. 获取 AI 配置
    const apiKey = getSetting("ai_api_key");
    if (!apiKey) {
      return res.status(400).json({ error: "请先在设置中配置 AI API Key" });
    }
    const baseUrl = getSetting("ai_base_url") || "https://api.openai.com/v1";
    const model = getSetting("ai_model") || "gpt-4o-mini";

    // 2. 并行获取数据: 基础行情 + 财务指标 + 新闻
    const [priceResult, finResult, newsText] = await Promise.all([
      queryWencai(`${code} ${name}`, 5),
      queryWencai(`${name} 一季报 净利润增长率 营业收入 净利润 毛利率 净利率 资产负债率 ROE 每股收益`, 5),
      gatherNews(code, name),
    ]);

    // 3. 整理基础行情
    const lines: string[] = [];
    if (priceResult.data && priceResult.data.length > 0) {
      const row = priceResult.data[0];
      if (row.股票代码) lines.push(`股票代码: ${row.股票代码}`);
      if (row.股票简称) lines.push(`股票简称: ${row.股票简称}`);
      if (row.最新价 && row.最新价 !== "") lines.push(`最新价: ${row.最新价}`);
      if (row.最新涨跌幅 && row.最新涨跌幅 !== "") lines.push(`最新涨跌幅: ${(row.最新涨跌幅 as number).toFixed(2)}%`);
    }

    // 4. 从财务查询提取指标
    if (finResult.data && finResult.data.length > 0) {
      let extractedCount = 0;
      for (const row of finResult.data) {
        for (const key of Object.keys(row)) {
          const val = row[key];
          if (Array.isArray(val)) {
            for (const item of val) {
              if (typeof item === "object" && item !== null) {
                let itemCode = "";
                let reportPeriod = "";
                const extracted: Record<string, string> = {};
                
                for (const mk of Object.keys(item)) {
                  const cleanKey = mk.replace(/^[^.]*?\[\d+\]\./, "");
                  if (cleanKey === "code" || cleanKey === "股票代码") {
                    itemCode = String(item[mk] || "");
                  } else if (cleanKey === "报告期") {
                    reportPeriod = String(item[mk] || "");
                  } else if (!["name", "domain", "type", "unit", "startDate", "endDate", "updateTime"].includes(cleanKey)) {
                    const unit = item.unit || "";
                    extracted[cleanKey] = String(item[mk]) + (unit ? unit : "");
                  }
                }
                
                if (itemCode && (itemCode.startsWith(code) || itemCode.replace(/\.(SZ|SH|BJ)$/i, "") === code)) {
                  const prefix = reportPeriod ? `[${reportPeriod}]` : "";
                  for (const [ek, ev] of Object.entries(extracted)) {
                    if (ev && ev !== "undefined" && ev !== "null" && ev !== "") {
                      if (!lines.some(l => l.includes(ek))) {
                        lines.push(`${prefix} ${ek}: ${ev}`);
                        extractedCount++;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
      console.log(`[diagnose] 提取到 ${extractedCount} 个财务指标`);
    }
    
    // 如果没提取到财务指标，尝试更多特定查询
    if (lines.length <= 2) {
      try {
        console.log("[diagnose] 基本数据不足，尝试补充查询...");
        // 净利润增长率通常返回最丰富的数据
        const more = await queryWencai(`${name} 净利润增长率`, 5);
        if (more.data) {
          for (const row of more.data) {
            for (const key of Object.keys(row)) {
              const val = row[key];
              if (Array.isArray(val) && val.length > 0) {
                for (const item of val) {
                  if (typeof item === "object") {
                    for (const mk of Object.keys(item)) {
                      const cleanKey = mk.replace(/^[^.]*?\[\d+\]\./, "");
                      if (!["code", "name", "domain", "type", "unit", "startDate", "endDate", "updateTime", "报告期", "报告期"].includes(cleanKey) && typeof item[mk] !== "object") {
                        const v = String(item[mk]).substring(0, 30);
                        if (v && v !== "undefined" && v !== "" && v !== "null") {
                          const unit = item.unit || "";
                          if (!lines.some(l => l.includes(cleanKey))) {
                            lines.push(`${cleanKey}: ${v}${unit}`);
                          }
                          break; // only first matching item per field
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e: any) {
        console.log("[diagnose] 补充查询失败:", e.message);
      }
    }

    const financials = lines.length > 0 ? lines.join("\n") : "暂无详细财务数据";
    console.log("[diagnose] 采集数据:", financials.replace(/\n/g, " | "));

    // 5. 调用 AI 诊断
    const { diagnoseStock } = await import("./ai.js");
    const result = await diagnoseStock(
      { apiKey, baseUrl, model },
      { code, name, financials, news: newsText || "暂无相关新闻" }
    );

    res.json(result);
  } catch (error: any) {
    console.error("[diagnose]", error.message);
    res.status(500).json({ error: "诊断失败: " + error.message });
  }
});

// ============================================================
// ============================================================
// Dashboard API — 策略仪表盘（含排名、重叠度、实时行情）
// ============================================================

app.get("/api/dashboard", async (_req, res) => {
  try {
    const strategies = getStrategies();
    const http = await import("http");

    // 1. Collect all stocks from latest snapshots
    const allStocks: any[] = [];
    for (const s of strategies) {
      const snaps = getSnapshots(s.id);
      if (!snaps.length) continue;
      const snap = snaps[0];
      const stocksList = getSnapshotStocks(snap.id);
      stocksList.forEach((st: any) => {
        allStocks.push({
          rawCode: st.stock_code,
          code: (st.stock_code || "").replace(/\.(SZ|SH|BJ)$/i, ""),
          name: st.stock_name,
          snapPrice: st.price_at_snapshot,
          snapDate: snap.snapshot_date,
          strategyId: s.id,
          strategyName: s.name,
          strategyGroup: s.group_name,
        });
      });
    }

    // 2. Cache lookup
    const allCodes = allStocks.map((s: any) => s.code);
    const cached = getCachedPrices(allCodes);

    // 3. Query Sina for current price + yesterday close (GBK解码 + 缓存)
    const currentPrices: Record<string, number> = {};
    const yesterdayClose: Record<string, number> = {};
    const todayStr = new Date().toISOString().slice(0, 10);

    // 先填充缓存命中
    const needSina: string[] = [];
    for (const s of allStocks) {
      const hit = cached.get(s.code);
      if (hit) {
        currentPrices[s.code] = hit.current;
        yesterdayClose[s.code] = hit.yest;
      } else {
        needSina.push(s);
      }
    }

    // 未命中 → 查新浪
    if (needSina.length > 0) {
      const BATCH = 100;
      for (let i = 0; i < needSina.length; i += BATCH) {
        const batchStocks = needSina.slice(i, i + BATCH);
        const sinaCodes = batchStocks.map((s: any) => {
          const raw = s.rawCode || "";
          return raw.endsWith(".SZ") ? `sz${s.code}` : raw.endsWith(".BJ") ? `bj${s.code}` : `sh${s.code}`;
        });
        const url = `http://hq.sinajs.cn/list=${sinaCodes.join(",")}`;
        try {
          const buffer = await new Promise<Buffer>((resolve, reject) => {
            http.get(url, { headers: { "Referer": "https://finance.sina.com.cn" } }, (r: any) => {
              const chunks: Buffer[] = [];
              r.on("data", (c: Buffer) => chunks.push(c));
              r.on("end", () => resolve(Buffer.concat(chunks)));
            }).on("error", reject);
          });
          // GBK → UTF-8 解码
          const data = Iconv.decode(buffer, "gbk");
          for (const line of data.split("\n")) {
            if (!line.trim()) continue;
            const m = line.match(/hq_str_(s[hz]\d+)="([^"]+)"/);
            if (!m) continue;
            const parts = m[2].split(",");
            const code = m[1].replace(/^(sh|sz|bj)/, "");
            const cur = parseFloat(parts[3]);
            const yc = parseFloat(parts[2]);
            const name = parts[0]; // 解码后的中文名
            if (code && !isNaN(cur) && cur > 0) {
              currentPrices[code] = cur;
              yesterdayClose[code] = yc;
              setCachedPrice(code, name || "", cur, yc);
            }
          }
        } catch (_) { /* skip batch */ }
      }
    }

    // 3b. Calculate changes (use yesterday close for same-day snapshots)
    for (const s of allStocks) {
      const cur = currentPrices[s.code];
      // 当日快照用昨收作基准
      const baseline = s.snapDate === todayStr ? yesterdayClose[s.code] : s.snapPrice;
      if (cur && baseline) {
        s.currentPrice = cur;
        s.changePct = (cur - baseline) / baseline * 100;
        s.baselineUsed = s.snapDate === todayStr ? "昨收" : "快照价";
      } else {
        s.currentPrice = null;
        s.changePct = null;
        s.baselineUsed = "-";
      }
    }

    // 4. Group ranking (含风险指标)
    const groupMap: Record<string, any> = {};
    for (const s of allStocks) {
      const g = s.strategyGroup;
      if (!groupMap[g]) groupMap[g] = { names: new Set(), up: 0, down: 0, flat: 0, total: 0, totalReturn: 0, countReturn: 0, winSum: 0, lossSum: 0 };
      groupMap[g].names.add(s.strategyName);
      groupMap[g].total++;
      if (s.changePct === null) continue;
      groupMap[g].totalReturn += s.changePct;
      groupMap[g].countReturn++;
      if (s.changePct > 0) { groupMap[g].up++; groupMap[g].winSum += s.changePct; }
      else if (s.changePct < 0) { groupMap[g].down++; groupMap[g].lossSum += Math.abs(s.changePct); }
      else groupMap[g].flat++;
    }

    const groupRank = Object.entries(groupMap)
      .map(([name, g]: any) => ({
        group: name,
        strategies: [...g.names].join(" + "),
        total: g.total, up: g.up, down: g.down, flat: g.flat,
        upRatio: g.countReturn > 0 ? +(g.up / g.countReturn * 100).toFixed(1) : 0,
        avgReturn: g.countReturn > 0 ? +(g.totalReturn / g.countReturn).toFixed(2) : 0,
        avgWin: g.up > 0 ? +(g.winSum / g.up).toFixed(2) : 0,
        avgLoss: g.down > 0 ? +(g.lossSum / g.down).toFixed(2) : 0,
        winLossRatio: g.lossSum > 0 ? +(g.winSum / g.lossSum).toFixed(2) : 0,
      }))
      .sort((a: any, b: any) => b.upRatio - a.upRatio)
      .map((g: any, i: number) => ({ rank: i + 1, ...g }));

    // 5. Strategy ranking (含风险指标)
    const stratMap: Record<string, any> = {};
    for (const s of allStocks) {
      const key = s.strategyName;
      if (!stratMap[key]) stratMap[key] = { group: s.strategyGroup, up: 0, down: 0, flat: 0, total: 0, totalReturn: 0, countReturn: 0, winSum: 0, lossSum: 0 };
      stratMap[key].total++;
      if (s.changePct === null) continue;
      stratMap[key].totalReturn += s.changePct;
      stratMap[key].countReturn++;
      if (s.changePct > 0) { stratMap[key].up++; stratMap[key].winSum += s.changePct; }
      else if (s.changePct < 0) { stratMap[key].down++; stratMap[key].lossSum += Math.abs(s.changePct); }
      else stratMap[key].flat++;
    }

    const strategyRank = Object.entries(stratMap)
      .map(([name, st]: any) => ({
        name, group: st.group,
        total: st.total, up: st.up, down: st.down,
        upRatio: st.countReturn > 0 ? +(st.up / st.countReturn * 100).toFixed(1) : 0,
        avgReturn: st.countReturn > 0 ? +(st.totalReturn / st.countReturn).toFixed(2) : 0,
        avgWin: st.up > 0 ? +(st.winSum / st.up).toFixed(2) : 0,
        avgLoss: st.down > 0 ? +(st.lossSum / st.down).toFixed(2) : 0,
        winLossRatio: st.lossSum > 0 ? +(st.winSum / st.lossSum).toFixed(2) : 0,
      }))
      .sort((a: any, b: any) => b.upRatio - a.upRatio)
      .map((s: any, i: number) => ({ rank: i + 1, ...s }));

    // 6. Overlap matrix
    const latestSnapshots: Record<number, number> = {};
    for (const sid of strategies.map((s: any) => s.id)) {
      const snaps = getSnapshots(sid);
      if (snaps.length) latestSnapshots[sid] = snaps[0].id;
    }
    const overlapMatrix: any[] = [];
    const sids = Object.keys(latestSnapshots).map(Number);
    for (let i = 0; i < sids.length; i++) {
      for (let j = i + 1; j < sids.length; j++) {
        const sid1 = sids[i], sid2 = sids[j];
        const stocks1 = new Set(getSnapshotStocks(latestSnapshots[sid1]).map((st: any) => st.stock_code));
        const stocks2 = new Set(getSnapshotStocks(latestSnapshots[sid2]).map((st: any) => st.stock_code));
        const overlap = [...stocks1].filter(c => stocks2.has(c)).length;
        const total = Math.min(stocks1.size, stocks2.size);
        if (overlap > 0) {
          const n1 = strategies.find((s: any) => s.id === sid1)?.name || "";
          const n2 = strategies.find((s: any) => s.id === sid2)?.name || "";
          overlapMatrix.push({
            strategyA: n1, groupA: strategies.find((s: any) => s.id === sid1)?.group_name || "",
            strategyB: n2, groupB: strategies.find((s: any) => s.id === sid2)?.group_name || "",
            overlap, totalA: stocks1.size, totalB: stocks2.size,
            ratio: total > 0 ? +(overlap / total * 100).toFixed(1) : 0,
          });
        }
      }
    }
    overlapMatrix.sort((a, b) => b.overlap - a.overlap);

    // 7. Multi-period trend (各策略历史快照收益趋势)
    const strategyTrend: any[] = [];
    for (const s of strategies) {
      const snaps = getSnapshots(s.id);
      if (snaps.length < 1) continue;
      // 按日期升序（最老的在前面）
      snaps.sort((a: any, b: any) => a.snapshot_date.localeCompare(b.snapshot_date));
      const points: { date: string; avgReturn: number; upRatio: number; stockCount: number }[] = [];
      for (const snap of snaps) {
        const stocks = getSnapshotStocks(snap.id);
        let retSum = 0, count = 0, up = 0;
        for (const st of stocks) {
          const code = (st.stock_code || "").replace(/\.(SZ|SH|BJ)$/i, "");
          const cur = currentPrices[code];
          if (cur && st.price_at_snapshot && st.price_at_snapshot > 0) {
            const ret = (cur - st.price_at_snapshot) / st.price_at_snapshot * 100;
            retSum += ret; count++;
            if (ret > 0) up++;
          }
        }
        if (count > 0) {
          points.push({
            date: snap.snapshot_date,
            avgReturn: +(retSum / count).toFixed(2),
            upRatio: +(up / count * 100).toFixed(1),
            stockCount: count,
          });
        }
      }
      if (points.length >= 1) {
        strategyTrend.push({ strategy: s.name, group: s.group_name, snapshots: points });
      }
    }

    res.json({
      date: todayStr,
      totalStrategies: strategies.length,
      totalStocks: allStocks.length,
      priceCoverage: allStocks.filter((s: any) => s.changePct !== null).length,
      groupRank,
      strategyRank,
      overlapMatrix,
      strategyTrend,
    });
  } catch (error: any) {
    res.status(500).json({ error: "仪表盘数据获取失败", detail: error.message });
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
