import { JSX } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Box, Tab, Tabs, Badge, useTheme } from "@mui/material";
import DashboardIcon from "@mui/icons-material/Dashboard";
import SearchIcon from "@mui/icons-material/Search";
import AssignmentIcon from "@mui/icons-material/Assignment";
import StarIcon from "@mui/icons-material/Star";
import BuildIcon from "@mui/icons-material/Build";
import NotificationsIcon from "@mui/icons-material/Notifications";

export type TabKey = "search" | "dashboard" | "strategies" | "watchlist" | "builder" | "alerts";

interface TabItem {
  key: TabKey;
  path: string;
  icon: JSX.Element;
  label: string;
}

const TABS: TabItem[] = [
  { key: "search", path: "/search", icon: <SearchIcon />, label: "查询" },
  { key: "dashboard", path: "/dashboard", icon: <DashboardIcon />, label: "仪表" },
  { key: "strategies", path: "/strategies", icon: <AssignmentIcon />, label: "策略" },
  { key: "watchlist", path: "/watchlist", icon: <StarIcon />, label: "自选" },
  { key: "builder", path: "/builder", icon: <BuildIcon />, label: "条件" },
  { key: "alerts", path: "/alerts", icon: <NotificationsIcon />, label: "告警" },
];

// map pathname → TabKey
function pathToTab(path: string): TabKey {
  for (const t of TABS) {
    if (path === t.path || path.startsWith(t.path + "?")) return t.key;
  }
  return "search";
}

interface Props {
  badges?: Partial<Record<TabKey, number>>;
}

export default function Sidebar({ badges }: Props): JSX.Element {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";
  const location = useLocation();
  const navigate = useNavigate();

  const activeTab = pathToTab(location.pathname);

  return (
    <Box
      component="aside"
      sx={{
        width: "56px",
        backgroundColor: isDarkMode ? "#2c2c2e" : "#f5f5f7",
        borderRight: "1px solid",
        borderColor: isDarkMode ? "#3a3a3c" : "#e8e8ed",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 0",
        gap: "2px",
        flexShrink: 0,
        position: "sticky",
        top: "48px",
        height: "calc(100vh - 48px)",
        zIndex: 50,
      }}
    >
      <Tabs
        orientation="vertical"
        value={activeTab}
        onChange={(_, value) => {
          const tab = TABS.find((t) => t.key === value);
          if (tab) navigate(tab.path);
        }}
        sx={{
          width: "100%",
          "& .MuiTabs-indicator": {
            left: 0,
            width: "3px",
            backgroundColor: "primary.main",
          },
        }}
      >
        {TABS.map((tab) => {
          const badge = badges?.[tab.key];
          return (
            <Tab
              key={tab.key}
              value={tab.key}
              icon={
                <Badge
                  badgeContent={badge && badge > 99 ? "99+" : badge}
                  color="error"
                  invisible={!badge || badge === 0}
                  sx={{
                    "& .MuiBadge-badge": {
                      fontSize: "9px",
                      minWidth: "16px",
                      height: "16px",
                    },
                  }}
                >
                  {tab.icon}
                </Badge>
              }
              label={tab.label}
              sx={{
                minHeight: "48px",
                minWidth: "44px",
                width: "44px",
                padding: "8px 0",
                margin: "0 6px",
                borderRadius: "10px",
                color: isDarkMode ? "#8e8e93" : "#86868b",
                "&.Mui-selected": {
                  backgroundColor: "primary.main",
                  color: "white",
                },
                "&:hover": {
                  backgroundColor: isDarkMode ? "#3a3a3c" : "#e8e8ed",
                  color: isDarkMode ? "#d1d1d6" : "#424245",
                },
                "& .MuiTab-iconWrapper": {
                  marginBottom: "1px",
                  fontSize: "18px",
                },
                "& .MuiTab-label": {
                  fontSize: "9px",
                  fontWeight: 500,
                  lineHeight: 1,
                },
              }}
            />
          );
        })}
      </Tabs>
    </Box>
  );
}
