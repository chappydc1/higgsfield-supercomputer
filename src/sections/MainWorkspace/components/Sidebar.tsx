import { SidebarPrimaryNav } from "@/sections/MainWorkspace/components/SidebarPrimaryNav";
import { SidebarUserControls } from "@/sections/MainWorkspace/components/SidebarUserControls";

export const Sidebar = () => {
  return (
    <div className="static bg-transparent box-content caret-black shrink h-auto min-w-0 outline-0 w-auto md:relative md:aspect-auto md:bg-zinc-900 md:box-border md:caret-transparent md:shrink-0 md:h-full md:min-w-[auto] md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-12 md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
      <div className="box-content caret-black block flex-row h-auto outline-0 pt-0 md:aspect-auto md:box-border md:caret-transparent md:flex md:flex-col md:h-full md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:overflow-hidden md:[mask-position:0%] md:bg-left-top md:pt-2 md:scroll-m-0 md:scroll-p-[auto]">
        <div className="[align-items:normal] box-content caret-black gap-x-[normal] block shrink min-h-0 min-w-0 outline-0 gap-y-[normal] px-0 md:items-center md:aspect-auto md:box-border md:caret-transparent md:gap-x-1 md:flex md:shrink-0 md:min-h-[auto] md:min-w-[auto] md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:gap-y-1 md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:px-1.5 md:scroll-m-0 md:scroll-p-[auto]">
          <div className="box-content caret-black basis-auto grow-0 min-h-0 outline-0 md:aspect-auto md:box-border md:caret-transparent md:basis-[0%] md:grow md:min-h-[auto] md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
            <div className="static box-content caret-black outline-0 md:relative md:aspect-auto md:box-border md:caret-transparent md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
              <div className="box-content caret-black block flex-row outline-0 py-0 rounded-none md:aspect-auto md:box-border md:caret-transparent md:flex md:flex-col md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:py-1 md:scroll-m-0 md:scroll-p-[auto] md:rounded-[20px]">
                <button
                  type="button"
                  className="[align-items:normal] bg-zinc-100 shadow-none caret-black inline-block h-auto justify-normal min-h-0 min-w-0 outline-0 text-center w-auto rounded-none md:items-center md:aspect-auto md:bg-[oklab(0.999994_0.0000455678_0.0000200868_/_0.05)] md:shadow-[rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0.06)_0px_2px_8px_0px] md:caret-transparent md:flex md:h-9 md:justify-center md:min-h-[auto] md:min-w-[auto] md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-9 md:[mask-position:0%] md:bg-left-top md:p-0 md:scroll-m-0 md:scroll-p-[auto] md:rounded-[28px]"
                >
                  <img
                    src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-4.svg"
                    alt="Icon"
                    className="text-black box-content caret-black shrink h-auto outline-0 w-auto md:text-[oklab(0.999994_0.0000455678_0.0000200868_/_0.5)] md:aspect-auto md:box-border md:caret-transparent md:shrink-0 md:h-4 md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-4 md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]"
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
        <SidebarPrimaryNav />
        <div className="static box-content caret-black basis-auto grow-0 min-w-0 opacity-100 outline-0 pointer-events-auto mt-0 md:relative md:aspect-auto md:box-border md:caret-transparent md:basis-[0%] md:grow md:min-w-[auto] md:opacity-0 md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:pointer-events-none md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:mt-1 md:scroll-m-0 md:scroll-p-[auto]">
          <div className="box-content caret-black h-auto outline-0 overflow-x-visible overflow-y-visible w-auto pb-0 md:aspect-auto md:box-border md:caret-transparent md:h-full md:outline-[3px] md:overflow-x-hidden md:overflow-y-auto md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:pb-3 md:scroll-m-0 md:scroll-p-[auto]">
            <div className="static box-content caret-black h-auto outline-0 md:relative md:aspect-auto md:box-border md:caret-transparent md:h-[166px] md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]">
              <div className="static box-content caret-black h-auto outline-0 w-auto left-auto top-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:h-9 md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-full md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:left-0 md:top-0"></div>
              <div className="static box-content caret-black h-auto outline-0 transform-none w-auto left-auto top-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:h-[130px] md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:translate-y-9 md:w-full md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:left-0 md:top-0"></div>
            </div>
          </div>
          <div className="static bg-none box-content caret-black h-auto outline-0 bottom-auto inset-x-auto md:absolute md:aspect-auto md:bg-[linear-gradient(to_top,rgb(26,26,28)_0%,rgba(0,0,0,0)_100%)] md:box-border md:caret-transparent md:h-6 md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:bottom-0 md:inset-x-0"></div>
        </div>
        <SidebarUserControls />
      </div>
      <div className="static box-content caret-black outline-0 pointer-events-auto w-auto right-auto inset-y-auto md:absolute md:aspect-auto md:box-border md:caret-transparent md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:pointer-events-none md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-px md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:right-0 md:inset-y-0"></div>
    </div>
  );
};
