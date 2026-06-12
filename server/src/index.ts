import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { queryWencai } from "./wencai.js";

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

// API: query wencai (纯 Node.js, 无需 Python)
app.get("/api/query", async (req, res) => {
  const query = (req.query.q as string || "").trim();
  if (!query) {
    return res.status(400).json({ error: "请输入查询条件" });
  }

  const limit = parseInt(req.query.limit as string) || 50;

  console.log(`[query] "${query}" (limit=${limit})`);

  try {
    const startTime = Date.now();
    const result = await queryWencai(query, limit);
    const elapsed = Date.now() - startTime;

    console.log(`[query] Done in ${elapsed}ms, ${result.total} results`);

    res.json(result);
  } catch (error: any) {
    console.error(`[query] Failed: "${query}"`, error.message);
    res.status(500).json({
      success: false,
      error: "查询失败",
      detail: error.message,
      query,
    });
  }
});

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Fallback to index.html for SPA
app.get("*", (_req, res) => {
  const indexHtml = path.resolve(clientDist, "index.html");
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(404).json({ error: "Frontend not built yet. Run: cd client && npm run build" });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 StockEasy server running at http://localhost:${PORT}`);
  console.log(`📡 纯 Node.js 引擎, 无需 Python 依赖`);
});
