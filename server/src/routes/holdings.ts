import { Router } from "express";
import { getHoldings, getAllHoldings, addHolding, updateHolding, deleteHolding } from "../database.js";
import { queryWencai } from "../wencai.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

router.get("/api/holdings", requireAuth, asyncHandler(async (req, res) => {
  res.json(getHoldings(req.user!.userId));
}));

router.post("/api/holdings", requireAuth, asyncHandler(async (req, res) => {
  const { stock_code, stock_name, cost_price, quantity, note } = req.body;
  if (!stock_code || !stock_name || !cost_price) { res.status(400).json({ error: "缺少必填字段: stock_code, stock_name, cost_price" }); return; }
  res.json(addHolding(req.user!.userId, stock_code, stock_name, cost_price, quantity || 1, note || ""));
}));

router.put("/api/holdings/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效 ID" }); return; }
  updateHolding(req.user!.userId, id, req.body);
  res.json({ success: true });
}));

router.delete("/api/holdings/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效 ID" }); return; }
  deleteHolding(req.user!.userId, id);
  res.json({ success: true });
}));

router.get("/api/daily-summary", requireAuth, asyncHandler(async (req, res) => {
  const isCron = req.user!.userId === 0;
  const holdings = isCron ? getAllHoldings() : getHoldings(req.user!.userId);
  if (!holdings.length) { res.json({ summary: "📋 当前无持仓记录", items: [], totalPnl: 0 }); return; }

  const codes = holdings.map((h: any) => h.stock_code).join(",");
  const quoteResult = await queryWencai(`${codes}`, holdings.length * 2);
  const pm: Record<string, any> = {};
  for (const row of (quoteResult.data || [])) {
    const c = (row.股票代码 || "").replace(/\.(SZ|SH)$/i, "");
    if (c) pm[c] = row;
  }

  let totalPnl = 0, totalCost = 0;
  const items = holdings.map((h: any) => {
    const q = pm[h.stock_code] || {};
    const cp = parseFloat(q.最新价 || 0);
    const pnl = (cp - h.cost_price) * h.quantity;
    const pnlPercent = h.cost_price > 0 ? (cp - h.cost_price) / h.cost_price * 100 : 0;
    totalPnl += pnl;
    totalCost += h.cost_price * h.quantity;
    return { ...h, current_price: cp, pnl, pnl_percent: pnlPercent, change_percent: parseFloat(q.最新涨跌幅 || 0) };
  });

  const totalPnlPercent = totalCost > 0 ? totalPnl / totalCost * 100 : 0;
  const summary = buildDailySummary(items, totalPnl, totalPnlPercent);
  res.json({ summary, items, totalPnl, totalPnlPercent });
}));

function buildDailySummary(items: any[], totalPnl: number, totalPnlPercent: number): string {
  const date = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", weekday: "long" });
  const pnlSymbol = totalPnl >= 0 ? "📈" : "📉";
  const pnlStr = `${totalPnl >= 0 ? "+" : ""}${totalPnl.toFixed(2)}`;
  const pnlPctStr = `${totalPnlPercent >= 0 ? "+" : ""}${totalPnlPercent.toFixed(2)}%`;
  let lines = [`📊 持仓日报 | ${date}`, `━━━━━━━━━━━━━━━━━━`, `总盈亏: ${pnlSymbol} ${pnlStr} (${pnlPctStr})`, `━━━━━━━━━━━━━━━━━━`];
  for (const item of items) {
    const emoji = item.pnl >= 0 ? "🟢" : "🔴";
    const pnlS = `${item.pnl >= 0 ? "+" : ""}${item.pnl.toFixed(2)}`;
    const pctS = `${item.pnl_percent >= 0 ? "+" : ""}${item.pnl_percent.toFixed(2)}%`;
    const dayS = `${item.change_percent >= 0 ? "+" : ""}${item.change_percent.toFixed(2)}%`;
    lines.push(`${emoji} ${item.stock_name}(${item.stock_code})`);
    lines.push(`   成本 ${item.cost_price.toFixed(2)} → 现价 ${item.current_price.toFixed(2)}  (${dayS})`);
    lines.push(`   浮盈: ${pnlS} | ${pctS}`);
  }
  lines.push(`━━━━━━━━━━━━━━━━━━`, `💡 StockEasy 每日收盘播报`);
  return lines.join("\n");
}

export default router;
