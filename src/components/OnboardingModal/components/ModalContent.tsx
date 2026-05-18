import { MobileShowcase } from "@/components/OnboardingModal/components/MobileShowcase";
import { DesktopShowcase } from "@/components/OnboardingModal/components/DesktopShowcase";

export const ModalContent = () => {
  return (
    <div className="absolute box-border caret-transparent outline-[3px] inset-0">
      <div className="absolute box-border caret-transparent flex flex-col outline-[3px] inset-0">
        <div className="relative items-center box-border caret-transparent flex basis-[0%] flex-col grow justify-normal min-h-[auto] min-w-[auto] outline-[3px] z-20 pt-20 pb-[108px] px-4 md:justify-center md:pt-24 md:pb-40 md:px-12">
          <MobileShowcase />
          <DesktopShowcase />
        </div>
        <div className="absolute box-border caret-transparent block outline-[3px] z-30 px-4 bottom-5 inset-x-0 md:hidden">
          <button
            type="button"
            className="text-neutral-900 text-sm font-semibold items-center bg-white shadow-[rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0.18)_0px_12px_40px_0px] caret-transparent flex h-12 justify-center tracking-[0%] leading-5 outline-[3px] text-center w-full border p-0 rounded-[3.35544e+07px] border-[oklab(0_0_0_/_0.1)]"
          >
            Continue
          </button>
        </div>
        <div className="absolute items-center box-border caret-transparent hidden flex-col outline-[3px] text-center z-30 px-4 bottom-6 inset-x-0 md:flex md:bottom-10">
          <div className="text-xl font-medium box-border caret-transparent blur-0 tracking-[-1%] leading-7 min-h-0 min-w-0 outline-[3px] md:text-2xl md:leading-[30px] md:min-h-[auto] md:min-w-[auto]">
            <p className="text-xl box-border caret-transparent leading-7 outline-[3px] md:text-2xl md:leading-[30px]">
              The self-learning AI agent
            </p>
            <p className="text-[oklab(0.999994_0.0000455677_0.0000200868_/_0.6)] text-xl box-border caret-transparent leading-7 outline-[3px] md:text-2xl md:leading-[30px]">
              Built for creators who ship
            </p>
          </div>
          <button
            type="button"
            className="text-neutral-900 text-sm font-semibold items-center bg-white shadow-[rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0.18)_0px_12px_40px_0px] caret-transparent flex h-10 justify-center tracking-[0%] leading-5 min-h-0 min-w-0 outline-[3px] border mt-5 px-6 py-0 rounded-[3.35544e+07px] border-[oklab(0_0_0_/_0.1)] md:h-8 md:min-h-[auto] md:min-w-[auto] md:mt-6 md:px-4"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
};
