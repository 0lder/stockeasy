import { JSX } from "react";

export type TabKey = "search" | "strategies" | "watchlist" | "builder" | "alerts";

interface TabItem {
  key: TabKey;
  icon: string;
  label: string;
}

const TABS: TabItem[] = [
  { key: "search", icon: "🔍", label: "查询" },
  { key: "strategies", icon: "📋", label: "策略" },
  { key: "watchlist", icon: "⭐", label: "自选" },
  { key: "builder", icon: "🔧", label: "条件" },
  { key: "alerts", icon: "🔔", label: "告警" },
];

interface Props {
  activeTab: TabKey;
  onTabChange: (tab: TabKey) => void;
  badges?: Partial<Record<TabKey, number>>;
}

export default function Sidebar({ activeTab, onTabChange, badges }: Props): JSX.Element {
  return (
    <aside className="sidebar">
      {TABS.map((tab) => {
        const isActive = activeTab === tab.key;
        const badge = badges?.[tab.key];
        return (
          <button
            key={tab.key}
            className={`sidebar-tab ${isActive ? "active" : ""}`}
            onClick={() => onTabChange(tab.key)}
            title={tab.label}
          >
            <span className="sidebar-icon">{tab.icon}</span>
            <span className="sidebar-label">{tab.label}</span>
            {badge !== undefined && badge > 0 && (
              <span className="sidebar-badge">{badge > 99 ? "99+" : badge}</span>
            )}
          </button>
        );
      })}
    </aside>
  );
}
