import { api } from "../api";
import { JSX, useState, useEffect } from "react";
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, CircularProgress, Alert, Card, CardContent,
} from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";

interface GroupRank {
  rank: number; group: string; strategies: string;
  total: number; up: number; down: number; flat: number;
  upRatio: number; avgReturn: number;
  avgWin: number; avgLoss: number; winLossRatio: number;
}

interface StrategyRank {
  rank: number; name: string; group: string;
  total: number; up: number; down: number;
  upRatio: number; avgReturn: number;
  avgWin: number; avgLoss: number; winLossRatio: number;
}

interface Overlap {
  strategyA: string; groupA: string;
  strategyB: string; groupB: string;
  overlap: number; totalA: number; totalB: number; ratio: number;
}

interface TrendPoint { date: string; avgReturn: number; upRatio: number; stockCount: number; }
interface StrategyTrend { strategy: string; group: string; snapshots: TrendPoint[]; }

interface DashboardData {
  date: string;
  totalStrategies: number; totalStocks: number; priceCoverage: number;
  groupRank: GroupRank[];
  strategyRank: StrategyRank[];
  overlapMatrix: Overlap[];
  strategyTrend: StrategyTrend[];
}

const GROUP_COLORS: Record<string, string> = {
  "价值风格": "#007AFF", "成长风格": "#34C759", "防御风格": "#FF9500",
  "事件驱动": "#AF52DE", "进攻型": "#FF3B30", "稳健型": "#5856D6",
};

function UpDownChip({ value, suffix = "%" }: { value: number; suffix?: string }) {
  if (value === 0) return <Chip size="small" label={`0.0${suffix}`} sx={{ color: "#86868B", bgcolor: "#F5F5F7", fontWeight: 600 }} />;
  if (value > 0) return <Chip size="small" icon={<TrendingUpIcon sx={{ fontSize: 14 }} />} label={`+${value.toFixed(1)}${suffix}`} sx={{ color: "#FF3B30", bgcolor: "#FFF0F0", fontWeight: 600 }} />;
  return <Chip size="small" icon={<TrendingDownIcon sx={{ fontSize: 14 }} />} label={`${value.toFixed(1)}${suffix}`} sx={{ color: "#34C759", bgcolor: "#F0FFF0", fontWeight: 600 }} />;
}

