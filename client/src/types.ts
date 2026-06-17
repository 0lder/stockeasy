// ---------- shared types ----------

export interface QueryResult {
  total: number;
  data: any[];
  columns?: { field: string; label: string; type?: string }[];
}

export interface HistoryRecord {
  id: number;
  query: string;
  result_count: number;
  status: string;
  error_msg: string | null;
  elapsed_ms: number | null;
  created_at: string;
}
