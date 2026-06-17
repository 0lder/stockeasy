import { useState, JSX } from "react";
import {
  Box, Container, Paper, Typography, TextField, Button,
  Tabs, Tab, Alert, CircularProgress, useTheme, Stack
} from "@mui/material";
import ShowChartIcon from "@mui/icons-material/ShowChart";
import { auth } from "./api";

interface Props {
  onLogin: (user: any) => void;
}

export default function LoginPage({ onLogin }: Props): JSX.Element {
  const theme = useTheme();
  const [tab, setTab] = useState(0); // 0=login, 1=register
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!username.trim() || !password) {
      setError("请填写用户名和密码");
      return;
    }
    if (tab === 1 && password.length < 6) {
      setError("密码至少 6 位");
      return;
    }
    setLoading(true);
    try {
      const user = tab === 0
        ? await auth.login(username.trim(), password)
        : await auth.register(username.trim(), password);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: theme.palette.mode === "dark"
          ? "linear-gradient(135deg, #0a0a2e 0%, #1a1a3e 50%, #0d0d2b 100%)"
          : "linear-gradient(135deg, #e8eaf6 0%, #f5f5f5 50%, #e3f2fd 100%)",
      }}
    >
      <Container maxWidth="xs">
        <Paper elevation={6} sx={{ p: 4, borderRadius: 3 }}>
          <Stack sx={{ alignItems: "center", mb: 3 }} spacing={1}>
            <ShowChartIcon sx={{ fontSize: 48, color: "primary.main" }} />
            <Typography variant="h5" sx={{ fontWeight: 700 }}>
              StockEasy
            </Typography>
            <Typography variant="body2" color="text.secondary">
              智能选股分析平台
            </Typography>
          </Stack>

          <Tabs
            value={tab}
            onChange={(_, v) => { setTab(v); setError(""); }}
            centered
            sx={{ mb: 3 }}
          >
            <Tab label="登录" />
            <Tab label="注册" />
          </Tabs>

          {error && (
            <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError("")}>
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              label="用户名"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              margin="normal"
              autoFocus
              disabled={loading}
            />
            <TextField
              fullWidth
              label="密码"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              margin="normal"
              disabled={loading}
              helperText={tab === 1 ? "至少 6 位字符" : ""}
            />
            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading}
              sx={{ mt: 3, py: 1.2 }}
            >
              {loading ? <CircularProgress size={24} color="inherit" /> : tab === 0 ? "登录" : "注册"}
            </Button>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
