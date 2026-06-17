import { Router } from "express";
import { getAllSnapshots, getSnapshotStocks, deleteSnapshot } from "../database.js";
import { fetchPrices, stripSuffix } from "../services/price.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();
const normalize = (code: string) => stripSuffix(code);

router.get("/api/snapshots", requireAuth, asyncHandler(async (req, res) => {
  res.json(getAllSnapshots(req.user!.userId));
}));

router.get("/api/snapshots/compare-stats", requireAuth, asyncHandler(async (req, res) => {
  const idsStr = req.query.ids as string;
  if (!idsStr) { res.status(400).json({ error: "请提供快照 ID，格式 ?ids=a,b" }); return; }
  const [idA, idB] = idsStr.split(",").map(Number);
  if (isNaN(idA) || isNaN(idB)) { res.status(400).json({ error: "无效的快照 ID" }); return; }

  const stocksA = getSnapshotStocks(idA);
  const stocksB = getSnapshotStocks(idB);
  if (!stocksA.length || !stocksB.length) { res.status(404).json({ error: "快照不存在" }); return; }

  const priceBMap: Record<string, number> = {};
  for (const s of stocksB) { if (s.price_at_snapshot) priceBMap[normalize(s.stock_code)] = s.price_at_snapshot; }

  const changes: any[] = [];
  for (const s of stocksA) {
    const c = normalize(s.stock_code);
    const pa = s.price_at_snapshot, pb = priceBMap[c];
    if (pa && pb) changes.push({ code: s.stock_code, name: s.stock_name, priceA: pa, priceB: pb, changePct: (pb - pa) / pa * 100 });
  }
  changes.sort((a, b) => b.changePct - a.changePct);
  const up = changes.filter((c: any) => c.changePct > 0);
  const down = changes.filter((c: any) => c.changePct < 0);
  const flat = changes.filter((c: any) => c.changePct === 0);
  const avg = changes.length > 0 ? changes.reduce((s: number, c: any) => s + c.changePct, 0) / changes.length : 0;

  res.json({
    snapshot_a: idA, snapshot_b: idB, total_common: changes.length,
    up_count: up.length, down_count: down.length, flat_count: flat.length,
    up_ratio: changes.length > 0 ? (up.length / changes.length * 100).toFixed(1) + "%" : "-",
    avg_change: avg.toFixed(2) + "%",
    best_5: changes.slice(0, 5).map((c: any) => ({ name: c.name, change: c.changePct.toFixed(2) + "%", from: c.priceA.toFixed(2), to: c.priceB.toFixed(2) })),
    worst_5: changes.slice(-5).reverse().map((c: any) => ({ name: c.name, change: c.changePct.toFixed(2) + "%", from: c.priceA.toFixed(2), to: c.priceB.toFixed(2) })),
    kept_count: changes.length,
    new_count: stocksB.filter((s: any) => !stocksA.some((a: any) => normalize(a.stock_code) === normalize(s.stock_code))).length,
    removed_count: stocksA.filter((s: any) => !stocksB.some((b: any) => normalize(b.stock_code) === normalize(s.stock_code))).length,
  });
}));

router.get("/api/snapshots/compare", requireAuth, asyncHandler(async (req, res) => {
  const idsStr = req.query.ids as string;
  if (!idsStr) { res.status(400).json({ error: "请提供快照 ID" }); return; }
  const ids = idsStr.split(",").map(Number);
  if (ids.some(isNaN)) { res.status(400).json({ error: "无效的快照 ID" }); return; }

  const allStocks: { snapshotId: number; date: string; code: string; name: string; price: number }[] = [];
  for (const id of ids) {
    const stocks = getSnapshotStocks(id);
    const snap = (getAllSnapshots(req.user!.userId) as any[]).find((s: any) => s.id === id);
    const date = snap?.snapshot_date?.slice(0, 10) || "";
    for (const s of stocks) allStocks.push({ snapshotId: id, date, code: normalize(s.stock_code), name: s.stock_name, price: s.price_at_snapshot });
  }

  const codes = [...new Set(allStocks.map(s => s.code))];
  const priceMap = await fetchPrices(codes);

  const enriched = allStocks.map(s => {
    const p = priceMap.get(s.code);
    return { ...s, currentPrice: p?.current || null, changePct: p ? ((p.current - p.yest) / p.yest * 100) : null };
  });

  res.json({ stocks: enriched, snapshotIds: ids });
}));

router.delete("/api/snapshots/:id", requireAuth, asyncHandler(async (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) { res.status(400).json({ error: "无效的快照 ID" }); return; }
  deleteSnapshot(id);
  res.json({ success: true });
}));

export default router;
