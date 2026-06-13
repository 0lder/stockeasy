import { JSX, useState, useEffect, useCallback } from "react";

interface WatchItem {
  id: number;
  stock_code: string;
  stock_name: string;
  note: string;
  group_name: string;
  added_at: string;
}

interface Alert {
  id: number;
  stock_code: string;
  stock_name: string;
  threshold_up: number;
  threshold_down: number;
  enabled: number;
  last_triggered_up: number | null;
  last_triggered_down: number | null;
}

interface PriceInfo {
  股票代码?: string;
  股票简称?: string;
  最新价?: number;
  最新涨跌幅?: number;
  [key: string]: any;
}

export default function WatchlistPanel({ onSearch }: { onSearch: (q: string) => void }): JSX.Element {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [groups, setGroups] = useState<string[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [code, setCode] = useState("");
  const [sname, setSname] = useState("");
  const [group, setGroup] = useState("默认");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");
  // Alert editing
  const [alertForm, setAlertForm] = useState<Record<number, { show: boolean; up: string; down: string }>>({});

  const fetchWatchlist = useCallback(async () => {
    setLoading(true);
    try {
      const [wlRes, alertRes] = await Promise.all([
        fetch("/api/watchlist"),
        fetch("/api/alerts"),
      ]);
      const wlData = await wlRes.json();
      setItems(wlData.items || []);
      setGroups(wlData.groups || []);
      setAlerts(await alertRes.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  const refreshPrices = useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await fetch("/api/watchlist/refresh", { method: "POST" });
      const data = await res.json();
      const map: Record<string, PriceInfo> = {};
      (data.data || []).forEach((p: PriceInfo) => {
        const code = p.股票代码 || "";
        map[code] = p;
      });
      setPrices(map);
    } catch (e) { console.error(e); }
    setRefreshing(false);
  }, []);

  const exportWatchlist = async () => {
    try {
      const res = await fetch("/api/export/watchlist");
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "导出失败");
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "watchlist.xlsx";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      alert("导出失败: " + e.message);
    }
  };

  useEffect(() => { fetchWatchlist(); }, [fetchWatchlist]);

  const handleAdd = async () => {
    if (!code.trim() || !sname.trim()) return;
    try {
      await fetch("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock_code: code.trim(), stock_name: sname.trim(), group_name: group }),
      });
      setCode(""); setSname(""); setShowAdd(false);
      fetchWatchlist();
    } catch (e) { console.error(e); }
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/watchlist/${id}`, { method: "DELETE" });
    fetchWatchlist();
  };

  const handleUpdateNote = async (id: number) => {
    await fetch(`/api/watchlist/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: editNote }),
    });
    setEditingId(null);
    fetchWatchlist();
  };

  const handleGroupChange = async (id: number, newGroup: string) => {
    await fetch(`/api/watchlist/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ group_name: newGroup }),
    });
    fetchWatchlist();
  };

  // Alert handlers
  const toggleAlertForm = (watchId: number, stockCode: string) => {
    const existing = alerts.find(a => a.stock_code === stockCode);
    setAlertForm(prev => ({
      ...prev,
      [watchId]: {
        show: !prev[watchId]?.show,
        up: String(existing?.threshold_up ?? 10),
        down: String(existing?.threshold_down ?? -8),
      },
    }));
  };

  const saveAlert = async (watchId: number, stockCode: string, stockName: string) => {
    const form = alertForm[watchId];
    if (!form) return;
    const up = parseFloat(form.up);
    const down = parseFloat(form.down);
    if (isNaN(up) || isNaN(down)) return;

    const existing = alerts.find(a => a.stock_code === stockCode);
    if (existing) {
      await fetch(`/api/alerts/${existing.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threshold_up: up, threshold_down: down, enabled: 1 }),
      });
    } else {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock_code: stockCode, stock_name: stockName, threshold_up: up, threshold_down: down }),
      });
    }
    setAlertForm(prev => ({ ...prev, [watchId]: { ...prev[watchId], show: false } }));
    fetchWatchlist();
  };

  const deleteAlert = async (stockCode: string) => {
    const existing = alerts.find(a => a.stock_code === stockCode);
    if (existing) {
      await fetch(`/api/alerts/${existing.id}`, { method: "DELETE" });
      fetchWatchlist();
    }
  };

  const formatPrice = (v: any) => v !== undefined && v !== null ? Number(v).toFixed(2) : "--";
  const formatChange = (v: any) => {
    if (v === undefined || v === null) return null;
    const n = Number(v);
    return { text: `${n > 0 ? "+" : ""}${n.toFixed(2)}%`, color: n > 0 ? "#ff3b30" : n < 0 ? "#34c759" : "#8e8e93" };
  };

  const groupMap = new Map<string, WatchItem[]>();
  items.forEach(item => {
    if (!groupMap.has(item.group_name)) groupMap.set(item.group_name, []);
    groupMap.get(item.group_name)!.push(item);
  });

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">⭐ 自选股</h2>
        <div className="panel-actions">
          <button className="btn-primary-sm" onClick={() => { setShowAdd(!showAdd); }}>{showAdd ? "取消" : "+ 添加"}</button>
          <button className="btn-secondary-sm" onClick={refreshPrices} disabled={refreshing}>
            {refreshing ? "刷新中..." : "🔄 刷新行情"}
          </button>
          <button className="btn-secondary-sm" onClick={exportWatchlist}>⬇ 导出</button>
        </div>
      </div>

      {showAdd && (
        <div className="strategy-form">
          <input className="input" placeholder="股票代码 *（如 600519）" value={code} onChange={e => setCode(e.target.value)} />
          <input className="input" placeholder="股票名称 *（如 贵州茅台）" value={sname} onChange={e => setSname(e.target.value)} />
          <select className="input" value={group} onChange={e => setGroup(e.target.value)}>
            <option>默认</option><option>核心持仓</option><option>观察仓</option><option>ETF</option>
            {groups.filter(g => !["默认","核心持仓","观察仓","ETF"].includes(g)).map(g => <option key={g}>{g}</option>)}
          </select>
          <button className="btn-primary-sm" onClick={handleAdd}>添加</button>
        </div>
      )}

      {loading ? (
        <div className="panel-loading">加载中...</div>
      ) : items.length === 0 ? (
        <div className="panel-empty">
          <p>自选股列表为空</p>
          <p className="panel-hint">添加股票到自选股，随时查看行情</p>
        </div>
      ) : (
        <div className="watchlist-scroll">
          {[...groupMap.entries()].map(([g, gItems]) => (
            <div key={g} className="strategy-group">
              <div className="strategy-group-title">{g} ({gItems.length})</div>
              {gItems.map(item => {
                const price = prices[item.stock_code];
                const change = price ? formatChange(price["最新涨跌幅"]) : null;
                const alert = alerts.find(a => a.stock_code === item.stock_code);
                const af = alertForm[item.id];
                return (
                  <div key={item.id} className="watchlist-item">
                    <div className="watchlist-item-info" onClick={() => onSearch(item.stock_name)}>
                      <div className="watchlist-item-name">
                        {item.stock_name}
                        <span className="watchlist-item-code">{item.stock_code}</span>
                      </div>
                      {item.note && <div className="watchlist-item-note">{item.note}</div>}
                      {alert && (
                        <div className="watchlist-item-alert-badge">
                          🔔 {alert.threshold_up > 0 ? `涨${alert.threshold_up}%` : ""}
                          {alert.threshold_down < 0 ? ` 跌${Math.abs(alert.threshold_down)}%` : ""}
                        </div>
                      )}
                    </div>
                    <div className="watchlist-item-price">
                      {price ? (
                        <>
                          <div className="watchlist-price-val">{formatPrice(price["最新价"])}</div>
                          {change && <div className="watchlist-price-chg" style={{ color: change.color }}>{change.text}</div>}
                        </>
                      ) : (
                        <button className="btn-link" onClick={refreshPrices}>加载</button>
                      )}
                    </div>
                    <div className="watchlist-item-actions">
                      <button className="icon-btn-sm" title="告警设置"
                        onClick={() => toggleAlertForm(item.id, item.stock_code)}
                        style={{ color: alert ? "#ff9500" : "#8e8e93" }}>
                        🔔
                      </button>
                      <select className="group-select" value={item.group_name} onChange={e => handleGroupChange(item.id, e.target.value)}>
                        <option>默认</option><option>核心持仓</option><option>观察仓</option><option>ETF</option>
                      </select>
                      <button className="icon-btn-sm" title="删除" onClick={() => handleDelete(item.id)}>✕</button>
                    </div>
                    {af?.show && (
                      <div className="alert-form">
                        <div className="alert-form-row">
                          <label>涨超 %</label>
                          <input className="input input-sm" type="number" value={af.up}
                            onChange={e => setAlertForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], up: e.target.value } }))} />
                        </div>
                        <div className="alert-form-row">
                          <label>跌超 %</label>
                          <input className="input input-sm" type="number" value={af.down}
                            onChange={e => setAlertForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], down: e.target.value } }))} />
                        </div>
                        <div className="alert-form-actions">
                          <button className="btn-primary-sm" onClick={() => saveAlert(item.id, item.stock_code, item.stock_name)}>保存</button>
                          {alert && <button className="btn-text-sm" onClick={() => deleteAlert(item.stock_code)}>删除告警</button>}
                          <button className="btn-text-sm" onClick={() => setAlertForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))}>取消</button>
                        </div>
                        {alert && (alert.last_triggered_up || alert.last_triggered_down) && (
                          <div className="alert-triggered-info">
                            上次触发: {alert.last_triggered_up && `涨 @${alert.last_triggered_up}`}
                            {alert.last_triggered_down && ` 跌 @${alert.last_triggered_down}`}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
