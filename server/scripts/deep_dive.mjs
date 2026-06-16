// Deep-dive on top tech stocks
import initSqlJs from "sql.js";
import fs from "fs";
import Iconv from "iconv-lite";

const SQL = await initSqlJs();
const buf = fs.readFileSync("/app/working/workspaces/default/stockeasy/data/history.db");
const db = new SQL.Database(buf);

// Top stocks from scan
const topStocks = [
  "688143", "688343", "688207", "301389", "688182","300976","688191","301178","603115","300790"
];

// Get Sina prices for all top stocks
const sinaCodes = topStocks.map(c => `sh${c}`).join(",");
const url = `http://hq.sinajs.cn/list=${sinaCodes}`;
const resp = await fetch(url, { headers: { "Referer": "https://finance.sina.com.cn" }, signal: AbortSignal.timeout(10000) });
const buffer = Buffer.from(await resp.arrayBuffer());
const text = Iconv.decode(buffer, "gbk");

const prices = {};
for (const line of text.split("\n")) {
  const m = line.match(/hq_str_(s[hz]\d+)="([^"]+)"/);
  if (!m) continue;
  const parts = m[2].split(",");
  const code = m[1].replace(/^(sh|sz|bj)/, "");
  prices[code] = {
    name: parts[0], cur: +parts[3], yc: +parts[2], high: +parts[4], low: +parts[5],
    open: +parts[1], vol: +parts[8], amt: +parts[9],
    dayChange: (+parts[3] - +parts[2]) / +parts[2] * 100
  };
}

// Now get wencai financial data for top 5
const top5 = ["688143","688343","688207","301389","688182"];
for (const code of top5) {
  const name = prices[code]?.name || code;
  const p = prices[code];
  console.log(`\n=== ${code} ${name} ===`);
  console.log(`  现价: ${p.cur?.toFixed(2)}  昨收: ${p.yc?.toFixed(2)}  涨幅: ${p.dayChange?.toFixed(2)}%`);
  console.log(`  最高: ${p.high?.toFixed(2)}  最低: ${p.low?.toFixed(2)}  开盘: ${p.open?.toFixed(2)}`);
  console.log(`  成交量: ${(p.vol/10000)?.toFixed(0)}万  成交额: ${(p.amt/10000)?.toFixed(0)}万元`);
  
  // Check if limit up
  const isKCB = code.startsWith("688");
  const limitUp = isKCB ? 20 : 10;
  const nearLimit = p.dayChange >= limitUp * 0.95;
  if (nearLimit) console.log(`  ⚠️ 接近涨停(科创板±${limitUp}%)`);
}

// Now use wencai to query PE/revenue
console.log("\n\n========= 问财基本面查询 =========");

// Import wencai (need to be in stockeasy/server to resolve)
const { queryWencai } = await import("../src/wencai.js");
// Can't import from here... let me just use browser

console.log("Done price scan");
