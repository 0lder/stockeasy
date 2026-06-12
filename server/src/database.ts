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
}

export function addToWatchlist(stockCode: string, stockName: string, note: string = "", groupName: string = "默认"): number {
  if (!db) throw new Error("Database not initialized");
  // 查重
  const existing = db.exec("SELECT id FROM watchlist WHERE stock_code = ?", [stockCode]);
  if (existing.length > 0 && existing[0].values.length > 0) {
    return existing[0].values[0][0] as number;
  }
  const stmt = db.prepare("INSERT INTO watchlist (stock_code, stock_name, note, group_name) VALUES (?, ?, ?, ?)");
  stmt.run([stockCode, stockName, note, groupName]);
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
