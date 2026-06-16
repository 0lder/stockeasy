/**
 * Price service — 统一股价查询
 *
 * 封装：本地 SQLite 缓存 + 新浪财经 API (hq.sinajs.cn) + GBK 解码
 * 所有需要查价的端点复用此服务。
 */

import { getCachedPrices, setCachedPrice } from "../database.js";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const Iconv = require("iconv-lite") as { decode: (buf: Buffer, enc: string) => string };

interface PriceResult {
  code: string;      // 纯数字代码 (无 .SZ/.SH)
  name: string;      // 股票名
  current: number;   // 最新价
  yest: number;      // 昨收
}

/**
 * 批量获取股票当前价格
 * @param codes  纯数字代码数组，如 ["000623", "600519"]
 * @returns      Map<code, {current, yest}>
 */
export async function fetchPrices(codes: string[]): Promise<Map<string, { current: number; yest: number }>> {
  const result = new Map<string, { current: number; yest: number }>();

  if (!codes.length) return result;

  // 1. Cache lookup
  const cached = getCachedPrices(codes);
  const needSina: string[] = [];

  for (const code of codes) {
    const hit = cached.get(code);
    if (hit) {
      result.set(code, { current: hit.current, yest: hit.yest });
    } else {
      needSina.push(code);
    }
  }

  // 2. Cache miss → batch query Sina
  if (needSina.length > 0) {
    const BATCH = 100;
    for (let i = 0; i < needSina.length; i += BATCH) {
      const batch = needSina.slice(i, i + BATCH);
      await querySinaBatch(batch, result);
    }
  }

  return result;
}

/**
 * 查询新浪 API 单批（最多 100 只）
 */
async function querySinaBatch(codes: string[], out: Map<string, { current: number; yest: number }>): Promise<void> {
  const sinaCodes = codes.map(c => {
    if (c.startsWith("6")) return `sh${c}`;
    if (c.startsWith("4") || c.startsWith("8")) return `bj${c}`;
    return `sz${c}`;
  });

  const url = `http://hq.sinajs.cn/list=${sinaCodes.join(",")}`;

  try {
    const http = await import("http");
    const buffer = await new Promise<Buffer>((resolve, reject) => {
      http.get(url, { headers: { "Referer": "https://finance.sina.com.cn" } }, (r: any) => {
        const chunks: Buffer[] = [];
        r.on("data", (c: Buffer) => chunks.push(c));
        r.on("end", () => resolve(Buffer.concat(chunks)));
      }).on("error", reject);
    });

    const data = Iconv.decode(buffer, "gbk");
    for (const line of data.split("\n")) {
      if (!line.trim()) continue;
      const m = line.match(/hq_str_(s[hz]\d+)="([^"]+)"/);
      if (!m) continue;
      const parts = m[2].split(",");
      const code = m[1].replace(/^(sh|sz|bj)/, "");
      const cur = parseFloat(parts[3]);
      const yc = parseFloat(parts[2]);
      const name = parts[0];
      if (code && !isNaN(cur) && cur > 0) {
        out.set(code, { current: cur, yest: yc });
        setCachedPrice(code, name || "", cur, yc);
      }
    }
  } catch (_) {
    // skip failed batch
  }
}

/**
 * 将带后缀的代码（如 000623.SZ）转换为纯数字代码
 */
export function stripSuffix(raw: string): string {
  return (raw || "").replace(/\.(SZ|SH|BJ)$/i, "");
}
