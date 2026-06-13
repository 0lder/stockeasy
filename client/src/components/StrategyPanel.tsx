import { JSX, useState, useEffect } from "react";

interface Strategy {
  id: number;
  name: string;
  description: string;
  query_text: string;
  tags: string;
  group_name: string;
  created_at: string;
  updated_at: string;
}

interface Snapshot {
  id: number;
  strategy_id: number;
  snapshot_date: string;
  stock_count: number;
  created_at: string;
}

interface SnapshotDetail {
  stocks: any[];
  stats: Record<string, { up: number; total: number; ratio: string }>;
}

export default function StrategyPanel({ onRunStrategy }: { onRunStrategy: (query: string) => void }): JSX.Element {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [queryText, setQueryText] = useState("");
  const [description, setDescription] = useState("");
  const [groupName, setGroupName] = useState("默认");
  const [editingId, setEditingId] = useState<number | null>(null);

  // Snapshots
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotDetail, setSnapshotDetail] = useState<SnapshotDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [expandedStrategy, setExpandedStrategy] = useState<number | null>(null);

  const fetchStrategies = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/strategies");
      setStrategies(await res.json());
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { fetchStrategies(); }, []);

  const fetchSnapshots = async (strategyId: number) => {
    try {
      const res = await fetch(`/api/strategies/${strategyId}/snapshots`);
      setSnapshots(await res.json());
    } catch (e) { console.error(e); }
  };

  const handleSave = async () => {
    if (!name.trim() || !queryText.trim()) return;
    try {
      const body = { name: name.trim(), query_text: queryText.trim(), description: description.trim(), group_name: groupName };
      if (editingId) {
        await fetch(`/api/strategies/${editingId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      } else {
        await fetch("/api/strategies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      }
      setName(""); setQueryText(""); setDescription(""); setGroupName("默认"); setEditingId(null); setShowForm(false);
      fetchStrategies();
    } catch (e) { console.error(e); }
  };

  const handleEdit = (s: Strategy) => {
    setName(s.name); setQueryText(s.query_text); setDescription(s.description); setGroupName(s.group_name);
    setEditingId(s.id); setShowForm(true);
  };

  const handleDelete = async (id: number) => {
    if (!confirm("确定删除该策略？")) return;
    await fetch(`/api/strategies/${id}`, { method: "DELETE" });
    if (expandedStrategy === id) { setExpandedStrategy(null); setSnapshots([]); }
    fetchStrategies();
  };

  // 保存快照：运行策略并保存结果
  const handleSaveSnapshot = async (s: Strategy) => {
    setSavingId(s.id);
    try {
      // 先查询
      const queryRes = await fetch(`/api/query?q=${encodeURIComponent(s.query_text)}&limit=50`);
      const queryData = await queryRes.json();
      if (!queryData.data || queryData.data.length === 0) {
        alert("策略没有选出任何股票，无法保存快照");
        setSavingId(null);
        return;
      }
      // 保存快照
      const snapRes = await fetch(`/api/strategies/${s.id}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stocks: queryData.data }),
      });
      const snapData = await snapRes.json();
      if (snapData.success) {
        fetchSnapshots(s.id);
        onRunStrategy(s.query_text); // 顺便显示结果
      }
    } catch (e) {
      console.error(e);
      alert("保存快照失败");
    }
    setSavingId(null);
  };

  // 查看快照详情
  const handleViewSnapshot = async (snapshotId: number) => {
    setDetailLoading(true);
    setSnapshotDetail(null);
    try {
      const res = await fetch(`/api/snapshots/${snapshotId}`);
      setSnapshotDetail(await res.json());
    } catch (e) { console.error(e); }
    setDetailLoading(false);
  };

  const handleDeleteSnapshot = async (snapshotId: number, strategyId: number) => {
    if (!confirm("确定删除该快照？")) return;
    await fetch(`/api/snapshots/${snapshotId}`, { method: "DELETE" });
    fetchSnapshots(strategyId);
    setSnapshotDetail(null);
  };

  // 展开/收起策略的快照
  const toggleExpand = (strategyId: number) => {
    if (expandedStrategy === strategyId) {
      setExpandedStrategy(null);
      setSnapshots([]);
      setSnapshotDetail(null);
    } else {
      setExpandedStrategy(strategyId);
      setSnapshotDetail(null);
      fetchSnapshots(strategyId);
    }
  };

  const groups = [...new Set(strategies.map(s => s.group_name))];

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">📋 策略管理</h2>
        <button className="btn-primary-sm" onClick={() => { setShowForm(!showForm); setEditingId(null); setName(""); setQueryText(""); setDescription(""); setGroupName("默认"); }}>
          {showForm ? "取消" : "+ 新建策略"}
        </button>
      </div>

      {showForm && (
        <div className="strategy-form">
          <input className="input" placeholder="策略名称 *" value={name} onChange={e => setName(e.target.value)} />
          <input className="input" placeholder="问财查询语句 *" value={queryText} onChange={e => setQueryText(e.target.value)} />
          <input className="input" placeholder="描述（可选）" value={description} onChange={e => setDescription(e.target.value)} />
          <select className="input" value={groupName} onChange={e => setGroupName(e.target.value)}>
            <option>默认</option><option>技术面</option><option>基本面</option><option>成长</option><option>价值</option><option>观察</option>
          </select>
          <button className="btn-primary-sm" onClick={handleSave}>{editingId ? "更新" : "保存"}</button>
        </div>
      )}

      {loading ? (
        <div className="panel-loading">加载中...</div>
      ) : strategies.length === 0 ? (
        <div className="panel-empty">
          <p>暂无策略</p>
          <p className="panel-hint">点击"新建策略"保存常用筛选条件</p>
        </div>
      ) : (
        <div className="strategy-list">
          {groups.map(group => {
            const groupStrategies = strategies.filter(s => s.group_name === group);
            return (
              <div key={group} className="strategy-group">
                <div className="strategy-group-title">{group}</div>
                {groupStrategies.map(s => (
                  <div key={s.id}>
                    <div className="strategy-item">
                      <div className="strategy-item-main" onClick={() => onRunStrategy(s.query_text)}>
                        <div className="strategy-item-name">{s.name}</div>
                        <div className="strategy-item-query">{s.query_text}</div>
                        {s.description && <div className="strategy-item-desc">{s.description}</div>}
                      </div>
                      <div className="strategy-item-actions">
                        <button className="icon-btn" title="运行" onClick={() => onRunStrategy(s.query_text)}>▶️</button>
                        <button className="icon-btn" title="保存快照" onClick={() => handleSaveSnapshot(s)} disabled={savingId === s.id}>
                          {savingId === s.id ? "⏳" : "📸"}
                        </button>
                        <button className="icon-btn" title="查看快照" onClick={() => toggleExpand(s.id)}>
                          📊
                        </button>
                        <button className="icon-btn" title="编辑" onClick={() => handleEdit(s)}>✏️</button>
                        <button className="icon-btn" title="删除" onClick={() => handleDelete(s.id)}>🗑️</button>
                      </div>
                    </div>

                    {/* 快照区域 */}
                    {expandedStrategy === s.id && (
                      <div className="snapshot-section">
                        {snapshots.length === 0 ? (
                          <div className="snapshot-empty">暂无快照，点击 📸 保存本次结果</div>
                        ) : (
                          <>
                            <div className="snapshot-list">
                              {snapshots.map(snap => (
                                <div key={snap.id} className="snapshot-item" onClick={() => handleViewSnapshot(snap.id)}>
                                  <div className="snapshot-date">{snap.snapshot_date}</div>
                                  <div className="snapshot-count">{snap.stock_count} 只</div>
                                  <button className="icon-btn-sm" title="删除快照"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteSnapshot(snap.id, s.id); }}>🗑️</button>
                                </div>
                              ))}
                            </div>

                            {/* 表现详情 */}
                            {detailLoading && <div className="panel-loading">加载表现数据...</div>}
                            {snapshotDetail && (
                              <div className="snapshot-detail">
                                <div className="snapshot-stats">
                                  {Object.entries(snapshotDetail.stats).map(([period, stat]: any) => (
                                    <div key={period} className="stat-card">
                                      <div className="stat-period">{period === "snapshot_today" ? "快照至今" : period}</div>
                                      <div className={`stat-ratio ${parseFloat(stat.ratio) >= 50 ? "up" : "down"}`}>
                                        {stat.ratio !== "-" ? `${stat.ratio} 上涨` : "-"}
                                      </div>
                                      <div className="stat-sub">{stat.up}/{stat.total} 只</div>
                                    </div>
                                  ))}
                                </div>
                                <div className="snapshot-stocks">
                                  <div className="snapshot-stocks-title">股票明细</div>
                                  <div className="snapshot-stocks-grid">
                                    {snapshotDetail.stocks.map((stk: any, i: number) => {
                                      const snapPx = stk.price_at_snapshot;
                                      const curPx = stk.current_price;
                                      let chgText = "-";
                                      let chgCls = "";
                                      if (snapPx && curPx !== "-") {
                                        const chg = (Number(curPx) - Number(snapPx)) / Number(snapPx) * 100;
                                        chgText = `${chg > 0 ? "+" : ""}${chg.toFixed(2)}%`;
                                        chgCls = chg > 0 ? "up" : chg < 0 ? "down" : "";
                                      }
                                      return (
                                        <div key={i} className="snapshot-stock-card">
                                          <div className="snap-stock-name">{stk.stock_name}</div>
                                          <div className="snap-stock-code">{stk.stock_code}</div>
                                          <div className="snap-stock-price">📌 {snapPx || "-"}</div>
                                          <div className="snap-stock-price">📊 {curPx !== "-" ? curPx : "-"}</div>
                                          <div className={`snap-stock-chg ${chgCls}`}>{chgText}</div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
