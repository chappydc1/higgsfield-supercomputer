"use client";

import { useState } from "react";
import { PanelTopBar } from "@/sections/MainWorkspace/components/PanelTopBar";

// Import button row for PanelTopBar right content
const MemoryTopBarRight = () => (
  <div className="flex items-center gap-2">
    {/* Import button with AI agent icons */}
    <button
      type="button"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 text-sm transition-colors"
    >
      <span className="flex items-center gap-0.5">
        {/* Claude icon */}
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-orange-500/80 text-[9px] font-bold text-white">C</span>
        {/* ChatGPT icon */}
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-600/80 text-[9px] font-bold text-white">G</span>
        {/* Hermes icon */}
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-purple-600/80 text-[9px] font-bold text-white">H</span>
        {/* Perplexity icon */}
        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-600/80 text-[9px] font-bold text-white">P</span>
      </span>
      <span>Import</span>
    </button>
    {/* New Memory button */}
    <button
      type="button"
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-zinc-900 text-sm font-medium hover:bg-white/90 transition-colors"
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
      </svg>
      <span>New Memory</span>
    </button>
  </div>
);

// Graph node positions (static layout)
const graphNodes = [
  { id: "add", x: 200, y: 180, type: "add" },
  { id: "avatar", x: 460, y: 130, type: "avatar" },
  { id: "folder", x: 660, y: 260, type: "folder" },
  { id: "code", x: 560, y: 400, type: "code" },
  { id: "gear1", x: 340, y: 350, type: "gear" },
  { id: "gear2", x: 160, y: 340, type: "gear" },
  { id: "heart", x: 440, y: 480, type: "heart" },
];

const graphEdges = [
  ["add", "avatar"],
  ["add", "gear1"],
  ["avatar", "folder"],
  ["avatar", "code"],
  ["gear1", "heart"],
  ["gear1", "gear2"],
  ["folder", "code"],
  ["code", "heart"],
];

const nodePosition = (id: string) => graphNodes.find((n) => n.id === id)!;

const NodeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case "add":
      return (
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center justify-center w-10 h-10 rounded-full border-2 border-dashed border-white/30 bg-white/5 hover:border-cyan-400/60 hover:bg-cyan-400/5 transition-colors cursor-pointer">
            <svg className="w-4 h-4 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-zinc-800/80 border border-white/10 text-white/50 text-xs whitespace-nowrap">
            Add memory...
          </div>
        </div>
      );
    case "avatar":
      return (
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-zinc-600 to-zinc-700 border-2 border-white/20 overflow-hidden flex items-center justify-center">
          <svg className="w-5 h-5 text-white/60" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z" />
          </svg>
        </div>
      );
    case "folder":
      return (
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-800/80 border border-white/10">
          <svg className="w-5 h-5 text-yellow-400/70" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
          </svg>
        </div>
      );
    case "code":
      return (
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-800/80 border border-white/10">
          <svg className="w-5 h-5 text-cyan-400/70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
        </div>
      );
    case "gear":
      return (
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-800/80 border border-white/10">
          <svg className="w-5 h-5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
      );
    case "heart":
      return (
        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-800/80 border border-white/10">
          <svg className="w-5 h-5 text-pink-400/70" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
          </svg>
        </div>
      );
    default:
      return null;
  }
};

export const MemoryPage = () => {
  const [memoryInput, setMemoryInput] = useState("");

  return (
    <div className="relative flex flex-col flex-1 min-h-0 bg-[#131517]">
      <PanelTopBar activePage="memory" rightContent={<MemoryTopBarRight />} />

      {/* Main area */}
      <div className="relative flex-1 overflow-hidden">
        {/* Center text */}
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 pointer-events-none z-0">
          <h1 className="text-[#f7f7f8] text-2xl font-semibold tracking-tight">Supercomputer memory</h1>
          <p className="text-[#898a8b] text-sm">Learning from every chat</p>
        </div>

        {/* Graph visualization */}
        <div className="absolute inset-0">
          <svg className="absolute inset-0 w-full h-full" style={{ zIndex: 1 }}>
            {graphEdges.map(([fromId, toId], i) => {
              const from = nodePosition(fromId);
              const to = nodePosition(toId);
              return (
                <line
                  key={i}
                  x1={from.x + 20}
                  y1={from.y + 20}
                  x2={to.x + 20}
                  y2={to.y + 20}
                  stroke="rgba(255,255,255,0.08)"
                  strokeWidth={1}
                />
              );
            })}
          </svg>

          {graphNodes.map((node) => (
            <div
              key={node.id}
              className="absolute"
              style={{ left: node.x, top: node.y, zIndex: 2 }}
            >
              <NodeIcon type={node.type} />
            </div>
          ))}
        </div>
      </div>

      {/* Bottom input bar */}
      <div className="flex items-center gap-2 px-4 py-3 border-t border-[rgba(217,217,217,0.04)] bg-[#151517] shrink-0">
        <button
          type="button"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/50 transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </button>
        <input
          type="text"
          value={memoryInput}
          onChange={(e) => setMemoryInput(e.target.value)}
          placeholder="Add a memory..."
          className="flex-1 bg-transparent text-white/80 text-sm placeholder-white/25 outline-none caret-white"
        />
        <button
          type="button"
          className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-500 hover:bg-blue-400 text-white transition-colors shrink-0"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
};
