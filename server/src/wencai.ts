/**
 * Pure TypeScript implementation of pywencai
 * 
 * Replaces the Python pywencai package with a self-contained Node.js solution.
 * Uses hexin-v.bundle.js (同花顺反爬令牌生成) + native fetch for HTTP requests.
 * 
 * Features:
 * - Token caching: spawns hexin-v only once, caches and reuses
 * - Auto-retry: on 401, regenerates token and retries once
 * - Response normalization: all formats → flat { columns, data }
 * - Meaningful errors: includes query text + step info
 */

import { spawnSync } from "child_process";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BUNDLE_PATH = path.resolve(__dirname, "hexin-v.bundle.js");

// ============================================================
// 1. Token Generation (cached)
// ============================================================

let cachedToken: string | null = null;

function getHexinVToken(refresh = false): string {
  if (!refresh && cachedToken) return cachedToken;

  const result = spawnSync("node", [BUNDLE_PATH], {
    timeout: 10000,
    stdio: ["pipe", "pipe", "pipe"],
  });

  if (result.error) {
    throw new Error(`hexin-v token generation failed: ${result.error.message}`);
  }

  const token = result.stdout.toString().trim();
  if (!token) {
    throw new Error("Empty hexin-v token");
  }

  cachedToken = token;
  return token;
}

// ============================================================
// 2. HTTP Client with hexin-v header
// ============================================================

interface WencaiHeaders {
  "hexin-v": string;
  "User-Agent": string;
  cookie?: string;
  Referer?: string;
  "Content-Type"?: string;
  Accept?: string;
}

function buildHeaders(token: string, cookie?: string): WencaiHeaders {
  const userAgents = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  ];

  return {
    "hexin-v": token,
    "User-Agent": userAgents[Math.floor(Math.random() * userAgents.length)],
    "Content-Type": "application/json",
    Accept: "application/json, text/plain, */*",
    Referer: "http://www.iwencai.com/",
    ...(cookie ? { cookie } : {}),
  };
}

// ============================================================
// 3. Step 1: get-robot-data
// ============================================================

interface RobotDataParams {
  url_params: Record<string, string | string[]>;
  data: any;
  row_count?: number;
  url?: string;
}

async function fetchWencai(url: string, options: RequestInit & { queryLabel?: string, stepLabel?: string }): Promise<Response> {
  const doFetch = async (): Promise<Response> => {
    const res = await fetch(url, {
      ...options,
      signal: AbortSignal.timeout(15000),
    });
    return res;
  };

  let res = await doFetch();

  // 401 → token expired → refresh once and retry
  if (res.status === 401) {
    console.warn(`[wencai] Token expired (401), refreshing...`);
    getHexinVToken(true); // force refresh
    // rebuild headers with new token
    const newHeaders = options.headers as Record<string, string>;
    if (newHeaders) {
      newHeaders["hexin-v"] = cachedToken!;
    }
    res = await doFetch();
  }

  if (!res.ok) {
    const label = options.queryLabel ? ` query="${options.queryLabel}"` : "";
    throw new Error(`${options.stepLabel || "request"} failed: ${res.status}${label}`);
  }

  return res;
}

// ============================================================
// 3. Step 1: get-robot-data
// ============================================================

async function getRobotData(
  query: string,
  options?: { cookie?: string; queryType?: string }
): Promise<RobotDataParams> {
  const token = getHexinVToken();
  const headers = buildHeaders(token, options?.cookie);

  const body = {
    add_info: JSON.stringify({
      urp: { scene: 1, company: 1, business: 1 },
      contentType: "json",
      searchInfo: true,
    }),
    perpage: "10",
    page: 1,
    source: "Ths_iwencai_Xuangu",
    log_info: JSON.stringify({ input_type: "click" }),
    version: "2.0",
    secondary_intent: options?.queryType || "stock",
    question: query,
  };

  const response = await fetchWencai(
    "http://www.iwencai.com/customized/chart/get-robot-data",
    {
      method: "POST",
      headers: headers as any,
      body: JSON.stringify(body),
      queryLabel: query,
      stepLabel: "get-robot-data",
    }
  );

  const raw = await response.json();
  const contentStr = raw?.data?.answer?.[0]?.txt?.[0]?.content;
  if (!contentStr) {
    throw new Error(`No content in get-robot-data response (query: "${query}")`);
  }

  const content = typeof contentStr === "string" ? JSON.parse(contentStr) : contentStr;
  const components = content.components || [];
  if (components.length === 0) {
    throw new Error("No components in response");
  }

  // Parse URL params from footer_info
  const footerUrl = components[0]?.config?.other_info?.footer_info?.url || "";
  const urlParams = parseUrlParams(footerUrl);

  const firstComp = components[0];
  const showType = firstComp?.show_type;

  if (showType === "xuangu_tableV1") {
    return {
      url_params: urlParams,
      data: {
        condition: firstComp?.data?.meta?.extra?.condition,
        comp_id: firstComp?.cid,
        uuid: firstComp?.puuid,
      },
      row_count: firstComp?.data?.meta?.extra?.row_count,
      url: footerUrl,
    };
  }

  // Multi-type handler
  const parsed = parseComponents(components);
  return {
    url_params: urlParams,
    data: parsed,
    url: footerUrl,
  };
}

