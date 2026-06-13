import { JSX, useState, useEffect } from "react";
import { 
  Box, 
  Typography, 
  Button, 
  TextField, 
  Card, 
  CardContent, 
  Chip, 
  IconButton, 
  CircularProgress, 
  Switch, 
  FormControlLabel, 
  Divider, 
  useTheme,
  Alert,
  Tooltip,
  Grid
} from "@mui/material";
import NotificationsIcon from "@mui/icons-material/Notifications";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import PauseIcon from "@mui/icons-material/Pause";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import WarningIcon from "@mui/icons-material/Warning";
import SyncIcon from "@mui/icons-material/Sync";
import SaveIcon from "@mui/icons-material/Save";
import CancelIcon from "@mui/icons-material/Cancel";
import DownloadIcon from "@mui/icons-material/Download";

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
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  
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
      fetchAlerts();
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
    <Box sx={{ maxWidth: "780px", margin: "0 auto", padding: "28px 24px 48px" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "8px" }}>
        <Box>
          <Typography variant="h2" sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
            🔔 涨跌告警
          </Typography>
          <Typography variant="body2" sx={{ color: "text.secondary", marginTop: "4px" }}>
            监控自选股涨跌，超阈值自动通知
          </Typography>
        </Box>
        <Box sx={{ display: "flex", gap: "8px" }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={checking ? <CircularProgress size={16} /> : <SyncIcon />}
            onClick={handleCheck}
            disabled={checking}
            sx={{ borderRadius: "999px" }}
          >
            {checking ? "检查中..." : "检查告警"}
          </Button>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={handleImportFromWatchlist}
            sx={{ borderRadius: "999px" }}
          >
            从自选股导入
          </Button>
        </Box>
      </Box>

      {checkResult && (
        <Alert 
          severity={checkResult.triggered?.length > 0 ? "warning" : "success"}
          sx={{ marginBottom: "20px", borderRadius: "12px" }}
        >
          <Typography variant="body2" sx={{ fontWeight: 600, marginBottom: "4px" }}>
            检查结果
          </Typography>
          <Typography variant="body2">
            检查 {checkResult.checked} 条告警
            {checkResult.triggered?.length > 0
              ? `，${checkResult.triggered.length} 条触发 🔔`
              : "，无触发 ✅"}
          </Typography>
          {checkResult.triggered?.length > 0 && (
            <Box sx={{ marginTop: "8px" }}>
              {checkResult.triggered.map((t: any, i: number) => (
                <Box key={i} sx={{ 
                  display: "flex", 
                  alignItems: "center", 
                  gap: "8px", 
                  padding: "4px 8px", 
                  backgroundColor: isDarkMode ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.02)",
                  borderRadius: "4px",
                  marginBottom: "4px"
                }}>
                  <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    {t.stock_name}
                  </Typography>
                  <Typography variant="body2" sx={{ color: t.direction === "down" ? "success.main" : "error.main" }}>
                    {t.change > 0 ? "+" : ""}{t.change.toFixed(2)}%
                  </Typography>
                  <Typography variant="caption" sx={{ color: "text.secondary" }}>
                    (阈值: {t.direction === "down" ? "跌破" : "涨超"}{t.threshold}%)
                  </Typography>
                </Box>
              ))}
            </Box>
          )}
        </Alert>
      )}

      {loading ? (
        <Box sx={{ textAlign: "center", padding: "48px" }}>
          <CircularProgress size={40} sx={{ marginBottom: "12px" }} />
          <Typography color="text.secondary">加载中...</Typography>
        </Box>
      ) : alerts.length === 0 ? (
        <Box sx={{ textAlign: "center", padding: "48px 20px", color: "text.secondary" }}>
          <Typography>暂无告警设置</Typography>
          <Typography variant="body2" sx={{ marginTop: "8px", color: "text.secondary" }}>
            点击「从自选股导入」快速添加
          </Typography>
        </Box>
      ) : (
        <Box>
          {alerts.map((a) => (
            <Card key={a.id} sx={{ 
              marginBottom: "8px", 
              borderRadius: "8px", 
              border: "1px solid", 
              borderColor: "divider",
              opacity: a.enabled ? 1 : 0.6,
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
                <Box sx={{ flex: 1 }}>
                  <Box sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>
                      {a.stock_name}
                    </Typography>
                    <Typography variant="body2" sx={{ color: "text.secondary" }}>
                      {a.stock_code}
                    </Typography>
                    {!a.enabled && (
                      <Chip 
                        size="small" 
                        label="已暂停" 
                        sx={{ fontSize: "11px" }}
                      />
                    )}
                  </Box>
                  
                  {editingId === a.id ? (
                    <Box sx={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "8px" }}>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>涨超</Typography>
                      <TextField
                        size="small"
                        type="number"
                        value={editUp}
                        onChange={e => setEditUp(e.target.value)}
                        sx={{ width: 70 }}
                      />
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>%</Typography>
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>跌破</Typography>
                      <TextField
                        size="small"
                        type="number"
                        value={editDown}
                        onChange={e => setEditDown(e.target.value)}
                        sx={{ width: 70 }}
                      />
                      <Typography variant="caption" sx={{ color: "text.secondary" }}>%</Typography>
                      <Tooltip title="保存">
                        <IconButton size="small" onClick={() => saveEdit(a.id)}>
                          <SaveIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title="取消">
                        <IconButton size="small" onClick={() => setEditingId(null)}>
                          <CancelIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Box>
                  ) : (
                    <Box sx={{ display: "flex", gap: "6px", alignItems: "center", marginTop: "8px" }}>
                      <Chip 
                        size="small" 
                        label={`↑${a.threshold_up}%`}
                        color={a.threshold_up > 0 ? "error" : "default"}
                        variant="outlined"
                        sx={{ fontSize: "11px" }}
                      />
                      <Chip 
                        size="small" 
                        label={`↓${a.threshold_down}%`}
                        color={a.threshold_down < 0 ? "success" : "default"}
                        variant="outlined"
                        sx={{ fontSize: "11px" }}
                      />
                      {a.last_triggered_up && (
                        <Typography variant="caption" sx={{ color: "text.secondary", marginLeft: "8px" }}>
                          上次涨触发: {a.last_triggered_up}
                        </Typography>
                      )}
                      {a.last_triggered_down && (
                        <Typography variant="caption" sx={{ color: "text.secondary", marginLeft: "8px" }}>
                          上次跌触发: {a.last_triggered_down}
                        </Typography>
                      )}
                    </Box>
                  )}
                </Box>
                
                <Box sx={{ display: "flex", gap: "4px" }}>
                  <Tooltip title="编辑">
                    <IconButton size="small" onClick={() => startEdit(a)}>
                      <EditIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={a.enabled ? "暂停" : "启用"}>
                    <IconButton size="small" onClick={() => handleToggleEnabled(a)}>
                      {a.enabled ? <PauseIcon fontSize="small" /> : <PlayArrowIcon fontSize="small" />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="删除">
                    <IconButton size="small" onClick={() => handleDelete(a.id)}>
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>
              </CardContent>
            </Card>
          ))}
        </Box>
      )}
    </Box>
  );
}
