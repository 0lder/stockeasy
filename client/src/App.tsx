import { JSX, useState, useCallback, useEffect } from "react";
import {
  Box,
  Container,
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Button,
  TextField,
  InputAdornment,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  Drawer,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  Pagination,
  Badge,
  useTheme,
  ThemeProvider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Snackbar,
  Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import HistoryIcon from "@mui/icons-material/History";
import CloseIcon from "@mui/icons-material/Close";
import DeleteIcon from "@mui/icons-material/Delete";
import DownloadIcon from "@mui/icons-material/Download";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import Sidebar, { TabKey } from "./components/Sidebar";
import DashboardPanel from "./components/DashboardPanel";
import StrategyPanel from "./components/StrategyPanel";
import WatchlistPanel from "./components/WatchlistPanel";
import ConditionBuilder from "./components/ConditionBuilder";
import AlertPanel from "./components/AlertPanel";
import LoginPage from "./LoginPage";
import { api, auth } from "./api";
import { lightTheme, darkTheme, stockColors, darkStockColors } from "./theme";
import { useThemeContext } from "./ThemeContext";

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
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const colors = isDarkMode ? darkStockColors : stockColors;
  const { darkMode, toggleTheme } = useThemeContext();

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

  // AI Settings state
  const [showSettings, setShowSettings] = useState(false);
  const [aiConfig, setAiConfig] = useState({ apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" });
  const [aiConfigForm, setAiConfigForm] = useState({ apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" });

  // Auth state
  const [user, setUser] = useState<any>(null);
  const [authChecking, setAuthChecking] = useState(true);

  // Check auth on mount
  useEffect(() => {
    auth.me().then((u) => {
      if (u) setUser(u);
      setAuthChecking(false);
    }).catch(() => setAuthChecking(false));
  }, []);
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState("");

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
      const res = await api.get(`/api/query?q=${encodeURIComponent(trimmed)}&limit=${limit}`);
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
      const res = await api.get(`/api/history?page=${page}&pageSize=20`);
      const data = await res.json();
      setHistory(data.records || []);
      setHistoryTotal(data.total || 0);
      setHistoryPage(data.page || 1);
    } catch (e) { console.error(e); }
    setHistoryLoading(false);
  }, []);

  const handleDeleteHistory = async (id: number) => {
    await api.delete(`/api/history/${id}`);
    fetchHistory(historyPage);
  };

  const handleClearHistory = async () => {
    if (!confirm("确定清空所有查询历史？")) return;
    await api.delete("/api/history");
    fetchHistory(1);
  };

  // 打开历史面板时加载
  useEffect(() => {
    if (showHistory) fetchHistory();
  }, [showHistory, fetchHistory]);

  // ---------- export ----------
  const exportData = async (url: string) => {
    try {
      const res = await api.get(url);
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "导出失败");
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      const disp = res.headers.get("Content-Disposition") || "";
      const match = disp.match(/filename="(.+?)"/);
      a.download = match ? decodeURIComponent(match[1]) : "export.xlsx";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      alert("导出失败: " + e.message);
    }
  };

  // ---------- helpers ----------
  const isNumericCol = (col: any): boolean => {
    if (col.type === "number" || col.type === "float" || col.type === "int") return true;
    const nf = ["最新价", "最新涨跌幅", "市盈率", "市净率", "总市值", "流通市值", "净利润增长率", "营收增长率",
      "ROE", "毛利率", "净利率", "股息率", "换手率", "成交量", "成交额", "资产负债率", "每股收益", "每股净资产",
      "涨跌幅", "涨幅", "跌幅", "振幅", "量比", "委比", "流通股", "总股本", "净利润", "营业收入", "现金流",
      "百分位", "score", "价格", "主力净流入", "北向资金持股"];
    return nf.some(k => col.label?.includes(k) || col.field?.includes(k));
  };

  // 获取列的推荐宽度
  const getColumnWidth = (col: any, index: number): string | number => {
    const label = col.label || col.field || "";
    // 股票代码列
    if (label.includes("代码") || label.includes("code")) return "90px";
    // 股票名称列
    if (label.includes("简称") || label.includes("名称") || label.includes("name")) return "100px";
    // 涨跌幅列
    if (label.includes("涨跌") || label.includes("change")) return "85px";
    // 价格列
    if (label.includes("价") || label.includes("price")) return "80px";
    // 百分比列
    if (label.includes("率") || label.includes("比")) return "75px";
    // 市值列
    if (label.includes("市值")) return "90px";
    // 默认宽度
    return "auto";
  };

  // 获取列的最小宽度
  const getColumnMinWidth = (col: any, index: number): number => {
    const label = col.label || col.field || "";
    if (label.includes("代码") || label.includes("code")) return 80;
    if (label.includes("简称") || label.includes("名称") || label.includes("name")) return 90;
    if (label.includes("涨跌") || label.includes("change")) return 75;
    if (label.includes("价") || label.includes("price")) return 70;
    return 60;
  };

  // 辅助函数：去除 HTML 标签，提取纯文本
  const stripHtml = (html: string): string => {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || "";
  };

  // 辅助函数：将对象/数组转换为可读字符串
  const formatValue = (val: any): string => {
    if (val === null || val === undefined) return "-";
    if (typeof val === "string") {
      // 如果是 HTML，提取纯文本
      if (val.includes("<") && val.includes(">")) {
        return stripHtml(val);
      }
      return val;
    }
    if (typeof val === "number" || typeof val === "boolean") return String(val);
    if (Array.isArray(val)) {
      // 数组：递归格式化每个元素
      return val.map(item => formatValue(item)).filter(v => v !== "-").join(", ");
    }
    if (typeof val === "object") {
      // 对象：尝试提取有意义的值
      const keys = Object.keys(val);
      if (keys.length === 0) return "-";
      // 如果对象有 text/content/name 等字段，优先使用
      if (val.text) return formatValue(val.text);
      if (val.content) return formatValue(val.content);
      if (val.name) return formatValue(val.name);
      if (val.label) return formatValue(val.label);
      // 否则返回所有值的拼接
      const values = keys.map(k => {
        const v = val[k];
        if (typeof v === "object" && v !== null) return null; // 跳过嵌套对象
        return formatValue(v);
      }).filter(v => v !== null && v !== "-");
      return values.join(" | ") || "-";
    }
    return String(val);
  };

  const formatCell = (row: any, col: any): { text: string; cls: string } => {
    let val = row[col.field] ?? row[col.label] ?? "-";
    
    // 处理对象/数组类型
    if (typeof val === "object" && val !== null) {
      const formatted = formatValue(val);
      return { text: formatted, cls: "" };
    }
    
    // 如果值是 HTML 字符串，提取纯文本
    if (typeof val === "string" && (val.includes("<") && val.includes(">"))) {
      val = stripHtml(val);
    }
    
    // 处理空值或占位符
    if (val === "-" || val === "" || val === null || val === undefined) {
      return { text: "-", cls: "" };
    }
    
    // 尝试解析数字
    const num = Number(val);
    if (isNaN(num)) {
      // 非数字：返回原字符串，截断过长内容
      const str = String(val);
      if (str.length > 30) {
        return { text: str.substring(0, 27) + "...", cls: "" };
      }
      return { text: str, cls: "" };
    }

    // 涨跌幅着色
    const isChange = col.label?.includes("涨跌") || col.field?.includes("change") || col.field?.includes("涨跌") || col.field?.includes("change_pct");
    if (isChange) {
      if (num > 0) return { text: `+${num.toFixed(2)}%`, cls: "up" };
      if (num < 0) return { text: `${num.toFixed(2)}%`, cls: "down" };
      return { text: `${num.toFixed(2)}%`, cls: "flat" };
    }

    // 百分比值（率、比等）
    if (col.label?.includes("率") || col.label?.includes("比") || col.field?.includes("rate") || col.field?.includes("ratio")) {
      return { text: `${num.toFixed(2)}%`, cls: "" };
    }

    // 大数字格式化（市值、成交额、净利润等）
    const isLargeNumber = col.label?.includes("市值") || col.label?.includes("成交额") || col.label?.includes("净利润") || 
                          col.label?.includes("营业收入") || col.label?.includes("现金流") || col.field?.includes("cap") || 
                          col.field?.includes("amount") || col.field?.includes("revenue");
    
    if (isLargeNumber) {
      if (Math.abs(num) >= 100000000) return { text: `${(num / 100000000).toFixed(2)}亿`, cls: "num" };
      if (Math.abs(num) >= 10000) return { text: `${(num / 10000).toFixed(2)}万`, cls: "num" };
    }

    // 成交量格式化
    const isVolume = col.label?.includes("量") || col.field?.includes("volume");
    if (isVolume) {
      if (Math.abs(num) >= 100000000) return { text: `${(num / 100000000).toFixed(2)}亿手`, cls: "num" };
      if (Math.abs(num) >= 10000) return { text: `${(num / 10000).toFixed(2)}万手`, cls: "num" };
      return { text: `${num.toLocaleString()}手`, cls: "num" };
    }

    // 价格格式化
    const isPrice = col.label?.includes("价") || col.field?.includes("price");
    if (isPrice) {
      return { text: num.toFixed(2), cls: "num" };
    }

    // 整数格式化
    if (Number.isInteger(num)) {
      return { text: num.toLocaleString(), cls: "num" };
    }

    // 默认：保留两位小数
    return { text: num.toFixed(2), cls: "num" };
  };

  // ---------- render ----------
  // Auth gate
  if (authChecking) {
    return (
      <Box sx={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <CircularProgress />
      </Box>
    );
  }
  if (!user) {
    return <LoginPage onLogin={(u) => setUser(u)} />;
  }

  const suggestions = ["上证指数", "北向资金流向", "涨停股", "2025年一季度净利润增长率大于50%的股票", "光伏行业龙头", "市盈率低于20的消费股"];

  const columns = result?.columns || (result?.data?.length ? Object.keys(result.data[0]).slice(0, 20).map(k => ({ field: k, label: k })) : []);

  return (
    <Box sx={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      {/* Navigation */}
      <AppBar position="sticky" color="default" elevation={0}>
        <Toolbar>
          <Typography variant="h6" component="a" href="/" sx={{ 
            textDecoration: "none", 
            color: "inherit", 
            fontWeight: 600,
            letterSpacing: "-0.01em",
            fontSize: "16px"
          }}>
            📈 StockEasy
          </Typography>
          
          <Box sx={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 1 }}>
            <IconButton
              onClick={toggleTheme}
              title={darkMode ? "切换浅色模式" : "切换深色模式"}
              color="inherit"
            >
              {darkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>

            <Tooltip title="AI 设置">
              <IconButton onClick={() => {
                api.get("/api/config/ai").then(r => r.json()).then(data => {
                  setAiConfigForm({
                    apiKey: "",
                    baseUrl: data.baseUrl || "https://api.openai.com/v1",
                    model: data.model || "gpt-4o-mini",
                  });
                  setShowSettings(true);
                }).catch(() => setShowSettings(true));
              }} color="inherit">
                <SettingsIcon />
              </IconButton>
            </Tooltip>

            <Tooltip title={user?.username}>
              <IconButton color="inherit" onClick={() => auth.logout()}>
                <LogoutIcon />
              </IconButton>
            </Tooltip>
            
            <Button
              variant={showHistory ? "contained" : "text"}
              color={showHistory ? "primary" : "inherit"}
              onClick={() => setShowHistory(!showHistory)}
              startIcon={
                <Badge badgeContent={historyTotal > 99 ? "99+" : historyTotal} color="error" invisible={historyTotal === 0}>
                  <HistoryIcon />
                </Badge>
              }
              sx={{ borderRadius: "999px" }}
            >
              历史
            </Button>
          </Box>
        </Toolbar>
      </AppBar>

      {/* Layout: Sidebar + Content */}
      <Box sx={{ display: "flex", flex: 1 }}>
        <Sidebar activeTab={activeTab} onTabChange={setActiveTab} badges={{ strategies: 0 }} />

        <Box component="main" sx={{ flex: 1, minWidth: 0, maxWidth: "100%" }}>
          {activeTab === "search" && (
            <>
              {/* Hero */}
              <Box sx={{ textAlign: "center", padding: "60px 24px 40px", maxWidth: "680px", margin: "0 auto" }}>
                <Typography variant="h1" sx={{ marginBottom: "10px" }}>
                  用自然语言查询 A 股市场数据
                </Typography>
                <Typography variant="body1" sx={{ color: "text.secondary", marginBottom: "28px", fontSize: "18px" }}>
                  问财数据引擎 · 实时行情 · 智能筛选
                </Typography>

                <Box sx={{ maxWidth: "580px", margin: "0 auto" }}>
                  <TextField
                    fullWidth
                    variant="outlined"
                    placeholder='输入查询，例如 "北向资金流向"'
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") doSearch(query); }}
                    slotProps={{
                      input: {
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon color="action" />
                          </InputAdornment>
                        ),
                        endAdornment: (
                          <InputAdornment position="end">
                            <IconButton
                              onClick={() => doSearch(query)}
                              disabled={loading || !query.trim()}
                              color="primary"
                              sx={{ backgroundColor: "primary.main", color: "white", "&:hover": { backgroundColor: "#0077ed" } }}
                            >
                              {loading ? <CircularProgress size={20} color="inherit" /> : <SearchIcon />}
                            </IconButton>
                          </InputAdornment>
                      ),
                    },
                    }}
                    sx={{
                      "& .MuiOutlinedInput-root": {
                        borderRadius: "999px",
                        paddingRight: "4px",
                      },
                    }}
                  />

                  <Box sx={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 1, marginTop: "16px" }}>
                    {suggestions.map(s => (
                      <Chip
                        key={s}
                        label={s}
                        onClick={() => doSearch(s)}
                        variant="outlined"
                        sx={{ borderRadius: "999px" }}
                      />
                    ))}
                  </Box>
                </Box>
              </Box>

              {/* Results */}
              <Box sx={{ maxWidth: "980px", margin: "0 auto", padding: "0 24px 48px" }}>
                {loading && (
                  <Box sx={{ padding: "32px 20px", textAlign: "center", color: "text.secondary" }}>
                    <CircularProgress size={40} sx={{ marginBottom: "12px" }} />
                    <Typography>正在问财数据引擎查询...</Typography>
                  </Box>
                )}

                {error && (
                  <Alert severity="error" sx={{ marginBottom: "16px" }}>
                    {error}
                  </Alert>
                )}

                {result && !loading && (
                  <Box sx={{ marginBottom: "32px" }}>
                    <Box sx={{ 
                      display: "flex", 
                      alignItems: "center", 
                      gap: "12px", 
                      marginBottom: "16px",
                      padding: "12px 16px",
                      backgroundColor: isDarkMode ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
                      borderRadius: "10px",
                      border: "1px solid",
                      borderColor: "divider",
                    }}>
                      <Typography variant="h3" sx={{ fontSize: "16px" }}>查询结果</Typography>
                      <Chip 
                        label={`${result.total} 条记录`} 
                        color="primary" 
                        variant="filled" 
                        size="small"
                        sx={{ fontWeight: 500 }}
                      />
                      <Box sx={{ flex: 1 }} />
                      <Typography variant="body2" sx={{ color: "text.secondary", fontSize: "12px" }}>
                        {columns.length} 列
                      </Typography>
                      <Button
                        variant="outlined"
                        size="small"
                        startIcon={<DownloadIcon />}
                        onClick={() => exportData(`/api/export/query?q=${encodeURIComponent(query)}`)}
                      >
                        导出 Excel
                      </Button>
                    </Box>

                    {result.data && result.data.length > 0 ? (
                      <TableContainer 
                        component={Paper} 
                        sx={{ 
                          borderRadius: "12px", 
                          border: "1px solid", 
                          borderColor: "divider",
                          maxHeight: "70vh",
                          overflow: "auto",
                          "&::-webkit-scrollbar": {
                            width: "8px",
                            height: "8px",
                          },
                          "&::-webkit-scrollbar-track": {
                            background: "transparent",
                          },
                          "&::-webkit-scrollbar-thumb": {
                            background: isDarkMode ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.2)",
                            borderRadius: "4px",
                            "&:hover": {
                              background: isDarkMode ? "rgba(255,255,255,0.3)" : "rgba(0,0,0,0.3)",
                            },
                          },
                        }}
                      >
                        <Table stickyHeader size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell 
                                sx={{ 
                                  width: "48px", 
                                  textAlign: "center", 
                                  color: "text.secondary", 
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  backgroundColor: isDarkMode ? "#2c2c2e" : "#f8f8fa",
                                  borderBottom: "2px solid",
                                  borderColor: "divider",
                                  position: "sticky",
                                  left: 0,
                                  zIndex: 2,
                                }}
                              >
                                #
                              </TableCell>
                              {columns.map((col, i) => (
                                <TableCell 
                                  key={i} 
                                  align={isNumericCol(col) ? "right" : "left"}
                                  sx={{ 
                                    fontWeight: 600,
                                    fontSize: "12px",
                                    color: "text.secondary",
                                    backgroundColor: isDarkMode ? "#2c2c2e" : "#f8f8fa",
                                    borderBottom: "2px solid",
                                    borderColor: "divider",
                                    whiteSpace: "nowrap",
                                    width: getColumnWidth(col, i),
                                    minWidth: getColumnMinWidth(col, i),
                                    position: i < 1 ? "sticky" : "relative",
                                    left: i < 1 ? "48px" : "auto",
                                    zIndex: i < 1 ? 2 : 1,
                                  }}
                                >
                                  {col.label || col.field}
                                </TableCell>
                              ))}
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {result.data.map((row, ri) => {
                              const isEven = ri % 2 === 0;
                              return (
                                <TableRow 
                                  key={ri} 
                                  hover
                                  sx={{
                                    backgroundColor: isEven ? "transparent" : (isDarkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)"),
                                    "&:hover": {
                                      backgroundColor: isDarkMode ? "rgba(10, 132, 255, 0.08)" : "rgba(0, 113, 227, 0.04)",
                                    },
                                    "&:last-child td": {
                                      borderBottom: 0,
                                    },
                                  }}
                                >
                                  <TableCell 
                                    sx={{ 
                                      textAlign: "center", 
                                      color: "text.secondary", 
                                      fontSize: "11px",
                                      position: "sticky",
                                      left: 0,
                                      backgroundColor: isEven 
                                        ? (isDarkMode ? "#1c1c1e" : "#ffffff") 
                                        : (isDarkMode ? "#222224" : "#fafafa"),
                                      zIndex: 1,
                                      "&:hover": {
                                        backgroundColor: isDarkMode ? "rgba(10, 132, 255, 0.08)" : "rgba(0, 113, 227, 0.04)",
                                      },
                                    }}
                                  >
                                    {ri + 1}
                                  </TableCell>
                                  {columns.map((col, ci) => {
                                    const { text, cls } = formatCell(row, col);
                                    const isNumeric = isNumericCol(col);
                                    return (
                                      <TableCell 
                                        key={ci} 
                                        align={isNumeric ? "right" : "left"}
                                        sx={{ 
                                          color: cls === "up" ? colors.up : cls === "down" ? colors.down : cls === "flat" ? colors.flat : "inherit",
                                          fontVariantNumeric: "tabular-nums",
                                          fontSize: "13px",
                                          padding: "8px 12px",
                                          fontWeight: ci < 2 ? 500 : 400,
                                          whiteSpace: "nowrap",
                                          position: ci === 0 ? "sticky" : "relative",
                                          left: ci === 0 ? "48px" : "auto",
                                          backgroundColor: ci === 0 
                                            ? (isEven 
                                              ? (isDarkMode ? "#1c1c1e" : "#ffffff") 
                                              : (isDarkMode ? "#222224" : "#fafafa"))
                                            : "inherit",
                                          zIndex: ci === 0 ? 1 : 0,
                                          "&:hover": {
                                            backgroundColor: isDarkMode ? "rgba(10, 132, 255, 0.08)" : "rgba(0, 113, 227, 0.04)",
                                          },
                                        }}
                                      >
                                        {text}
                                      </TableCell>
                                    );
                                  })}
                                </TableRow>
                              );
                            })}
                          </TableBody>
                        </Table>
                      </TableContainer>
                    ) : (
                      <Box sx={{ 
                        padding: "48px 20px", 
                        textAlign: "center", 
                        color: "text.secondary",
                        backgroundColor: isDarkMode ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)",
                        borderRadius: "12px",
                        border: "1px dashed",
                        borderColor: "divider",
                      }}>
                        <Typography variant="body1" sx={{ marginBottom: "8px" }}>暂无数据</Typography>
                        <Typography variant="body2">尝试修改查询条件获取更多结果</Typography>
                      </Box>
                    )}
                  </Box>
                )}
              </Box>
            </>
          )}

          {activeTab === "strategies" && <StrategyPanel onRunStrategy={doSearch} />}
          {activeTab === "dashboard" && <DashboardPanel />}
          {activeTab === "watchlist" && <WatchlistPanel onSearch={doSearch} />}
          {activeTab === "builder" && <ConditionBuilder onQuery={doSearch} />}
          {activeTab === "alerts" && <AlertPanel />}
        </Box>
      </Box>

      {/* History Overlay & Panel */}
      {showHistory && (
        <>
          <Box
            sx={{
              position: "fixed",
              inset: 0,
              zIndex: 200,
              backgroundColor: "rgba(0, 0, 0, 0.15)",
              backdropFilter: "blur(4px)",
            }}
            onClick={() => setShowHistory(false)}
          />
          <Drawer
            anchor="right"
            open={showHistory}
            onClose={() => setShowHistory(false)}
            slotProps={{
              paper: {
                sx: {
                  width: "400px",
                  maxWidth: "90vw",
                  boxShadow: "-4px 0 24px rgba(0, 0, 0, 0.12)",
                },
              },
            }}
          >
            <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
              <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid", borderColor: "divider" }}>
                <Typography variant="h3">查询历史</Typography>
                <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                  {historyTotal > 0 && (
                    <Button
                      variant="outlined"
                      color="error"
                      size="small"
                      onClick={handleClearHistory}
                      sx={{ borderRadius: "999px" }}
                    >
                      清空
                    </Button>
                  )}
                  <IconButton onClick={() => setShowHistory(false)}>
                    <CloseIcon />
                  </IconButton>
                </Box>
              </Box>

              {historyLoading ? (
                <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px" }}>
                  <CircularProgress size={40} sx={{ marginBottom: "12px" }} />
                  <Typography color="text.secondary">加载中...</Typography>
                </Box>
              ) : history.length === 0 ? (
                <Box sx={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "48px 20px", color: "text.secondary" }}>
                  <HistoryIcon sx={{ fontSize: 48, opacity: 0.3, marginBottom: "16px" }} />
                  <Typography>暂无查询记录</Typography>
                  <Typography variant="body2" sx={{ marginTop: "8px", color: "text.secondary" }}>
                    开始查询后，历史记录将自动保存到这里
                  </Typography>
                </Box>
              ) : (
                <List sx={{ flex: 1, overflow: "auto", padding: "8px 0" }}>
                  {history.map((r) => (
                    <ListItem
                      key={r.id}
                      sx={{
                        borderLeft: "3px solid transparent",
                        "&:hover": {
                          backgroundColor: "action.hover",
                          borderLeftColor: r.status === "error" ? "error.main" : "primary.main",
                        },
                      }}
                    >
                      <ListItemText
                        primary={
                          <Typography
                            sx={{ fontWeight: 500, cursor: "pointer" }}
                            onClick={() => { doSearch(r.query); setShowHistory(false); }}
                          >
                            {r.query}
                          </Typography>
                        }
                        secondary={
                          <Box sx={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "6px" }}>
                            <Chip
                              label={r.status === "success" ? "成功" : "失败"}
                              size="small"
                              color={r.status === "success" ? "success" : "error"}
                              variant="outlined"
                              sx={{ borderRadius: "999px" }}
                            />
                            <Typography variant="caption" color="text.secondary">
                              {r.created_at}
                            </Typography>
                            {r.elapsed_ms != null && (
                              <Typography variant="caption" color="text.secondary">
                                {r.elapsed_ms}ms
                              </Typography>
                            )}
                            {r.result_count > 0 && (
                              <Typography variant="caption" color="text.secondary">
                                {r.result_count} 条
                              </Typography>
                            )}
                          </Box>
                        }
                      />
                      <ListItemSecondaryAction>
                        <IconButton
                          edge="end"
                          onClick={() => handleDeleteHistory(r.id)}
                          title="删除"
                          size="small"
                        >
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </ListItemSecondaryAction>
                    </ListItem>
                  ))}
                </List>
              )}

              {/* Pagination */}
              {historyTotal > 20 && (
                <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "12px", padding: "12px 20px", borderTop: "1px solid", borderColor: "divider" }}>
                  <Pagination
                    count={Math.ceil(historyTotal / 20)}
                    page={historyPage}
                    onChange={(_, page) => fetchHistory(page)}
                    color="primary"
                    size="small"
                  />
                </Box>
              )}
            </Box>
          </Drawer>
        </>
      )}

      {/* AI Settings Dialog */}
      <Dialog open={showSettings} onClose={() => setShowSettings(false)} maxWidth="sm" fullWidth>
        <DialogTitle>🤖 AI 诊断设置</DialogTitle>
        <DialogContent>
          <Box sx={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "8px" }}>
            <Typography variant="body2" color="text.secondary">
              配置 OpenAI 兼容 API，用于一键诊股功能。配置信息仅存储在本地，不会上传。
            </Typography>
            <TextField
              fullWidth
              label="API Key"
              type="password"
              value={aiConfigForm.apiKey}
              onChange={e => setAiConfigForm(prev => ({ ...prev, apiKey: e.target.value }))}
              placeholder="sk-..."
              size="small"
            />
            <TextField
              fullWidth
              label="Base URL"
              value={aiConfigForm.baseUrl}
              onChange={e => setAiConfigForm(prev => ({ ...prev, baseUrl: e.target.value }))}
              placeholder="https://api.openai.com/v1"
              size="small"
            />
            <TextField
              fullWidth
              label="模型"
              value={aiConfigForm.model}
              onChange={e => setAiConfigForm(prev => ({ ...prev, model: e.target.value }))}
              placeholder="gpt-4o-mini"
              size="small"
              helperText="推荐：gpt-4o-mini（经济）、gpt-4o（精准）、deepseek-chat、qwen-turbo 等"
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSettings(false)}>取消</Button>
          <Button
            variant="contained"
            disabled={configSaving}
            onClick={async () => {
              setConfigSaving(true);
              try {
                const res = await api.put("/api/config/ai", aiConfigForm);
                if (res.ok) {
                  setConfigMsg("配置已保存 ✅");
                  setShowSettings(false);
                } else {
                  setConfigMsg("保存失败");
                }
              } catch { setConfigMsg("保存失败"); }
              setConfigSaving(false);
            }}
          >
            保存
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!configMsg}
        autoHideDuration={3000}
        onClose={() => setConfigMsg("")}
        message={configMsg}
      />

      {/* Footer */}
      <Box component="footer" sx={{ 
        textAlign: "center", 
        padding: "32px 24px 48px", 
        color: "text.secondary", 
        fontSize: "13px", 
        borderTop: "1px solid", 
        borderColor: "divider",
        maxWidth: "980px",
        margin: "0 auto",
      }}>
        StockEasy · 数据来源：问财 · 仅供学习参考
      </Box>
    </Box>
  );
}
