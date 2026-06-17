/**
 * SQLite database layer (sql.js in-memory + disk persistence).
 *
 * v2 changes:
 *  - User auth (users table, password hashing via bcryptjs)
 *  - user_id foreign key on all data tables
 *  - Price cache TTL (intraday only — re-fetch next day)
 */

import initSqlJs, { Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = path.resolve(__dirname, "../../data/history.db");

let db: SqlJsDatabase | null = null;

// ============================================================
// Init — create tables + migrate
// ============================================================

export async function initDatabase(): Promise<void> {
  const SQL = await initSqlJs();

  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // ---- Users ----
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT (datetime('now', 'localtime'))
    )
  `);

  // ---- Settings (per-user key-value) ----
  db.run(`
    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      UNIQUE(user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ---- Query history ----
  db.run(`
    CREATE TABLE IF NOT EXISTS query_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      query TEXT NOT NULL,
      result_count INTEGER DEFAULT 0,
      status TEXT DEFAULT 'success',
      error_msg TEXT,
      elapsed_ms INTEGER,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ---- Strategies ----
  db.run(`
    CREATE TABLE IF NOT EXISTS strategies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      query_text TEXT NOT NULL,
      tags TEXT DEFAULT '[]',
      group_name TEXT DEFAULT '默认',
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ---- Watchlist ----
  db.run(`
    CREATE TABLE IF NOT EXISTS watchlist (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      note TEXT DEFAULT '',
      group_name TEXT DEFAULT '默认',
      added_at DATETIME DEFAULT (datetime('now', 'localtime')),
      price_at_add REAL,
      alert_up REAL,
      alert_down REAL,
      alert_triggered INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ---- Strategy snapshots ----
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

  // ---- Snapshot stocks ----
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

  // ---- Holdings ----
  db.run(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      cost_price REAL NOT NULL,
      quantity INTEGER DEFAULT 1,
      note TEXT DEFAULT '',
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ---- Alerts ----
  db.run(`
    CREATE TABLE IF NOT EXISTS alerts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      stock_code TEXT NOT NULL,
      stock_name TEXT NOT NULL,
      threshold_up REAL DEFAULT 10.0,
      threshold_down REAL DEFAULT -8.0,
      enabled INTEGER DEFAULT 1,
      last_triggered_up REAL,
      last_triggered_down REAL,
      created_at DATETIME DEFAULT (datetime('now', 'localtime')),
      updated_at DATETIME DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // ---- Price cache ----
  db.run(`
    CREATE TABLE IF NOT EXISTS stock_prices (
      stock_code TEXT PRIMARY KEY,
      stock_name TEXT,
      current_price REAL,
      yesterday_close REAL,
      updated_at TEXT NOT NULL
    )
  `);

  // ---- Migration: add user_id columns to existing tables ----
  migrateAddColumn("query_history", "user_id", "INTEGER");
  migrateAddColumn("strategies", "user_id", "INTEGER");
  migrateAddColumn("watchlist", "user_id", "INTEGER");
  migrateAddColumn("holdings", "user_id", "INTEGER");
  migrateAddColumn("alerts", "user_id", "INTEGER");

  // ---- Migration: add missing columns on watchlist ----
  for (const col of ["price_at_add", "alert_up", "alert_down", "alert_triggered"]) {
    migrateAddColumn("watchlist", col, "price_at_add" === col || "alert_up" === col || "alert_down" === col ? "REAL" : "INTEGER DEFAULT 0");
  }

  saveToDisk();
  setInterval(saveToDisk, 30000);
  process.on("exit", saveToDisk);
  process.on("SIGINT", () => { saveToDisk(); process.exit(); });
  process.on("SIGTERM", () => { saveToDisk(); process.exit(); });

  console.log(`📦 SQLite database ready at ${DB_PATH}`);
}

// ============================================================
// Migration helper
// ============================================================

function migrateAddColumn(table: string, col: string, type: string): void {
  if (!db) return;
  try {
    const existing = db.exec(`PRAGMA table_info(${table})`);
    const cols = existing.flatMap((r: any) => r.values.map((v: any) => v[1]));
    if (!cols.includes(col)) {
      db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${type}`);
      console.log(`[db migration] Added ${table}.${col}`);
    }
  } catch (e: any) {
    console.error(`[db migration] Failed for ${table}.${col}: ${e.message}`);
  }
}

// ============================================================
// Disk persistence
// ============================================================

function saveToDisk(): void {
  if (!db) return;
  try {
    fs.writeFileSync(DB_PATH, Buffer.from(db.export()));
  } catch (err) {
    console.error("[db] Failed to save database:", err);
  }
}

// ============================================================
// Users
// ============================================================

export interface User {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
}

/** Return the last inserted rowid from the most recent INSERT on this connection */
function getLastInsertId(): number {
  if (!db) throw new Error("Database not initialized");
  const r = db.exec("SELECT last_insert_rowid() AS id");
  if (!r.length || !r[0].values.length) return 0;
  const id = r[0].values[0][0];
  return typeof id === "number" ? id : Number(id) || 0;
}

export function createUser(username: string, passwordHash: string): number {
  if (!db) throw new Error("Database not initialized");
  db.run("INSERT INTO users (username, password_hash) VALUES (?, ?)", [username, passwordHash]);
  const id = getLastInsertId();
  saveToDisk();
  return id;
}

export function getUserByUsername(username: string): User | null {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM users WHERE username = ?");
  stmt.bind([username]);
  if (!stmt.step()) { stmt.free(); return null; }
  const row = stmt.getAsObject() as any;
  stmt.free();
  return { id: row.id as number, username: row.username as string, password_hash: row.password_hash as string, created_at: row.created_at as string };
}

export function getUserById(id: number): User | null {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM users WHERE id = ?");
  stmt.bind([id]);
  if (!stmt.step()) { stmt.free(); return null; }
  const row = stmt.getAsObject() as any;
  stmt.free();
  return { id: row.id as number, username: row.username as string, password_hash: row.password_hash as string, created_at: row.created_at as string };
}

// ============================================================
// Settings (per-user key-value)
// ============================================================

export function getSetting(userId: number, key: string): string | null {
  if (!db) throw new Error("Database not initialized");
  const r = db.exec("SELECT value FROM settings WHERE user_id = ? AND key = ?", [userId, key]);
  if (r.length === 0 || r[0].values.length === 0) return null;
  return r[0].values[0][0] as string;
}

export function setSetting(userId: number, key: string, value: string): void {
  if (!db) throw new Error("Database not initialized");
  db.run(
    "INSERT INTO settings (user_id, key, value) VALUES (?, ?, ?) ON CONFLICT(user_id, key) DO UPDATE SET value = ?",
    [userId, key, value, value]
  );
  saveToDisk();
}

// ============================================================
// Query History
// ============================================================

export function recordQuery(userId: number, query: string, resultCount: number, status = "success", errorMsg?: string, elapsedMs?: number): number {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("INSERT INTO query_history (user_id, query, result_count, status, error_msg, elapsed_ms) VALUES (?, ?, ?, ?, ?, ?)");
  stmt.run([userId, query, resultCount, status, errorMsg || null, elapsedMs || null]);
  stmt.free();
  return getLastInsertId();
}

export function getQueryHistory(userId: number, page = 1, pageSize = 20) {
  if (!db) throw new Error("Database not initialized");
  const offset = (page - 1) * pageSize;
  const stmt = db.prepare("SELECT * FROM query_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?");
  stmt.bind([userId, pageSize, offset]);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  const total = (db.exec("SELECT COUNT(*) FROM query_history WHERE user_id = ?", [userId])[0]?.values[0][0] || 0) as number;
  return { items: rows, total, page, pageSize };
}

export function deleteQueryHistory(userId: number, id: number): void {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM query_history WHERE id = ? AND user_id = ?", [id, userId]);
  saveToDisk();
}

export function clearQueryHistory(userId: number): void {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM query_history WHERE user_id = ?", [userId]);
  saveToDisk();
}

// ============================================================
// Strategies
// ============================================================

export interface Strategy {
  id: number;
  user_id: number;
  name: string;
  description: string;
  query_text: string;
  tags: string;
  group_name: string;
  created_at: string;
  updated_at: string;
}

export function createStrategy(userId: number, name: string, queryText: string, description = "", tags: string[] = [], groupName = "默认"): number {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("INSERT INTO strategies (user_id, name, description, query_text, tags, group_name) VALUES (?, ?, ?, ?, ?, ?)");
  stmt.run([userId, name, description, queryText, JSON.stringify(tags), groupName]);
  stmt.free();
  const id = getLastInsertId();
  saveToDisk();
  return id;
}

export function getStrategies(userId: number): Strategy[] {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM strategies WHERE user_id = ? ORDER BY updated_at DESC");
  stmt.bind([userId]);
  const rows: Strategy[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as any);
  stmt.free();
  return rows;
}

/** Get all strategies across all users (for scripts/cron reports) */
export function getAllStrategies(): Strategy[] {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM strategies ORDER BY id");
  const rows: Strategy[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject() as any);
  stmt.free();
  return rows;
}

export function getStrategyById(userId: number, id: number): Strategy | null {
  if (!db) throw new Error("Database not initialized");
  const r = db.exec("SELECT * FROM strategies WHERE id = ? AND user_id = ?", [id, userId]);
  if (r.length === 0 || r[0].values.length === 0) return null;
  const v = r[0].values[0];
  return { id: v[0], user_id: v[1], name: v[2], description: v[3], query_text: v[4], tags: v[5], group_name: v[6], created_at: v[7], updated_at: v[8] } as Strategy;
}

export function updateStrategy(userId: number, id: number, data: { name?: string; description?: string; query_text?: string; tags?: string[]; group_name?: string }): boolean {
  if (!db) throw new Error("Database not initialized");
  const fields: string[] = []; const values: any[] = [];
  if (data.name !== undefined) { fields.push("name = ?"); values.push(data.name); }
  if (data.description !== undefined) { fields.push("description = ?"); values.push(data.description); }
  if (data.query_text !== undefined) { fields.push("query_text = ?"); values.push(data.query_text); }
  if (data.tags !== undefined) { fields.push("tags = ?"); values.push(JSON.stringify(data.tags)); }
  if (data.group_name !== undefined) { fields.push("group_name = ?"); values.push(data.group_name); }
  fields.push("updated_at = datetime('now', 'localtime')");
  values.push(id, userId);
  db.run(`UPDATE strategies SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, values);
  saveToDisk();
  return true;
}

export function deleteStrategy(userId: number, id: number): boolean {
  if (!db) throw new Error("Database not initialized");
  // Also delete snapshots and snapshot_stocks
  db.run("DELETE FROM snapshot_stocks WHERE snapshot_id IN (SELECT id FROM strategy_snapshots WHERE strategy_id = ?)", [id]);
  db.run("DELETE FROM strategy_snapshots WHERE strategy_id = ?", [id]);
  db.run("DELETE FROM strategies WHERE id = ? AND user_id = ?", [id, userId]);
  saveToDisk();
  return true;
}

// ============================================================
// Snapshots
// ============================================================

export function createSnapshot(strategyId: number, stocks: { code: string; name: string; price: number }[]): number {
  if (!db) throw new Error("Database not initialized");
  const today = new Date().toISOString().slice(0, 10);
  db.run("INSERT INTO strategy_snapshots (strategy_id, snapshot_date, stock_count) VALUES (?, ?, ?)", [strategyId, today, stocks.length]);
  const snapId = getLastInsertId();
  const stmt = db.prepare("INSERT INTO snapshot_stocks (snapshot_id, stock_code, stock_name, price_at_snapshot) VALUES (?, ?, ?, ?)");
  for (const s of stocks) stmt.run([snapId, s.code, s.name, s.price || null]);
  stmt.free();
  saveToDisk();
  return snapId;
}

export function replaceSnapshot(strategyId: number, stocks: { code: string; name: string; price: number }[]): number {
  if (!db) throw new Error("Database not initialized");
  const today = new Date().toISOString().slice(0, 10);
  // Delete today's snapshot if exists
  db.run("DELETE FROM snapshot_stocks WHERE snapshot_id IN (SELECT id FROM strategy_snapshots WHERE strategy_id = ? AND snapshot_date = ?)", [strategyId, today]);
  db.run("DELETE FROM strategy_snapshots WHERE strategy_id = ? AND snapshot_date = ?", [strategyId, today]);
  return createSnapshot(strategyId, stocks);
}

export function getSnapshots(strategyId: number) {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM strategy_snapshots WHERE strategy_id = ? ORDER BY snapshot_date DESC");
  stmt.bind([strategyId]);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function getAllSnapshots(userId: number) {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare(`
    SELECT ss.*, s.name as strategy_name
    FROM strategy_snapshots ss
    JOIN strategies s ON s.id = ss.strategy_id
    WHERE s.user_id = ?
    ORDER BY ss.snapshot_date DESC
  `);
  stmt.bind([userId]);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function getSnapshotStocks(snapshotId: number) {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM snapshot_stocks WHERE snapshot_id = ?");
  stmt.bind([snapshotId]);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function deleteSnapshot(snapshotId: number): void {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM snapshot_stocks WHERE snapshot_id = ?", [snapshotId]);
  db.run("DELETE FROM strategy_snapshots WHERE id = ?", [snapshotId]);
  saveToDisk();
}

// ============================================================
// Watchlist
// ============================================================

export function addToWatchlist(userId: number, stockCode: string, stockName: string, note = "", groupName = "默认", priceAtAdd?: number): number {
  if (!db) throw new Error("Database not initialized");
  const existing = db.exec("SELECT id FROM watchlist WHERE stock_code = ? AND user_id = ?", [stockCode, userId]);
  if (existing.length > 0 && existing[0].values.length > 0) return existing[0].values[0][0] as number;
  db.run("INSERT INTO watchlist (user_id, stock_code, stock_name, note, group_name, price_at_add) VALUES (?, ?, ?, ?, ?, ?)", [userId, stockCode, stockName, note, groupName, priceAtAdd || null]);
  const id = getLastInsertId();
  saveToDisk();
  return id;
}

export function getWatchlist(userId: number) {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM watchlist WHERE user_id = ? ORDER BY added_at DESC");
  stmt.bind([userId]);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function getWatchlistGroups(userId: number): string[] {
  if (!db) throw new Error("Database not initialized");
  const r = db.exec("SELECT DISTINCT group_name FROM watchlist WHERE user_id = ?", [userId]);
  return r.flatMap(row => row.values.map(v => v[0] as string));
}

export function updateWatchItem(userId: number, id: number, data: Record<string, any>): void {
  if (!db) throw new Error("Database not initialized");
  const allowed = ["stock_name", "note", "group_name", "price_at_add", "alert_up", "alert_down", "alert_triggered"];
  const values: any[] = [];
  const setClauses: string[] = [];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (setClauses.length) {
    values.push(id, userId);
    db.run(`UPDATE watchlist SET ${setClauses.join(", ")} WHERE id = ? AND user_id = ?`, values);
    saveToDisk();
  }
}

export function removeFromWatchlist(userId: number, id: number): void {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM watchlist WHERE id = ? AND user_id = ?", [id, userId]);
  saveToDisk();
}

// ============================================================
// Holdings
// ============================================================

export function getHoldings(userId: number) {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM holdings WHERE user_id = ? ORDER BY created_at DESC");
  stmt.bind([userId]);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Get all holdings across all users (for cron/scripts) */
export function getAllHoldings() {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM holdings ORDER BY user_id, created_at DESC");
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function addHolding(userId: number, stockCode: string, stockName: string, costPrice: number, quantity = 1, note = "") {
  if (!db) throw new Error("Database not initialized");
  db.run("INSERT INTO holdings (user_id, stock_code, stock_name, cost_price, quantity, note) VALUES (?, ?, ?, ?, ?, ?)", [userId, stockCode, stockName, costPrice, quantity, note]);
  const id = getLastInsertId();
  saveToDisk();
  return { id };
}

export function updateHolding(userId: number, id: number, data: Record<string, any>): void {
  if (!db) throw new Error("Database not initialized");
  const allowed = ["stock_name", "cost_price", "quantity", "note"];
  const values: any[] = [];
  const setClauses: string[] = [];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (setClauses.length) {
    values.push(id, userId);
    db.run(`UPDATE holdings SET ${setClauses.join(", ")} WHERE id = ? AND user_id = ?`, values);
    saveToDisk();
  }
}

export function deleteHolding(userId: number, id: number): void {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM holdings WHERE id = ? AND user_id = ?", [id, userId]);
  saveToDisk();
}

// ============================================================
// Alerts
// ============================================================

export function getAlerts(userId: number) {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM alerts WHERE user_id = ? ORDER BY created_at DESC");
  stmt.bind([userId]);
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

/** Get all alerts across all users (for cron background checks) */
export function getAllAlerts() {
  if (!db) throw new Error("Database not initialized");
  const stmt = db.prepare("SELECT * FROM alerts ORDER BY user_id, created_at DESC");
  const rows: any[] = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

export function createAlert(userId: number, stockCode: string, stockName: string, thresholdUp?: number, thresholdDown?: number): number {
  if (!db) throw new Error("Database not initialized");
  db.run("INSERT INTO alerts (user_id, stock_code, stock_name, threshold_up, threshold_down) VALUES (?, ?, ?, ?, ?)", [userId, stockCode, stockName, thresholdUp ?? 10, thresholdDown ?? -8]);
  saveToDisk();
  return getLastInsertId();
}

export function updateAlert(userId: number, id: number, data: Record<string, any>): void {
  if (!db) throw new Error("Database not initialized");
  const allowed = ["threshold_up", "threshold_down", "enabled"];
  const values: any[] = [];
  const setClauses: string[] = [];
  for (const key of allowed) {
    if (data[key] !== undefined) {
      setClauses.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (setClauses.length) {
    setClauses.push("updated_at = datetime('now', 'localtime')");
    values.push(id, userId);
    db.run(`UPDATE alerts SET ${setClauses.join(", ")} WHERE id = ? AND user_id = ?`, values);
    saveToDisk();
  }
}

export function deleteAlert(userId: number, id: number): void {
  if (!db) throw new Error("Database not initialized");
  db.run("DELETE FROM alerts WHERE id = ? AND user_id = ?", [id, userId]);
  saveToDisk();
}

export function updateAlertTriggered(userId: number, id: number, direction: "up" | "down", timestamp: string): void {
  if (!db) throw new Error("Database not initialized");
  const col = direction === "up" ? "last_triggered_up" : "last_triggered_down";
  db.run(`UPDATE alerts SET ${col} = ? WHERE id = ? AND user_id = ?`, [timestamp, id, userId]);
  saveToDisk();
}

// ============================================================
// Price Cache (with TTL — same-day only)
// ============================================================

export function getCachedPrices(codes: string[]): Map<string, { current: number; yest: number }> {
  if (!db) return new Map();
  const result = new Map<string, { current: number; yest: number }>();
  if (!codes.length) return result;

  const CACHE_TTL_MS = 60000; // 60 seconds — during trading hours prices change fast
  const now = Date.now();
  const today = new Date().toISOString().slice(0, 10);
  const stmt = db.prepare("SELECT stock_code, current_price, yesterday_close, updated_at FROM stock_prices WHERE stock_code = ?");
  for (const code of codes) {
    stmt.bind([code]);
    if (stmt.step()) {
      const row = stmt.getAsObject() as any;
      // TTL check: same day AND less than 60 seconds old
      if (row.updated_at && row.updated_at.startsWith(today)) {
        const cachedAt = new Date(row.updated_at).getTime();
        if (now - cachedAt < CACHE_TTL_MS) {
          result.set(code, { current: row.current_price, yest: row.yesterday_close });
        }
      }
    }
    stmt.reset();
  }
  stmt.free();
  return result;
}

export function setCachedPrice(code: string, name: string, current: number, yest: number): void {
  if (!db) return;
  const now = new Date().toISOString();
  db.run(
    "INSERT INTO stock_prices (stock_code, stock_name, current_price, yesterday_close, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(stock_code) DO UPDATE SET stock_name=?, current_price=?, yesterday_close=?, updated_at=?",
    [code, name, current, yest, now, name, current, yest, now]
  );
}
