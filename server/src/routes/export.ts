import { Router } from "express";
import ExcelJS from "exceljs";
import { getSnapshotStocks, getWatchlist } from "../database.js";
import { queryWencai } from "../wencai.js";

const router = Router();

async function generateExcel(rows: any[], sheetName: string, columns?: string[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName);
  if (!columns) columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  ws.columns = columns.map((k, i) => ({ header: k, key: k, width: Math.max(k.length * 3 + 4, 12) }));
  ws.addRows(rows);
  ws.getRow(1).font = { bold: true };
  return Buffer.from(await wb.xlsx.writeBuffer());
}

router.post("/api/export", async (req, res) => {
  try {
    const { data, filename = "export.xlsx", sheetName = "Sheet1", columns } = req.body;
    if (!data || !Array.isArray(data) || data.length === 0) return res.status(400).json({ error: "没有数据可导出" });
    const buf = await generateExcel(data, sheetName, columns);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
    res.send(buf);
  } catch (e: any) { console.error("[export]", e); res.status(500).json({ error: "导出失败", detail: e.message }); }
});

router.get("/api/export/query", async (req, res) => {
  try {
    const q = (req.query.q as string || "").trim();
    const limit = parseInt(req.query.limit as string) || 50;
    if (!q) return res.status(400).json({ error: "请输入查询条件" });
    const result = await queryWencai(q, limit);
    if (!result.data?.length) return res.status(400).json({ error: "查询结果为空" });
    const buf = await generateExcel(result.data, "查询结果");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(q.slice(0, 20))}.xlsx"`);
    res.send(buf);
  } catch (e: any) { console.error("[export query]", e); res.status(500).json({ error: "导出失败", detail: e.message }); }
});

router.get("/api/export/snapshot/:id", async (req, res) => {
  try {
    const sid = parseInt(req.params.id);
    if (isNaN(sid)) return res.status(400).json({ error: "无效的快照 ID" });
    const stocks = getSnapshotStocks(sid);
    if (!stocks.length) return res.status(400).json({ error: "快照数据为空" });
    const priceResult = await queryWencai(stocks.map((s: any) => s.stock_code).join(" "), stocks.length * 2);
    const pm: Record<string, any> = {};
    for (const row of (priceResult.data || [])) { const c = (row.股票代码 || "").replace(/\.(SZ|SH)$/i, ""); if (c) pm[c] = row; }
    const enriched = stocks.map((s: any) => {
      const p = pm[s.stock_code.replace(/\.(SZ|SH)$/i, "")] || {};
      const cp = parseFloat(p.最新价 || 0), sp = parseFloat(s.price_at_snapshot);
      return { 股票代码: s.stock_code, 股票名称: s.stock_name, 快照价格: sp || "-", 最新价: cp || "-", 涨跌幅: cp && sp ? `${((cp-sp)/sp*100).toFixed(2)}%` : "-" };
    });
    const buf = await generateExcel(enriched, "快照数据", ["股票代码", "股票名称", "快照价格", "最新价", "涨跌幅"]);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="snapshot_${sid}.xlsx"`);
    res.send(buf);
  } catch (e: any) { console.error("[export snapshot]", e); res.status(500).json({ error: "导出快照失败", detail: e.message }); }
});

router.get("/api/export/watchlist", async (_req, res) => {
  try {
    const items = getWatchlist();
    if (!items.length) return res.status(400).json({ error: "自选股为空" });
    const priceResult = await queryWencai(items.map((s: any) => s.stock_code).join(","), items.length * 2);
    const pm: Record<string, any> = {};
    for (const row of (priceResult.data || [])) { const c = (row.股票代码 || "").replace(/\.(SZ|SH)$/i, ""); if (c) pm[c] = row; }
    const enriched = items.map((s: any) => {
      const p = pm[s.stock_code.replace(/\.(SZ|SH)$/i, "")] || {};
      return { 股票代码: s.stock_code, 股票名称: s.stock_name, 分组: s.group_name || "默认", 最新价: parseFloat(p.最新价 || 0) || "-", 最新涨跌幅: p.最新涨跌幅 ? `${parseFloat(p.最新涨跌幅).toFixed(2)}%` : "-" };
    });
    const buf = await generateExcel(enriched, "自选股", ["股票代码", "股票名称", "分组", "最新价", "最新涨跌幅"]);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="watchlist.xlsx"`);
    res.send(buf);
  } catch (e: any) { console.error("[export watchlist]", e); res.status(500).json({ error: "导出自选股失败", detail: e.message }); }
});

export default router;
