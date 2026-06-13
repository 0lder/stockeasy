/**
 * SQLite 查询历史存储 (纯 JS, 无需编译)
 * 使用 sql.js 实现，数据保存在内存 + 定时写入磁盘
 */

import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DB_PATH = path.resolve(__dirname, "../../data/history.db");

let db: SqlJsDatabase | null = null;

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();

  // 确保 data 目录存在
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // 尝试从磁盘加载已有数据库
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS query_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      query TEXT NOT NULL,
      result_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success',
      error_msg TEXT,
      elapsed_ms INTEGER,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 策略表
  db.run(`
    CREATE TABLE IF NOT EXISTS strategies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      query_text TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      group_name TEXT DEFAULT '默认',
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 自选股表
  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      note TEXT DEFAULT '',
      group_name TEXT DEFAULT '默认',
      added_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 迁移：添加告警相关列（兼容已有数据库）
  const watchlistCols = db.exec("PRAGMA table_info(watchlist)").flatMap((r: any) => r.values.map((v: any) => v[1]));
  if (!watchlistCols.includes("price_at_add")) {
    db.run("ALTER TABLE watchlist ADD COLUMN price_at_add REAL");
  }
  if (!watchlistCols.includes("alert_up")) {
    db.run("ALTER TABLE watchlist ADD COLUMN alert_up REAL");
  }
  if (!watchlistCols.includes("alert_down")) {
    db.run("ALTER TABLE watchlist ADD COLUMN alert_down REAL");
  }
  if (!watchlistCols.includes("alert_triggered")) {
    db.run("ALTER TABLE watchlist ADD COLUMN alert_triggered INTEGER DEFAULT 0");
  }

  // 策略快照表
  db.run(`
    CREATE TABLE IF NOT EXISTS strategy_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      strategy_id INTEGER NOT NULL,
      snapshot_date TEXT NOT NULL,
      stock_count INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (strategy_id) REFERENCES strategies(id)
    )
  `);

  // 快照股票表
  db.run(`
    CREATE TABLE IF NOT EXISTS snapshot_stocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_id INTEGER NOT NULL,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      price_at_snapshot REAL,
      FOREIGN KEY (snapshot_id) REFERENCES strategy_snapshots(id)
    )
  `);

    // 告警设置表
  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      threshold_up REAL DEFAULT 10.0,
      threshold_down REAL DEFAULT -8.0,
      enabled INTEGER DEFAULT 1,
      last_triggered_up REAL,
      last_triggered_down REAL,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      updated_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // 保存到磁盘
  saveToDisk();

  // 定时保存 (每30秒)
  setInterval(saveToDisk, 30000);
  // 进程退出时保存
  process.on("exit", saveToDisk);
  process.on("SIGINT", () => { saveToDisk(); process.exit(); });
  process.on("SIGTERM", () => { saveToDisk(); process.exit(); });

  console.log(`📦 SQLite database ready at ${DB_PATH}`);
}

function saveToDisk(): void {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  } catch (err) {
    console.error("[db] Failed to save database:", err);
  }
}

// ============================================================
// Query History
// ============================================================

export interface QueryRecord {
  id: number;
  query: string;
  result_count: number;
  status: string;
  error_msg: string | null;
  elapsed_ms: number | null;
  created_at: string;
}

export function recordQuery(
  query: string,
  resultCount: number,
  status: string = "success",
  errorMsg?: string,
  elapsedMs?: number
): number {
  if (!db) throw new Error("Database not initialized");

  const stmt = db.prepare(`
    INSERT INTO query_history (query, result_count, status, error_msg, elapsed_ms)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run([query, resultCount, status, errorMsg || null, elapsedMs || null]);
  stmt.free();

  const id = (db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0]) as number;
  return id;
}

