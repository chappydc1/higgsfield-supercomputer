import { Sidebar } from "@/sections/MainWorkspace/components/Sidebar";
import { WorkspaceContent } from "@/sections/MainWorkspace/components/WorkspaceContent";

export const MainWorkspace = () => {
  return (
    <main className="bg-neutral-900 box-border caret-transparent col-end-[main] col-start-[main] row-end-[main] row-start-[main] h-full min-h-[auto] outline-[3px] overscroll-x-none overscroll-y-none overflow-hidden">
      <div className="box-border caret-transparent flex h-[1000px] outline-[3px] w-full overflow-hidden md:h-full">
        <Sidebar />
        <WorkspaceContent />
      </div>
    </main>
  );
};
