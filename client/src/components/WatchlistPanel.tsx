import { JSX, useState, useEffect, useCallback } from "react";

interface WatchItem {
  id: number;
  stock_code: string;
  stock_name: string;
  note: string;
  group_name: string;
  added_at: string;
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
  const [prices, setPrices] = useState<Record<string, PriceInfo>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [code, setCode] = useState("");
  const [sname, setSname] = useState("");
  const [group, setGroup] = useState("默认");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editNote, setEditNote] = useState("");

  const fetchWatchlist = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/watchlist");
      const data = await res.json();
      setItems(data.items || []);
      setGroups(data.groups || []);
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

  const formatPrice = (v: any) => v !== undefined && v !== null ? Number(v).toFixed(2) : "--";
  const formatChange = (v: any) => {
    if (v === undefined || v === null) return "";
    const n = Number(v);
    const s = n > 0 ? `+${n.toFixed(2)}%` : `${n.toFixed(2)}%`;
    return { text: s, color: n > 0 ? "#ff3b30" : n < 0 ? "#34c759" : "#8e8e93" };
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
                return (
                  <div key={item.id} className="watchlist-item">
                    <div className="watchlist-item-info" onClick={() => onSearch(item.stock_name)}>
                      <div className="watchlist-item-name">
                        {item.stock_name}
                        <span className="watchlist-item-code">{item.stock_code}</span>
                      </div>
                      {item.note && <div className="watchlist-item-note">{item.note}</div>}
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
                      <select className="group-select" value={item.group_name} onChange={e => handleGroupChange(item.id, e.target.value)}>
                        <option>默认</option><option>核心持仓</option><option>观察仓</option><option>ETF</option>
                      </select>
                      <button className="icon-btn-sm" title="删除" onClick={() => handleDelete(item.id)}>✕</button>
                    </div>
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
