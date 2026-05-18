import { useState } from "react";
import { PanelTopBar } from "@/sections/MainWorkspace/components/PanelTopBar";

const connectorPlaceholders = [
  { name: "Slack", color: "bg-purple-600/20", letter: "S", border: "border-purple-500/20" },
  { name: "GitHub", color: "bg-zinc-700/40", letter: "G", border: "border-white/10" },
  { name: "Notion", color: "bg-white/10", letter: "N", border: "border-white/10" },
];

export const ConnectorsPage = () => {
  const [activeTab, setActiveTab] = useState<"available" | "installed">("available");

  return (
    <div className="relative flex flex-col flex-1 min-h-0 bg-[radial-gradient(ellipse_at_center,_rgba(30,30,35,1)_0%,_rgba(10,10,12,1)_100%)]">
      <PanelTopBar activePage="connectors" />

      {/* Main area */}
      <div className="flex flex-col flex-1 items-center justify-center gap-6 px-8">
        {/* Connector placeholder cards row */}
        <div className="flex items-center gap-3">
          {connectorPlaceholders.map((connector, i) => (
            <div
              key={i}
              className={`w-14 h-14 rounded-2xl ${connector.color} border ${connector.border} flex items-center justify-center shadow-lg`}
            >
              <span className="text-white/60 text-xl font-bold">{connector.letter}</span>
            </div>
          ))}
        </div>

        {/* Heading */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-white text-2xl font-semibold tracking-tight">Install Connectors</h1>
          <p className="text-white/40 text-sm">for context in Supercomputer</p>
        </div>

        {/* Available / Installed tabs */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("available")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "available"
                ? "bg-white/15 text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            Available
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("installed")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "installed"
                ? "bg-white/15 text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            Installed
          </button>
        </div>

        {/* Content */}
        {activeTab === "available" && (
          <div className="grid grid-cols-3 gap-3 w-full max-w-lg">
            {connectorPlaceholders.map((connector, i) => (
              <div
                key={i}
                className="flex flex-col items-center gap-2 p-4 rounded-xl bg-zinc-800/50 border border-white/5 hover:border-white/15 transition-colors cursor-pointer"
              >
                <div className={`w-10 h-10 rounded-xl ${connector.color} border ${connector.border} flex items-center justify-center`}>
                  <span className="text-white/70 text-lg font-bold">{connector.letter}</span>
                </div>
                <span className="text-white/60 text-xs font-medium">{connector.name}</span>
                <button
                  type="button"
                  className="text-cyan-400 text-xs hover:text-cyan-300 transition-colors"
                >
                  Install
                </button>
              </div>
            ))}
          </div>
        )}

        {activeTab === "installed" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 border border-white/10">
              <svg className="w-6 h-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <p className="text-white/30 text-sm">No connectors installed yet</p>
            <button
              type="button"
              onClick={() => setActiveTab("available")}
              className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors"
            >
              Browse available connectors
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
