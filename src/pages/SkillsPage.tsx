import { useState } from "react";
import { PanelTopBar } from "@/sections/MainWorkspace/components/PanelTopBar";

const SkillsTopBarRight = () => (
  <button
    type="button"
    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-zinc-900 text-sm font-medium hover:bg-white/90 transition-colors"
  >
    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
    </svg>
    <span>Create Skill</span>
  </button>
);

const skillIcons = [
  "https://static.higgsfield.ai/claudesfield/skill-1-icon-new.png",
  "https://static.higgsfield.ai/claudesfield/skill-2-icon-new.png",
  "https://static.higgsfield.ai/claudesfield/skill-3-icon-new.png",
];

export const SkillsPage = () => {
  const [activeTab, setActiveTab] = useState<"my" | "community">("my");

  return (
    <div className="relative flex flex-col flex-1 min-h-0 bg-[radial-gradient(ellipse_at_center,_rgba(30,30,35,1)_0%,_rgba(10,10,12,1)_100%)]">
      <PanelTopBar activePage="skills" rightContent={<SkillsTopBarRight />} />

      {/* Main area */}
      <div className="flex flex-col flex-1 items-center justify-center gap-6 px-8">
        {/* Skill icons row */}
        <div className="flex items-center gap-3">
          {skillIcons.map((src, i) => (
            <div key={i} className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-800 border border-white/10 shadow-lg">
              <img
                src={src}
                alt={`Skill ${i + 1}`}
                className="w-full h-full object-cover"
                onError={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  target.style.display = "none";
                  const parent = target.parentElement;
                  if (parent) {
                    parent.innerHTML = `<div class="w-full h-full flex items-center justify-center text-white/20 text-xl">★</div>`;
                  }
                }}
              />
            </div>
          ))}
        </div>

        {/* Heading */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-white text-2xl font-semibold tracking-tight">Install Skills</h1>
          <p className="text-white/40 text-sm">to evolve Supercomputer</p>
        </div>

        {/* My skills / Community tabs */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("my")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "my"
                ? "bg-white/15 text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            My skills
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("community")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "community"
                ? "bg-white/15 text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            Community
          </button>
        </div>

        {/* Empty state */}
        {activeTab === "my" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 border border-white/10">
              <svg className="w-6 h-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <p className="text-white/30 text-sm">No skills installed yet</p>
            <button
              type="button"
              className="text-cyan-400 text-sm hover:text-cyan-300 transition-colors"
            >
              Browse community skills
            </button>
          </div>
        )}

        {activeTab === "community" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 border border-white/10">
              <svg className="w-6 h-6 text-white/20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-white/30 text-sm">Community skills coming soon</p>
          </div>
        )}
      </div>
    </div>
  );
};
