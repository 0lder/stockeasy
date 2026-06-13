import { JSX } from "react";
import { Box, Tab, Tabs, Badge, useTheme } from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import AssignmentIcon from "@mui/icons-material/Assignment";
import StarIcon from "@mui/icons-material/Star";
import BuildIcon from "@mui/icons-material/Build";
import NotificationsIcon from "@mui/icons-material/Notifications";

export type TabKey = "search" | "strategies" | "watchlist" | "builder" | "alerts";

interface TabItem {
  key: TabKey;
  icon: JSX.Element;
  label: string;
}

const TABS: TabItem[] = [
  { key: "search", icon: <SearchIcon />, label: "查询" },
  { key: "strategies", icon: <AssignmentIcon />, label: "策略" },
  { key: "watchlist", icon: <StarIcon />, label: "自选" },
  { key: "builder", icon: <BuildIcon />, label: "条件" },
  { key: "alerts", icon: <NotificationsIcon />, label: "告警" },
];

interface Props {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  badges?: Partial<Record<TabKey, number>>;
}

export default function Sidebar({ activeTab, onTabChange, badges }: Props): JSX.Element {
  const theme = useTheme();
  const isDarkMode = theme.palette.mode === "dark";

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
        onChange={(_, value) => onTabChange(value)}
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