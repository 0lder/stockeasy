import { Router } from "express";
import { getStrategies, getSnapshots, getSnapshotStocks } from "../database.js";
import { fetchPrices, stripSuffix } from "../services/price.js";

const router = Router();

router.get("/api/dashboard", async (_req, res) => {
  try {
    const strategies = getStrategies();
    if (!strategies.length) return res.json({ date: "", totalStrategies: 0, totalStocks: 0, groupRank: [], strategyRank: [], overlapMatrix: [], strategyTrend: [] });

    const todayStr = new Date().toISOString().slice(0, 10);

    // 1. Get latest snapshot for each strategy
    const latestSnaps: Record<number, any> = {};
    for (const s of strategies) {
      const snaps = getSnapshots(s.id);
      if (snaps.length) latestSnaps[s.id] = snaps[0];
    }

    // 2. Collect all snapshot stocks
    const allStocks: { strategyId: number; strategyName: string; strategyGroup: string; code: string; snapPrice: number; snapDate: string }[] = [];
    for (const s of strategies) {
      const snap = latestSnaps[s.id];
      if (!snap) continue;
      for (const st of getSnapshotStocks(snap.id)) {
        allStocks.push({ strategyId: s.id, strategyName: s.name, strategyGroup: s.group_name, code: stripSuffix(st.stock_code), snapPrice: st.price_at_snapshot, snapDate: snap.snapshot_date.slice(0, 10) });
      }
    }

    // 3. Fetch current prices via price service
    const priceMap = await fetchPrices(allStocks.map(s => s.code));

    // 4. Calculate changes
    for (const s of allStocks) {
      const p = priceMap.get(s.code);
      if (p) {
        s.currentPrice = p.current;
        s.changePct = (p.current - p.yest) / p.yest * 100;
        s.baselineUsed = "昨收";
      } else {
        s.currentPrice = null;
        s.changePct = null;
        s.baselineUsed = "-";
      }
    }

    // 5. Group ranking
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
        group: name, strategies: [...g.names].join(" + "),
        total: g.total, up: g.up, down: g.down, flat: g.flat,
        upRatio: g.countReturn > 0 ? +(g.up / g.countReturn * 100).toFixed(1) : 0,
        avgReturn: g.countReturn > 0 ? +(g.totalReturn / g.countReturn).toFixed(2) : 0,
        avgWin: g.up > 0 ? +(g.winSum / g.up).toFixed(2) : 0,
        avgLoss: g.down > 0 ? +(g.lossSum / g.down).toFixed(2) : 0,
        winLossRatio: g.lossSum > 0 ? +(g.winSum / g.lossSum).toFixed(2) : (g.winSum > 0 ? 9999 : 0),
      }))
      .sort((a: any, b: any) => b.upRatio - a.upRatio)
      .map((g: any, i: number) => ({ rank: i + 1, ...g }));

    // 6. Strategy ranking
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
        name, group: st.group, total: st.total, up: st.up, down: st.down,
        upRatio: st.countReturn > 0 ? +(st.up / st.countReturn * 100).toFixed(1) : 0,
        avgReturn: st.countReturn > 0 ? +(st.totalReturn / st.countReturn).toFixed(2) : 0,
        avgWin: st.up > 0 ? +(st.winSum / st.up).toFixed(2) : 0,
        avgLoss: st.down > 0 ? +(st.lossSum / st.down).toFixed(2) : 0,
        winLossRatio: st.lossSum > 0 ? +(st.winSum / st.lossSum).toFixed(2) : (st.winSum > 0 ? 9999 : 0),
      }))
      .sort((a: any, b: any) => b.upRatio - a.upRatio)
      .map((s: any, i: number) => ({ rank: i + 1, ...s }));

    // 7. Overlap matrix
    const snapIdMap: Record<number, number> = {};
    for (const s of strategies) { const snap = latestSnaps[s.id]; if (snap) snapIdMap[s.id] = snap.id; }
    const overlapMatrix: any[] = [];
    const sids = Object.keys(snapIdMap).map(Number);
    for (let i = 0; i < sids.length; i++) {
      for (let j = i + 1; j < sids.length; j++) {
        const s1 = new Set(getSnapshotStocks(snapIdMap[sids[i]]).map((st: any) => st.stock_code));
        const s2 = new Set(getSnapshotStocks(snapIdMap[sids[j]]).map((st: any) => st.stock_code));
        const overlap = [...s1].filter(c => s2.has(c)).length;
        const n1 = strategies.find((s: any) => s.id === sids[i])?.name || "";
        const n2 = strategies.find((s: any) => s.id === sids[j])?.name || "";
        if (overlap > 0) {
          overlapMatrix.push({
            strategyA: n1, groupA: strategies.find((s: any) => s.id === sids[i])?.group_name || "",
            strategyB: n2, groupB: strategies.find((s: any) => s.id === sids[j])?.group_name || "",
            overlap, totalA: s1.size, totalB: s2.size,
            ratio: Math.min(s1.size, s2.size) > 0 ? +(overlap / Math.min(s1.size, s2.size) * 100).toFixed(1) : 0,
          });
        }
      }
    }
    overlapMatrix.sort((a, b) => b.overlap - a.overlap);

    // 8. Multi-period trend
    const strategyTrend: any[] = [];
    for (const s of strategies) {
      const snaps = getSnapshots(s.id);
      if (snaps.length < 1) continue;
      snaps.sort((a: any, b: any) => a.snapshot_date.localeCompare(b.snapshot_date));
      const points: any[] = [];
      for (const snap of snaps) {
        const stocks = getSnapshotStocks(snap.id);
        let retSum = 0, count = 0, up = 0;
        for (const st of stocks) {
          const code = stripSuffix(st.stock_code);
          const p = priceMap.get(code);
          if (p && st.price_at_snapshot > 0) {
            const ret = (p.current - st.price_at_snapshot) / st.price_at_snapshot * 100;
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
      if (points.length >= 1) strategyTrend.push({ strategy: s.name, group: s.group_name, snapshots: points });
    }

    res.json({
      date: todayStr, totalStrategies: strategies.length, totalStocks: allStocks.length,
      priceCoverage: allStocks.filter((s: any) => s.changePct !== null).length,
      groupRank, strategyRank, overlapMatrix, strategyTrend,
    });
  } catch (e: any) { res.status(500).json({ error: "仪表盘数据获取失败", detail: e.message }); }
});

export default router;