export default function DashboardPanel(): JSX.Element {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get("/api/dashboard").then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <Box sx={{ display: "flex", justifyContent: "center", p: 8 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!data) return <></>;

  const maxRet = Math.max(...data.strategyRank.map(s => s.avgReturn), 0.1);
  const minRet = Math.min(...data.strategyRank.map(s => s.avgReturn), -0.1);
  const range = maxRet - minRet || 1;

  return (
    <Box sx={{ p: 3, maxWidth: 1100, mx: "auto" }}>
      {/* Header */}
      <Typography variant="h5" sx={{ fontWeight: 700, mb: 1 }}>
        📊 策略仪表盘
      </Typography>
      <Typography variant="body2" sx={{ color: "#86868B", mb: 3 }}>
        {data.date} · {data.totalStrategies}条策略 · {data.totalStocks}只标的 · {data.priceCoverage}只有行情
      </Typography>

      {/* Group Rankings */}
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, mt: 1 }}>
        分组排名
      </Typography>
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 4 }}>
        {data.groupRank.map(g => {
          const color = GROUP_COLORS[g.group] || "#007AFF";
          const wl = g.winLossRatio;
          return (
            <Card key={g.group} sx={{ flex: "1 1 185px", minWidth: 170, borderRadius: 3, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color }}>#{g.rank}</Typography>
                  <Chip label={g.group} size="small" sx={{ bgcolor: color, color: "#fff", fontWeight: 600, fontSize: 11 }} />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {g.upRatio}%
                </Typography>
                <Typography variant="caption" sx={{ color: "#86868B" }}>
                  均{g.avgReturn.toFixed(2)}% · 盈亏{wl > 0 ? `1:${wl.toFixed(2)}` : "N/A"}
                </Typography>
                <br />
                <Typography variant="caption" sx={{ color: "#86868B" }}>
                  📈{g.up} 📉{g.down} ➡️{g.flat} · {g.total}只
                </Typography>
              </CardContent>
            </Card>
          );
        })}
      </Box>

      {/* Strategy Ranking Table */}
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, mt: 2 }}>
        策略排名
      </Typography>
      <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", mb: 4 }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: "#007AFF" }}>
              {["#", "策略", "分组", "标的", "上涨率", "均收益", "均胜", "均败", "赔率"].map(h => (
                <TableCell key={h} sx={{ color: "#fff", fontWeight: 600, fontSize: 13, py: 1.2 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.strategyRank.map((s, i) => (
              <TableRow key={s.name} sx={{ bgcolor: i % 2 === 1 ? "#F5F5F7" : "#fff" }}>
                <TableCell sx={{ fontWeight: 600 }}>{s.rank}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{s.name}</TableCell>
                <TableCell>
                  <Chip label={s.group} size="small" sx={{ bgcolor: GROUP_COLORS[s.group] || "#007AFF", color: "#fff", fontSize: 11 }} />
                </TableCell>
                <TableCell>{s.total}</TableCell>
                <TableCell><UpDownChip value={s.upRatio} /></TableCell>
                <TableCell><UpDownChip value={s.avgReturn} /></TableCell>
                <TableCell><UpDownChip value={s.avgWin} /></TableCell>
                <TableCell><UpDownChip value={s.avgLoss} /></TableCell>
                <TableCell>
                  <Chip size="small" label={s.winLossRatio > 999 ? "∞ (零亏损)" : s.winLossRatio > 0 ? `1:${s.winLossRatio.toFixed(2)}` : "N/A"} sx={{
                    bgcolor: s.winLossRatio > 1.5 ? "#E8F5E9" : s.winLossRatio > 0.8 ? "#FFF3E0" : "#FFE0E0",
                    color: s.winLossRatio > 1.5 ? "#2E7D32" : s.winLossRatio > 0.8 ? "#E65100" : "#C62828",
                    fontWeight: 600,
                  }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Multi-period Trend Chart (SVG) */}
      {data.strategyTrend.filter(t => t.snapshots.length > 1).length > 0 && (
        <>
          <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, mt: 2 }}>
            策略收益趋势
          </Typography>
          <Paper sx={{ p: 2, borderRadius: 3, boxShadow: "0 2px 12px rgba(0,0,0,0.06)", mb: 4 }}>
            <svg width="100%" height="320" viewBox="0 0 900 320" style={{ display: "block" }}>
              {/* 背景网格 */}
              {[-3, -2, -1, 0, 1, 2, 3].map(v => {
                const y = 160 - v * 40;
                return (
                  <g key={v}>
                    <line x1="80" y1={y} x2="880" y2={y} stroke={v === 0 ? "#D0D0D0" : "#EEE"} strokeWidth="1" />
                    <text x="75" y={y + 4} textAnchor="end" fill="#999" fontSize="11">{v > 0 ? `+${v}%` : `${v}%`}</text>
                  </g>
                );
              })}
              {/* 收益折线 */}
              {data.strategyTrend.filter(t => t.snapshots.length > 1).map((t, idx) => {
                const pts = t.snapshots;
                const allDates = pts.map(p => p.date);
                const xStep = 800 / (pts.length - 1 || 1);
                const minRetT = Math.min(...pts.map(p => p.avgReturn)) - 0.5;
                const maxRetT = Math.max(...pts.map(p => p.avgReturn)) + 0.5;
                const hRange = maxRetT - minRetT || 1;
                const color = GROUP_COLORS[t.group] || ["#007AFF","#34C759","#FF9500","#AF52DE","#FF3B30","#5856D6"][idx % 6];
                const pathD = pts.map((p, i) => {
                  const x = 80 + i * xStep;
                  const y = 160 - ((p.avgReturn - minRetT) / hRange * 140 - 70);
                  return `${i === 0 ? "M" : "L"}${x},${y}`;
                }).join(" ");
                return (
                  <g key={t.strategy}>
                    <path d={pathD} fill="none" stroke={color} strokeWidth="2.5" opacity="0.8" />
                    {/* 标签 */}
                    <text x={880} y={30 + idx * 22} fill={color} fontSize="12" fontWeight="600" textAnchor="end">
                      {t.strategy}
                    </text>
                    <line x1={882} y1={26 + idx * 22} x2={895} y2={26 + idx * 22} stroke={color} strokeWidth="2.5" />
                  </g>
                );
              })}
              {/* X轴标签 */}
              {data.strategyTrend[0]?.snapshots.map((p, i) => {
                const x = 80 + i * (800 / (data.strategyTrend[0].snapshots.length - 1 || 1));
                return (
                  <text key={i} x={x} y={300} textAnchor="middle" fill="#999" fontSize="11">
                    {p.date}
                  </text>
                );
              })}
            </svg>
          </Paper>
        </>
      )}

      {/* Overlap Matrix */}
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, mt: 2 }}>
        策略重叠度
      </Typography>
      <Typography variant="body2" sx={{ color: "#86868B", mb: 1 }}>
        重叠数（比例）- 越高说明策略越相似
      </Typography>
      <TableContainer component={Paper} sx={{ borderRadius: 3, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
        <Table size="small">
          <TableHead>
            <TableRow sx={{ bgcolor: "#5856D6" }}>
              {["策略A", "分组", "策略B", "分组", "重叠数", "重叠率"].map(h => (
                <TableCell key={h} sx={{ color: "#fff", fontWeight: 600, fontSize: 13, py: 1.2 }}>{h}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.overlapMatrix.slice(0, 15).map((o, i) => (
              <TableRow key={`${o.strategyA}-${o.strategyB}`} sx={{ bgcolor: i % 2 === 1 ? "#F5F5F7" : "#fff" }}>
                <TableCell sx={{ fontWeight: 600 }}>{o.strategyA}</TableCell>
                <TableCell><Chip label={o.groupA} size="small" sx={{ bgcolor: GROUP_COLORS[o.groupA] || "#007AFF", color: "#fff", fontSize: 11 }} /></TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{o.strategyB}</TableCell>
                <TableCell><Chip label={o.groupB} size="small" sx={{ bgcolor: GROUP_COLORS[o.groupB] || "#007AFF", color: "#fff", fontSize: 11 }} /></TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{o.overlap}</TableCell>
                <TableCell>
                  <Chip size="small" label={`${o.ratio}%`} sx={{
                    bgcolor: o.ratio > 30 ? "#FFE0E0" : o.ratio > 15 ? "#FFF3E0" : "#F0F0F0",
                    color: o.ratio > 30 ? "#D32F2F" : o.ratio > 15 ? "#E65100" : "#666",
                    fontWeight: 600,
                  }} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
