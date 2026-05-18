import { Link, useLocation } from "react-router-dom";

export const Sidebar = () => {
  const { pathname } = useLocation();

  const isActive = (path: string) => pathname === path || pathname.startsWith(path + "/");

  const navItemClass = (active: boolean) =>
    `flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
      active
        ? "bg-white/10 text-white"
        : "text-white/60 hover:text-white/90 hover:bg-white/5"
    }`;

  return (
    <div className="hidden md:flex flex-col bg-zinc-900 border-r border-white/5 shrink-0 h-full overflow-hidden" style={{ width: 160 }}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-3 border-b border-white/5">
        <div className="flex items-center justify-center w-6 h-6 rounded-md bg-white/10 shrink-0">
          <img
            src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-4.svg"
            alt="Icon"
            className="w-3.5 h-3.5 opacity-80"
          />
        </div>
        <span className="text-white text-sm font-semibold truncate">Supercomputer</span>
        <svg className="w-3.5 h-3.5 text-white/40 shrink-0 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Primary Nav */}
      <div className="flex flex-col gap-0.5 px-2 pt-2">
        {/* New Task */}
        <Link to="/supercomputer" className={navItemClass(pathname === "/" || pathname === "/supercomputer")}>
          <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          <span>New task</span>
        </Link>

        {/* Search */}
        <button type="button" className={navItemClass(false)}>
          <img src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-6.svg" alt="Search" className="w-4 h-4 shrink-0 opacity-60" />
          <span>Search</span>
        </button>

        {/* Skills */}
        <Link to="/supercomputer/skills" className={navItemClass(isActive("/supercomputer/skills"))}>
          <img src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-7.svg" alt="Skills" className="w-4 h-4 shrink-0 opacity-60" />
          <span>Skills</span>
        </Link>

        {/* Connectors */}
        <Link to="/supercomputer/connectors" className={navItemClass(isActive("/supercomputer/connectors"))}>
          <img src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-8.svg" alt="Connectors" className="w-4 h-4 shrink-0 opacity-60" />
          <span>Connectors</span>
        </Link>

        {/* Files */}
        <button type="button" className={navItemClass(false)}>
          <img src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-9.svg" alt="Files" className="w-4 h-4 shrink-0 opacity-60" />
          <span>Files</span>
        </button>

        {/* Memory */}
        <Link to="/supercomputer/memory" className={navItemClass(isActive("/supercomputer/memory"))}>
          <img src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-10.svg" alt="Memory" className="w-4 h-4 shrink-0 opacity-60" />
          <span>Memory</span>
        </Link>
      </div>

      {/* Tasks section */}
      <div className="flex flex-col px-2 pt-3">
        <div className="flex items-center justify-between px-3 mb-1">
          <span className="text-white/40 text-xs font-semibold uppercase tracking-wider">Tasks</span>
          <svg className="w-3.5 h-3.5 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {/* Empty task placeholder */}
        <div className="flex flex-col items-center justify-center gap-1.5 py-4 px-3 rounded-lg border border-dashed border-white/10">
          <button
            type="button"
            className="flex items-center justify-center w-6 h-6 rounded-full bg-white/5 hover:bg-white/10 transition-colors"
          >
            <svg className="w-3.5 h-3.5 text-white/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
            </svg>
          </button>
          <span className="text-white/30 text-[11px] text-center leading-tight">No tasks yet</span>
        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom controls */}
      <div className="flex flex-col gap-2 p-2 border-t border-white/5">
        {/* Pricing pill */}
        <a
          href="/supercomputer/pricing"
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full bg-cyan-400/15 hover:bg-cyan-400/25 transition-colors"
        >
          <img
            src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-11.svg"
            alt="Pricing"
            className="w-3.5 h-3.5 text-cyan-200"
          />
          <span className="text-cyan-200 text-xs font-semibold whitespace-nowrap">Pricing 30% OFF</span>
        </a>

        {/* User row */}
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer">
          <div className="w-6 h-6 rounded-full bg-zinc-600 shrink-0 overflow-hidden flex items-center justify-center">
            <img
              src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-12.svg"
              alt="User"
              className="w-4 h-4"
            />
          </div>
          <span className="text-white/80 text-sm font-medium flex-1 truncate">chappy</span>
          <button type="button" className="text-white/30 hover:text-white/60 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};