export function getQueryHistory(
  page: number = 1,
  pageSize: number = 20
): { records: QueryRecord[]; total: number; page: number; pageSize: number } {
  if (!db) throw new Error("Database not initialized");

  // 总数
  const countResult = db.exec("SELECT COUNT(*) as total FROM query_history");
  const total = countResult[0]?.values[0][0] as number || 0;

  // 分页查询 (倒序，最新的在前)
  const offset = (page - 1) * pageSize;
  const stmt = db.prepare(`
    SELECT id, query, result_count, status, error_msg, elapsed_ms, created_at
    FROM query_history
    ORDER BY id DESC
    LIMIT ? OFFSET ?
  `);
  stmt.bind([pageSize, offset]);

  const records: QueryRecord[] = [];
  while (stmt.step()) {
    const row = stmt.getAsObject() as any;
    records.push({
      id: row.id,
      query: row.query,
      result_count: row.result_count,
      status: row.status,
      error_msg: row.error_msg,
      elapsed_ms: row.elapsed_ms,
      created_at: row.created_at,
    });
  }
  stmt.free();

  return { records, total, page, pageSize };
}

export function deleteQueryHistory(id: number): boolean {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM query_history WHERE id = ?", [id]);
  saveToDisk();
  return true;
}

export function clearQueryHistory(): void {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM query_history");
  saveToDisk();
}

export function getLatestQuery(): QueryRecord | null {
  if (!db) return null;
  const stmt = db.prepare(`
    SELECT id, query, result_count, status, error_msg, elapsed_ms, created_at
    FROM query_history
    ORDER BY id DESC
    LIMIT 1
  `);
  stmt.bind([]);
  let record: QueryRecord | null = null;
  if (stmt.step()) {
    const row = stmt.getAsObject() as any;
    record = {
      id: row.id,
      query: row.query,
      result_count: row.result_count,
      status: row.status,
      error_msg: row.error_msg,
      elapsed_ms: row.elapsed_ms,
      created_at: row.created_at,
    };
  }
  stmt.free();
  return record;
}

// ============================================================
// Strategies (策略管理)
// ============================================================

export interface Strategy {
  id: number;
  name: string;
  description: string;
  query_text: string;
  tags: string;
  group_name: string;
  created_at: string;
  updated_at: string;
}

export function createStrategy(
  name: string,
  queryText: string,
  description: string = "",
  tags: string[] = [],
  groupName: string = "默认"
): number {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare(`
    INSERT INTO strategies (name, description, query_text, tags, group_name)
    VALUES (?, ?, ?, ?, ?)
  `);
  stmt.run([name, description, queryText, JSON.stringify(tags), groupName]);
  stmt.free();
  return (db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0]) as number;
}

export function getStrategies(): Strategy[] {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM strategies ORDER BY updated_at DESC");
  stmt.bind([]);
  const rows: Strategy[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as any);
  stmt.free();
  return rows;
}

export function updateStrategy(id: number, data: { name?: string; description?: string; query_text?: string; tags?: string[]; group_name?: string }): boolean {
  if (!db) throw new Error("Database not initialized");
  const fields: string[] = [];
  const values: any[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
  if (data.query_text !== undefined) { fields.push("query_text = ?"); values.push(data.query_text); }
  if (data.tags !== undefined) { fields.push("tags = ?"); values.push(JSON.stringify(data.tags)); }
  if (data.group_name !== undefined) { fields.push("group_name = ?"); values.push(data.group_name); }
  fields.push("updated_at = datetime('now', 'localtime')");
  values.push(id);
  db.run(`UPDATE strategies SET ${fields.join(", ")} WHERE id = ?`, values);
  saveToDisk();
  return true;
}

export function deleteStrategy(id: number): boolean {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM strategies WHERE id = ?", [id]);
  saveToDisk();
  return true;
}

// ============================================================
// Watchlist (自选股)
// ============================================================

export interface WatchItem {
  id: number;
  stock_code: string;
  stock_name: string;
  note: string;
  group_name: string;
  added_at: string;
  price_at_add: number | null;
  alert_up: number | null;
  alert_down: number | null;
  alert_triggered: number;
}

export function addToWatchlist(stockCode: string, stockName: string, note: string = "", groupName: string = "默认", priceAtAdd?: number): number {
  if (!db) throw new Error("Database not initialized");
  // 查重
  const existing = db.exec("SELECT id FROM watchlist WHERE stock_code = ?", [stockCode]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return existing[0].values[0][0] as number;
  }
  const stmt = db.prepare("INSERT INTO watchlist (stock_code, stock_name, note, group_name, price_at_add) VALUES (?, ?, ?, ?, ?)");
  stmt.run([stockCode, stockName, note, groupName, priceAtAdd || null]);
  stmt.free();
  saveToDisk();
  return (db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0]) as number;
}

