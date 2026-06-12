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

export default function StrategyPanel({ onRunStrategy }: { onRunStrategy: (query: string) => void }): JSX.Element {
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [queryText, setQueryText] = useState("");
  const [description, setDescription] = useState("");
  const [groupName, setGroupName] = useState("默认");
  const [editingId, setEditingId] = useState<number | null>(null);

  const fetchStrategies = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/strategies");
      const data = await res.json();
      setStrategies(data);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => { fetchStrategies(); }, []);

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
    fetchStrategies();
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
          <input className="input" placeholder="问财查询语句 *（如：市盈率小于20 净利润增长率大于50%）" value={queryText} onChange={e => setQueryText(e.target.value)} />
          <input className="input" placeholder="描述（可选）" value={description} onChange={e => setDescription(e.target.value)} />
          <select className="input" value={groupName} onChange={e => setGroupName(e.target.value)}>
            <option>默认</option><option>技术面</option><option>基本面</option><option>成长</option><option>价值</option>
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
                  <div key={s.id} className="strategy-item">
                    <div className="strategy-item-main" onClick={() => onRunStrategy(s.query_text)}>
                      <div className="strategy-item-name">{s.name}</div>
                      <div className="strategy-item-query">{s.query_text}</div>
                      {s.description && <div className="strategy-item-desc">{s.description}</div>}
                    </div>
                    <div className="strategy-item-actions">
                      <button className="icon-btn" title="运行" onClick={() => onRunStrategy(s.query_text)}>▶️</button>
                      <button className="icon-btn" title="编辑" onClick={() => handleEdit(s)}>✏️</button>
                      <button className="icon-btn" title="删除" onClick={() => handleDelete(s.id)}>🗑️</button>
                    </div>
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
