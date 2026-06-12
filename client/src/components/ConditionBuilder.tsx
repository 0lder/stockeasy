import { JSX, useState } from "react";

interface Condition {
  field: string;
  fieldLabel: string;
  operator: string;
  value: string;
}

const FIELD_GROUPS = [
  {
    label: "估值", fields: [
      { id: "pe", label: "市盈率 (PE)" },
      { id: "pb", label: "市净率 (PB)" },
      { id: "ps", label: "市销率 (PS)" },
      { id: " DividendYield", label: "股息率" },
    ]
  },
  {
    label: "成长", fields: [
      { id: "net_profit_growth", label: "净利润增长率" },
      { id: "revenue_growth", label: "营收增长率" },
      { id: "eps_growth", label: "每股收益增长率" },
    ]
  },
  {
    label: "财务", fields: [
      { id: "roe", label: "净资产收益率 (ROE)" },
      { id: "gross_margin", label: "毛利率" },
      { id: "net_margin", label: "净利率" },
      { id: "debt_ratio", label: "资产负债率" },
    ]
  },
  {
    label: "行情", fields: [
      { id: "price", label: "最新价" },
      { id: "change_pct", label: "涨跌幅" },
      { id: "volume", label: "成交量" },
      { id: "turnover_rate", label: "换手率" },
      { id: "market_cap", label: "总市值" },
    ]
  },
  {
    label: "技术", fields: [
      { id: "ma_trend", label: "均线多头排列" },
      { id: "macd_golden", label: "MACD金叉" },
      { id: "kdj_golden", label: "KDJ金叉" },
      { id: "volume_break", label: "放量突破" },
    ]
  },
];

const FIELD_TO_WENCAI: Record<string, string> = {
  "pe": "市盈率",
  "pb": "市净率",
  "ps": "市销率",
  " DividendYield": "股息率",
  "net_profit_growth": "净利润增长率",
  "revenue_growth": "营业收入增长率",
  "eps_growth": "每股收益增长率",
  "roe": "净资产收益率",
  "gross_margin": "毛利率",
  "net_margin": "净利率",
  "debt_ratio": "资产负债率",
  "price": "最新价",
  "change_pct": "涨跌幅",
  "volume": "成交量",
  "turnover_rate": "换手率",
  "market_cap": "总市值",
  "ma_trend": "均线多头排列",
  "macd_golden": "MACD金叉",
  "kdj_golden": "KDJ金叉",
  "volume_break": "放量突破",
};

const OPERATORS = [
  { id: "gt", label: "大于 (>)" },
  { id: "lt", label: "小于 (<)" },
  { id: "gte", label: "大于等于 (≥)" },
  { id: "lte", label: "小于等于 (≤)" },
  { id: "eq", label: "等于 (=)" },
  { id: "between", label: "介于" },
];

const TECH_FIELDS = new Set(["ma_trend", "macd_golden", "kdj_golden", "volume_break"]);

function conditionToWencai(c: Condition): string {
  const wencaiField = FIELD_TO_WENCAI[c.field] || c.field;
  if (TECH_FIELDS.has(c.field)) {
    return wencaiField;
  }
  switch (c.operator) {
    case "gt": return `${wencaiField}大于${c.value}`;
    case "lt": return `${wencaiField}小于${c.value}`;
    case "gte": return `${wencaiField}大于等于${c.value}`;
    case "lte": return `${wencaiField}小于等于${c.value}`;
    case "eq": return `${wencaiField}等于${c.value}`;
    case "between": {
      const parts = c.value.split(",");
      if (parts.length === 2) return `${wencaiField}${parts[0]}至${parts[1]}`;
      return `${wencaiField}等于${c.value}`;
    }
    default: return `${wencaiField}${c.value}`;
  }
}

