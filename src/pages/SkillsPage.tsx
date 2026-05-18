"use client";

import { useState } from "react";
import { PanelTopBar } from "@/sections/MainWorkspace/components/PanelTopBar";

interface Skill {
  title: string;
  subtitle: string;
  color: string;
  letter: string;
}

const skills: Skill[] = [
  { title: "UGC Flow", subtitle: "Create viral UGC content videos", color: "bg-violet-500", letter: "UG" },
  { title: "Marketing Campaign", subtitle: "Run full marketing campaigns", color: "bg-rose-500", letter: "MC" },
  { title: "Cinema Director", subtitle: "Create cinematic video sequences", color: "bg-amber-500", letter: "CD" },
  { title: "Cartoon Animator", subtitle: "Animate cartoon-style videos", color: "bg-sky-500", letter: "CA" },
  { title: "Product Demo", subtitle: "Create product demonstration videos", color: "bg-emerald-500", letter: "PD" },
  { title: "Social Media", subtitle: "Create social media content", color: "bg-pink-500", letter: "SM" },
  { title: "Brand Identity", subtitle: "Build brand identity assets", color: "bg-indigo-500", letter: "BI" },
];

const leftSkills = skills.filter((_, i) => i % 2 === 0);
const rightSkills = skills.filter((_, i) => i % 2 !== 0);

interface SkillRowProps {
  skill: Skill;
}

const SkillRow = ({ skill }: SkillRowProps) => (
  <div className="flex items-center gap-3 h-16 px-3 rounded-lg hover:bg-white/5 transition-colors group">
    <div
      className={`w-10 h-10 rounded-full ${skill.color} text-white flex items-center justify-center text-xs font-bold shrink-0`}
    >
      {skill.letter}
    </div>
    <div className="flex flex-col flex-1 min-w-0">
      <span className="text-white text-sm font-medium leading-tight">{skill.title}</span>
      <span className="text-white/50 text-xs truncate leading-tight mt-0.5">{skill.subtitle}</span>
    </div>
    <button
      type="button"
      className="shrink-0 w-7 h-7 rounded-full border border-white/20 flex items-center justify-center text-white/50 hover:text-white hover:border-white/50 transition-colors text-base leading-none"
      aria-label={`Add ${skill.title}`}
    >
      +
    </button>
  </div>
);

const SkillsTopBarRight = () => {
  const [search, setSearch] = useState("");
  return (
    <div className="flex items-center gap-2">
      <div className="relative">
        <svg
          className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30 pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          type="text"
          placeholder="Search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 pr-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-white text-sm placeholder-white/30 focus:outline-none focus:border-white/20 w-36"
        />
      </div>
      <button
        type="button"
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white text-zinc-900 text-sm font-medium hover:bg-white/90 transition-colors whitespace-nowrap"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
        </svg>
        <span>Create Skill</span>
      </button>
    </div>
  );
};

export const SkillsPage = () => {
  const [activeTab, setActiveTab] = useState<"my" | "community">("my");

  return (
    <div className="relative flex flex-col flex-1 min-h-0 bg-[#131517]">
      <PanelTopBar activePage="skills" rightContent={<SkillsTopBarRight />} />

      {/* Main area */}
      <div className="flex flex-col flex-1 min-h-0 items-center px-8 py-6 gap-6">
        {/* Two overlapping skill icons */}
        <div className="flex items-center">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-800 border border-white/10 shadow-lg">
            <img
              src="https://static.higgsfield.ai/claudesfield/skill-1-icon-new.png"
              alt="Skill 1"
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
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-zinc-800 border border-white/10 shadow-lg -ml-4">
            <img
              src="https://static.higgsfield.ai/claudesfield/skill-2-icon-new.png"
              alt="Skill 2"
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
        </div>

        {/* Heading */}
        <div className="flex flex-col items-center gap-1 text-center">
          <h1 className="text-[#f7f7f8] text-2xl font-semibold tracking-tight">Install Skills</h1>
          <p className="text-[#898a8b] text-sm">to evolve Supercomputer</p>
        </div>

        {/* My skills / Community tabs */}
        <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5">
          <button
            type="button"
            onClick={() => setActiveTab("my")}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === "my"
                ? "bg-white/10 text-white"
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
                ? "bg-white/10 text-white"
                : "text-white/50 hover:text-white/80"
            }`}
          >
            Community
          </button>
        </div>

        {/* My skills list */}
        {activeTab === "my" && (
          <div className="flex-1 min-h-0 w-full max-w-3xl overflow-y-auto">
            <div className="grid grid-cols-2 gap-x-4">
              <div className="flex flex-col">
                {leftSkills.map((skill) => (
                  <SkillRow key={skill.title} skill={skill} />
                ))}
              </div>
              <div className="flex flex-col">
                {rightSkills.map((skill) => (
                  <SkillRow key={skill.title} skill={skill} />
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "community" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="flex items-center justify-center w-12 h-12 rounded-2xl bg-white/5 border border-white/10">
              <svg
                className="w-6 h-6 text-white/20"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1.5}
              >
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
