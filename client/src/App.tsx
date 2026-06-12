import { useState, FormEvent, useCallback } from "react";
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

  const handleSearch = useCallback(async (e?: FormEvent) => {
    e?.preventDefault();
    const q = query.trim();
    if (!q) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch(`/api/query?q=${encodeURIComponent(q)}&limit=50`);
      const json = await res.json();

      if (!res.ok || json.error) {
        setError(json.error || "查询失败");
      } else {
        setResult(json);
        if (json.data?.length > 0) {
          setColumns(Object.keys(json.data[0]));
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "网络错误");
    } finally {
      setLoading(false);
    }
  }, [query]);

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
        </div>
      </nav>

      {/* Hero */}
      <section className="hero">
        <h1 className="hero-title">
          用自然语言查询
          <br />
          <span className="hero-highlight">A 股市场数据</span>
        </h1>
        <p className="hero-desc">
          问财数据引擎 · 实时行情 · 智能筛选
        </p>

        {/* Search */}
        <form className="search-form" onSubmit={handleSearch}>
          <div className="search-bar">
            <input
              className="search-input"
              type="text"
              placeholder='输入查询，例如 "北向资金流向"'
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSearch()}
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

        {/* Suggestions */}
        <div className="suggestions">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              className="suggestion-chip"
              onClick={() => {
                setQuery(s);
                setTimeout(() => {
                  const form = document.querySelector(".search-form") as HTMLFormElement;
                  form?.requestSubmit();
                }, 50);
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