export default function ConditionBuilder({ onQuery }: { onQuery: (q: string) => void }): JSX.Element {
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [selectedField, setSelectedField] = useState("pe");
  const [selectedFieldLabel, setSelectedFieldLabel] = useState("市盈率 (PE)");
  const [operator, setOperator] = useState("lt");
  const [value, setValue] = useState("");

  const addCondition = () => {
    if (!selectedField) return;
    const isTech = TECH_FIELDS.has(selectedField);
    setConditions([...conditions, {
      field: selectedField,
      fieldLabel: selectedFieldLabel,
      operator: isTech ? "eq" : operator,
      value: isTech ? "yes" : value,
    }]);
    setValue("");
  };

  const removeCondition = (idx: number) => {
    setConditions(conditions.filter((_, i) => i !== idx));
  };

  const clearAll = () => {
    setConditions([]);
  };

  const queryText = conditions.map(conditionToWencai).join(" ");
  const isTech = TECH_FIELDS.has(selectedField);

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="panel-title">🔧 条件组合器</h2>
        <div className="panel-actions">
          {conditions.length > 0 && (
            <>
              <button className="btn-primary-sm" onClick={() => onQuery(queryText)}>🚀 查询</button>
              <button className="btn-secondary-sm" onClick={clearAll}>清空</button>
            </>
          )}
        </div>
      </div>

      {/* 条件添加区 */}
      <div className="builder-add-row">
        <select className="input builder-select" value={selectedField} onChange={e => {
          const opt = e.target.selectedOptions[0];
          setSelectedField(e.target.value);
          setSelectedFieldLabel(opt.textContent || e.target.value);
        }}>
          {FIELD_GROUPS.map(g => (
            <optgroup key={g.label} label={g.label}>
              {g.fields.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </optgroup>
          ))}
        </select>

        {!isTech && (
          <select className="input builder-select" value={operator} onChange={e => setOperator(e.target.value)}>
            {OPERATORS.map(op => <option key={op.id} value={op.id}>{op.label}</option>)}
          </select>
        )}

        {!isTech && (
          <input className="input builder-input" placeholder={operator === "between" ? "最小值,最大值" : "数值"} value={value} onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") addCondition(); }} />
        )}

        <button className="btn-primary-sm" onClick={addCondition} disabled={!isTech && !value.trim()}>+ 添加</button>
      </div>

      {/* 已选条件列表 */}
      {conditions.length > 0 && (
        <div className="builder-conditions">
          <div className="builder-query-preview">
            <span className="builder-preview-label">生成的问财语句：</span>
            <span className="builder-preview-text">{queryText}</span>
          </div>
          <div className="builder-chips">
            {conditions.map((c, i) => (
              <div key={i} className="builder-chip">
                <span className="builder-chip-text">{conditionToWencai(c)}</span>
                <button className="builder-chip-del" onClick={() => removeCondition(i)}>✕</button>
                {i < conditions.length - 1 && <span className="builder-and">且</span>}
              </div>
            ))}
          </div>
          <div className="builder-actions">
            <button className="btn-primary-sm" onClick={() => onQuery(queryText)}>🚀 执行查询</button>
          </div>
        </div>
      )}

      {conditions.length === 0 && (
        <div className="panel-empty">
          <p>选择条件和数值，组合成问财查询语句</p>
          <p className="panel-hint">支持估值、成长、财务、行情、技术面多种条件</p>
        </div>
      )}

      {/* 常用模板 */}
      <div className="builder-templates">
        <div className="strategy-group-title">📌 常用模板</div>
        <div className="templates-grid">
          {[
            { name: "低估值蓝筹", query: "市盈率小于15 市净率小于2 股息率大于3%" },
            { name: "高成长小盘", query: "净利润增长率大于50% 总市值小于100亿 市盈率大于0" },
            { name: "MACD金叉", query: "MACD金叉 换手率大于3%" },
            { name: "放量突破", query: "放量突破 涨跌幅大于5%" },
            { name: "白马股", query: "ROE大于15% 毛利率大于30% 净利润增长率大于20%" },
            { name: "破净股", query: "市净率小于1 市盈率大于0" },
          ].map(t => (
            <button key={t.name} className="template-chip" onClick={() => onQuery(t.query)}>
              <span className="template-name">{t.name}</span>
              <span className="template-desc">{t.query}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
