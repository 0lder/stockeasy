import { JSX, useState, useEffect } from "react";
import {
  Box, Typography, Paper, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, CircularProgress, Alert, Card, CardContent,
} from "@mui/material";
import TrendingUpIcon from "@mui/icons-material/TrendingUp";
import TrendingDownIcon from "@mui/icons-material/TrendingDown";
import RemoveRedEyeIcon from "@mui/icons-material/RemoveRedEye";

interface GroupRank {
  rank: number; group: string; strategies: string;
  total: number; up: number; down: number; flat: number;
  upRatio: number; avgReturn: number;
}

interface StrategyRank {
  rank: number; name: string; group: string;
  total: number; up: number; down: number;
  upRatio: number; avgReturn: number;
}

interface Overlap {
  strategyA: string; groupA: string;
  strategyB: string; groupB: string;
  overlap: number; totalA: number; totalB: number; ratio: number;
}

interface DashboardData {
  date: string;
  totalStrategies: number; totalStocks: number; priceCoverage: number;
  groupRank: GroupRank[];
  strategyRank: StrategyRank[];
  overlapMatrix: Overlap[];
}

const GROUP_COLORS: Record<string, string> = {
  "价值风格": "#007AFF",
  "成长风格": "#34C759",
  "防御风格": "#FF9500",
  "事件驱动": "#AF52DE",
  "进攻型":   "#FF3B30",
  "稳健型":   "#5856D6",
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
    fetch("/api/dashboard")
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  if (loading) return <Box sx={{ display: "flex", justifyContent: "center", p: 8 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="error" sx={{ m: 2 }}>{error}</Alert>;
  if (!data) return null;

  return (
    <Box sx={{ p: 3, maxWidth: 1000, mx: "auto" }}>
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
          return (
            <Card key={g.group} sx={{ flex: "1 1 160px", minWidth: 150, borderRadius: 3, boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
              <CardContent sx={{ p: 2, "&:last-child": { pb: 2 } }}>
                <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 600, color }}>#{g.rank}</Typography>
                  <Chip label={g.group} size="small" sx={{ bgcolor: color, color: "#fff", fontWeight: 600, fontSize: 11 }} />
                </Box>
                <Typography variant="h5" sx={{ fontWeight: 700, mb: 0.5 }}>
                  {g.upRatio}%
                </Typography>
                <Typography variant="caption" sx={{ color: "#86868B" }}>
                  上涨率 · 均{/* g.avgReturn > 0 ? "+" : "" */}{g.avgReturn.toFixed(2)}%
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
              {["#", "策略名称", "分组", "标的", "上涨", "下跌", "上涨率", "平均收益"].map(h => (
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
                <TableCell sx={{ color: "#FF3B30", fontWeight: 600 }}>{s.up}</TableCell>
                <TableCell sx={{ color: "#34C759", fontWeight: 600 }}>{s.down}</TableCell>
                <TableCell><UpDownChip value={s.upRatio} /></TableCell>
                <TableCell><UpDownChip value={s.avgReturn} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Overlap Matrix */}
      <Typography variant="h6" sx={{ fontWeight: 600, mb: 2, mt: 2 }}>
        策略重叠度
      </Typography>
      <Typography variant="body2" sx={{ color: "#86868B", mb: 1 }}>
        重叠股票数（比例）- 越高说明策略越相似
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
                <TableCell>
                  <Chip label={o.groupA} size="small" sx={{ bgcolor: GROUP_COLORS[o.groupA] || "#007AFF", color: "#fff", fontSize: 11 }} />
                </TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{o.strategyB}</TableCell>
                <TableCell>
                  <Chip label={o.groupB} size="small" sx={{ bgcolor: GROUP_COLORS[o.groupB] || "#007AFF", color: "#fff", fontSize: 11 }} />
                </TableCell>
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
