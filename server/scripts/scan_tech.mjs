// Direct DB read + Sina price query
import initSqlJs from "sql.js";
import fs from "fs";
import Iconv from "iconv-lite";

const SQL = await initSqlJs();
const buf = fs.readFileSync("/app/working/workspaces/default/stockeasy/data/history.db");
const db = new SQL.Database(buf);

// Get 科技成长 strategy (ID:8)
const strat = db.exec("SELECT id, name, group_name FROM strategies WHERE id=8");
if (!strat.length) { console.log("Strategy not found"); process.exit(1); }
const sid = strat[0].values[0][0];

// Get latest snapshot
const snaps = db.exec(`SELECT id, snapshot_date, stock_count FROM strategy_snapshots WHERE strategy_id=${sid} ORDER BY id DESC LIMIT 1`);
if (!snaps.length) { console.log("No snapshots"); process.exit(1); }
const snapId = snaps[0].values[0][0];
const snapDate = snaps[0].values[0][1];
console.log(`Snapshot ${snapId}, date: ${snapDate}`);

// Get snapshot stocks
const stocksRaw = db.exec(`SELECT stock_code, stock_name, price_at_snapshot FROM snapshot_stocks WHERE snapshot_id=${snapId}`);
const stocks = stocksRaw[0].values.map(r => ({
  rawCode: r[0], name: r[1], snapPrice: r[2],
  code: (r[0] || "").replace(/\.(SZ|SH|BJ)$/i, "")
}));
console.log(`${stocks.length} stocks`);

// Sina batch query
const BATCH = 50;
const prices = {};

for (let i = 0; i < stocks.length; i += BATCH) {
  const batch = stocks.slice(i, i + BATCH);
  const sinaCodes = batch.map(s => {
    const raw = s.rawCode || "";
    return raw.endsWith(".SZ") ? `sz${s.code}` : raw.endsWith(".BJ") ? `bj${s.code}` : `sh${s.code}`;
  });
  const url = `http://hq.sinajs.cn/list=${sinaCodes.join(",")}`;
  try {
    const resp = await fetch(url, { headers: { "Referer": "https://finance.sina.com.cn" }, signal: AbortSignal.timeout(10000) });
    const buffer = Buffer.from(await resp.arrayBuffer());
    const text = Iconv.decode(buffer, "gbk");
    for (const line of text.split("\n")) {
      const m = line.match(/hq_str_(s[hz]\d+)="([^"]+)"/);
      if (!m) continue;
      const parts = m[2].split(",");
      const code = m[1].replace(/^(sh|sz|bj)/, "");
      prices[code] = {
        name: parts[0], open: +parts[1], yc: +parts[2], cur: +parts[3],
        high: +parts[4], low: +parts[5], vol: +parts[8], amt: +parts[9]
      };
    }
    console.log(`  Batch ${i}: got ${Object.keys(prices).length} prices so far`);
  } catch(e) { console.log(`  Batch ${i}: error - ${e.message}`); }
}

console.log(`Total prices: ${Object.keys(prices).length}`);

// Calculate and rank
const results = [];
for (const s of stocks) {
  const p = prices[s.code];
  if (!p || !s.snapPrice || s.snapPrice <= 0 || !p.yc || p.yc <= 0) continue;
  const dayChange = (p.cur - p.yc) / p.yc * 100;
  // Check if hitting daily limit up (for 科创板/创业板 20%, 主板 10%)
  const isKCB = s.code.startsWith("688");
  const isCYB = s.code.startsWith("30");
  const isLimitUp = isKCB || isCYB ? dayChange >= 19.5 : dayChange >= 9.5;
  
  results.push({
    code: s.code, name: s.name,
    snapPrice: s.snapPrice, cur: p.cur, yc: p.yc,
    dayChange, high: p.high, low: p.low, open: p.open,
    vol: p.vol, amt: p.amt,
    isLimitUp
  });
}

results.sort((a, b) => b.dayChange - a.dayChange);

console.log("\n🔥 科技成长 Top 20 (按今日涨幅):");
console.log("代码      名称     现价     涨幅    成交量(万)  标记");
console.log("-".repeat(60));
for (const r of results.slice(0, 20)) {
  const tags = [];
  if (r.isLimitUp) tags.push("涨停");
  if (r.dayChange > 7) tags.push("领涨");
  if (r.vol > 50000000) tags.push("放量");
  console.log(`${r.code} ${r.name} ${r.cur.toFixed(2)} ${r.dayChange.toFixed(2)}% ${(r.vol/10000).toFixed(0)}万 ${tags.join(" ")}`);
}

// Output JSON for comprehensive analysis
console.log("\n===JSON===");
console.log(JSON.stringify(results.slice(0, 10).map(r => ({
  code: r.code, name: r.name, cur: r.cur, dayChange: r.dayChange,
  high: r.high, low: r.low, open: r.open, vol: r.vol
}))));
