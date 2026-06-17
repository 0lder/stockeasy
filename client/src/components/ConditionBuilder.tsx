import { JSX, useState } from "react";
import { 
  Box, 
  Typography, 
  Button, 
  TextField, 
  Select, 
  MenuItem, 
  FormControl, 
  InputLabel, 
  Card, 
  CardContent, 
  Chip, 
  IconButton, 
  Grid, 
  Divider,
  useTheme,
  Autocomplete,
  Tooltip
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/Delete";
import SearchIcon from "@mui/icons-material/Search";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import BuildIcon from "@mui/icons-material/Build";
import ClearIcon from "@mui/icons-material/Clear";

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
      { id: "DividendYield", label: "股息率" },
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
  "DividendYield": "股息率",
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
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [selectedField, setSelectedField] = useState("pe");
  const [selectedFieldLabel, setSelectedFieldLabel] = useState("市盈率 (PE)");
  const [operator, setOperator] = useState("lt");
  const [value, setValue] = useState("");

  const allFields = FIELD_GROUPS.flatMap(g => g.fields);
  const selectedFieldObj = allFields.find(f => f.id === selectedField);

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
    <Box sx={{ maxWidth: "780px", margin: "0 auto", padding: "28px 24px 48px" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "8px" }}>
        <Typography variant="h2" sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          🔧 条件组合器
        </Typography>
        <Box sx={{ display: "flex", gap: "8px" }}>
          {conditions.length > 0 && (
            <>
              <Button
                variant="contained"
                color="primary"
                startIcon={<SearchIcon />}
                onClick={() => onQuery(queryText)}
                sx={{ borderRadius: "999px" }}
              >
                查询
              </Button>
              <Button
                variant="outlined"
                startIcon={<ClearIcon />}
                onClick={clearAll}
                sx={{ borderRadius: "999px" }}
              >
                清空
              </Button>
            </>
          )}
        </Box>
      </Box>

      {/* 条件添加区 */}
      <Card sx={{ marginBottom: "20px", borderRadius: "12px" }}>
        <CardContent sx={{ display: "flex", flexDirection: "column", gap: "12px", padding: "16px" }}>
          <Box sx={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <FormControl sx={{ minWidth: 200 }} size="small">
              <InputLabel>选择指标</InputLabel>
              <Select
                value={selectedField}
                label="选择指标"
                onChange={e => {
                  setSelectedField(e.target.value);
                  const field = allFields.find(f => f.id === e.target.value);
                  setSelectedFieldLabel(field?.label || e.target.value);
                }}
              >
                {FIELD_GROUPS.map(g => (
                  <Box key={g.label}>
                    <Typography variant="caption" sx={{ 
                      padding: "8px 16px", 
                      display: "block", 
                      color: "text.secondary",
                      fontWeight: 600 
                    }}>
                      {g.label}
                    </Typography>
                    {g.fields.map(f => (
                      <MenuItem key={f.id} value={f.id}>{f.label}</MenuItem>
                    ))}
                    <Divider />
                  </Box>
                ))}
              </Select>
            </FormControl>

            {!isTech && (
              <FormControl sx={{ minWidth: 150 }} size="small">
                <InputLabel>运算符</InputLabel>
                <Select
                  value={operator}
                  label="运算符"
                  onChange={e => setOperator(e.target.value)}
                >
                  {OPERATORS.map(op => (
                    <MenuItem key={op.id} value={op.id}>{op.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}

            {!isTech && (
              <TextField
                size="small"
                label={operator === "between" ? "最小值,最大值" : "数值"}
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addCondition(); }}
                sx={{ minWidth: 120 }}
              />
            )}

            <Button
              variant="contained"
              startIcon={<AddIcon />}
              onClick={addCondition}
              disabled={!isTech && !value.trim()}
              sx={{ borderRadius: "999px" }}
            >
              添加
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* 已选条件列表 */}
      {conditions.length > 0 && (
        <Card sx={{ marginBottom: "20px", borderRadius: "12px" }}>
          <CardContent sx={{ padding: "16px" }}>
            <Box sx={{ marginBottom: "12px" }}>
              <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", marginBottom: "6px", display: "block" }}>
                生成的问财语句：
              </Typography>
              <Typography variant="body2" sx={{ 
                padding: "8px 12px", 
                backgroundColor: isDarkMode ? "#2c2c2e" : "#f5f5f7", 
                borderRadius: "8px",
                fontFamily: "monospace",
                wordBreak: "break-all"
              }}>
                {queryText}
              </Typography>
            </Box>
            
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
              {conditions.map((c, i) => (
                <Chip
                  key={i}
                  label={conditionToWencai(c)}
                  onDelete={() => removeCondition(i)}
                  color="primary"
                  variant="outlined"
                  sx={{ borderRadius: "999px" }}
                />
              ))}
            </Box>
            
            <Button
              variant="contained"
              color="primary"
              startIcon={<PlayArrowIcon />}
              onClick={() => onQuery(queryText)}
              sx={{ borderRadius: "999px" }}
            >
              执行查询
            </Button>
          </CardContent>
        </Card>
      )}

      {conditions.length === 0 && (
        <Box sx={{ textAlign: "center", padding: "48px 20px", color: "text.secondary" }}>
          <Typography>选择条件和数值，组合成问财查询语句</Typography>
          <Typography variant="body2" sx={{ marginTop: "8px", color: "text.secondary" }}>
            支持估值、成长、财务、行情、技术面多种条件
          </Typography>
        </Box>
      )}

      {/* 常用模板 */}
      <Card sx={{ borderRadius: "12px" }}>
        <CardContent sx={{ padding: "16px" }}>
          <Typography variant="h6" sx={{ marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
            📌 常用模板
          </Typography>
          <Grid container spacing={2}>
            {[
              { name: "低估值蓝筹", query: "市盈率小于15 市净率小于2 股息率大于3%" },
              { name: "高成长小盘", query: "净利润增长率大于50% 总市值小于100亿 市盈率大于0" },
              { name: "MACD金叉", query: "MACD金叉 换手率大于3%" },
              { name: "放量突破", query: "放量突破 涨跌幅大于5%" },
              { name: "白马股", query: "ROE大于15% 毛利率大于30% 净利润增长率大于20%" },
              { name: "破净股", query: "市净率小于1 市盈率大于0" },
            ].map(t => (
              <Grid size={{ xs: 12, sm: 6, md: 4 }} key={t.name}>
                <Card 
                  sx={{ 
                    cursor: "pointer", 
                    "&:hover": { 
                      backgroundColor: "action.hover",
                      borderColor: "primary.main"
                    },
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: "8px"
                  }}
                  onClick={() => onQuery(t.query)}
                >
                  <CardContent sx={{ padding: "12px", "&:last-child": { paddingBottom: "12px" } }}>
                    <Typography variant="body2" sx={{ fontWeight: 600, marginBottom: "4px" }}>
                      {t.name}
                    </Typography>
                    <Typography variant="caption" sx={{ color: "text.secondary" }}>
                      {t.query}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </CardContent>
      </Card>
    </Box>
  );
}
