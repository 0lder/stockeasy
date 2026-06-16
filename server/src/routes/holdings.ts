import { Router } from "express";
import { getHoldings, addHolding, updateHolding, deleteHolding } from "../database.js";
import { queryWencai } from "../wencai.js";

const router = Router();

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

router.get("/api/holdings", (_req, res) => {
  try { res.json(getHoldings()); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.post("/api/holdings", (req, res) => {
  const { stock_code, stock_name, cost_price, quantity, note } = req.body;
  if (!stock_code || !stock_name || !cost_price) return res.status(400).json({ error: "缺少必填字段: stock_code, stock_name, cost_price" });
  try { res.json(addHolding(stock_code, stock_name, cost_price, quantity || 1, note || "")); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.put("/api/holdings/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "无效 ID" });
  try { updateHolding(id, req.body); res.json({ success: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.delete("/api/holdings/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) return res.status(400).json({ error: "无效 ID" });
  try { deleteHolding(id); res.json({ success: true }); }
  catch (e: any) { res.status(500).json({ error: e.message }); }
});

router.get("/api/daily-summary", async (_req, res) => {
  try {
    const holdings = getHoldings();
    if (!holdings.length) return res.json({ summary: "📋 当前无持仓记录", items: [], totalPnl: 0 });
    const codes = holdings.map((h: any) => h.stock_code).join(",");
    const quoteResult = await queryWencai(`${codes} 最新价 最新涨跌幅 总市值`, 20);
    const quoteMap: Record<string, any> = {};
    if (quoteResult.data) {
      for (const row of quoteResult.data) {
        const c = (row.股票代码 || "").replace(/\.(SZ|SH)$/i, "");
        quoteMap[c] = { price: parseFloat(row.最新价) || 0, change: parseFloat(row.最新涨跌幅) || 0 };
      }
    }
    const items: any[] = [];
    let totalCost = 0, totalMarketValue = 0, totalPnl = 0;
    for (const h of holdings) {
      const c = h.stock_code.replace(/\.(SZ|SH)$/i, "");
      const q = quoteMap[c] || { price: 0, change: 0 };
      const cp = h.cost_price, qty = h.quantity || 1, cur = q.price;
      const v = cur * qty, cst = cp * qty, pnl = v - cst;
      totalCost += cst; totalMarketValue += v; totalPnl += pnl;
      items.push({ stock_code: c, stock_name: h.stock_name, cost_price: cp, current_price: cur, change_percent: q.change, pnl, pnl_percent: cp > 0 ? (cur - cp) / cp * 100 : 0, quantity: qty });
    }
    const totalPnlPercent = totalCost > 0 ? totalPnl / totalCost * 100 : 0;
    res.json({ summary: buildDailySummary(items, totalPnl, totalPnlPercent), items, totalPnl, totalPnlPercent, totalCost, totalMarketValue });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

export default router;
