import { JSX, useState, useEffect, useCallback, useRef } from "react";
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
  Badge,
  Autocomplete,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  LinearProgress
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
import MedicalServicesIcon from "@mui/icons-material/MedicalServices";

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
  const [searchOptions, setSearchOptions] = useState<{ code: string; name: string }[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Diagnosis state
  const [diagnosing, setDiagnosing] = useState<string | null>(null); // stock code being diagnosed
  const [diagResult, setDiagResult] = useState<{ score: number; recommendation: string; reason: string } | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagError, setDiagError] = useState("");

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
        const key = (p.股票代码 || "").replace(/\.(SZ|SH|BJ)$/i, "");
        map[key] = p;
      });
      setPrices(map);
    } catch (e) { console.error(e); }
    setRefreshing(false);
  }, []);

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

  const handleEditNote = async (id: number) => {
    await fetch(`/api/watchlist/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ note: editNote }),
    });
    setEditingId(null);
    fetchWatchlist();
  };

  const handleCreateAlert = async (item: WatchItem, up: string, down: string) => {
    if (!up && !down) return;
    await fetch("/api/alerts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stock_code: item.stock_code,
        stock_name: item.stock_name,
        threshold_up: up ? parseFloat(up) : null,
        threshold_down: down ? parseFloat(down) : null,
      }),
    });
    const alertRes = await fetch("/api/alerts");
    setAlerts(await alertRes.json());
  };

  const handleDeleteAlert = async (aid: number) => {
    await fetch(`/api/alerts/${aid}`, { method: "DELETE" });
    const alertRes = await fetch("/api/alerts");
    setAlerts(await alertRes.json());
  };

  const handleToggleAlert = async (aid: number, enabled: number) => {
    await fetch(`/api/alerts/${aid}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: enabled ? 0 : 1 }),
    });
    const alertRes = await fetch("/api/alerts");
    setAlerts(await alertRes.json());
  };

  useEffect(() => { fetchWatchlist(); }, [fetchWatchlist]);

  useEffect(() => {
    if (items.length > 0 && Object.keys(prices).length === 0) {
      refreshPrices();
    }
  }, [items, prices, refreshPrices]);

  // ---------- diagnosis ----------
  const handleDiagnose = async (code: string, name: string) => {
    setDiagnosing(code);
    setDiagLoading(true);
    setDiagError("");
    setDiagResult(null);
    try {
      const res = await fetch("/api/diagnose/" + code, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (res.status === 400) {
        const err = await res.json();
        setDiagError(err.error || "请先在设置中配置 AI API Key");
        return;
      }
      if (!res.ok) {
        setDiagError("诊断失败，请稍后重试");
        return;
      }
      const data = await res.json();
      setDiagResult(data);
    } catch {
      setDiagError("诊断请求失败");
    } finally {
      setDiagLoading(false);
    }
  };

  const getPriceColor = (p: PriceInfo | undefined) => {
    if (!p) return "text.secondary";
    const chg = p.最新涨跌幅;
    if (chg !== undefined && chg !== null) {
      if (chg > 0) return "error.main";
      if (chg < 0) return "success.main";
    }
    return "text.secondary";
  };

  const getChangeText = (p: PriceInfo | undefined) => {
    if (!p) return "";
    const price = p.最新价;
    const chg = p.最新涨跌幅;
    if (price !== undefined && price !== null && chg !== undefined && chg !== null) {
      return `${price.toFixed(2)} (${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%)`;
    }
    return "";
  };

  return (
    <Box>
      {/* 头部操作栏 */}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
        <Typography variant="h6" fontWeight={600}>📋 自选股</Typography>
        <Box sx={{ display: "flex", gap: "8px" }}>
          <Tooltip title="刷新行情">
            <IconButton size="small" onClick={refreshPrices} disabled={refreshing}>
              {refreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
            </IconButton>
          </Tooltip>
          <Button
            size="small"
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={async () => {
              try {
                const res = await fetch("/api/export/watchlist");
                const blob = await res.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "自选股.xlsx";
                a.click();
                URL.revokeObjectURL(url);
              } catch (e) { console.error(e); }
            }}
          >
            导出
          </Button>
        </Box>
      </Box>

      {showAdd && (
        <Card sx={{ marginBottom: "20px", borderRadius: "12px" }}>
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px" }}>
            <Autocomplete
              freeSolo
              fullWidth
              options={searchOptions}
              loading={searchLoading}
              getOptionLabel={(option: any) => {
                if (typeof option === "string") return option;
                return option.name + " (" + option.code + ")";
              }}
              renderOption={(props: any, option: any) => {
                const { key, ...rest } = props;
                return (
                  <Box component="li" key={key} {...rest} sx={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                    <Typography variant="body2">{option.name}</Typography>
                    <Typography variant="caption" color="text.secondary">{option.code}</Typography>
                  </Box>
                );
              }}
              renderInput={(params: any) => {
                return (
                  <TextField
                    {...params}
                    label="搜索股票（名称或代码）*"
                    placeholder="如 茅台 / 600519"
                    size="small"
                  />
                );
              }}
              onInputChange={(_e: any, val: string) => {
                if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
                if (val.length < 1) {
                  setSearchOptions([]);
                  setCode("");
                  setSname("");
                  return;
                }
                searchTimerRef.current = setTimeout(async () => {
                  setSearchLoading(true);
                  try {
                    const res = await fetch("/api/stocks/search?q=" + encodeURIComponent(val));
                    const data = await res.json();
                    setSearchOptions(data || []);
                  } catch (_e) { setSearchOptions([]); }
                  setSearchLoading(false);
                }, 300);
              }}
              onChange={(_e: any, val: any) => {
                if (val && typeof val === "object" && !Array.isArray(val)) {
                  setCode(val.code);
                  setSname(val.name);
                } else if (typeof val === "string") {
                  setCode(val);
                  setSname("");
                } else {
                  setCode("");
                  setSname("");
                }
              }}
              isOptionEqualToValue={(option: any, value: any) => option.code === value.code}
              noOptionsText="未找到匹配股票"
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
            <Box sx={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
              <Button size="small" onClick={() => { setShowAdd(false); setCode(""); setSname(""); }}>取消</Button>
              <Button size="small" variant="contained" onClick={handleAdd} disabled={!code.trim() || !sname.trim()}>添加</Button>
            </Box>
          </CardContent>
        </Card>
      )}

      <Button
        size="small"
        variant={showAdd ? "outlined" : "contained"}
        startIcon={<AddIcon />}
        onClick={() => setShowAdd(!showAdd)}
        sx={{ marginBottom: "16px" }}
      >
        {showAdd ? "收起" : "添加股票"}
      </Button>

      {/* 自选股列表 */}
      {loading ? (
        <Box sx={{ display: "flex", justifyContent: "center", padding: "40px" }}>
          <CircularProgress />
        </Box>
      ) : items.length === 0 ? (
        <Typography color="text.secondary" textAlign="center" sx={{ padding: "40px" }}>
          还没有自选股，点击上方按钮添加
        </Typography>
      ) : (
        Object.entries(
          items.reduce((acc: Record<string, WatchItem[]>, item) => {
            const g = item.group_name || "默认";
            if (!acc[g]) acc[g] = [];
            acc[g].push(item);
            return acc;
          }, {})
        ).sort(([a], [b]) => {
          const order = ["默认", "核心持仓", "观察仓", "ETF"];
          return (order.indexOf(a) - order.indexOf(b));
        }).map(([gName, gItems]) => (
          <Box key={gName} sx={{ marginBottom: "16px" }}>
            <Typography variant="subtitle2" fontWeight={600} sx={{ marginBottom: "8px", paddingLeft: "4px" }}>
              {gName}
              <Typography component="span" variant="caption" color="text.secondary" sx={{ marginLeft: "8px" }}>
                {gItems.length} 只
              </Typography>
            </Typography>
            {gItems.map(item => {
              const pCode = item.stock_code;
              const price = prices[pCode];
              const color = getPriceColor(price);
              const changeText = getChangeText(price);
              const alert = alerts.find(a => a.stock_code === item.stock_code);
              const af = alertForm[item.id];

              return (
                <Card key={item.id} sx={{ marginBottom: "8px", borderRadius: "10px", overflow: "visible" }}>
                  <CardContent sx={{ padding: "12px 16px !important" }}>
                    <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <Box sx={{ flex: 1 }}>
                        <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Box
                            component="span"
                            onClick={() => onSearch(item.stock_code)}
                            sx={{ cursor: "pointer", "&:hover": { opacity: 0.8 } }}
                          >
                            <Typography fontWeight={600} display="inline">{item.stock_name}</Typography>
                          </Box>
                          <Typography variant="caption" color="text.secondary">{item.stock_code}</Typography>
                          {alert && (
                            <Tooltip title={alert.enabled ? "已设告警" : "告警已停用"}>
                              <NotificationsIcon sx={{ fontSize: 14, color: alert.enabled ? "warning.main" : "text.disabled" }} />
                            </Tooltip>
                          )}
                        </Box>
                        {item.note && (
                          <Typography variant="caption" color="text.secondary" sx={{ marginTop: "2px", display: "block" }}>
                            {item.note}
                          </Typography>
                        )}
                      </Box>
                      <Box sx={{ textAlign: "right", minWidth: "110px" }}>
                        {price ? (
                          <Typography variant="body2" fontWeight={600} color={color}>
                            {changeText}
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.secondary">--</Typography>
                        )}
                      </Box>
                      <Box sx={{ display: "flex", gap: "4px", marginLeft: "8px" }}>
                        {editingId === item.id ? (
                          <>
                            <TextField
                              size="small"
                              value={editNote}
                              onChange={e => setEditNote(e.target.value)}
                              placeholder="备注"
                              sx={{ width: "100px" }}
                            />
                            <IconButton size="small" onClick={() => handleEditNote(item.id)} color="primary">
                              <Typography variant="caption">保存</Typography>
                            </IconButton>
                          </>
                        ) : (
                          <IconButton size="small" onClick={() => { setEditingId(item.id); setEditNote(item.note || ""); }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        )}
                        <IconButton size="small" onClick={() => {
                          setAlertForm(prev => ({ ...prev, [item.id]: { show: !prev[item.id]?.show, up: "", down: "" } }));
                        }}>
                          <NotificationsIcon fontSize="small" />
                        </IconButton>
                        <Tooltip title="一键诊股">
                          <IconButton
                            size="small"
                            onClick={() => handleDiagnose(item.stock_code, item.stock_name)}
                            color={diagResult && diagResult.score >= 7 ? "success" : diagResult && diagResult.score >= 4 ? "warning" : "default"}
                          >
                            {diagnosing === item.stock_code && diagLoading ? (
                              <CircularProgress size={16} />
                            ) : (
                              <MedicalServicesIcon fontSize="small" />
                            )}
                          </IconButton>
                        </Tooltip>
                        <IconButton size="small" onClick={() => handleDelete(item.id)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Box>
                    </Box>

                    {/* 告警表单 */}
                    {af?.show && (
                      <Box sx={{ marginTop: "8px", padding: "8px", bgcolor: "action.hover", borderRadius: "8px" }}>
                        <Typography variant="caption" fontWeight={600} sx={{ marginBottom: "6px", display: "block" }}>
                          设置涨跌告警 - {item.stock_name}
                        </Typography>
                        <Box sx={{ display: "flex", gap: "8px", alignItems: "center" }}>
                          <TextField size="small" label="涨超 (%)" value={af.up} onChange={e => setAlertForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], up: e.target.value } }))} sx={{ width: "100px" }} />
                          <TextField size="small" label="跌超 (%)" value={af.down} onChange={e => setAlertForm(prev => ({ ...prev, [item.id]: { ...prev[item.id], down: e.target.value } }))} sx={{ width: "100px" }} />
                          <Button size="small" variant="contained" onClick={() => handleCreateAlert(item, af.up, af.down)}>确定</Button>
                          {alert && (
                            <>
                              <Button size="small" color={alert.enabled ? "warning" : "success"} onClick={() => handleToggleAlert(alert.id, alert.enabled)}>
                                {alert.enabled ? "暂停" : "启用"}
                              </Button>
                              <IconButton size="small" onClick={() => handleDeleteAlert(alert.id)}>
                                <DeleteIcon fontSize="small" />
                              </IconButton>
                            </>
                          )}
                        </Box>
                      </Box>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </Box>
        ))
      )}

      {/* 诊股结果弹窗 */}
      <Dialog open={diagResult !== null || !!diagError} onClose={() => { setDiagResult(null); setDiagError(""); setDiagnosing(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>
          {diagnosing ? "诊股结果 - " + diagnosing : "诊股"}
        </DialogTitle>
        <DialogContent>
          {diagLoading && (
            <Box sx={{ textAlign: "center", padding: "32px" }}>
              <CircularProgress />
              <Typography sx={{ marginTop: "16px" }} color="text.secondary">AI 分析中...</Typography>
            </Box>
          )}
          {diagError && (
            <Box sx={{ textAlign: "center", padding: "16px" }}>
              <Typography color="error">{diagError}</Typography>
            </Box>
          )}
          {diagResult && !diagLoading && (
            <Box sx={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* 评分 */}
              <Box sx={{ textAlign: "center" }}>
                <Typography variant="h3" fontWeight={700} sx={{
                  color: diagResult.score >= 7 ? "success.main" : diagResult.score >= 4 ? "warning.main" : "error.main",
                }}>
                  {diagResult.score}/10
                </Typography>
                <Typography variant="body1" fontWeight={600} sx={{
                  color: diagResult.score >= 7 ? "success.main" : diagResult.score >= 4 ? "warning.main" : "error.main",
                }}>
                  {diagResult.recommendation}
                </Typography>
                <Box sx={{ width: "100%", marginTop: "8px" }}>
                  <LinearProgress
                    variant="determinate"
                    value={diagResult.score * 10}
                    color={diagResult.score >= 7 ? "success" : diagResult.score >= 4 ? "warning" : "error"}
                    sx={{ height: 8, borderRadius: 4 }}
                  />
                </Box>
              </Box>

              <Divider />

              {/* 分析理由 */}
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
                {diagResult.reason}
              </Typography>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDiagResult(null); setDiagError(""); setDiagnosing(null); }}>关闭</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
