import { ModalHeader } from "@/components/OnboardingModal/components/ModalHeader";
import { ModalContent } from "@/components/OnboardingModal/components/ModalContent";

export const OnboardingModal = () => {
  return (
    <div
      aria-label="Supercomputer onboarding"
      role="dialog"
      className="fixed bg-neutral-900 box-border caret-transparent isolate outline-[3px] z-[1300] overflow-hidden inset-0"
    >
      <div className="relative text-white bg-neutral-900 box-border caret-transparent h-full isolate outline-[3px] w-full overflow-hidden">
        <div className="absolute bg-neutral-900 box-border caret-transparent outline-[3px] z-0 inset-0"></div>
        <div className="absolute box-border caret-transparent mix-blend-lighten outline-[3px] pointer-events-none z-[5] overflow-hidden inset-0">
          <img
            alt=""
            sizes="100vw"
            src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/background-horizon.jpg"
            className="absolute text-transparent box-border blur-2xl brightness-[0.45] h-full max-w-full object-cover object-[50%_0%] outline-[3px] w-full inset-0"
          />
        </div>
        <div className="absolute box-border caret-transparent mix-blend-lighten outline-[3px] pointer-events-none z-[5] overflow-hidden inset-0">
          <img
            alt=""
            sizes="100vw"
            src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/bg-image.png"
            className="absolute text-transparent box-border blur-3xl brightness-90 h-full max-w-full object-cover object-[50%_0%] opacity-20 outline-[3px] w-full inset-0 md:opacity-40"
          />
        </div>
        <img
          src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/image-2.png"
          className="absolute text-white/10 aspect-[auto_1280_/_1000] box-border caret-transparent h-full max-w-full outline-[3px] pointer-events-none w-full z-10 inset-0"
        />
        <ModalHeader />
        <ModalContent />
      </div>
    </div>
  );
};
