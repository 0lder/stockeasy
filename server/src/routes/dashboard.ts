import { Router } from "express";
import { getStrategies, getSnapshots, getSnapshotStocks } from "../database.js";
import { fetchPrices, stripSuffix } from "../services/price.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

router.get("/api/dashboard", requireAuth, asyncHandler(async (req, res) => {
  const userId = req.user!.userId;
  const strategies = getStrategies(userId);
  if (!strategies.length) { res.json({ date: "", totalStrategies: 0, totalStocks: 0, groupRank: [], strategyRank: [], overlapMatrix: [], strategyTrend: [] }); return; }

  const todayStr = new Date().toISOString().slice(0, 10);

  const latestSnaps: Record<number, any> = {};
  for (const s of strategies) {
    const snaps = getSnapshots(s.id);
    if (snaps.length) latestSnaps[s.id] = snaps[0];
  }

  const allStocks: { strategyId: number; strategyName: string; strategyGroup: string; code: string; snapPrice: number; snapDate: string; currentPrice?: number | null; changePct?: number | null; baselineUsed?: string }[] = [];
  for (const s of strategies) {
    const snap = latestSnaps[s.id];
    if (!snap) continue;
    for (const st of getSnapshotStocks(snap.id)) {
      allStocks.push({ strategyId: s.id, strategyName: s.name, strategyGroup: s.group_name, code: stripSuffix(st.stock_code), snapPrice: st.price_at_snapshot, snapDate: snap.snapshot_date.slice(0, 10) });
    }
  }

  const priceMap = await fetchPrices(allStocks.map(s => s.code));
  for (const s of allStocks) {
    const p = priceMap.get(s.code);
    if (p) { s.currentPrice = p.current; s.changePct = (p.current - p.yest) / p.yest * 100; s.baselineUsed = "昨收"; }
    else { s.currentPrice = null; s.changePct = null; s.baselineUsed = "-"; }
  }

  // Group ranking
  const groupMap: Record<string, any> = {};
  for (const s of allStocks) {
    const g = s.strategyGroup;
    if (!groupMap[g]) groupMap[g] = { names: new Set<string>(), up: 0, down: 0, flat: 0, total: 0, totalReturn: 0, countReturn: 0, winSum: 0, lossSum: 0 };
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
      group: name, strategies: [...g.names].join(" + "),
      total: g.total, up: g.up, down: g.down, flat: g.flat,
      upRatio: g.countReturn > 0 ? +(g.up / g.countReturn * 100).toFixed(1) : 0,
      avgReturn: g.countReturn > 0 ? +(g.totalReturn / g.countReturn).toFixed(2) : 0,
      avgWin: g.up > 0 ? +(g.winSum / g.up).toFixed(2) : 0,
      avgLoss: g.down > 0 ? +(g.lossSum / g.down).toFixed(2) : 0,
    }))
    .sort((a: any, b: any) => b.avgReturn - a.avgReturn);

  // Strategy ranking
  const stratMap: Record<string, any> = {};
  for (const s of allStocks) {
    const key = s.strategyName;
    if (!stratMap[key]) stratMap[key] = { up: 0, down: 0, flat: 0, total: 0, totalReturn: 0, countReturn: 0 };
    stratMap[key].total++;
    if (s.changePct === null) continue;
    stratMap[key].totalReturn += s.changePct;
    stratMap[key].countReturn++;
    if (s.changePct > 0) stratMap[key].up++;
    else if (s.changePct < 0) stratMap[key].down++;
    else stratMap[key].flat++;
  }
  const strategyRank = Object.entries(stratMap)
    .map(([name, g]: any) => ({
      name, total: g.total, up: g.up, down: g.down, flat: g.flat,
      upRatio: g.countReturn > 0 ? +(g.up / g.countReturn * 100).toFixed(1) : 0,
      avgReturn: g.countReturn > 0 ? +(g.totalReturn / g.countReturn).toFixed(2) : 0,
    }))
    .sort((a: any, b: any) => b.avgReturn - a.avgReturn);

  // Overlap matrix
  const strategyNames = [...new Set(allStocks.map(s => s.strategyName))];
  const overlapMatrix: any[] = [];
  for (const a of strategyNames) {
    const aCodes = new Set(allStocks.filter(s => s.strategyName === a).map(s => s.code));
    for (const b of strategyNames) {
      if (a >= b) continue;
      const bCodes = new Set(allStocks.filter(s => s.strategyName === b).map(s => s.code));
      const overlap = [...aCodes].filter(c => bCodes.has(c));
      if (overlap.length > 0) overlapMatrix.push({ strategyA: a, strategyB: b, overlapCount: overlap.length, codes: overlap.slice(0, 5) });
    }
  }
  overlapMatrix.sort((a: any, b: any) => b.overlapCount - a.overlapCount);

  // Strategy trend
  const strategyTrend = strategies.map(s => {
    const snaps = getSnapshots(s.id).slice(0, 30).reverse();
    return {
      strategyId: s.id, strategyName: s.name,
      points: snaps.map((sn: any) => ({ date: sn.snapshot_date.slice(0, 10), count: sn.stock_count })),
    };
  });

  res.json({
    date: todayStr,
    totalStrategies: strategies.length,
    totalStocks: allStocks.length,
    groupRank,
    strategyRank,
    overlapMatrix,
    strategyTrend,
  });
}));

export default router;
