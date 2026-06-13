/**
 * Local A-share stock index for fast autocomplete search.
 * Generated from wencai data, cached in data/stocks.json.
 * Falls back to wencai query if not cached.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { queryWencai } from "./wencai.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_PATH = path.resolve(__dirname, "../../data/stocks.json");

interface StockItem {
  code: string;
  name: string;
}

let stockCache: StockItem[] | null = null;

/** 行业查询列表（覆盖不同板块，wencai 每段返回 200 只） */
const SECTOR_QUERIES = [
  "银行 股票代码 股票简称",
  "证券 股票代码 股票简称",
  "保险 股票代码 股票简称",
  "房地产 股票代码 股票简称",
  "半导体 股票代码 股票简称",
  "医药生物 股票代码 股票简称",
  "食品饮料 股票代码 股票简称",
  "汽车 股票代码 股票简称",
  "电力设备 股票代码 股票简称",
  "机械设备 股票代码 股票简称",
  "计算机 股票代码 股票简称",
  "国防军工 股票代码 股票简称",
  "电子 股票代码 股票简称",
  "有色金属 股票代码 股票简称",
  "基础化工 股票代码 股票简称",
  "建筑装饰 股票代码 股票简称",
  "交通运输 股票代码 股票简称",
  "传媒 股票代码 股票简称",
  "通信 股票代码 股票简称",
  "家用电器 股票代码 股票简称",
  "纺织服饰 股票代码 股票简称",
  "轻工制造 股票代码 股票简称",
  "商贸零售 股票代码 股票简称",
  "农林牧渔 股票代码 股票简称",
  "公用事业 股票代码 股票简称",
  "环保 股票代码 股票简称",
  "煤炭 股票代码 股票简称",
  "钢铁 股票代码 股票简称",
  "建筑材料 股票代码 股票简称",
  "石油化工 股票代码 股票简称",
  // 补充北交所/科创板
  "688 股票代码 股票简称",
  "北交所 股票代码 股票简称",
];

async function loadStockList(): Promise<StockItem[]> {
  if (stockCache) return stockCache;

  if (fs.existsSync(CACHE_PATH)) {
    try {
      const raw = fs.readFileSync(CACHE_PATH, "utf-8");
      stockCache = JSON.parse(raw);
      console.log(`[stock_index] 加载缓存 ${stockCache.length} 只股票`);
      return stockCache!;
    } catch { /* 缓存损坏则重建 */ }
  }

  console.log("[stock_index] 正在生成股票索引（按行业分段）...");
  const all = new Map<string, string>();

  for (const sector of SECTOR_QUERIES) {
    try {
      const result = await queryWencai(sector, 250);
      let added = 0;
      for (const row of result.data || []) {
        const code = (row.股票代码 || row.code || "").replace(/\.(SZ|SH|BJ)$/i, "");
        const name = row.股票简称 || row.name || "";
        if (code && name && /^\d{6}$/.test(code) && !all.has(code)) {
          all.set(code, name);
          added++;
        }
      }
      console.log(`  [${sector.split(" ")[0]}] +${added}（共 ${all.size}）`);
    } catch (e: any) {
      console.warn(`  [${sector.split(" ")[0]}] 查询失败: ${e.message}`);
    }
  }

  const list = Array.from(all.entries()).map(([code, name]) => ({ code, name }));
  list.sort((a, b) => a.code.localeCompare(b.code));

  try {
    fs.writeFileSync(CACHE_PATH, JSON.stringify(list, null, 0), "utf-8");
    console.log(`[stock_index] 缓存已保存: ${list.length} 只股票`);
  } catch (e) {
    console.warn("[stock_index] 缓存写入失败");
  }

  stockCache = list;
  return list;
}

export async function searchStocks(keyword: string): Promise<StockItem[]> {
  const kw = keyword.trim().toLowerCase();
  if (!kw) return [];

  // 精确代码匹配优先
  if (/^\d{6}$/.test(kw)) {
    const list = await loadStockList();
    const exact = list.find(s => s.code === kw);
    if (exact) return [exact];
  }

  const list = await loadStockList();

  // 代码前缀匹配
  if (/^\d+$/.test(kw)) {
    return list.filter(s => s.code.startsWith(kw)).slice(0, 10);
  }

  // 名称模糊匹配（包含关键字）
  const localResults = list.filter(s =>
    s.name.toLowerCase().includes(kw) ||
    s.code.includes(kw)
  ).slice(0, 10);

  // 如果本地找到足够结果，直接返回
  if (localResults.length >= 3) return localResults;

  // 不足则回退到 wencai 实时搜索补充
  try {
    const wc = await queryWencai(kw, 10);
    const seen = new Set(localResults.map(r => r.code));
    for (const row of wc.data || []) {
      const code = (row.股票代码 || row.code || "").replace(/\.(SZ|SH|BJ)$/i, "");
      const name = row.股票简称 || row.name || "";
      if (code && name && !seen.has(code)) {
        localResults.push({ code, name });
        seen.add(code);
      }
    }
  } catch { /* 忽略 */ }

  return localResults.slice(0, 10);
}
