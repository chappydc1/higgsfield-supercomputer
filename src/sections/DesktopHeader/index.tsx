import { BrandLogo } from "@/sections/DesktopHeader/components/BrandLogo";
import { DesktopNavigation } from "@/sections/DesktopHeader/components/DesktopNavigation";
import { HeaderActions } from "@/sections/DesktopHeader/components/HeaderActions";

export const DesktopHeader = () => {
  return (
    <header className="relative backdrop-blur-sm bg-black/90 shadow-[rgb(0,0,0)_0px_16px_16px_0px_inset] box-border caret-transparent hidden col-end-[header] col-start-[header] row-end-[header] row-start-[header] h-16 outline-[3px] w-full z-[51] top-0 md:sticky">
      <nav
        aria-label="primary navigation"
        className="relative items-center box-border caret-transparent grid grid-cols-[1fr_auto] h-full max-w-none outline-[3px] w-full m-auto px-4 md:grid-cols-[auto_1fr_auto] md:max-w-full"
      >
        <BrandLogo />
        <DesktopNavigation />
        <HeaderActions />
      </nav>
    </header>
  );
};
