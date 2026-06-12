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
