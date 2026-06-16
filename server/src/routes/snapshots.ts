import { Router } from "express";
import { getAllSnapshots, getSnapshotStocks, deleteSnapshot } from "../database.js";
import { fetchPrices, stripSuffix } from "../services/price.js";

const router = Router();

const normalize = (code: string) => stripSuffix(code);

// --- List all ---
router.get("/api/snapshots", (_req, res) => {
  try { res.json(getAllSnapshots()); }
  catch (e: any) { res.status(500).json({ error: "获取快照列表失败", detail: e.message }); }
});

// --- Compare stats (两期价格对比) ---
router.get("/api/snapshots/compare-stats", async (req, res) => {
  try {
    const idsStr = req.query.ids as string;
    if (!idsStr) return res.status(400).json({ error: "请提供快照 ID，格式 ?ids=a,b" });
    const [idA, idB] = idsStr.split(",").map(Number);
    if (isNaN(idA) || isNaN(idB)) return res.status(400).json({ error: "无效的快照 ID" });

    const stocksA = getSnapshotStocks(idA);
    const stocksB = getSnapshotStocks(idB);
    if (!stocksA.length || !stocksB.length) return res.status(404).json({ error: "快照不存在" });

    const priceBMap: Record<string, number> = {};
    for (const s of stocksB) { if (s.price_at_snapshot) priceBMap[normalize(s.stock_code)] = s.price_at_snapshot; }

    const changes: any[] = [];
    for (const s of stocksA) {
      const c = normalize(s.stock_code);
      const pa = s.price_at_snapshot, pb = priceBMap[c];
      if (pa && pb) changes.push({ code: s.stock_code, name: s.stock_name, priceA: pa, priceB: pb, changePct: (pb - pa) / pa * 100 });
    }
    changes.sort((a, b) => b.changePct - a.changePct);
    const up = changes.filter(c => c.changePct > 0), down = changes.filter(c => c.changePct < 0), flat = changes.filter(c => c.changePct === 0);
    const avg = changes.length > 0 ? changes.reduce((s, c) => s + c.changePct, 0) / changes.length : 0;
    res.json({
      snapshot_a: idA, snapshot_b: idB, total_common: changes.length,
      up_count: up.length, down_count: down.length, flat_count: flat.length,
      up_ratio: changes.length > 0 ? (up.length / changes.length * 100).toFixed(1) + "%" : "-",
      avg_change: avg.toFixed(2) + "%",
      best_5: changes.slice(0, 5).map(c => ({ name: c.name, change: c.changePct.toFixed(2) + "%", from: c.priceA.toFixed(2), to: c.priceB.toFixed(2) })),
      worst_5: changes.slice(-5).reverse().map(c => ({ name: c.name, change: c.changePct.toFixed(2) + "%", from: c.priceA.toFixed(2), to: c.priceB.toFixed(2) })),
      kept_count: changes.length,
      new_count: stocksB.filter(s => !stocksA.some(a => normalize(a.stock_code) === normalize(s.stock_code))).length,
      removed_count: stocksA.filter(s => !stocksB.some(b => normalize(b.stock_code) === normalize(s.stock_code))).length,
    });
  } catch (e: any) { res.status(500).json({ error: "统计失败", detail: e.message }); }
});

// --- Compare (full detail with current prices) ---
router.get("/api/snapshots/compare", async (req, res) => {
  try {
    const idsStr = req.query.ids as string;
    if (!idsStr) return res.status(400).json({ error: "请提供要对比的快照 ID，格式 ?ids=1,2" });
    const [idA, idB] = idsStr.split(",").map(Number);
    if (isNaN(idA) || isNaN(idB)) return res.status(400).json({ error: "无效的快照 ID" });

    const stocksA = getSnapshotStocks(idA);
    const stocksB = getSnapshotStocks(idB);
    if (!stocksA.length || !stocksB.length) return res.status(404).json({ error: "快照不存在或为空" });

    const allCodes = [...new Set([...stocksA.map((s: any) => normalize(s.stock_code)), ...stocksB.map((s: any) => normalize(s.stock_code))])];
    const prices = await fetchPrices(allCodes);

    const mapStocks = (snaps: any[]) => snaps.map((s: any) => ({
      code: normalize(s.stock_code), name: s.stock_name,
      price: s.price_at_snapshot,
      current_price: prices.get(normalize(s.stock_code))?.current ?? "-",
    }));

    const mappedA = mapStocks(stocksA), mappedB = mapStocks(stocksB);
    const codeSetA = new Set(stocksA.map(s => normalize(s.stock_code)));
    const codeSetB = new Set(stocksB.map(s => normalize(s.stock_code)));

    const kept = mappedA.filter(s => codeSetB.has(s.code)).map(s => {
      const b = mappedB.find(x => x.code === s.code)!;
      return { code: s.code, name: s.name, price_a: s.price, price_b: b.price, price_change: (typeof b.price === "number" && typeof s.price === "number") ? ((b.price - s.price) / s.price * 100).toFixed(2) + "%" : "-" };
    });
    const newStocks = mappedB.filter(s => !codeSetA.has(s.code));
    const removed = mappedA.filter(s => !codeSetB.has(s.code));

    res.json({
      a: { id: idA, stocks: mappedA }, b: { id: idB, stocks: mappedB },
      comparison: { kept, new: newStocks, removed, stats: { kept_count: kept.length, new_count: newStocks.length, removed_count: removed.length, total_a: stocksA.length, total_b: stocksB.length } },
    });
  } catch (e: any) { res.status(500).json({ error: "快照对比失败", detail: e.message }); }
});

// --- Detail (with current prices via price service) ---
router.get("/api/snapshots/:id", async (req, res) => {
  try {
    const snapshotId = parseInt(req.params.id);
    if (isNaN(snapshotId)) return res.status(400).json({ error: "无效的快照 ID" });
    const stocks = getSnapshotStocks(snapshotId);
    if (!stocks.length) return res.json({ stocks: [] });

    const codes = stocks.map(s => normalize(s.stock_code));
    const prices = await fetchPrices(codes);

    const enriched = stocks.map(s => ({
      stock_code: s.stock_code, stock_name: s.stock_name,
      price_at_snapshot: s.price_at_snapshot,
      current_price: prices.get(normalize(s.stock_code))?.current ?? "-",
    }));
    res.json({ stocks: enriched });
  } catch (e: any) { res.status(500).json({ error: "获取快照详情失败", detail: e.message }); }
});

// --- Delete ---
router.delete("/api/snapshots/:id", (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "无效的快照 ID" });
    deleteSnapshot(id);
    res.json({ success: true });
  } catch (e: any) { res.status(500).json({ error: "删除快照失败", detail: e.message }); }
});

export default router;
