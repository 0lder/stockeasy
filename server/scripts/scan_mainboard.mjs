// Scan tech stocks - 主板 only (exclude 创业板 30xxx, 科创板 688xxx)
import initSqlJs from "sql.js";
import fs from "fs";
import Iconv from "iconv-lite";

const SQL = await initSqlJs();
const buf = fs.readFileSync("/app/working/workspaces/default/stockeasy/data/history.db");
const db = new SQL.Database(buf);

const snapId = 37;
const stocksRaw = db.exec(`SELECT stock_code, stock_name, price_at_snapshot FROM snapshot_stocks WHERE snapshot_id=${snapId}`);
const allStocks = stocksRaw[0].values.map(r => ({
  rawCode: r[0], name: r[1], snapPrice: r[2],
  code: (r[0] || "").replace(/\.(SZ|SH|BJ)$/i, "")
}));

// Filter: keep only 主板 (600/601/603/605 + 000/001/002/003)
const mainBoard = allStocks.filter(s => {
  const c = s.code;
  return c.startsWith("60") || c.startsWith("00");
});

console.log(`All: ${allStocks.length}, 主板: ${mainBoard.length}`);
console.log(mainBoard.map(s => s.code + " " + s.name).join(", "));

// Sina query
const BATCH = 50;
const prices = {};
const stocks = mainBoard;

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
    let cnt = 0;
    for (const line of text.split("\n")) {
      const m = line.match(/hq_str_(s[hz]\d+)="([^"]+)"/);
      if (!m) continue;
      const parts = m[2].split(",");
      const code = m[1].replace(/^(sh|sz|bj)/, "");
      prices[code] = {
        name: parts[0], open: +parts[1], yc: +parts[2], cur: +parts[3],
        high: +parts[4], low: +parts[5], vol: +parts[8], amt: +parts[9],
        turnover: parts[7] // 换手率
      };
      cnt++;
    }
    console.log(`Batch ${i}: ${cnt} prices`);
  } catch(e) { console.log(`Batch ${i}: error`); }
}

// Rank
const results = [];
for (const s of stocks) {
  const p = prices[s.code];
  if (!p || !p.yc || p.yc <= 0) continue;
  const dayChange = (p.cur - p.yc) / p.yc * 100;
  const isLimitUp = dayChange >= 9.5; // 主板 10% 涨停
  results.push({
    code: s.code, name: s.name,
    cur: p.cur, yc: p.yc, dayChange,
    high: p.high, low: p.low, open: p.open,
    vol: p.vol, amt: p.amt, turnover: p.turnover,
    isLimitUp
  });
}

results.sort((a, b) => b.dayChange - a.dayChange);

console.log("\n=== 科技成长主板股 (剔除创业板/科创板) ===");
console.log(`${results.length} stocks with prices`);
for (const r of results) {
  const tags = [];
  if (r.isLimitUp) tags.push("⚠️涨停");
  if (r.dayChange > 7) tags.push("领涨");
  if (r.vol > 50000000) tags.push("放量");
  console.log(`${r.code} ${r.name.padEnd(8)} ${r.cur.toFixed(2)} ${r.dayChange.toFixed(2)}% ${(r.vol/10000).toFixed(0)}万 ${tags.join(" ")}`);
}
