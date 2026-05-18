import { Sidebar } from "@/sections/MainWorkspace/components/Sidebar";

export default function SupercomputerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="bg-[#131517] box-border caret-transparent col-end-[main] col-start-[main] row-end-[main] row-start-[main] h-full min-h-[auto] outline-[3px] overscroll-x-none overscroll-y-none overflow-hidden">
      <div className="box-border caret-transparent flex h-[1000px] outline-[3px] w-full overflow-hidden md:h-full">
        <Sidebar />
        {children}
      </div>
    </main>
  );
}
