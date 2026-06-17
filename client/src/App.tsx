import { JSX, useState, lazy, Suspense, useCallback, useEffect } from "react";
import { Routes, Route, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import {
  Box, AppBar, Toolbar, Typography, IconButton, Button, Badge,
  Drawer, List, ListItem, ListItemText, ListItemSecondaryAction,
  Pagination, CircularProgress, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, Alert, Tooltip, useTheme,
} from "@mui/material";
import HistoryIcon from "@mui/icons-material/History";
import LightModeIcon from "@mui/icons-material/LightMode";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import SettingsIcon from "@mui/icons-material/Settings";
import LogoutIcon from "@mui/icons-material/Logout";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import DeleteIcon from "@mui/icons-material/Delete";

import Sidebar from "./components/Sidebar";
import ErrorBoundary from "./components/ErrorBoundary";
import LoginPage from "./LoginPage";
import { api, auth } from "./api";
import { useThemeContext } from "./ThemeContext";
import { useAuth } from "./AuthContext";
import type { HistoryRecord } from "./types";

// ---------- lazy pages ----------
const SearchPage = lazy(() => import("./pages/SearchPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const StrategyPage = lazy(() => import("./pages/StrategyPage"));
const WatchlistPage = lazy(() => import("./pages/WatchlistPage"));
const BuilderPage = lazy(() => import("./pages/BuilderPage"));
const AlertPage = lazy(() => import("./pages/AlertPage"));

// ---------- page loading fallback ----------
function PageFallback() {
  return (
    <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "300px" }}>
      <CircularProgress size={32} />
    </Box>
  );
}

// ---------- AppShell ----------
function AppShell() {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const { toggleTheme } = useThemeContext();
  const { user } = useAuth();

  // cross-page shared UI
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  // history data (shared, fetched when drawer opens)
  const [history, setHistory] = useState<HistoryRecord[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyLoading, setHistoryLoading] = useState(false);

  // AI settings
  const [aiForm, setAiForm] = useState({ apiKey: "", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" });
  const [configSaving, setConfigSaving] = useState(false);
  const [configMsg, setConfigMsg] = useState("");

  const navigate = useNavigate();

  // ---- history ----
  const fetchHistory = useCallback(async (page = 1) => {
    setHistoryLoading(true);
    try {
      const res = await api.get(`/api/history?page=${page}&pageSize=20`);
      const data = await res.json();
      setHistory(data.records || []);
      setHistoryTotal(data.total || 0);
      setHistoryPage(data.page || 1);
    } catch {
      // silent
    }
    setHistoryLoading(false);
  }, []);

  useEffect(() => {
    if (showHistory) fetchHistory();
  }, [showHistory, fetchHistory]);

  const handleDeleteHistory = async (id: number) => {
    await api.delete(`/api/history/${id}`);
    fetchHistory(historyPage);
  };

  const handleClearHistory = async () => {
    if (!confirm("确定清空所有查询历史？")) return;
    await api.delete("/api/history");
    fetchHistory(1);
  };

  const handleHistoryClick = (query: string) => {
    setShowHistory(false);
    navigate(`/search?q=${encodeURIComponent(query)}`);
  };

  // ---- AI settings ----
  const handleOpenSettings = () => {
    try {
      const raw = localStorage.getItem("stockeasy-ai");
      if (raw) {
        const parsed = JSON.parse(raw);
        setAiForm(parsed);
      }
    } catch {}
    setShowSettings(true);
  };

  const handleSaveConfig = async () => {
    setConfigSaving(true);
    setConfigMsg("");
    try {
      const res = await api.post("/api/config/ai", aiForm);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "保存失败");
      }
      localStorage.setItem("stockeasy-ai", JSON.stringify(aiForm));
      setConfigMsg("保存成功");
      setTimeout(() => setShowSettings(false), 800);
    } catch (e: any) {
      setConfigMsg(e.message);
    }
    setConfigSaving(false);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", minHeight: "100vh" }}>
      {/* ---- App Bar ---- */}
      <AppBar position="sticky" elevation={0}>
        <Toolbar sx={{ minHeight: "48px !important", px: "12px !important", gap: 1 }}>
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, flex: 1 }}>
            <ShowChartIcon sx={{ color: "primary.main", fontSize: 24 }} />
            <Typography variant="h4" sx={{ fontWeight: 700, fontSize: "16px" }}>
              StockEasy
            </Typography>
          </Box>

          <Tooltip title={isDarkMode ? "浅色模式" : "深色模式"}>
            <IconButton onClick={toggleTheme} color="inherit">
              {isDarkMode ? <LightModeIcon /> : <DarkModeIcon />}
            </IconButton>
          </Tooltip>

          <Tooltip title="AI 配置">
            <IconButton onClick={handleOpenSettings} color="inherit">
              <SettingsIcon />
            </IconButton>
          </Tooltip>

          <Tooltip title={user?.username}>
            <IconButton onClick={() => auth.logout()} color="inherit">
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
        </Toolbar>
      </AppBar>

      {/* ---- Body: Sidebar + Content ---- */}
      <Box sx={{ display: "flex", flex: 1 }}>
        <Sidebar />

        <Box component="main" sx={{ flex: 1, minWidth: 0 }}>
          <ErrorBoundary>
            <Suspense fallback={<PageFallback />}>
              <Routes>
                <Route path="/search" element={<SearchPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/strategies" element={<StrategyPage />} />
                <Route path="/watchlist" element={<WatchlistPage />} />
                <Route path="/builder" element={<BuilderPage />} />
                <Route path="/alerts" element={<AlertPage />} />
                <Route path="*" element={<Navigate to="/search" replace />} />
              </Routes>
            </Suspense>
          </ErrorBoundary>
        </Box>
      </Box>

      {/* ---- History Drawer ---- */}
      <Drawer anchor="right" open={showHistory} onClose={() => setShowHistory(false)}>
        <Box sx={{ width: 360, p: 2, display: "flex", flexDirection: "column", height: "100%" }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2 }}>
            <Typography variant="h6">查询历史</Typography>
            {history.length > 0 && (
              <Button size="small" color="error" onClick={handleClearHistory}>清空</Button>
            )}
          </Box>
          {historyLoading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}><CircularProgress size={24} /></Box>
          ) : history.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ textAlign: "center", mt: 8 }}>
              暂无查询记录
            </Typography>
          ) : (
            <>
              <List sx={{ flex: 1, overflow: "auto" }}>
                {history.map((h) => (
                  <ListItem
                    key={h.id}
                    onClick={() => handleHistoryClick(h.query)}
                    sx={{ cursor: "pointer", borderRadius: 1, "&:hover": { bgcolor: "action.hover" } }}
                  >
                    <ListItemText
                      primary={h.query}
                      secondary={`${new Date(h.created_at).toLocaleString()} · ${h.result_count} 条${h.elapsed_ms ? ` · ${h.elapsed_ms}ms` : ""}`}
                      primaryTypographyProps={{ fontSize: 14 }}
                      secondaryTypographyProps={{ fontSize: 12 }}
                    />
                    <ListItemSecondaryAction>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDeleteHistory(h.id); }}>
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                    </ListItemSecondaryAction>
                  </ListItem>
                ))}
              </List>
              {historyTotal > 20 && (
                <Pagination
                  count={Math.ceil(historyTotal / 20)}
                  page={historyPage}
                  onChange={(_, p) => fetchHistory(p)}
                  size="small"
                  sx={{ alignSelf: "center", mt: 1 }}
                />
              )}
            </>
          )}
        </Box>
      </Drawer>

      {/* ---- AI Settings Dialog ---- */}
      <Dialog open={showSettings} onClose={() => setShowSettings(false)} maxWidth="sm" fullWidth>
        <DialogTitle>AI 配置</DialogTitle>
        <DialogContent>
          <TextField fullWidth label="API Key" type="password"
            value={aiForm.apiKey}
            onChange={(e) => setAiForm({ ...aiForm, apiKey: e.target.value })}
            margin="normal" />
          <TextField fullWidth label="Base URL"
            value={aiForm.baseUrl}
            onChange={(e) => setAiForm({ ...aiForm, baseUrl: e.target.value })}
            margin="normal" />
          <TextField fullWidth label="模型"
            value={aiForm.model}
            onChange={(e) => setAiForm({ ...aiForm, model: e.target.value })}
            margin="normal" />
          {configMsg && (
            <Alert severity={configMsg === "保存成功" ? "success" : "error"} sx={{ mt: 1 }}>{configMsg}</Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setShowSettings(false)}>取消</Button>
          <Button variant="contained" onClick={handleSaveConfig} disabled={configSaving}>
            {configSaving ? "保存中..." : "保存"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

// ---------- App root ----------
export default function App(): JSX.Element {
  const { user, authChecking } = useAuth();
  const { setUser } = useAuth();

  if (authChecking) {
    return (
      <Box sx={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <CircularProgress size={40} />
      </Box>
    );
  }

  if (!user) {
    return <LoginPage onLogin={(u) => setUser(u)} />;
  }

  return <AppShell />;
}