// ============================================================
// 4. Step 2: getDataList / find
// ============================================================

interface QueryOptions {
  cookie?: string;
  queryType?: string;
  perpage?: number;
  page?: number;
  find?: string;
}

async function getDataList(
  urlParams: Record<string, string | string[]>,
  options?: QueryOptions
): Promise<any[]> {
  const token = getHexinVToken();
  const headers = buildHeaders(token, options?.cookie);

  const data: Record<string, any> = {
    ...urlParams,
    perpage: options?.perpage || 100,
    page: options?.page || 1,
  };

  const targetUrl = "http://www.iwencai.com/gateway/urp/v7/landing/getDataList";
  const path = "answer.components.0.data.datas";

  const response = await fetchWencai(targetUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } as any,
    body: new URLSearchParams(data).toString(),
    stepLabel: "getDataList",
  });

  const raw = await response.json();
  const dataList = getNestedValue(raw, path);

  if (!dataList || !Array.isArray(dataList) || dataList.length === 0) {
    // Try alternative endpoint
    return getStockPickFind(urlParams, options);
  }

  return dataList;
}

async function getStockPickFind(
  urlParams: Record<string, string | string[]>,
  options?: QueryOptions
): Promise<any[]> {
  const token = getHexinVToken();
  const headers = buildHeaders(token, options?.cookie);

  const data: Record<string, any> = {
    ...urlParams,
    perpage: options?.perpage || 100,
    page: options?.page || 1,
    query_type: options?.queryType || "stock",
    question: options?.find || "",
  };

  const targetUrl = "http://www.iwencai.com/unifiedwap/unified-wap/v2/stock-pick/find";

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" } as any,
    body: new URLSearchParams(data).toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`stock-pick/find failed: ${response.status}`);
  }

  const raw = await response.json();
  const dataList = getNestedValue(raw, "data.data.datas");

  if (!dataList || !Array.isArray(dataList)) {
    return [];
  }

  return dataList;
}

// ============================================================
// 5. Pagination
// ============================================================

async function queryAll(
  query: string,
  options?: { limit?: number; cookie?: string }
): Promise<any[]> {
  const robotData = await getRobotData(query, options);
  const { url_params, row_count } = robotData;
  const condition = robotData.data?.condition;

  if (!condition) {
    return robotData.data ? [robotData.data] : [];
  }

  const perpage = 100;
  const maxRows = options?.limit || 50;
  const maxPages = Math.min(Math.ceil(maxRows / perpage), 5); // Max 5 pages

  let allData: any[] = [];

  for (let page = 1; page <= maxPages; page++) {
    const pageData = await getDataList(url_params, {
      ...options,
      perpage,
      page,
    });

    if (pageData.length === 0) break;
    allData = allData.concat(pageData);
    if (allData.length >= maxRows) break;
  }

  return allData.slice(0, maxRows);
}

// ============================================================
// 6. Response Normalization
//    Converts all response formats into flat { columns, data }
// ============================================================

interface NormalizedRow {
  [key: string]: any;
}

function normalizeData(rawData: any[]): NormalizedRow[] {
  if (!rawData || rawData.length === 0) return [];

  // Case 1: Row has 股票代码 directly (strategy query flat format)
  if (rawData[0].股票代码 && typeof rawData[0].股票代码 === "string") {
    return rawData.map(row => ({ ...row }));
  }

  // Case 2: tableV1 array (single stock code query)
  const tableV1 = rawData[0]?.tableV1;
  if (Array.isArray(tableV1) && tableV1.length > 0) {
    return tableV1.map((item: any) => ({
      股票代码: item.股票代码,
      股票简称: item.股票简称,
      最新价: item["收盘价:前复权"] || item.收盘价,
      最新涨跌幅: item["涨跌幅:前复权"] || item.涨跌幅,
    }));
  }

  // Case 3: Compound key arrays (multi-stock query)
  // Keys look like "盐津铺子、新锐股份收盘价:不复权、涨跌幅:前复权"
  const results: NormalizedRow[] = [];
  for (const row of rawData) {
    for (const key of Object.keys(row)) {
      if (Array.isArray(row[key])) {
        for (const item of row[key]) {
          if (item.代码 || item.股票代码) {
            results.push({
              股票代码: item.代码 || item.股票代码 || "",
              股票简称: item.名称 || item.股票简称 || "",
              最新价: item["收盘价:前复权"] || item.收盘价 || item["收盘价:不复权"] || "",
              最新涨跌幅: item["涨跌幅:前复权"] || item.涨跌幅 || "",
            });
          }
        }
      }
    }
  }
  if (results.length > 0) return results;

  // Case 4: Unknown format, return as-is
  return rawData;
}