export function getWatchlist(): WatchItem[] {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM watchlist ORDER BY group_name, added_at DESC");
  stmt.bind([]);
  const rows: WatchItem[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as any);
  stmt.free();
  return rows;
}

export function updateWatchItem(id: number, data: { note?: string; group_name?: string }): boolean {
  if (!db) throw new Error("Database not initialized");
  const fields: string[] = [];
  const values: any[] = [];
  if (data.note !== undefined) { fields.push("note = ?"); values.push(data.note); }
  if (data.group_name !== undefined) { fields.push("group_name = ?"); values.push(data.group_name); }
  if (fields.length === 0) return true;
  values.push(id);
  db.run(`UPDATE watchlist SET ${fields.join(", ")} WHERE id = ?`, values);
  saveToDisk();
  return true;
}

export function removeFromWatchlist(id: number): boolean {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM watchlist WHERE id = ?", [id]);
  saveToDisk();
  return true;
}

export function getWatchlistGroups(): string[] {
  if (!db) throw new Error("Database not initialized");
  const result = db.exec("SELECT DISTINCT group_name FROM watchlist ORDER BY group_name");
  return result[0]?.values.map((v: any) => v[0]) || [];
}

// ============================================================
// Strategy Snapshots (策略快照)
// ============================================================

export interface StrategySnapshot {
  id: number;
  strategy_id: number;
  snapshot_date: string;
  stock_count: number;
  created_at: string;
}

export interface SnapshotStock {
  id: number;
  snapshot_id: number;
  stock_code: string;
  stock_name: string;
  price_at_snapshot: number | null;
}

// 创建快照
export function createSnapshot(strategyId: number, stocks: { code: string; name: string; price?: number }[]): number {
  if (!db) throw new Error("Database not initialized");
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10); // YYYY-MM-DD
  db.run("INSERT INTO strategy_snapshots (strategy_id, snapshot_date, stock_count) VALUES (?, ?, ?)",
    [strategyId, dateStr, stocks.length]);
  const snapshotId = (db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0]) as number;

  const stmt = db.prepare("INSERT INTO snapshot_stocks (snapshot_id, stock_code, stock_name, price_at_snapshot) VALUES (?, ?, ?, ?)");
  for (const s of stocks) {
    stmt.run([snapshotId, s.code, s.name, s.price || null]);
  }
  stmt.free();
  saveToDisk();
  return snapshotId;
}

// 获取策略的所有快照
export function getSnapshots(strategyId: number): StrategySnapshot[] {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM strategy_snapshots WHERE strategy_id = ? ORDER BY snapshot_date DESC, created_at DESC");
  stmt.bind([strategyId]);
  const rows: StrategySnapshot[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as any);
  stmt.free();
  return rows;
}

// 获取快照中的股票列表
export function getSnapshotStocks(snapshotId: number): SnapshotStock[] {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM snapshot_stocks WHERE snapshot_id = ?");
  stmt.bind([snapshotId]);
  const rows: SnapshotStock[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as any);
  stmt.free();
  return rows;
}

// 删除快照
export function deleteSnapshot(snapshotId: number): boolean {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM snapshot_stocks WHERE snapshot_id = ?", [snapshotId]);
  db.run("DELETE FROM strategy_snapshots WHERE id = ?", [snapshotId]);
  saveToDisk();
  return true;
}

// 获取所有快照（含策略名）
export function getAllSnapshots(): { id: number; strategy_id: number; strategy_name: string; snapshot_date: string; stock_count: number; created_at: string }[] {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare(`
    SELECT ss.*, s.name as strategy_name
    FROM strategy_snapshots ss
    JOIN strategies s ON s.id = ss.strategy_id
    ORDER BY ss.created_at DESC
  `);
  stmt.bind([]);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as any);
  stmt.free();
  return rows;
}


