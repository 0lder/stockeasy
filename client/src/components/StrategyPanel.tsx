import { JSX, useState, useEffect } from "react";
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
  Grid, 
  Chip, 
  IconButton, 
  CircularProgress, 
  Collapse, 
  useTheme
} from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/Edit";
import DeleteIcon from "@mui/icons-material/Delete";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import BarChartIcon from "@mui/icons-material/BarChart";
import DownloadIcon from "@mui/icons-material/Download";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";

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
  snapshot: any;
  stocks: any[];
  performance: any;
}

export default function StrategyPanel({ onRunStrategy }: { onRunStrategy: (query: string) => void }): JSX.Element {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [queryText, setQueryText] = useState("");
  const [description, setDescription] = useState("");
  const [groupName, setGroupName] = useState("默认");
  const [editingId, setEditingId] = useState<number | null>(null);

  // Snapshots (每个策略只有一组)
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [snapshotDetail, setSnapshotDetail] = useState<SnapshotDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [expandedStrategy, setExpandedStrategy] = useState<number | null>(null);
  const [snapshotError, setSnapshotError] = useState<string>("");

  // Export snapshot to Excel
  const exportSnapshot = async (snapshotId: number) => {
    try {
      const res = await fetch(`/api/export/snapshot/${snapshotId}`);
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || "导出失败");
        return;
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `snapshot_${snapshotId}.xlsx`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      alert("导出失败: " + e.message);
    }
  };


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
      const data = await res.json();
      setSnapshots(data);
      return data;
    } catch (e) { console.error(e); }
    return [];
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

  // 重新生成快照：运行策略 → 替换旧快照
  const handleSaveSnapshot = async (s: Strategy) => {
    setSavingId(s.id);
    try {
      const queryRes = await fetch(`/api/query?q=${encodeURIComponent(s.query_text)}&limit=50`);
      const queryData = await queryRes.json();
      if (!queryData.data || queryData.data.length === 0) {
        alert("策略没有选出任何股票，无法生成快照");
        setSavingId(null);
        return;
      }
      const snapRes = await fetch(`/api/strategies/${s.id}/snapshot`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stocks: queryData.data }),
      });
      const snapData = await snapRes.json();
      if (snapData.success) {
        // 刷新展开的快照视图
        const snaps = await fetchSnapshots(s.id);
        if (snaps && snaps.length > 0) await handleViewSnapshot(snaps[0].id);
        onRunStrategy(s.query_text);
      }
    } catch (e) {
      console.error(e);
      alert("重新生成快照失败");
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

  // 展开/收起策略快照：自动加载唯一的快照详情
  const toggleExpand = async (strategyId: number) => {
    if (expandedStrategy === strategyId) {
      setExpandedStrategy(null);
      setSnapshots([]);
      setSnapshotDetail(null);
      setSnapshotError("");
      return;
    }
    setExpandedStrategy(strategyId);
    setSnapshotDetail(null);
    setSnapshotError("");
    const snaps = await fetchSnapshots(strategyId);
    if (snaps && snaps.length > 0) {
      await handleViewSnapshot(snaps[0].id);
    }
  };

  const groups = [...new Set(strategies.map(s => s.group_name))];

  return (
    <Box sx={{ maxWidth: "780px", margin: "0 auto", padding: "28px 24px 48px" }}>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px", flexWrap: "wrap", gap: "8px" }}>
        <Typography variant="h2" sx={{ display: "flex", alignItems: "center", gap: "8px" }}>
          📋 策略管理
        </Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={showForm ? null : <AddIcon />}
          onClick={() => { setShowForm(!showForm); setEditingId(null); setName(""); setQueryText(""); setDescription(""); setGroupName("默认"); }}
          sx={{ borderRadius: "999px" }}
        >
          {showForm ? "取消" : "新建策略"}
        </Button>
      </Box>

      {showForm && (
        <Card sx={{ marginBottom: "20px", borderRadius: "12px" }}>
          <CardContent sx={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px" }}>
            <TextField
              fullWidth
              label="策略名称 *"
              value={name}
              onChange={e => setName(e.target.value)}
              size="small"
            />
            <TextField
              fullWidth
              label="问财查询语句 *"
              value={queryText}
              onChange={e => setQueryText(e.target.value)}
              size="small"
            />
            <TextField
              fullWidth
              label="描述（可选）"
              value={description}
              onChange={e => setDescription(e.target.value)}
              size="small"
            />
            <FormControl fullWidth size="small">
              <InputLabel>分组</InputLabel>
              <Select
                value={groupName}
                label="分组"
                onChange={e => setGroupName(e.target.value)}
              >
                <MenuItem value="默认">默认</MenuItem>
                <MenuItem value="技术面">技术面</MenuItem>
                <MenuItem value="基本面">基本面</MenuItem>
                <MenuItem value="成长">成长</MenuItem>
                <MenuItem value="价值">价值</MenuItem>
                <MenuItem value="观察">观察</MenuItem>
              </Select>
            </FormControl>
            <Button
              variant="contained"
              color="primary"
              onClick={handleSave}
              sx={{ borderRadius: "999px", alignSelf: "flex-start" }}
            >
              {editingId ? "更新" : "保存"}
            </Button>
          </CardContent>
        </Card>
      )}

      {loading ? (
        <Box sx={{ textAlign: "center", padding: "48px" }}>
          <CircularProgress size={40} sx={{ marginBottom: "12px" }} />
          <Typography color="text.secondary">加载中...</Typography>
        </Box>
      ) : strategies.length === 0 ? (
        <Box sx={{ textAlign: "center", padding: "48px 20px", color: "text.secondary" }}>
          <Typography>暂无策略</Typography>
          <Typography variant="body2" sx={{ marginTop: "8px", color: "text.secondary" }}>
            点击"新建策略"保存常用筛选条件
          </Typography>
        </Box>
      ) : (
        <Box>
          {groups.map(group => {
            const groupStrategies = strategies.filter(s => s.group_name === group);
            return (
              <Box key={group} sx={{ marginBottom: "20px" }}>
                <Typography variant="caption" sx={{ 
                  fontWeight: 600, 
                  color: "text.secondary", 
                  textTransform: "uppercase", 
                  letterSpacing: "0.04em", 
                  marginBottom: "8px", 
                  padding: "0 2px" 
                }}>
                  {group}
                </Typography>
                {groupStrategies.map(s => (
                  <Box key={s.id}>
                    <Card sx={{ 
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
                          onClick={() => onRunStrategy(s.query_text)}
                        >
                          <Typography variant="body1" sx={{ fontWeight: 600, marginBottom: "3px" }}>
                            {s.name}
                          </Typography>
                          <Typography variant="body2" sx={{ color: "primary.main", wordBreak: "break-all" }}>
                            {s.query_text}
                          </Typography>
                          {s.description && (
                            <Typography variant="caption" sx={{ color: "text.secondary", marginTop: "2px" }}>
                              {s.description}
                            </Typography>
                          )}
                        </Box>
                        <Box sx={{ display: "flex", gap: "4px", flexShrink: 0, marginLeft: "12px" }}>
                          <IconButton title="运行" onClick={() => onRunStrategy(s.query_text)} size="small">
                            <PlayArrowIcon />
                          </IconButton>
                          <IconButton 
                            title="重新生成快照" 
                            onClick={() => handleSaveSnapshot(s)} 
                            disabled={savingId === s.id}
                            size="small"
                          >
                            {savingId === s.id ? <CircularProgress size={20} /> : <CameraAltIcon />}
                          </IconButton>
                          <IconButton title="查看快照" onClick={() => toggleExpand(s.id)} size="small">
                            <BarChartIcon />
                          </IconButton>
                          <IconButton title="编辑" onClick={() => handleEdit(s)} size="small">
                            <EditIcon />
                          </IconButton>
                          <IconButton title="删除" onClick={() => handleDelete(s.id)} size="small">
                            <DeleteIcon />
                          </IconButton>
                        </Box>
                      </CardContent>
                    </Card>

                    {/* 快照区域 — 每个策略仅一组快照 */}
                    {expandedStrategy === s.id && (
                      <Box sx={{ 
                        padding: "10px 14px 14px", 
                        margin: "0 0 8px", 
                        backgroundColor: isDarkMode ? "#2c2c2e" : "#f5f5f7", 
                        borderRadius: "8px", 
                        border: "1px solid", 
                        borderColor: isDarkMode ? "#3a3a3c" : "#e8e8ed" 
                      }}>
                        {snapshots.length === 0 ? (
                          <Typography variant="body2" sx={{ color: "text.secondary", textAlign: "center", padding: "12px" }}>
                            暂无快照，点击 📸 重新生成
                          </Typography>
                        ) : (
                          <>
                            <Box sx={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "10px", flexWrap: "wrap" }}>
                              <Chip
                                label={
                                  <Box sx={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{snapshots[0].snapshot_date}</Typography>
                                    <Typography variant="caption" sx={{ color: "text.secondary" }}>{snapshots[0].stock_count} 只</Typography>
                                  </Box>
                                }
                                color="primary"
                                variant="filled"
                                sx={{ borderRadius: "999px", padding: "6px 10px", "& .MuiChip-label": { padding: 0 } }}
                              />
                              <Button
                                variant="outlined"
                                size="small"
                                onClick={() => exportSnapshot(snapshots[0].id)}
                                startIcon={<DownloadIcon />}
                                sx={{ borderRadius: "999px" }}
                              >
                                导出 Excel
                              </Button>
                            </Box>

                            {/* 错误提示 */}
                            {snapshotError && (
                              <Typography variant="body2" sx={{ color: "error.main", marginBottom: "8px" }}>
                                ⚠️ {snapshotError}
                              </Typography>
                            )}

                            {/* 加载中 */}
                            {detailLoading && (
                              <Box sx={{ textAlign: "center", padding: "24px" }}>
                                <CircularProgress size={32} />
                                <Typography variant="body2" color="text.secondary" sx={{ marginTop: "8px" }}>加载快照详情...</Typography>
                              </Box>
                            )}

                            {/* 快照详情 — 股票列表 + 现价 */}
                            {snapshotDetail && !detailLoading && (
                              <Box sx={{ marginTop: "6px" }}>
                                <Typography variant="caption" sx={{ fontWeight: 600, color: "text.secondary", marginBottom: "6px", display: "block" }}>
                                  快照股票 ({snapshotDetail.stocks.length} 只)
                                </Typography>
                                <Grid container spacing={1}>
                                  {snapshotDetail.stocks.map((stk: any, i: number) => {
                                    const snapPx = stk.price_at_snapshot;
                                    const curPx = stk.current_price;
                                    let chgText = "-";
                                    let chgColor = "text.secondary";
                                    if (snapPx && curPx !== "-" && curPx !== undefined) {
                                      const chg = (Number(curPx) - Number(snapPx)) / Number(snapPx) * 100;
                                      chgText = `${chg > 0 ? "+" : ""}${chg.toFixed(2)}%`;
                                      chgColor = chg > 0 ? "error.main" : chg < 0 ? "success.main" : "text.secondary";
                                    }
                                    return (
                                      <Grid item xs={12} sm={6} md={4} key={i}>
                                        <Card sx={{ 
                                          padding: "8px 10px", 
                                          borderRadius: "6px",
                                          border: "1px solid",
                                          borderColor: "divider"
                                        }}>
                                          <Typography variant="body2" sx={{ fontWeight: 600 }}>{stk.stock_name}</Typography>
                                          <Typography variant="caption" sx={{ color: "text.secondary" }}>{stk.stock_code}</Typography>
                                          <Typography variant="body2" sx={{ marginTop: "4px" }}>📌 快照价: {snapPx || "-"}</Typography>
                                          <Typography variant="body2">📊 现价: {curPx !== undefined && curPx !== "-" ? curPx : "-"}</Typography>
                                          <Typography variant="caption" sx={{ color: chgColor, fontWeight: 500 }}>{chgText}</Typography>
                                        </Card>
                                      </Grid>
                                    );
                                  })}
                                </Grid>
                              </Box>
                            )}
                          </>
                        )}
                      </Box>
                    )}
                  </Box>
                ))}
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