// ============================================================
// 7. Public API
// ============================================================

function parseUrlParams(url: string): Record<string, string | string[]> {
  if (!url) return {};

  const params: Record<string, string | string[]> = {};
  const queryStart = url.indexOf("?");

  if (queryStart === -1) return params;

  const queryStr = url.slice(queryStart + 1);
  const pairs = queryStr.split("&");

  for (const pair of pairs) {
    const [key, ...rest] = pair.split("=");
    if (!key) continue;

    const decodedKey = decodeURIComponent(key);
    const value = rest.join("=");
    const decodedValue = decodeURIComponent(value);

    if (params[decodedKey] !== undefined) {
      const existing = params[decodedKey];
      params[decodedKey] = Array.isArray(existing)
        ? [...existing, decodedValue]
        : [existing as string, decodedValue];
    } else {
      params[decodedKey] = decodedValue;
    }
  }

  return params;
}

function getNestedValue(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => {
    if (acc === null || acc === undefined) return undefined;
    if (Array.isArray(acc)) {
      const index = parseInt(part, 10);
      if (!isNaN(index)) return acc[index];
      return acc.map((item: any) => item?.[part]).filter(Boolean);
    }
    return acc?.[part];
  }, obj);
}

function parseComponents(components: any[]): Record<string, any> {
  const result: Record<string, any> = {};

  for (const comp of components) {
    const showType = comp?.show_type;
    const key =
      comp?.title_config?.data?.h1 ||
      comp?.config?.title ||
      showType ||
      "unknown";

    const value = parseComponent(comp, components);
    if (value !== null && value !== undefined) {
      result[key] = value;
    }
  }

  return result;
}

function parseComponent(comp: any, components: any[]): any {
  const showType = comp?.show_type;

  switch (showType) {
    case "container": {
      const result: Record<string, any> = {};
      const children: string[] = comp?.config?.children || [];
      for (const uuid of children) {
        const child = components.find((c: any) => c.uuid === uuid);
        if (child) {
          const childKey = child.show_type || uuid;
          result[childKey] = parseComponent(child, components);
        }
      }
      return result;
    }

    case "txt1":
    case "txt2":
      return comp?.data?.content;

    case "tab4": {
      const result: Record<string, any> = {};
      const tabList = comp?.tab_list || [];
      for (const tab of tabList) {
        const tabName = tab?.tab_name;
        const tabComps = tab?.list || [];
        const tabResult: Record<string, any> = {};
        for (const tc of tabComps) {
          tabResult[tc.show_type] = parseComponent(tc, tabComps);
        }
        if (tabName) result[tabName] = tabResult;
      }
      return result;
    }

    case "tab1": {
      const result: Record<string, any> = {};
      const data = comp?.data || {};
      const tabList = comp?.tab_list || [];
      for (const tab of tabList) {
        const tabName = tab?.tab_name;
        const tabComps = tab?.list || [];
        const tabResult: Record<string, any> = {};
        for (const tc of tabComps) {
          const dataIndex = tc?.data_index;
          const tcData = dataIndex ? data[dataIndex] : null;
          if (tcData) tc.data = tcData;
          tabResult[tc.show_type] = parseComponent(tc, tabComps);
        }
        if (tabName) result[tabName] = tabResult;
      }
      return result;
    }

    default: {
      // common handler
      const datas = comp?.data?.datas;
      if (Array.isArray(datas)) return datas;
      return comp?.data;
    }
  }
}

// ============================================================
// 7. Public API
// ============================================================

export interface WencaiResult {
  success: boolean;
  total: number;
  query: string;
  data: Record<string, any>[];
}

export async function queryWencai(
  queryStr: string,
  limit: number = 50
): Promise<WencaiResult> {
  if (!queryStr || !queryStr.trim()) {
    throw new Error("Query string is required");
  }

  try {
    const rawData = await queryAll(queryStr.trim(), { limit });
    const data = normalizeData(rawData);

    return {
      success: true,
      total: data.length,
      query: queryStr,
      data: data,
    };
  } catch (error: any) {
    console.error(`[wencai] ❌ Query failed: "${queryStr}" — ${error.message}`);
    throw new Error(`查询失败: ${error.message}`);
  }
}

// Allow running directly
const isMain = process.argv[1]?.includes("wencai");
if (isMain) {
  const q = process.argv[2];
  if (!q) {
    console.error("Usage: tsx wencai.ts <query> [--limit N]");
    process.exit(1);
  }

  const limitIdx = process.argv.indexOf("--limit");
  const limit = limitIdx > 0 ? parseInt(process.argv[limitIdx + 1]) || 50 : 20;

  queryWencai(q, limit)
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
    })
    .catch((err) => {
      console.error(JSON.stringify({ success: false, error: err.message }));
      process.exit(1);
    });
}
