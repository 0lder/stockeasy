import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { queryWencai } from "./wencai.js";
import { initDatabase, recordQuery, getQueryHistory, deleteQueryHistory, clearQueryHistory } from "./database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Serve built frontend
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// ============================================================
// API: Query
// ============================================================

app.get("/api/query", async (req, res) => {
  const query = (req.query.q as string || "").trim();
  if (!query) {
    return res.status(400).json({ error: "请输入查询条件" });
  }

  const limit = parseInt(req.query.limit as string) || 50;

  console.log(`[query] "${query}" (limit=${limit})`);

  const startTime = Date.now();

  try {
    const result = await queryWencai(query, limit);
    const elapsed = Date.now() - startTime;

    console.log(`[query] Done in ${elapsed}ms, ${result.total} results`);

    // 记录到历史
    recordQuery(query, result.total, "success", undefined, elapsed);

    res.json(result);
  } catch (error: any) {
    const elapsed = Date.now() - startTime;
    console.error(`[query] Failed: "${query}"`, error.message);

    // 记录失败历史
    recordQuery(query, 0, "error", error.message, elapsed);

    res.status(500).json({
      success: false,
      error: "查询失败",
      detail: error.message,
      query,
    });
  }
});

// ============================================================
// API: Query History
// ============================================================

// 获取历史记录
app.get("/api/history", (req, res) => {
  const page = parseInt(req.query.page as string) || 1;
  const pageSize = parseInt(req.query.pageSize as string) || 20;

  try {
    const result = getQueryHistory(page, pageSize);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({ error: "获取历史记录失败", detail: error.message });
  }
});

// 删除单条历史
app.delete("/api/history/:id", (req, res) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    return res.status(400).json({ error: "无效的 ID" });
  }

  try {
    deleteQueryHistory(id);
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "删除失败", detail: error.message });
  }
});

// 清空全部历史
app.delete("/api/history", (_req, res) => {
  try {
    clearQueryHistory();
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ error: "清空失败", detail: error.message });
  }
});

// ============================================================
// Health
// ============================================================

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// ============================================================
// SPA fallback
// ============================================================

app.get("*", (_req, res) => {
  const indexHtml = path.resolve(clientDist, "index.html");
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(404).json({ error: "Frontend not built yet. Run: cd client && npm run build" });
  }
});

// ============================================================
// Start
// ============================================================

async function start() {
  // 初始化数据库
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`🚀 StockEasy server running at http://localhost:${PORT}`);
    console.log(`📡 纯 Node.js 引擎, 无需 Python 依赖`);
    console.log(`📦 SQLite 查询历史已启用`);
  });
}

start();
