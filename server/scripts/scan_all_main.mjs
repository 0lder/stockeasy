// Scan ALL strategies - 主板 only (no 科创板 688, no 创业板 300)
import initSqlJs from "sql.js";
import fs from "fs";
import Iconv from "iconv-lite";

const SQL = await initSqlJs();
const buf = fs.readFileSync("/app/working/workspaces/default/stockeasy/data/history.db");
const db = new SQL.Database(buf);

// Get all strategies
const strats = db.exec("SELECT id, name, group_name FROM strategies");
const allStocks = [];

for (const [sid, sname, sgroup] of strats[0].values) {
  const snaps = db.exec(`SELECT id, snapshot_date FROM strategy_snapshots WHERE strategy_id=${sid} ORDER BY id DESC LIMIT 1`);
  if (!snaps.length) continue;
  const snapId = snaps[0].values[0][0];
  const stocksRaw = db.exec(`SELECT stock_code, stock_name, price_at_snapshot FROM snapshot_stocks WHERE snapshot_id=${snapId}`);
  for (const r of stocksRaw[0].values) {
    const code = (r[0] || "").replace(/\.(SZ|SH|BJ)$/i, "");
    // Main board: 60xxxx or 00xxxx (exclude 科创板 688xxx, 创业板 300xxx, 北交所)
    if ((code.startsWith("60") || code.startsWith("00")) && !code.startsWith("688") && !code.startsWith("300")) {
      allStocks.push({
        rawCode: r[0], code, name: r[1].toString().trim(), priceSnap: r[2],
        strategy: sname.toString(), group: sgroup.toString()
      });
    }
  }
}

console.log(`Total 主板 stocks across ${strats[0].values.length} strategies: ${allStocks.length}`);

// Sina batch query
const BATCH = 80;
const prices = {};
for (let i = 0; i < allStocks.length; i += BATCH) {
  const batch = allStocks.slice(i, i + BATCH);
  const sinaCodes = batch.map(s => s.rawCode.endsWith(".SZ") ? `sz${s.code}` : `sh${s.code}`);
  const url = `http://hq.sinajs.cn/list=${sinaCodes.join(",")}`;
  try {
    const resp = await fetch(url, { headers: { "Referer": "https://finance.sina.com.cn" }, signal: AbortSignal.timeout(15000) });
    const buffer = Buffer.from(await resp.arrayBuffer());
    const text = Iconv.decode(buffer, "gbk");
    for (const line of text.split("\n")) {
      const m = line.match(/hq_str_(s[hz]\d+)="([^"]+)"/);
      if (!m) continue;
      const parts = m[2].split(",");
      const code = m[1].replace(/^(sh|sz|bj)/, "");
      prices[code] = {
        name: parts[0].trim(), open: +parts[1], yc: +parts[2], cur: +parts[3],
        high: +parts[4], low: +parts[5], vol: +parts[8], amt: +parts[9]
      };
    }
  } catch(e) { console.log(`Batch ${i}: error - ${e.message}`); }
}
console.log(`Got prices for ${Object.keys(prices).length} stocks`);

// Rank by day change
const results = [];
for (const s of allStocks) {
  const p = prices[s.code];
  if (!p || !p.yc || p.yc <= 0) continue;
  const dayChange = (p.cur - p.yc) / p.yc * 100;
  const isLimitUp = dayChange >= 9.5;
  // Score: positive change + volume confirmation
  const volScore = Math.min(p.vol / 100000000, 2); // cap at 2
  const score = dayChange + volScore; // simple composite
  
  results.push({
    code: s.code, name: s.name, strategy: s.strategy, group: s.group,
    cur: p.cur, dayChange, open: p.open, vol: p.vol,
    isLimitUp, score
  });
}

results.sort((a, b) => b.score - a.score);

console.log("\n=== 全策略主板股 Top 25 (综合评分) ===");
console.log("代码      名称         策略          现价      涨幅    成交量(万)  评分");
for (const r of results.slice(0, 25)) {
  const tags = [];
  if (r.isLimitUp) tags.push("涨停");
  if (r.dayChange > 7) tags.push("强");
  if (r.dayChange > 0 && r.dayChange < 5) tags.push("启");
  if (r.dayChange < 0) tags.push("跌");
  const v = (r.vol/10000).toFixed(0);
  console.log(`${r.code} ${r.name.padEnd(10)} ${r.strategy.padEnd(10)} ${r.cur.toFixed(2)} ${r.dayChange.toFixed(2)}% ${v.padStart(6)} ${r.score.toFixed(1)} ${tags.join(" ")}`);
}

// Also print candidates with positive dayChange sorted by volume
console.log("\n=== 高成交量 + 正涨幅 (稳健型) ===");
const posVol = results.filter(r => r.dayChange > 1 && r.dayChange < 7 && r.vol > 40000000).sort((a,b) => b.vol - a.vol);
for (const r of posVol) {
  const v = (r.vol/10000).toFixed(0);
  console.log(`${r.code} ${r.name.padEnd(10)} ${r.strategy.padEnd(10)} ${r.cur.toFixed(2)} ${r.dayChange.toFixed(2)}% ${v.padStart(6)}万`);
}
