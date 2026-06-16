import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

import { initDatabase } from "./database.js";
import { errorHandler } from "./middleware/error-handler.js";

// Route modules
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

app.use(cors());
app.use(express.json());

// Static frontend
const clientDist = path.resolve(__dirname, "../../client/dist");
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
}

// Mount route modules
app.use(queryRouter);
app.use(strategiesRouter);
app.use(snapshotsRouter);
app.use(watchlistRouter);
app.use(alertsRouter);
app.use(holdingsRouter);
app.use(exportRouter);
app.use(stocksRouter);
app.use(diagnoseRouter);
app.use(dashboardRouter);
app.use(healthRouter);  // contains SPA fallback (*)

// Global error handler
app.use(errorHandler);

// Start
async function start() {
  await initDatabase();

  app.listen(PORT, () => {
    console.log(`🚀 StockEasy server running at http://localhost:${PORT}`);
    console.log(`📡 纯 Node.js 引擎, 无需 Python 依赖`);
    console.log(`📦 SQLite 查询历史已启用`);
  });
}

start();
