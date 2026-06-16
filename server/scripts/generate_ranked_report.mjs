import { initDatabase, getStrategies, getSnapshots, getSnapshotStocks } from "../src/database.js";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

await initDatabase();
const strategies = getStrategies();

// Collect all stocks from all snapshots
const allStocks = [];
for (const s of strategies) {
  const snaps = getSnapshots(s.id);
  if (!snaps.length) continue;
  const snap = snaps[0];
  const stocksList = getSnapshotStocks(snap.id);
  stocksList.forEach(st => {
    allStocks.push({
      rawCode: st.stock_code, // e.g. "002734.SZ"
      code: (st.stock_code || "").replace(/\.(SZ|SH|BJ)$/i, ""),
      name: st.stock_name,
      snapPrice: st.price_at_snapshot,
      strategyId: s.id,
      strategyName: s.name,
      strategyGroup: s.group_name,
    });
  });
}

// ── Query current prices via Sina API (batch, 100 per request) ──
const sinaCodes = allStocks.map(s => {
  const raw = s.rawCode || "";
  return raw.endsWith(".SZ") ? `sz${s.code}` : raw.endsWith(".BJ") ? `bj${s.code}` : `sh${s.code}`;
});

const currentPrices = {};
const yesterdayClose = {};
const BATCH = 100;
for (let i = 0; i < sinaCodes.length; i += BATCH) {
  const batch = sinaCodes.slice(i, i + BATCH).join(",");
  const url = `http://hq.sinajs.cn/list=${batch}`;
  try {
    const resp = await fetch(url, { headers: { "Referer": "https://finance.sina.com.cn" } });
    const text = await resp.text();
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      const m = line.match(/hq_str_(s[hz]\d+)="([^"]+)"/);
      if (!m) continue;
      const parts = m[2].split(",");
      const code = m[1].replace(/^(sh|sz|bj)/, "");
      const price = parseFloat(parts[3]); // current price
      const yc = parseFloat(parts[2]);    // yesterday close
      if (code && !isNaN(price) && price > 0) currentPrices[code] = price;
      if (code && !isNaN(yc) && yc > 0) yesterdayClose[code] = yc;
    }
  } catch (_e) { /* skip batch */ }
}

// ── Calculate changes (当日快照用昨收作基准) ──
const today = new Date().toISOString().slice(0, 10);
let hasPriceCount = 0;
for (const s of allStocks) {
  const cur = currentPrices[s.code];
  const baseline = s.snapDate === today ? yesterdayClose[s.code] : s.snapPrice;
  if (cur && baseline) {
    s.currentPrice = cur;
    s.changePct = (cur - s.snapPrice) / s.snapPrice * 100;
    hasPriceCount++;
  } else {
    s.currentPrice = null;
    s.changePct = null;
  }
  s.isUp = s.changePct !== null && s.changePct > 0;
  s.isDown = s.changePct !== null && s.changePct < 0;
  s.isFlat = s.changePct !== null && s.changePct === 0;
}
console.log(`Price data: ${hasPriceCount}/${allStocks.length} stocks`);

// ── Group ranking ──
const groupMap = {};
for (const s of allStocks) {
  const g = s.strategyGroup;
  if (!groupMap[g]) groupMap[g] = { names: new Set(), up: 0, down: 0, flat: 0, total: 0, totalReturn: 0, countReturn: 0 };
  groupMap[g].names.add(s.strategyName);
  groupMap[g].total++;
  if (s.changePct === null) continue;
  groupMap[g].totalReturn += s.changePct;
  groupMap[g].countReturn++;
  if (s.isUp) groupMap[g].up++; else if (s.isDown) groupMap[g].down++; else groupMap[g].flat++;
}

const groupRank = Object.entries(groupMap)
  .map(([name, g]) => ({
    group: name,
    strategies: [...g.names].join(" + "),
    total: g.total, up: g.up, down: g.down, flat: g.flat,
    upRatio: g.countReturn > 0 ? (g.up / g.countReturn * 100).toFixed(1) + "%" : "-",
    avgReturn: g.countReturn > 0 ? (g.totalReturn / g.countReturn).toFixed(2) + "%" : "-",
  }))
  .sort((a, b) => parseFloat(b.upRatio) - parseFloat(a.upRatio))
  .map((g, i) => ({ rank: i + 1, ...g }));

// ── Strategy ranking ──
const stratMap = {};
for (const s of allStocks) {
  const key = s.strategyName;
  if (!stratMap[key]) stratMap[key] = { group: s.strategyGroup, up: 0, down: 0, flat: 0, total: 0, totalReturn: 0, countReturn: 0 };
  stratMap[key].total++;
  if (s.changePct === null) continue;
  stratMap[key].totalReturn += s.changePct;
  stratMap[key].countReturn++;
  if (s.isUp) stratMap[key].up++; else if (s.isDown) stratMap[key].down++; else stratMap[key].flat++;
}

