/**
 * AI 诊断客户端（兼容 OpenAI 协议）
 * 支持配置任意 OpenAI 兼容 API（base URL、API key、model）
 */

const DEFAULT_MODEL = "gpt-4o-mini";
const DEFAULT_BASE_URL = "https://api.openai.com/v1";

export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

export function getDefaultConfig(): AiConfig {
  return {
    apiKey: "",
    baseUrl: DEFAULT_BASE_URL,
    model: DEFAULT_MODEL,
  };
}

export async function diagnoseStock(
  config: AiConfig,
  stockInfo: { code: string; name: string; financials: string; news: string }
): Promise<{ score: number; recommendation: string; reason: string }> {
  const prompt = buildPrompt(stockInfo);
  console.log("[ai] prompt data length:", prompt.length, "financials:", stockInfo.financials.substring(0, 100));

  const body = {
    model: config.model,
    messages: [
      {
        role: "system",
        content: `你是一位专业的A股分析师。请基于提供的财务数据和时事新闻，对该股票进行全面诊断。
请返回 JSON 格式，不要包含其他内容：
{
  "score": 0-10之间的整数（10为最推荐），
  "recommendation": "推荐买入" | "谨慎持有" | "建议卖出" | "观望",
  "reason": "详细的分析理由，包含财务面、技术面、新闻面三个维度的分析，200-300字"
}

评分参考：
- 8-10：基本面优秀，新闻正面，强烈推荐
- 6-7：基本面良好，有一定亮点，可以关注
- 4-5：中性，有优点也有风险
- 2-3：基本面偏弱，风险较高
- 0-1：基本面差，风险大，不推荐`,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 1500,
  };

  const url = config.baseUrl.replace(/\/+$/, "") + "/chat/completions";

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer " + config.apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error("API error " + res.status + ": " + errText);
    }

    const data = await res.json();
    let content = data.choices?.[0]?.message?.content || "";

    // 提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("AI 返回格式异常");
    const result = JSON.parse(jsonMatch[0]);

    return {
      score: Math.max(0, Math.min(10, result.score || 5)),
      recommendation: result.recommendation || "观望",
      reason: result.reason || "暂无分析",
    };
  } catch (error: any) {
    throw new Error("诊断失败: " + error.message);
  }
}

function buildPrompt(info: { code: string; name: string; financials: string; news: string }): string {
  return `请对 A 股股票 ${info.name}（${info.code}）进行诊断。

## 财务数据
${info.financials || "暂无财务数据"}

## 近期相关新闻
${info.news || "暂无相关新闻"}

请综合以上信息，给出评分、推荐建议和详细分析理由。`;
}
