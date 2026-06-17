import { JSX, useState, useCallback, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import {
  Box, Typography, TextField, InputAdornment, IconButton, Button,
  Paper, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Chip, CircularProgress, Alert, useTheme,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import DownloadIcon from "@mui/icons-material/Download";
import { api } from "../api";
import { stockColors, darkStockColors } from "../theme";
import type { QueryResult } from "../types";

// ---------- helpers ----------
function isNumericCol(col: any): boolean {
  const nt = (col.type || "").toLowerCase();
  return ["float", "int", "double", "number", "num"].includes(nt);
}

function formatCell(val: any, col: any): string {
  if (val === null || val === undefined) return "-";
  if (isNumericCol(col)) {
    const n = Number(val);
    return isNaN(n) ? String(val) : n.toLocaleString();
  }
  return String(val);
}

// ---------- component ----------
export default function SearchPage(): JSX.Element {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const colors = isDarkMode ? darkStockColors : stockColors;
  const [searchParams, setSearchParams] = useSearchParams();

  const [query, setQuery] = useState(searchParams.get("q") || "");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const doSearchInternal = useCallback(async (q: string) => {
    const trimmed = q.trim();
    if (!trimmed) return;
    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await api.get(`/api/query?q=${encodeURIComponent(trimmed)}&limit=50`);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || err.error || "查询失败");
      }
      setResult(await res.json());
    } catch (e: any) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // Handle URL `?q=` param on mount
  useEffect(() => {
    const q = searchParams.get("q") || "";
    if (q) {
      doSearchInternal(q);
    }
    // only on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doSearch = (q: string) => {
    setQuery(q);
    setSearchParams(q ? { q } : {});
    doSearchInternal(q);
  };

  // export
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
      a.download = "export.xlsx";
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e: any) {
      alert("导出失败: " + e.message);
    }
  };

  return (
    <>
      {/* ---- Hero / Search bar ---- */}
      <Box sx={{ textAlign: "center", padding: "60px 24px 40px", maxWidth: "680px", margin: "0 auto" }}>
        <Typography variant="h1" sx={{ mb: "10px" }}>
          用自然语言查询 A 股市场数据
        </Typography>
        <Typography variant="body1" sx={{ color: "text.secondary", mb: "28px", fontSize: "18px" }}>
          问财数据引擎 · 实时行情 · 智能筛选
        </Typography>

        <Box sx={{ maxWidth: "580px", margin: "0 auto" }}>
          <TextField
            fullWidth variant="outlined"
            placeholder='输入查询，例如 "北向资金流向"'
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") doSearch(query); }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start"><SearchIcon color="action" /></InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={() => doSearch(query)}
                      disabled={loading || !query.trim()}
                      sx={{ backgroundColor: "primary.main", color: "white", "&:hover": { backgroundColor: "#0077ed" } }}
                    >
                      <SearchIcon />
                    </IconButton>
                  </InputAdornment>
                ),
              },
            }}
          />
        </Box>

        {loading && <Box sx={{ mt: 6 }}><CircularProgress size={32} /></Box>}

        {error && <Alert severity="error" sx={{ mt: 4 }} onClose={() => setError("")}>{error}</Alert>}

        {/* Empty state suggestions */}
        {!result && !loading && !error && (
          <Box sx={{ mt: 6, color: "text.secondary" }}>
            <Typography variant="body1" sx={{ mb: 1 }}>试试这些查询：</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, justifyContent: "center" }}>
              {["市盈率小于20的大盘股", "净利润增长超过30%", "北向资金持续流入", "高股息蓝筹股", "MACD金叉的科技股"].map((tag) => (
                <Chip key={tag} label={tag} onClick={() => doSearch(tag)} variant="outlined" sx={{ cursor: "pointer" }} />
              ))}
            </Box>
          </Box>
        )}
      </Box>

      {/* ---- Results table ---- */}
      {result && !loading && (
        <Box sx={{ maxWidth: "100%", px: 2, pb: 4 }}>
          <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", mb: 2, flexWrap: "wrap", gap: 1 }}>
            <Typography variant="h4">
              查询结果
              <span style={{ fontSize: "14px", color: theme.palette.text.secondary, fontWeight: 400 }}>
                （共 {result.total} 条）
              </span>
            </Typography>
            <Button variant="outlined" size="small" startIcon={<DownloadIcon />}
              onClick={() => exportData(`/api/export/results?q=${encodeURIComponent(query)}`)}>
              导出 Excel
            </Button>
          </Box>

          <TableContainer component={Paper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {result.columns?.map((col) => (
                    <TableCell key={col.field} sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>{col.label}</TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {result.data.map((row: any, ri: number) => (
                  <TableRow key={ri} hover>
                    {result.columns?.map((col) => {
                      const val = row[col.field];
                      return (
                        <TableCell key={col.field} sx={{ whiteSpace: "nowrap" }}>
                          {isNumericCol(col) ? (
                            <span style={{
                              color: typeof val === "number"
                                ? val > 0 ? colors.up : val < 0 ? colors.down : colors.flat
                                : "inherit",
                            }}>
                              {formatCell(val, col)}
                            </span>
                          ) : (
                            formatCell(val, col)
                          )}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </>
  );
}
