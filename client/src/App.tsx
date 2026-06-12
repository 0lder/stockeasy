import { JSX, useState, useCallback, useEffect } from "react";
import Sidebar, { TabKey } from "./components/Sidebar";
import StrategyPanel from "./components/StrategyPanel";
import WatchlistPanel from "./components/WatchlistPanel";
import ConditionBuilder from "./components/ConditionBuilder";

// ---------- types ----------
interface QueryResult {
  total: number;
  data: any[];
  columns?: { field: string; label: string; type?: string }[];
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

// ---------- main ----------
export default function App(): JSX.Element {
  // Tab
  const [activeTab, setActiveTab] = useState<TabKey>("search");

  // Search state
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // History state
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);

  // ---------- search ----------
  const doSearch = useCallback(async (q: string, limit = 50) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setQuery(trimmed);
    setLoading(true);
    setError("");
    setResult(null);

    // 切回搜索 tab
    setActiveTab("search");

    try {
      const res = await fetch(`/api/query?q=${encodeURIComponent(trimmed)}&limit=${limit}`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || "查询失败");
      }
      const data = await res.json();
      setResult(data);
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // ---------- history ----------
  const fetchHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const res = await fetch(`/api/history?page=${page}&pageSize=20`);
      const data = await res.json();
      setHistory(data.records || []);
      setHistoryTotal(data.total || 0);
      setHistoryPage(data.page || 1);
    } catch (e) { console.error(e); }
    setHistoryLoading(false);
  }, []);

  const handleDeleteHistory = async (id: number) => {
    await fetch(`/api/history/${id}`, { method: "DELETE" });
    fetchHistory(historyPage);
  };

  const handleClearHistory = async () => {
    if (!confirm("确定清空所有查询历史？")) return;
    await fetch("/api/history", { method: "DELETE" });
    fetchHistory(1);
  };

  // 打开历史面板时加载
  useEffect(() => {
    if (showHistory) fetchHistory();
  }, [showHistory, fetchHistory]);

  // ---------- helpers ----------
  const isNumericCol = (col: any): boolean => {
    if (col.type === "number" || col.type === "float" || col.type === "int") return true;
    const nf = ["最新价", "最新涨跌幅", "市盈率", "市净率", "总市值", "流通市值", "净利润增长率", "营收增长率",
      "ROE", "毛利率", "净利率", "股息率", "换手率", "成交量", "成交额", "资产负债率", "每股收益", "每股净资产",
      "涨跌幅", "涨幅", "跌幅", "振幅", "量比", "委比", "流通股", "总股本", "净利润", "营业收入", "现金流",
      "百分位", "score", "价格", "主力净流入", "北向资金持股"];
    return nf.some(k => col.label?.includes(k) || col.field?.includes(k));
  };

  const formatCell = (row: any, col: any): { text: string; cls: string } => {
    const val = row[col.field] ?? row[col.label] ?? "-";
    if (val === null || val === undefined) return { text: "-", cls: "" };
    const num = Number(val);
    if (isNaN(num)) return { text: String(val), cls: "" };

    // 涨跌幅着色
    const isChange = col.label?.includes("涨跌") || col.field?.includes("change") || col.field?.includes("涨跌");
    if (isChange) {
      if (num > 0) return { text: `+${num.toFixed(2)}%`, cls: "up" };
      if (num < 0) return { text: `${num.toFixed(2)}%`, cls: "down" };
      return { text: `${num.toFixed(2)}%`, cls: "flat" };
    }

    // 百分比值
    if (col.label?.includes("率") || col.field?.includes("rate") || col.field?.includes("比")) {
      return { text: `${num.toFixed(2)}%`, cls: "" };
    }

    // 大数字格式化
    if (Math.abs(num) >= 100000000) return { text: `${(num / 100000000).toFixed(2)}亿`, cls: "num" };
    if (Math.abs(num) >= 10000) return { text: `${(num / 10000).toFixed(2)}万`, cls: "num" };
    if (Number.isInteger(num)) return { text: num.toLocaleString(), cls: "num" };
    return { text: num.toFixed(2), cls: "num" };
  };

  // ---------- render ----------
  const suggestions = ["上证指数", "北向资金流向", "涨停股", "2025年一季度净利润增长率大于50%的股票", "光伏行业龙头", "市盈率低于20的消费股"];

  const columns = result?.columns || (result?.data?.length ? Object.keys(result.data[0]).slice(0, 20).map(k => ({ field: k, label: k })) : []);

  return (
    <div className="app">
      {/* Navigation */}
      <nav className="nav">
        <div className="nav-inner">
          <a className="nav-logo" href="/">📈 StockEasy</a>
          <div className="nav-right">
            <button
              className={`history-btn ${showHistory ? "active" : ""}`}
              onClick={() => setShowHistory(!showHistory)}
              title="查询历史"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
              </svg>
              <span className="history-btn-text">历史</span>
              {historyTotal > 0 && <span className="history-badge">{historyTotal > 99 ? "99+" : historyTotal}</span>}
            </button>
          </div>
        </div>
      </nav>

      {/* Layout: Sidebar + Content */}
      <div className="app-layout">
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} badges={{ strategies: 0 }} />

        <main className="main-content">
          {activeTab === "search" && (
            <>
              {/* Hero */}
              <section className="hero">
                <h1 className="hero-title">用自然语言查询 A 股市场数据</h1>
                <p className="hero-desc">问财数据引擎 · 实时行情 · 智能筛选</p>

                <div className="search-bar-wrap">
                  <div className="search-bar">
                    <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                    </svg>
                    <input
                      className="search-input"
                      placeholder='输入查询，例如 "北向资金流向"'
                      value={query}
                      onChange={e => setQuery(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") doSearch(query); }}
                    />
                    <button className="search-btn" onClick={() => doSearch(query)} disabled={loading || !query.trim()}>
                      {loading ? <span className="spinner" /> : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>}
                    </button>
                  </div>

                  <div className="suggestions">
                    {suggestions.map(s => (
                      <button key={s} className="suggestion-chip" onClick={() => doSearch(s)}>{s}</button>
                    ))}
                  </div>
                </div>
              </section>

              {/* Results */}
              <section className="section">
                {loading && (
                  <div className="loading-card">
                    <div className="loading-bar" />
                    <span>正在问财数据引擎查询...</span>
                  </div>
                )}

                {error && (
                  <div className="error-card">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    <span>{error}</span>
                  </div>
                )}

                {result && !loading && (
                  <div className="result-section">
                    <div className="result-header">
                      <span className="result-title">查询结果</span>
                      <span className="result-count">共 {result.total} 条</span>
                    </div>

                    {result.data && result.data.length > 0 ? (
                      <div className="table-wrap">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th className="row-num">#</th>
                              {columns.map((col, i) => (
                                <th key={i} className={isNumericCol(col) ? "num" : ""}>{col.label || col.field}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {result.data.map((row, ri) => (
                              <tr key={ri}>
                                <td className="row-num">{ri + 1}</td>
                                {columns.map((col, ci) => {
                                  const { text, cls } = formatCell(row, col);
                                  return <td key={ci} className={cls}>{text}</td>;
                                })}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <div className="empty-card">暂无数据</div>
                    )}
                  </div>
                )}
              </section>
            </>
          )}

          {activeTab === "strategies" && <StrategyPanel onRunStrategy={doSearch} />}
          {activeTab === "watchlist" && <WatchlistPanel onSearch={doSearch} />}
          {activeTab === "builder" && <ConditionBuilder onQuery={doSearch} />}
        </main>
      </div>

      {/* History Overlay & Panel */}
      {showHistory && (
        <>
          <div className="history-overlay" onClick={() => setShowHistory(false)} />
          <div className="history-panel">
            <div className="history-header">
              <h3 className="history-title">查询历史</h3>
              <div className="history-actions">
                {historyTotal > 0 && <button className="history-clear-btn" onClick={handleClearHistory}>清空</button>}
                <button className="history-close-btn" onClick={() => setShowHistory(false)}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>

            {historyLoading ? (
              <div className="history-loading"><div className="loading-bar" />加载中...</div>
            ) : history.length === 0 ? (
              <div className="history-empty">
                <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" opacity="0.3"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <p>暂无查询记录</p>
                <p className="history-empty-hint">开始查询后，历史记录将自动保存到这里</p>
              </div>
            ) : (
              <div className="history-list">
                {history.map((r) => (
                  <div key={r.id} className={`history-item ${r.status === "error" ? "error" : ""}`}>
                    <div className="history-item-top">
                      <span className="history-item-query" onClick={() => { doSearch(r.query); setShowHistory(false); }}>{r.query}</span>
                      <button className="history-item-del" onClick={() => handleDeleteHistory(r.id)} title="删除">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>
                      </button>
                    </div>
                    <div className="history-item-meta">
                      <span className={`history-status ${r.status}`}>{r.status === "success" ? "成功" : "失败"}</span>
                      <span className="history-time">{r.created_at}</span>
                      {r.elapsed_ms != null && <span className="history-elapsed">{r.elapsed_ms}ms</span>}
                      {r.result_count > 0 && <span className="history-elapsed">{r.result_count} 条</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Pagination */}
            {historyTotal > 20 && (
              <div className="history-pagination">
                <button disabled={historyPage <= 1} onClick={() => fetchHistory(historyPage - 1)}>← 上一页</button>
                <span>第 {historyPage} / {Math.ceil(historyTotal / 20)} 页</span>
                <button disabled={historyPage >= Math.ceil(historyTotal / 20)} onClick={() => fetchHistory(historyPage + 1)}>下一页 →</button>
              </div>
            )}
          </div>
        </>
      )}

      {/* Footer */}
      <footer className="footer">
        StockEasy · 数据来源：问财 · 仅供学习参考
      </footer>
    </div>
  );
}