const stratRank = Object.entries(stratMap)
  .map(([name, st]) => ({
    name, group: st.group,
    total: st.total, up: st.up, down: st.down,
    upRatio: st.countReturn > 0 ? (st.up / st.countReturn * 100).toFixed(1) + "%" : "-",
    avgReturn: st.countReturn > 0 ? (st.totalReturn / st.countReturn).toFixed(2) + "%" : "-",
  }))
  .sort((a, b) => parseFloat(b.upRatio) - parseFloat(a.upRatio))
  .map((s, i) => ({ rank: i + 1, ...s }));

// ══════════════════════════════════════
// Excel
// ══════════════════════════════════════
const wb = new ExcelJS.Workbook();
const blue = "FF007AFF";
const white = "FFFFFFFF";
const lightGray = "FFF5F5F7";
const borderGray = "FFD2D2D7";
const purple = "FF5856D6";
const green = "FF34C759";

const hFont = { name: "Arial", bold: true, color: { argb: white }, size: 11 };
const bFont = { name: "Arial", size: 10 };
function hFill(c) { return { type: "pattern", pattern: "solid", fgColor: { argb: c } }; }
function cBorder(cell) {
  cell.border = { top: { style: "thin", color: { argb: borderGray } }, bottom: { style: "thin", color: { argb: borderGray } }, left: { style: "thin", color: { argb: borderGray } }, right: { style: "thin", color: { argb: borderGray } } };
}
function altRow(row, i) { row.eachCell(c => { c.fill = i % 2 === 1 ? hFill(lightGray) : hFill("FFFFFFFF"); }); }

// Sheet 1: 分组排名
const s1 = wb.addWorksheet("分组排名");
s1.columns = [
  { header: "排名", key: "rank", width: 6 }, { header: "风格分组", key: "group", width: 14 },
  { header: "策略组合", key: "strategies", width: 28 }, { header: "总标的", key: "total", width: 8 },
  { header: "上涨", key: "up", width: 8 }, { header: "下跌", key: "down", width: 8 }, { header: "持平", key: "flat", width: 8 },
  { header: "上涨率↑", key: "upRatio", width: 10 }, { header: "平均收益", key: "avgReturn", width: 12 },
];
const h1 = s1.getRow(1);
h1.font = hFont; h1.fill = hFill(purple); h1.alignment = { vertical: "middle", horizontal: "center" };
h1.eachCell(c => cBorder(c));
groupRank.forEach((g, i) => {
  const r = s1.addRow(g); r.font = bFont; r.alignment = { vertical: "middle" }; altRow(r, i);
  r.eachCell(c => cBorder(c));
  [1, 4, 5, 6, 7, 8].forEach(j => r.getCell(j).alignment = { horizontal: "center" });
  r.getCell(9).alignment = { horizontal: "right" };
});
s1.freezePanes = "A2";

// Sheet 2: 策略排名
const s2 = wb.addWorksheet("策略排名");
s2.columns = [
  { header: "排名", key: "rank", width: 6 }, { header: "策略名称", key: "name", width: 16 },
  { header: "分组", key: "group", width: 12 }, { header: "总标的", key: "total", width: 8 },
  { header: "上涨", key: "up", width: 8 }, { header: "下跌", key: "down", width: 8 },
  { header: "上涨率↑", key: "upRatio", width: 10 }, { header: "平均收益", key: "avgReturn", width: 12 },
];
const h2 = s2.getRow(1);
h2.font = hFont; h2.fill = hFill(blue); h2.alignment = { vertical: "middle", horizontal: "center" };
h2.eachCell(c => cBorder(c));
stratRank.forEach((s, i) => {
  const r = s2.addRow(s); r.font = bFont; r.alignment = { vertical: "middle" }; altRow(r, i);
  r.eachCell(c => cBorder(c));
  [1, 4, 5, 6, 7].forEach(j => r.getCell(j).alignment = { horizontal: "center" });
  r.getCell(8).alignment = { horizontal: "right" };
});
s2.freezePanes = "A2";

// Sheet 3: 策略概览
const s3 = wb.addWorksheet("策略概览");
s3.columns = [
  { header: "#", key: "id", width: 5 }, { header: "策略名称", key: "name", width: 16 },
  { header: "分组", key: "group", width: 12 }, { header: "描述", key: "desc", width: 35 },
  { header: "选股数", key: "cnt", width: 8 }, { header: "快照日期", key: "sdate", width: 14 },
];
const h3 = s3.getRow(1);
h3.font = hFont; h3.fill = hFill(blue); h3.alignment = { vertical: "middle", horizontal: "center" };
h3.eachCell(c => cBorder(c));
strategies.forEach((s, i) => {
  const snaps = getSnapshots(s.id);
  const snap = snaps[0] || {};
  const r = s3.addRow({ id: s.id, name: s.name, group: s.group_name, desc: s.description, cnt: snap.stock_count || "-", sdate: snap.snapshot_date || "-" });
  r.font = bFont; r.alignment = { vertical: "middle" }; altRow(r, i);
  r.eachCell(c => cBorder(c));
  [1, 5, 6].forEach(j => r.getCell(j).alignment = { horizontal: "center" });
});
s3.freezePanes = "A2";