// ============================================================
// Alerts (涨跌告警)
// ============================================================

export interface Alert {
  id: number;
  stock_code: string;
  stock_name: string;
  threshold_up: number;
  threshold_down: number;
  enabled: number;
  last_triggered_up: number | null;
  last_triggered_down: number | null;
  created_at: string;
  updated_at: string;
}

// 获取所有告警
export function getAlerts(): Alert[] {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM alerts ORDER BY stock_code");
  stmt.bind([]);
  const rows: Alert[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as any);
  stmt.free();
  return rows;
}

// 创建告警
export function createAlert(stockCode: string, stockName: string, thresholdUp?: number, thresholdDown?: number): number {
  if (!db) throw new Error("Database not initialized");
  db.run(
    "INSERT INTO alerts (stock_code, stock_name, threshold_up, threshold_down) VALUES (?, ?, ?, ?)",
    [stockCode, stockName, thresholdUp ?? 10.0, thresholdDown ?? -8.0]
  );
  const id = (db.exec("SELECT last_insert_rowid() as id")[0]?.values[0][0]) as number;
  saveToDisk();
  return id;
}

// 更新告警
export function updateAlert(id: number, updates: Partial<{ threshold_up: number; threshold_down: number; enabled: number }>): void {
  if (!db) throw new Error("Database not initialized");
  const fields: string[] = [];
  const values: any[] = [];
  if (updates.threshold_up !== undefined) { fields.push("threshold_up = ?"); values.push(updates.threshold_up); }
  if (updates.threshold_down !== undefined) { fields.push("threshold_down = ?"); values.push(updates.threshold_down); }
  if (updates.enabled !== undefined) { fields.push("enabled = ?"); values.push(updates.enabled); }
  if (fields.length === 0) return;
  fields.push("updated_at = datetime('now', 'localtime')");
  values.push(id);
  db.run(`UPDATE alerts SET ${fields.join(", ")} WHERE id = ?`, values);
  saveToDisk();
}

// 更新触发记录
export function updateAlertTriggered(id: number, currentPrice: number, changePct: number): void {
  if (!db) throw new Error("Database not initialized");
  if (changePct > 0) {
    db.run("UPDATE alerts SET last_triggered_up = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [currentPrice, id]);
  } else {
    db.run("UPDATE alerts SET last_triggered_down = ?, updated_at = datetime('now', 'localtime') WHERE id = ?", [currentPrice, id]);
  }
  saveToDisk();
}

// 删除告警
export function deleteAlert(id: number): void {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM alerts WHERE id = ?", [id]);
  saveToDisk();
}

// 批量从自选股创建告警（不重复）
export function createAlertsFromWatchlist(stocks: { code: string; name: string }[]): number {
  if (!db) throw new Error("Database not initialized");
  let created = 0;
  const existing = new Set(getAlerts().map(a => a.stock_code));
  for (const s of stocks) {
    if (!existing.has(s.code)) {
      createAlert(s.code, s.name);
      created++;
    }
  }
  return created;
}

// ============================================================
// Settings 设置存储（AI 配置等）
// ============================================================

export function getSetting(key: string): string | null {
  if (!db) throw new Error("Database not initialized");
  try { db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)"); } catch { /* ok */ }
  const stmt = db.prepare("SELECT value FROM settings WHERE key = ?");
  stmt.bind([key]);
  if (stmt.step()) {
    const val = stmt.getAsObject() as { value: string };
    stmt.free();
    return val.value;
  }
  stmt.free();
  return null;
}

export function setSetting(key: string, value: string): void {
  if (!db) throw new Error("Database not initialized");
  db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
  db.run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [key, value]);
  saveToDisk();
}

export function deleteSetting(key: string): void {
  if (!db) throw new Error("Database not initialized");
  db.run("CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT)");
  db.run("DELETE FROM settings WHERE key = ?", [key]);
  saveToDisk();
}
