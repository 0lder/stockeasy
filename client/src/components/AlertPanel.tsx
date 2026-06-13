import { JSX, useState, useEffect } from "react";

interface Alert {
  id: number;
  stock_code: string;
  stock_name: string;
  threshold_up: number;
  threshold_down: number;
  enabled: number;
  last_triggered_up: number | null;
  last_triggered_down: number | null;
  created_at: string;
}

export default function AlertPanel(): JSX.Element {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<any>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editUp, setEditUp] = useState("");
  const [editDown, setEditDown] = useState("");

  const fetchAlerts = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/alerts");
      setAlerts(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchAlerts(); }, []);

  const handleCheck = async () => {
    setChecking(true);
    setCheckResult(null);
    try {
      const res = await fetch("/api/alerts/check", { method: "POST" });
      const data = await res.json();
      setCheckResult(data);
      fetchAlerts(); // refresh last_triggered
    } catch (e) { console.error(e); }
    setChecking(false);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除该告警？")) return;
    await fetch(`/api/alerts/${id}`, { method: "DELETE" });
    fetchAlerts();
  };

  const handleToggleEnabled = async (a: Alert) => {
    await fetch(`/api/alerts/${a.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: a.enabled ? 0 : 1 }),
    });
    fetchAlerts();
  };

  const startEdit = (a: Alert) => {
    setEditingId(a.id);
    setEditUp(String(a.threshold_up));
    setEditDown(String(a.threshold_down));
  };

  const saveEdit = async (id: number) => {
    await fetch(`/api/alerts/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ threshold_up: parseFloat(editUp) || 10, threshold_down: parseFloat(editDown) || -8 }),
    });
    setEditingId(null);
    fetchAlerts();
  };

  const handleImportFromWatchlist = async () => {
    try {
      const res = await fetch("/api/alerts/from-watchlist", { method: "POST" });
      const data = await res.json();
      if (data.created > 0) alert(`已从自选股导入 ${data.created} 条告警`);
      else alert("自选股中的股票已有告警，无新增");
      fetchAlerts();
    } catch (e) { console.error(e); }
  };

  return (
    <div className="panel">
      <div className="panel-header">
        <div className="panel-title">🔔 涨跌告警</div>
        <div className="panel-subtitle">监控自选股涨跌，超阈值自动通知</div>
      </div>

      <div className="panel-actions" style={{ display: "flex", gap: 8, padding: "0 14px 12px" }}>
        <button className="btn btn-sm btn-secondary-sm" onClick={handleCheck} disabled={checking}>
          {checking ? "检查中..." : "🔄 检查告警"}
        </button>
        <button className="btn btn-sm btn-secondary-sm" onClick={handleImportFromWatchlist}>
          📥 从自选股导入
        </button>
      </div>

      {checkResult && (
        <div className="panel-section" style={{ margin: "0 14px 12px", padding: 10, background: "var(--gray-50)", borderRadius: 8, border: "1px solid var(--gray-100)" }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>检查结果</div>
          <div style={{ fontSize: 12, color: "var(--gray-500)" }}>
            检查 {checkResult.checked} 条告警
            {checkResult.triggered?.length > 0
              ? `，${checkResult.triggered.length} 条触发 🔔`
              : "，无触发 ✅"}
          </div>
          {checkResult.triggered?.map((t: any, i: number) => (
            <div key={i} style={{ fontSize: 12, marginTop: 4, padding: "4px 8px", background: "white", borderRadius: 4 }}>
              <span style={{ fontWeight: 600 }}>{t.stock_name}</span>
              <span style={{ color: t.direction === "down" ? "var(--green)" : "var(--red)" }}>
                {" "}{t.change > 0 ? "+" : ""}{t.change.toFixed(2)}%
              </span>
              <span style={{ color: "var(--gray-400)" }}> (阈值: {t.direction === "down" ? "跌破" : "涨超"}{t.threshold}%)</span>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="panel-loading">加载中...</div>
      ) : alerts.length === 0 ? (
        <div className="panel-empty">
          <p>暂无告警设置</p>
          <p style={{ fontSize: 12, color: "var(--gray-400)", marginTop: 4 }}>点击「从自选股导入」快速添加</p>
        </div>
      ) : (
        <div className="panel-section" style={{ padding: "0 14px" }}>
          {alerts.map((a) => (
            <div key={a.id} className="watchlist-item" style={{ opacity: a.enabled ? 1 : 0.5 }}>
              <div className="watchlist-stock-info" style={{ flex: 1 }}>
                <div className="watchlist-stock-name">{a.stock_name}</div>
                <div className="watchlist-stock-code">{a.stock_code}</div>
              </div>

              {editingId === a.id ? (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--gray-400)" }}>涨超</span>
                  <input
                    type="number"
                    value={editUp}
                    onChange={e => setEditUp(e.target.value)}
                    style={{ width: 48, fontSize: 11, padding: "2px 4px", textAlign: "center" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--gray-400)" }}>%</span>
                  <span style={{ fontSize: 11, color: "var(--gray-400)", marginLeft: 4 }}>跌破</span>
                  <input
                    type="number"
                    value={editDown}
                    onChange={e => setEditDown(e.target.value)}
                    style={{ width: 48, fontSize: 11, padding: "2px 4px", textAlign: "center" }}
                  />
                  <span style={{ fontSize: 11, color: "var(--gray-400)" }}>%</span>
                  <button className="icon-btn-sm" onClick={() => saveEdit(a.id)}>💾</button>
                  <button className="icon-btn-sm" onClick={() => setEditingId(null)}>❌</button>
                </div>
              ) : (
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                  <span className={`badge ${a.threshold_up > 0 ? "badge-kept" : ""}`}
                    style={{ fontSize: 11, padding: "2px 6px" }}>
                    ↑{a.threshold_up}%
                  </span>
                  <span className={`badge ${a.threshold_down < 0 ? "badge-removed" : ""}`}
                    style={{ fontSize: 11, padding: "2px 6px" }}>
                    ↓{a.threshold_down}%
                  </span>
                  <button className="icon-btn-sm" title="编辑" onClick={() => startEdit(a)}>✏️</button>
                  <button className="icon-btn-sm" title={a.enabled ? "暂停" : "启用"} onClick={() => handleToggleEnabled(a)}>
                    {a.enabled ? "⏸️" : "▶️"}
                  </button>
                  <button className="icon-btn-sm" title="删除" onClick={() => handleDelete(a.id)}>🗑️</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
