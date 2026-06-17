import { Router } from "express";
import ExcelJS from "exceljs";
import { getSnapshotStocks } from "../database.js";
import { queryWencai } from "../wencai.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

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

router.post("/api/export", requireAuth, asyncHandler(async (req, res) => {
  const { data, filename = "export.xlsx", sheetName = "Sheet1", columns } = req.body;
  if (!data || !Array.isArray(data) || data.length === 0) { res.status(400).json({ error: "没有数据可导出" }); return; }
  const buf = await generateExcel(data, sheetName, columns);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(filename)}"`);
  res.send(buf);
}));

router.get("/api/export/query", requireAuth, asyncHandler(async (req, res) => {
  const q = (req.query.q as string || "").trim();
  const limit = parseInt(req.query.limit as string) || 50;
  if (!q) { res.status(400).json({ error: "请输入查询条件" }); return; }
  const result = await queryWencai(q, limit);
  if (!result.data?.length) { res.status(400).json({ error: "查询结果为空" }); return; }
  const buf = await generateExcel(result.data, "查询结果");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${encodeURIComponent(q.slice(0, 20))}.xlsx"`);
  res.send(buf);
}));

router.get("/api/export/snapshot/:id", requireAuth, asyncHandler(async (req, res) => {
  const sid = parseInt(req.params.id);
  if (isNaN(sid)) { res.status(400).json({ error: "无效的快照 ID" }); return; }
  const stocks = getSnapshotStocks(sid);
  if (!stocks.length) { res.status(400).json({ error: "快照数据为空" }); return; }
  const priceResult = await queryWencai(stocks.map((s: any) => s.stock_code).join(" "), stocks.length * 2);
  const pm: Record<string, any> = {};
  for (const row of (priceResult.data || [])) { const c = (row.股票代码 || "").replace(/\.(SZ|SH)$/i, ""); if (c) pm[c] = row; }
  const enriched = stocks.map((s: any) => {
    const p = pm[s.stock_code.replace(/\.(SZ|SH)$/i, "")] || {};
    const cp = parseFloat(p.最新价 || 0);
    const sp = parseFloat(s.price_at_snapshot);
    return {
      股票代码: s.stock_code, 股票名称: s.stock_name,
      快照价: sp || null, 最新价: cp || null,
      涨跌幅: sp && cp ? ((cp - sp) / sp * 100).toFixed(2) + "%" : "-",
    };
  });
  const buf = await generateExcel(enriched, "快照对比");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="snapshot_${sid}.xlsx"`);
  res.send(buf);
}));

export default router;
