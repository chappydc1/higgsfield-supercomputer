import { WorkspaceTopBar } from "@/sections/MainWorkspace/components/WorkspaceTopBar";
import { PromptComposer } from "@/sections/MainWorkspace/components/PromptComposer";

export const WorkspaceContent = () => {
  return (
    <div className="relative box-border caret-transparent flex basis-[0%] grow min-h-[auto] outline-[3px] bg-[#131517]" style={{ backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)", backgroundSize: "24px 24px" }}>
      <div className="box-border caret-transparent flex basis-[0%] flex-col grow min-h-[auto] outline-[3px]">
        <WorkspaceTopBar />
        <div className="absolute box-border caret-transparent outline-[3px] pointer-events-none inset-0">
          <img
            src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/image-1.png"
            className="text-white/10 aspect-[auto_1232_/_1000] box-border caret-transparent h-full max-w-full outline-[3px] w-full"
          />
        </div>
        <PromptComposer />
      </div>
    </div>
  );
};
