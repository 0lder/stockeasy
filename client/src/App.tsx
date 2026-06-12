import { useState, FormEvent, useCallback, useEffect } from "react";
import "./App.css";

interface StockItem {
  股票代码?: string;
  股票简称?: string;
  最新价?: string | number;
  最新涨跌幅?: string | number;
  涨跌幅?: string | number;
  成交量?: string | number;
  成交额?: string | number;
  市盈率?: string | number;
  所属行业?: string;
  [key: string]: unknown;
}

interface QueryResult {
  success: boolean;
  total: number;
  limit: number;
  query: string;
  data: StockItem[];
}

interface HistoryRecord {
  id: number;
  query: string;
  result_count: number;
  status: string;
  error_msg: string | null;
  elapsed_ms: number | null;
  created_at: string;
}

interface HistoryResponse {
  records: HistoryRecord[];
  total: number;
  page: number;
  pageSize: number;
}

const SUGGESTIONS = [
  "上证指数",
  "北向资金流向",
  "涨停股",
  "2025年一季度净利润增长率大于50%的股票",
  "光伏行业龙头",
  "市盈率低于20的消费股",
];

export default function App() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [columns, setColumns] = useState<string[]>([]);

  // History state
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);

  // 加载历史
  const loadHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/history?page=${page}&pageSize=20`);
      const json: HistoryResponse = await res.json();
      setHistory(json.records);
      setHistoryTotal(json.total);
      setHistoryPage(json.page);
    } catch {
      // ignore
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // 打开历史面板时加载
  useEffect(() => {
    if (showHistory) {
      loadHistory(1);
    }
  }, [showHistory, loadHistory]);

  const handleSearch = useCallback(async (q?: string) => {
    const searchQuery = q ?? query.trim();
    if (!searchQuery) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`/api/query?q=${encodeURIComponent(searchQuery)}&limit=50`);
      const json = await res.json();

      if (!res.ok || json.error) {
        setError(json.error || "查询失败");
      } else {
        setResult(json);
        if (json.data?.length > 0) {
          setColumns(Object.keys(json.data[0]));
        }
        // 查完后刷新历史
        if (showHistory) loadHistory(1);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setLoading(false);
    }
  }, [query, showHistory, loadHistory]);

  const handleFormSubmit = useCallback((e?: FormEvent) => {
    e?.preventDefault();
    handleSearch();
  }, [handleSearch]);

  // 点击历史记录重新查询
  const handleHistoryClick = useCallback((record: HistoryRecord) => {
    setQuery(record.query);
    setShowHistory(false);
    handleSearch(record.query);
  }, [handleSearch]);

  // 删除单条历史
  const handleDeleteHistory = useCallback(async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await fetch(`/api/history/${id}`, { method: "DELETE" });
    loadHistory(historyPage);
  }, [loadHistory, historyPage]);

  // 清空历史
  const handleClearHistory = useCallback(async () => {
    await fetch("/api/history", { method: "DELETE" });
    setHistory([]);
    setHistoryTotal(0);
    setHistoryPage(1);
  }, []);

  const formatValue = (val: unknown): string => {
    if (val === null || val === undefined) return "—";
    if (typeof val === "number") {
      return Number.isInteger(val) ? String(val) : val.toFixed(2);
    }
    return String(val);
  };

  const isNumberCol = (key: string): boolean => {
    if (!result?.data?.length) return false;
    const val = result.data[0][key];
    return typeof val === "number" || (typeof val === "string" && !isNaN(Number(val)));
  };

  const displayCols = columns.filter((c) => !["market_code", "code"].includes(c));

  return (
    <div className="app">
      {/* Nav */}
      <nav className="nav">
        <div className="nav-inner">
          <span className="nav-logo">📈 StockEasy</span>
          <span className="nav-subtitle">智能股票查询</span>
          <div className="nav-right">
            <button
              className={`history-btn ${showHistory ? "active" : ""}`}
              onClick={() => setShowHistory(!showHistory)}
              title="查询历史"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span className="history-btn-text">历史</span>
              {historyTotal > 0 && (
                <span className="history-badge">{historyTotal > 99 ? "99+" : historyTotal}</span>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* History Panel */}
      {showHistory && (
        <div className="history-overlay" onClick={() => setShowHistory(false)}>
          <aside className="history-panel" onClick={(e) => e.stopPropagation()}>
            <div className="history-header">
              <h2 className="history-title">查询历史</h2>
              <div className="history-actions">
                {history.length > 0 && (
                  <button className="history-clear-btn" onClick={handleClearHistory}>
                    清空
                  </button>
                )}
                <button className="history-close-btn" onClick={() => setShowHistory(false)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>

            {historyLoading ? (
              <div className="history-loading">
                <div className="loading-bar" />
                <p>加载中…</p>
              </div>
            ) : history.length === 0 ? (
              <div className="history-empty">
                <p>暂无查询记录</p>
                <p className="history-empty-hint">输入关键词搜索后，记录将出现在这里</p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((record) => (
                  <div
                    key={record.id}
                    className={`history-item ${record.status === "error" ? "error" : ""}`}
                    onClick={() => handleHistoryClick(record)}
                  >
                    <div className="history-item-top">
                      <span className="history-item-query">{record.query}</span>
                      <button
                        className="history-item-del"
                        onClick={(e) => handleDeleteHistory(record.id, e)}
                        title="删除"
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    </div>
                    <div className="history-item-meta">
                      {record.status === "error" ? (
                        <span className="history-status error">失败</span>
                      ) : (
                        <span className="history-status success">{record.result_count} 条</span>
                      )}
                      <span className="history-time">{record.created_at}</span>
                      {record.elapsed_ms != null && (
                        <span className="history-elapsed">{record.elapsed_ms}ms</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {historyTotal > 20 && (
              <div className="history-pagination">
                <button
                  disabled={historyPage <= 1}
                  onClick={() => loadHistory(historyPage - 1)}
                >
                  上一页
                </button>
                <span>{historyPage} / {Math.ceil(historyTotal / 20)}</span>
                <button
                  disabled={historyPage >= Math.ceil(historyTotal / 20)}
                  onClick={() => loadHistory(historyPage + 1)}
                >
                  下一页
                </button>
              </div>
            )}
          </aside>
        </div>
      )}

      {/* Hero + Search */}
      <section className="hero">
        <h1 className="hero-title">
          用自然语言查询
          <br />
          <span className="hero-highlight">A 股市场数据</span>
        </h1>
        <p className="hero-desc">
          问财数据引擎 · 实时行情 · 智能筛选
        </p>

        <form className="search-form" onSubmit={handleFormSubmit}>
          <div className="search-bar">
            <input
              className="search-input"
              type="text"
              placeholder='输入查询，例如 "北向资金流向"'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleFormSubmit()}
            />
            <button
              className="search-btn"
              type="submit"
              disabled={loading || !query.trim()}
            >
              {loading ? (
                <span className="spinner" />
              ) : (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
              )}
            </button>
          </div>
        </form>

        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="suggestion-chip"
              onClick={() => {
                setQuery(s);
                handleSearch(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </section>

      {/* Error */}
      {error && (
        <section className="section">
          <div className="error-card">
            <span className="error-icon">⚠️</span>
            <span>{error}</span>
          </div>
        </section>
      )}

      {/* Loading */}
      {loading && (
        <section className="section">
          <div className="loading-card">
            <div className="loading-bar" />
            <p>正在查询「{query}」…</p>
          </div>
        </section>
      )}

      {/* Results */}
      {result && !loading && (
        <section className="section">
          <div className="result-header">
            <h2 className="result-title">
              查询结果：<span className="result-query">"{result.query}"</span>
            </h2>
            <span className="result-count">
              共 {result.total} 条
            </span>
          </div>

          {result.data.length === 0 ? (
            <div className="empty-card">
              <p>暂无数据</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="row-num">#</th>
                    {displayCols.map((col) => (
                      <th key={col} className={isNumberCol(col) ? "num" : ""}>
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {result.data.map((row, i) => (
                    <tr key={i}>
                      <td className="row-num">{i + 1}</td>
                      {displayCols.map((col) => (
                        <td key={col} className={isNumberCol(col) ? "num" : ""}>
                          {formatValue(row[col])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* Footer */}
      <footer className="footer">
        <p>StockEasy · 数据来源：问财 · 仅供学习参考</p>
      </footer>
    </div>
  );
}
