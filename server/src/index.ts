import express from "express";
import cors from "cors";
import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

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

// API: query wencai
app.get("/api/query", (req, res) => {
  const query = (req.query.q as string || "").trim();
  if (!query) {
    return res.status(400).json({ error: "请输入查询条件" });
  }

  const limit = parseInt(req.query.limit as string) || 50;
  const scriptPath = path.resolve(__dirname, "../../wencai.py");

  console.log(`[query] "${query}" (limit=${limit})`);

  const python = spawn("python3", [scriptPath, query, "--json", "-l", String(limit)], {
    cwd: path.dirname(scriptPath),
    timeout: 60000,
  });

  let stdout = "";
  let stderr = "";

  python.stdout.on("data", (data) => {
    stdout += data.toString();
  });

  python.stderr.on("data", (data) => {
    stderr += data.toString();
  });

  python.on("close", (code) => {
    if (code !== 0) {
      console.error(`[error] exit code ${code}: ${stderr.slice(0, 200)}`);
      return res.status(500).json({ error: "查询失败", detail: stderr.slice(0, 500) });
    }

    try {
      // Find the valid JSON in stdout (ignore warnings from stderr-like output)
      const jsonStart = stdout.indexOf("[");
      const jsonEnd = stdout.lastIndexOf("]");
      const jsonStart2 = stdout.indexOf("{");

      let jsonStr = "";
      if (jsonStart !== -1 && jsonEnd !== -1) {
        jsonStr = stdout.slice(jsonStart, jsonEnd + 1);
      } else if (jsonStart2 !== -1) {
        jsonStr = stdout.slice(jsonStart2);
      } else {
        return res.status(500).json({ error: "无法解析结果" });
      }

      const data = JSON.parse(jsonStr);
      const dataArray = Array.isArray(data) ? data : [];

      res.json({
        success: true,
        total: dataArray.length,
        limit,
        query,
        data: dataArray,
      });
    } catch (e: any) {
      console.error(`[parse error]`, e.message);
      res.status(500).json({ error: "结果解析失败", detail: e.message });
    }
  });

  python.on("error", (err) => {
    console.error(`[spawn error]`, err.message);
    res.status(500).json({ error: "进程启动失败", detail: err.message });
  });
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
});