// Sheet 4: 持仓明细
const s4 = wb.addWorksheet("持仓明细");
s4.columns = [
  { header: "策略", key: "sname", width: 14 }, { header: "分组", key: "group", width: 10 },
  { header: "代码", key: "code", width: 10 }, { header: "名称", key: "stock", width: 14 },
  { header: "快照价", key: "snapPrice", width: 10 }, { header: "现价", key: "curPrice", width: 10 },
  { header: "涨跌幅", key: "chg", width: 10 },
];
const h4 = s4.getRow(1);
h4.font = hFont; h4.fill = hFill(blue); h4.alignment = { vertical: "middle", horizontal: "center" };
h4.eachCell(c => cBorder(c));
let ri = 0;
for (const s of allStocks) {
  const r = s4.addRow({
    sname: s.strategyName, group: s.strategyGroup, code: s.code, stock: s.name,
    snapPrice: s.snapPrice, curPrice: s.currentPrice || "-",
    chg: s.changePct !== null ? s.changePct / 100 : "-",
  });
  r.font = bFont; r.alignment = { vertical: "middle" }; altRow(r, ri);
  r.eachCell(c => cBorder(c));
  r.getCell(5).alignment = { horizontal: "right" }; r.getCell(5).numFmt = "#,##0.00";
  r.getCell(6).alignment = { horizontal: "right" }; r.getCell(6).numFmt = s.currentPrice ? "#,##0.00" : "@";
  r.getCell(7).alignment = { horizontal: "right" }; r.getCell(7).numFmt = s.changePct !== null ? "0.00%" : "@";
  ri++;
}
s4.freezePanes = "A2";

// Sheet 5: 当前持仓
const s5 = wb.addWorksheet("当前持仓");
s5.columns = [
  { header: "股票", key: "name", width: 14 }, { header: "成本", key: "cost", width: 10 },
  { header: "现价", key: "price", width: 10 }, { header: "盈亏", key: "pnl", width: 12 },
  { header: "涨幅", key: "pct", width: 10 }, { header: "数量", key: "qty", width: 8 },
];
const h5 = s5.getRow(1);
h5.font = hFont; h5.fill = hFill(green); h5.alignment = { vertical: "middle", horizontal: "center" };
h5.eachCell(c => cBorder(c));
try {
  const http = require("http");
  const daily = await new Promise((res, rej) => {
    http.get("http://localhost:3001/api/daily-summary", r => {
      let b = ""; r.on("data", c => b += c); r.on("end", () => res(JSON.parse(b)));
    }).on("error", rej);
  });
  (daily.holdings || []).forEach((h, i) => {
    const r = s5.addRow({ name: h.stock_name, cost: h.cost_price, price: h.current_price || "-", pnl: h.pnl || 0, pct: h.pnl_pct || 0, qty: h.quantity || "-" });
    r.font = bFont; r.alignment = { vertical: "middle" }; altRow(r, i);
    r.eachCell(c => cBorder(c));
    [2,3,4].forEach(j => { r.getCell(j).alignment = { horizontal: "right" }; r.getCell(j).numFmt = "#,##0.00"; });
    r.getCell(5).alignment = { horizontal: "right" }; r.getCell(5).numFmt = "0.00%";
    r.getCell(6).alignment = { horizontal: "center" };
  });
} catch(_) {}
s5.freezePanes = "A2";

// Save
const outDir = path.join(process.cwd(), "..", "output");
fs.mkdirSync(outDir, { recursive: true });
const outPath = path.join(outDir, "stockeasy_strategy_report.xlsx");
await wb.xlsx.writeFile(outPath);
console.log("✅", outPath);
console.log("   Size:", fs.statSync(outPath).size, "bytes");

console.log("\n📊 分组排名:");
groupRank.forEach(g => console.log(`   #${g.rank} ${g.group.padEnd(10)} ${g.upRatio.padStart(6)} 上涨率 | 均${g.avgReturn} | ${g.total}只`));
console.log("\n📊 策略排名:");
stratRank.forEach(s => console.log(`   #${s.rank} ${s.name.padEnd(10)} ${s.upRatio.padStart(6)} 上涨率 | 均${s.avgReturn}`));
