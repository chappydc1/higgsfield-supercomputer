import { Link, useLocation } from "react-router-dom";

type ActivePage = "skills" | "memory" | "connectors";

interface PanelTopBarProps {
  activePage: ActivePage;
  rightContent?: React.ReactNode;
}

export const PanelTopBar = ({ activePage, rightContent }: PanelTopBarProps) => {
  const tabs: { id: ActivePage; label: string; path: string }[] = [
    { id: "skills", label: "Skills", path: "/supercomputer/skills" },
    { id: "memory", label: "Memory", path: "/supercomputer/memory" },
    { id: "connectors", label: "Connectors", path: "/supercomputer/connectors" },
  ];

  return (
    <div className="flex items-center justify-between px-4 py-2 border-b border-white/5 bg-zinc-900/80 backdrop-blur-sm shrink-0">
      {/* Left: Your OS label */}
      <div className="flex items-center">
        <span className="text-white/50 text-xs font-medium bg-white/5 px-2.5 py-1 rounded-full border border-white/10">
          Your OS
        </span>
      </div>

      {/* Center: Tab switcher */}
      <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            to={tab.path}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activePage === tab.id
                ? "bg-white/15 text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>

      {/* Right: custom content */}
      <div className="flex items-center gap-2">
        {rightContent}
      </div>
    </div>
  );
};
