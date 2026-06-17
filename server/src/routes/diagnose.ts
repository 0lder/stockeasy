import { Router } from "express";
import { queryWencai } from "../wencai.js";
import { getSetting } from "../database.js";
import { diagnoseStock, getDefaultConfig } from "../ai.js";
import { requireAuth } from "../middleware/auth.js";
import { asyncHandler } from "../middleware/async-handler.js";

const router = Router();

async function gatherNews(code: string, name: string): Promise<string> {
  try {
    const url = `https://searchapi.eastmoney.com/bgsearch/api?client=app&keyword=${encodeURIComponent(name + " " + code)}&page=1&size=5`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return "";
    const data = await res.json();
    if (data?.Data?.list) {
      return data.Data.list.slice(0, 5).map((item: any) => `[${item.date || "近期"}] ${item.title || ""}`).join("\n");
    }
    return "";
  } catch { return ""; }
}

router.post("/api/diagnose/:code", requireAuth, asyncHandler(async (req, res) => {
  const code = req.params.code.replace(/\.(SZ|SH|BJ)$/i, "");
  const name = (req.body?.name || code) as string;
  const userId = req.user!.userId;

  const apiKey = getSetting(userId, "ai_api_key");
  if (!apiKey) { res.status(400).json({ error: "请先在设置中配置 AI API Key" }); return; }
  const baseUrl = getSetting(userId, "ai_base_url") || "https://api.openai.com/v1";
  const model = getSetting(userId, "ai_model") || "gpt-4o-mini";

  const [priceResult, finResult, newsText] = await Promise.all([
    queryWencai(`${code} ${name}`, 5),
    queryWencai(`${name} 一季报 净利润增长率 营业收入 净利润 毛利率 净利率 资产负债率 ROE 每股收益`, 5),
    gatherNews(code, name),
  ]);

  const lines: string[] = [];
  if (priceResult.data?.length > 0) {
    const row = priceResult.data[0];
    if (row.股票代码) lines.push(`股票代码: ${row.股票代码}`);
    if (row.股票简称) lines.push(`股票简称: ${row.股票简称}`);
    if (row.最新价 && row.最新价 !== "") lines.push(`最新价: ${row.最新价}`);
    if (row.最新涨跌幅 && row.最新涨跌幅 !== "") lines.push(`最新涨跌幅: ${(row.最新涨跌幅 as number).toFixed(2)}%`);
  }

  if (finResult.data?.length > 0) {
    for (const row of finResult.data) {
      for (const key of Object.keys(row)) {
        const val = row[key];
        if (Array.isArray(val)) {
          for (const item of val) {
            if (typeof item === "object" && item !== null) {
              const extracted: Record<string, string> = {};
              for (const mk of Object.keys(item)) {
                const cleanKey = mk.replace(/^[^.]*?\[\d+\]\./, "");
                if (cleanKey === "code" || cleanKey === "股票代码") continue;
                if (cleanKey === "报告期") { extracted["报告期"] = String(item[mk] || ""); continue; }
                if (!["name", "domain", "type", "unit", "startDate", "endDate", "updateTime"].includes(cleanKey)) {
                  extracted[cleanKey] = String(item[mk] || "");
                }
              }
              if (Object.keys(extracted).length > 1) {
                lines.push(Object.entries(extracted).map(([k, v]) => `${k}: ${v}`).join(" | "));
              }
            }
          }
        }
      }
    }
  }

  const financials = lines.join("\n");
  const result = await diagnoseStock(
    { apiKey, baseUrl, model },
    { code, name, financials, news: newsText }
  );
  res.json({ code, name, diagnoses: [result] });
}));

export default router;
