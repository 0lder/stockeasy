import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { initDatabase } from "./database.js";
import { requestLogger } from "./middleware/request-logger.js";
import { errorHandler, notFound } from "./middleware/error-handler.js";

// Route modules
import authRouter from "./routes/auth.js";
import queryRouter from "./routes/query.js";
import strategiesRouter from "./routes/strategies.js";
import snapshotsRouter from "./routes/snapshots.js";
import watchlistRouter from "./routes/watchlist.js";
import alertsRouter from "./routes/alerts.js";
import holdingsRouter from "./routes/holdings.js";
import exportRouter from "./routes/export.js";
import stocksRouter from "./routes/stocks.js";
import diagnoseRouter from "./routes/diagnose.js";
import dashboardRouter from "./routes/dashboard.js";
import healthRouter from "./routes/health.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// --- Global middleware ---
app.use(cors());
app.use(express.json());
app.use(requestLogger);

// --- Static frontend ---
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// --- API routes ---
// Auth (no requireAuth — public)
app.use(authRouter);

// Stocks search & health are public
app.use(stocksRouter);
app.use(healthRouter);

// Protected routes (require auth via per-route middleware)
app.use(queryRouter);
app.use(strategiesRouter);
app.use(snapshotsRouter);
app.use(watchlistRouter);
app.use(alertsRouter);
app.use(holdingsRouter);
app.use(exportRouter);
app.use(diagnoseRouter);
app.use(dashboardRouter);

// --- 404 vs SPA fallback ---
app.use("/api", notFound);
app.get("*", (_req, res) => {
  const indexHtml = path.resolve(clientDist, "index.html");
  if (fs.existsSync(indexHtml)) {
    res.sendFile(indexHtml);
  } else {
    res.status(404).json({ error: "Frontend not built yet. Run: cd client && npm run build" });
  }
});

// --- Global error handler ---
app.use(errorHandler);

// --- Start ---
async function start() {
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`🚀 StockEasy server running at http://localhost:${PORT}`);
    console.log(`📡 纯 Node.js 引擎, 无需 Python 依赖`);
    console.log(`📦 SQLite 查询历史已启用`);
    console.log(`🔐 用户认证已启用`);
  });
}

start();
