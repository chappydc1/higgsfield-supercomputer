import { Routes, Route } from "react-router-dom";
import { Sidebar } from "@/sections/MainWorkspace/components/Sidebar";
import { WorkspaceContent } from "@/sections/MainWorkspace/components/WorkspaceContent";
import { SkillsPage } from "@/pages/SkillsPage";
import { MemoryPage } from "@/pages/MemoryPage";
import { ConnectorsPage } from "@/pages/ConnectorsPage";

export const MainWorkspace = () => {
  return (
    <main className="bg-neutral-900 box-border caret-transparent col-end-[main] col-start-[main] row-end-[main] row-start-[main] h-full min-h-[auto] outline-[3px] overscroll-x-none overscroll-y-none overflow-hidden">
      <div className="box-border caret-transparent flex h-[1000px] outline-[3px] w-full overflow-hidden md:h-full">
        <Sidebar />
        <Routes>
          <Route path="/" element={<WorkspaceContent />} />
          <Route path="/supercomputer" element={<WorkspaceContent />} />
          <Route path="/supercomputer/skills" element={<SkillsPage />} />
          <Route path="/supercomputer/memory" element={<MemoryPage />} />
          <Route path="/supercomputer/connectors" element={<ConnectorsPage />} />
        </Routes>
      </div>
    </main>
  );
};
