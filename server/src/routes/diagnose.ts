import { Router } from "express";
import { queryWencai } from "../wencai.js";
import { getSetting } from "../database.js";

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

router.post("/api/diagnose/:code", async (req, res) => {
  try {
    const code = req.params.code.replace(/\.(SZ|SH|BJ)$/i, "");
    const name = (req.body?.name || code) as string;

    const apiKey = getSetting("ai_api_key");
    if (!apiKey) return res.status(400).json({ error: "请先在设置中配置 AI API Key" });
    const baseUrl = getSetting("ai_base_url") || "https://api.openai.com/v1";
    const model = getSetting("ai_model") || "gpt-4o-mini";

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
      let extractedCount = 0;
      for (const row of finResult.data) {
        for (const key of Object.keys(row)) {
          const val = row[key];
          if (Array.isArray(val)) {
            for (const item of val) {
              if (typeof item === "object" && item !== null) {
                let itemCode = "";
                let reportPeriod = "";
                const extracted: Record<string, string> = {};
                for (const mk of Object.keys(item)) {
                  const cleanKey = mk.replace(/^[^.]*?\[\d+\]\./, "");
                  if (cleanKey === "code" || cleanKey === "股票代码") itemCode = String(item[mk] || "");
                  else if (cleanKey === "报告期") reportPeriod = String(item[mk] || "");
                  else if (!["name", "domain", "type", "unit", "startDate", "endDate", "updateTime"].includes(cleanKey)) {
                    const unit = item.unit || "";
                    extracted[cleanKey] = String(item[mk]) + (unit ? unit : "");
                  }
                }
                if (itemCode && (itemCode.startsWith(code) || itemCode.replace(/\.(SZ|SH|BJ)$/i, "") === code)) {
                  const prefix = reportPeriod ? `[${reportPeriod}]` : "";
                  for (const [ek, ev] of Object.entries(extracted)) {
                    if (ev && ev !== "undefined" && ev !== "null" && ev !== "") {
                      if (!lines.some(l => l.includes(ek))) { lines.push(`${prefix} ${ek}: ${ev}`); extractedCount++; }
                    }
                  }
                }
              }
            }
          }
        }
      }
      console.log(`[diagnose] 提取到 ${extractedCount} 个财务指标`);
    }

    // Fallback: try more queries
    if (lines.length <= 2) {
      try {
        const more = await queryWencai(`${name} 净利润增长率`, 5);
        if (more.data) {
          for (const row of more.data) {
            for (const key of Object.keys(row)) {
              const val = row[key];
              if (Array.isArray(val)?.length > 0) {
                for (const item of val) {
                  if (typeof item === "object") {
                    for (const mk of Object.keys(item)) {
                      const cleanKey = mk.replace(/^[^.]*?\[\d+\]\./, "");
                      if (!["code", "name", "domain", "type", "unit", "startDate", "endDate", "updateTime", "报告期"].includes(cleanKey) && typeof item[mk] !== "object") {
                        const v = String(item[mk]).substring(0, 30);
                        if (v && v !== "undefined" && v !== "" && v !== "null") {
                          if (!lines.some(l => l.includes(cleanKey))) lines.push(`${cleanKey}: ${v}${item.unit || ""}`);
                          break;
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      } catch (e: any) { console.log("[diagnose] 补充查询失败:", e.message); }
    }

    const financials = lines.length > 0 ? lines.join("\n") : "暂无详细财务数据";
    console.log("[diagnose] 采集数据:", financials.replace(/\n/g, " | "));

    const { diagnoseStock } = await import("../ai.js");
    const result = await diagnoseStock(
      { apiKey, baseUrl, model },
      { code, name, financials, news: newsText || "暂无相关新闻" }
    );
    res.json(result);
  } catch (error: any) {
    console.error("[diagnose]", error.message);
    res.status(500).json({ error: "诊断失败: " + error.message });
  }
});

export default router;
