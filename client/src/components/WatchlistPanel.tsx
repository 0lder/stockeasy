import { JSX, useState, useEffect, useCallback } from "react";
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
  CircularProgress, 
  Collapse, 
  Divider,
  useTheme,
  Tooltip,
  Badge
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/Download";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import NotificationsIcon from "@mui/icons-material/Notifications";
import SearchIcon from "@mui/icons-material/Search";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

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
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  
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
    return { text: `${n > 0 ? "+" : ""}${n.toFixed(2)}%`, color: n > 0 ? "error.main" : n < 0 ? "success.main" : "text.secondary" };
  };

  const groupMap = new Map<string, WatchItem[]>();
  items.forEach(item => {
    if (!groupMap.has(item.group_name)) groupMap.set(item.group_name, []);
    groupMap.get(item.group_name)!.push(item);
  });

  return (
    <Box sx={{ maxWidth: "780px", margin: "0 auto", padding: "28px 24px 48px" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "8px" }}>
        <Typography variant="h2" sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          ⭐ 自选股
        </Typography>
        <Box sx={{ display: "flex", gap: "8px" }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={showAdd ? null : <AddIcon />}
            onClick={() => setShowAdd(!showAdd)}
            sx={{ borderRadius: "999px" }}
          >
            {showAdd ? "取消" : "添加"}
          </Button>
          <Button
            variant="outlined"
            startIcon={refreshing ? <CircularProgress size={16} /> : <RefreshIcon />}
            onClick={refreshPrices}
            disabled={refreshing}
            sx={{ borderRadius: "999px" }}
          >
            {refreshing ? "刷新中..." : "刷新行情"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={exportWatchlist}
            sx={{ borderRadius: "999px" }}
          >
            导出
          </Button>
        </Box>
      </Box>

      {showAdd && (
        <Card sx={{ marginBottom: "20px", borderRadius: "12px" }}>
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px" }}>
            <TextField
              fullWidth
              label="股票代码 *（如 600519）"
              value={code}
              onChange={e => setCode(e.target.value)}
              size="small"
            />
            <TextField
              fullWidth
              label="股票名称 *（如 贵州茅台）"
              value={sname}
              onChange={e => setSname(e.target.value)}
              size="small"
            />
            <FormControl fullWidth size="small">
              <InputLabel>分组</InputLabel>
              <Select
                value={group}
                label="分组"
                onChange={e => setGroup(e.target.value)}
              >
                <MenuItem value="默认">默认</MenuItem>
                <MenuItem value="核心持仓">核心持仓</MenuItem>
                <MenuItem value="观察仓">观察仓</MenuItem>
                <MenuItem value="ETF">ETF</MenuItem>
                {groups.filter(g => !["默认","核心持仓","观察仓","ETF"].includes(g)).map(g => (
                  <MenuItem key={g} value={g}>{g}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Button
              variant="contained"
              color="primary"
              onClick={handleAdd}
              sx={{ borderRadius: "999px", alignSelf: "flex-start" }}
            >
              添加
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Box sx={{ textAlign: "center", padding: "48px" }}>
          <CircularProgress size={40} sx={{ marginBottom: "12px" }} />
          <Typography color="text.secondary">加载中...</Typography>
        </Box>
      ) : items.length === 0 ? (
        <Box sx={{ textAlign: "center", padding: "48px 20px", color: "text.secondary" }}>
          <Typography>自选股列表为空</Typography>
          <Typography variant="body2" sx={{ marginTop: "8px", color: "text.secondary" }}>
            添加股票到自选股，随时查看行情
          </Typography>
        </Box>
      ) : (
        <Box>
          {[...groupMap.entries()].map(([g, gItems]) => (
            <Box key={g} sx={{ marginBottom: "20px" }}>
              <Typography variant="caption" sx={{ 
                fontWeight: 600, 
                color: "text.secondary", 
                textTransform: "uppercase", 
                letterSpacing: "0.04em", 
                marginBottom: "8px", 
                padding: "0 2px" 
              }}>
                {g} ({gItems.length})
              </Typography>
              {gItems.map(item => {
                const price = prices[item.stock_code];
                const change = price ? formatChange(price["最新涨跌幅"]) : null;
                const alert = alerts.find(a => a.stock_code === item.stock_code);
                const af = alertForm[item.id];
                return (
                  <Card key={item.id} sx={{ 
                    marginBottom: "6px", 
                    borderRadius: "8px", 
                    border: "1px solid", 
                    borderColor: "divider",
                    "&:hover": { 
                      backgroundColor: "action.hover", 
                      borderColor: "action.hover" 
                    }
                  }}>
                    <CardContent sx={{ 
                      display: "flex", 
                      alignItems: "center", 
                      justifyContent: "space-between", 
                      padding: "12px 14px", 
                      "&:last-child": { paddingBottom: "12px" } 
                    }}>
                      <Box 
                        sx={{ flex: 1, minWidth: 0, cursor: "pointer" }} 
                        onClick={() => onSearch(item.stock_name)}
                      >
                        <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                          <Typography variant="body1" sx={{ fontWeight: 600 }}>
                            {item.stock_name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "text.secondary" }}>
                            {item.stock_code}
                          </Typography>
                        </Box>
                        {item.note && (
                          <Typography variant="caption" sx={{ color: "text.secondary", marginTop: "2px" }}>
                            {item.note}
                          </Typography>
                        )}
                        {alert && (
                          <Chip
                            size="small"
                            label={`🔔 ${alert.threshold_up > 0 ? `涨${alert.threshold_up}%` : ""}${alert.threshold_down < 0 ? ` 跌${Math.abs(alert.threshold_down)}%` : ""}`}
                            sx={{ marginTop: "4px", fontSize: "11px" }}
                          />
                        )}
                      </Box>
                      
                      <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        {price ? (
                          <Box sx={{ textAlign: "right" }}>
                            <Typography variant="body1" sx={{ fontWeight: 600 }}>
                              {formatPrice(price["最新价"])}
                            </Typography>
                            {change && (
                              <Typography variant="caption" sx={{ color: change.color, fontWeight: 500 }}>
                                {change.text}
                              </Typography>
                            )}
                          </Box>
                        ) : (
                          <Button size="small" onClick={refreshPrices}>
                            加载
                          </Button>
                        )}
                        
                        <Tooltip title="告警设置">
                          <IconButton 
                            size="small" 
                            onClick={() => toggleAlertForm(item.id, item.stock_code)}
                            sx={{ color: alert ? "warning.main" : "text.secondary" }}
                          >
                            <NotificationsIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        
                        <FormControl size="small" sx={{ minWidth: 80 }}>
                          <Select
                            value={item.group_name}
                            onChange={e => handleGroupChange(item.id, e.target.value)}
                            size="small"
                            sx={{ fontSize: "12px" }}
                          >
                            <MenuItem value="默认">默认</MenuItem>
                            <MenuItem value="核心持仓">核心持仓</MenuItem>
                            <MenuItem value="观察仓">观察仓</MenuItem>
                            <MenuItem value="ETF">ETF</MenuItem>
                          </Select>
                        </FormControl>
                        
                        <Tooltip title="删除">
                          <IconButton size="small" onClick={() => handleDelete(item.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </CardContent>
                    
                    <Collapse in={af?.show}>
                      <Box sx={{ padding: "12px 14px", borderTop: "1px solid", borderColor: "divider" }}>
                        <Box sx={{ display: "flex", gap: "8px", alignItems: "center", marginBottom: "8px" }}>
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>涨超 %</Typography>
                          <TextField
                            size="small"
                            type="number"
                            value={af?.up || ""}
                            onChange={e => setAlertForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], up: e.target.value } }))}
                            sx={{ width: 80 }}
                          />
                          <Typography variant="caption" sx={{ color: "text.secondary" }}>跌超 %</Typography>
                          <TextField
                            size="small"
                            type="number"
                            value={af?.down || ""}
                            onChange={e => setAlertForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], down: e.target.value } }))}
                            sx={{ width: 80 }}
                          />
                        </Box>
                        <Box sx={{ display: "flex", gap: "8px" }}>
                          <Button 
                            variant="contained" 
                            size="small" 
                            onClick={() => saveAlert(item.id, item.stock_code, item.stock_name)}
                          >
                            保存
                          </Button>
                          {alert && (
                            <Button 
                              variant="text" 
                              size="small" 
                              color="error"
                              onClick={() => deleteAlert(item.stock_code)}
                            >
                              删除告警
                            </Button>
                          )}
                          <Button 
                            variant="text" 
                            size="small" 
                            onClick={() => setAlertForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], show: false } }))}
                          >
                            取消
                          </Button>
                        </Box>
                        {alert && (alert.last_triggered_up || alert.last_triggered_down) && (
                          <Typography variant="caption" sx={{ color: "text.secondary", marginTop: "8px", display: "block" }}>
                            上次触发: {alert.last_triggered_up && `涨 @${alert.last_triggered_up}`}
                            {alert.last_triggered_down && ` 跌 @${alert.last_triggered_down}`}
                          </Typography>
                        )}
                      </Box>
                    </Collapse>
                  </Card>
                );
              })}
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
}
