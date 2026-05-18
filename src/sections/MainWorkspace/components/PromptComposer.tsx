import { PromptHeader } from "@/sections/MainWorkspace/components/PromptHeader";
import { PromptInput } from "@/sections/MainWorkspace/components/PromptInput";

export const PromptComposer = () => {
  return (
    <div className="relative items-center box-border caret-transparent flex basis-[0%] flex-col grow h-full justify-center min-h-[auto] min-w-[auto] outline-[3px] w-full px-5">
      <div className="relative box-border caret-transparent gap-x-3 flex flex-col max-w-[800px] min-h-[auto] outline-[3px] gap-y-3 w-full">
        <PromptHeader />
        <PromptInput />
      </div>
      <div className="absolute items-center box-border caret-transparent gap-x-2 hidden outline-[3px] gap-y-2 z-10 right-3 -top-11 md:flex">
        <button
          type="button"
          className="text-[oklab(0.999994_0.0000455677_0.0000200868_/_0.8)] text-xs font-medium items-center bg-[oklab(0.999994_0.0000455678_0.0000200868_/_0.05)] caret-transparent gap-x-1 flex h-8 justify-center tracking-[0%] leading-[18px] min-h-0 min-w-0 outline-[3px] gap-y-1 text-center px-2.5 py-1 rounded-[3.35544e+07px] md:min-h-[auto] md:min-w-[auto]"
        >
          <img
            src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-27.svg"
            alt="Icon"
            className="text-[oklab(0.999994_0.0000455678_0.0000200868_/_0.5)] box-border caret-transparent shrink-0 h-3 outline-[3px] w-3"
          />
          <span className="box-border caret-transparent block min-h-0 min-w-0 outline-[3px] px-1 md:min-h-[auto] md:min-w-[auto]">
            Shortcuts
          </span>
        </button>
      </div>
    </div>
  );
};
