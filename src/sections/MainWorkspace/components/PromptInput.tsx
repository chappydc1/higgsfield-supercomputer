export const PromptInput = () => {
  return (
    <div className="box-border caret-transparent gap-x-3 flex flex-col max-h-[680px] min-w-[auto] outline-[3px] gap-y-3 w-full overflow-hidden pt-1 pb-3 px-1 rounded-[28px] md:max-h-[740px]">
      <div className="bg-zinc-900 box-border caret-transparent gap-x-2.5 flex flex-col min-h-[auto] min-w-[auto] outline-[3px] gap-y-2.5 w-full p-3 rounded-3xl">
        <div className="relative box-border caret-transparent flex min-h-[auto] outline-[3px] p-1.5">
          <div
            role="textbox"
            className="text-white text-sm box-border caret-transparent leading-5 max-h-[140px] max-w-full min-h-5 min-w-[auto] outline-[3px] break-words overflow-x-hidden overflow-y-auto w-full"
          ></div>
          <div className="absolute items-center box-border caret-transparent flex h-5 outline-[3px] pointer-events-none overflow-hidden top-1.5 inset-x-1.5">
            <span className="text-zinc-500 text-sm box-border caret-transparent block leading-5 min-h-[auto] min-w-[auto] outline-[3px] text-ellipsis text-nowrap w-full overflow-hidden pr-1"></span>
          </div>
        </div>
        <div className="items-center box-border caret-transparent gap-x-2 flex flex-wrap justify-between min-h-[auto] min-w-[auto] outline-[3px] gap-y-2 md:flex-nowrap">
          <div className="items-center box-border caret-transparent gap-x-1 flex basis-[0%] grow min-h-[auto] outline-[3px] gap-y-1">
            <input
              type="file"
              className="appearance-none items-baseline bg-transparent box-border caret-transparent hidden outline-[3px] text-ellipsis text-nowrap p-0"
            />
            <button
              type="button"
              className="[align-items:normal] bg-zinc-100 caret-black inline-block shrink h-auto justify-normal min-h-0 min-w-0 outline-0 text-center w-auto rounded-none md:items-center md:aspect-auto md:bg-[oklab(0.999994_0.0000455678_0.0000200868_/_0.05)] md:caret-transparent md:flex md:shrink-0 md:h-8 md:justify-center md:min-h-[auto] md:min-w-[auto] md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-8 md:[mask-position:0%] md:bg-left-top md:p-0 md:scroll-m-0 md:scroll-p-[auto] md:rounded-[3.35544e+07px]"
            >
              <img
                src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-16.svg"
                alt="Icon"
                className="text-black box-content caret-black h-auto outline-0 w-auto md:text-white md:aspect-auto md:box-border md:caret-transparent md:h-4 md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-4 md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto]"
              />
            </button>
          </div>
          <div className="items-center box-border caret-transparent gap-x-2 flex shrink-0 min-h-[auto] min-w-[auto] outline-[3px] gap-y-2 md:gap-x-3 md:gap-y-3">
            <button
              type="button"
              aria-label="Ask Run"
              className="text-[oklab(0.999994_0.0000455678_0.0000200868_/_0.9)] text-xs font-medium items-center bg-transparent caret-transparent gap-x-0.5 flex h-8 tracking-[0%] leading-[18px] min-h-[auto] outline-[3px] gap-y-0.5 text-center pl-3 pr-2 py-1 rounded-[3.35544e+07px]"
            >
              <img
                src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-17.svg"
                alt="Icon"
                className="text-[oklab(0.999994_0.0000455677_0.0000200868_/_0.7)] box-border caret-transparent hidden shrink-0 h-4 outline-[3px] w-4"
              />
              <span className="box-border caret-transparent block min-h-[auto] min-w-[auto] outline-[3px] text-ellipsis text-nowrap overflow-hidden">
                Ask Run
              </span>
              <img
                src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-18.svg"
                alt="Icon"
                className="text-[oklab(0.999994_0.0000455678_0.0000200868_/_0.5)] box-border caret-transparent shrink-0 h-4 outline-[3px] w-4"
              />
            </button>
            <button
              type="button"
              aria-label="Send message"
              className="items-center bg-cyan-200 caret-transparent flex shrink-0 h-8 justify-center min-h-[auto] min-w-[auto] outline-[3px] text-center w-8 p-0 rounded-[3.35544e+07px]"
            >
              <img
                src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-19.svg"
                alt="Icon"
                className="text-neutral-900 box-border caret-transparent h-4 outline-[3px] w-4"
              />
            </button>
          </div>
        </div>
      </div>
      <div className="box-border caret-transparent min-w-[auto] outline-[3px] overflow-auto px-2 md:px-3">
        <div className="box-border caret-transparent gap-x-3 flex flex-col outline-[3px] gap-y-3">
          <div className="items-center box-border caret-transparent gap-x-1 flex min-h-[auto] min-w-[auto] outline-[3px] overflow-x-auto overflow-y-hidden gap-y-1 w-full pb-1 md:overflow-x-visible md:overflow-y-visible md:pb-0">
            <button
              type="button"
              className="text-white text-xs font-medium items-center bg-[oklab(0.999994_0.0000455678_0.0000200868_/_0.05)] caret-transparent gap-x-2 flex shrink-0 h-8 tracking-[0%] leading-[18px] min-h-[auto] min-w-[auto] outline-[3px] gap-y-2 text-center text-nowrap px-3 py-0 rounded-[3.35544e+07px]"
            >
              <img
                src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-20.svg"
                alt="Icon"
                className="text-white/40 box-border caret-transparent shrink-0 h-4 outline-[3px] text-nowrap w-4 rounded-bl rounded-br rounded-tl rounded-tr"
              />
              <span className="box-border caret-transparent block min-h-[auto] min-w-[auto] outline-[3px] text-ellipsis text-nowrap overflow-hidden md:hidden md:min-h-0 md:min-w-0">
                Skills
              </span>
              <span className="box-border caret-transparent hidden min-h-0 min-w-0 outline-[3px] text-nowrap md:block md:min-h-[auto] md:min-w-[auto]">
                Build with skills
              </span>
              <span className="text-cyan-200 text-[10px] font-semibold bg-[oklab(0.880873_-0.0652866_-0.0372148_/_0.05)] box-border caret-transparent block leading-[14px] min-h-[auto] min-w-[auto] outline-[3px] text-nowrap px-1.5 py-0.5 rounded-[3.35544e+07px]">
                New
              </span>
            </button>
            <button
              type="button"
              className="text-[oklab(0.999994_0.0000455677_0.0000200868_/_0.8)] text-xs font-medium items-center bg-transparent caret-transparent gap-x-2 flex shrink-0 h-8 tracking-[0%] leading-[18px] min-h-[auto] min-w-[auto] outline-[3px] gap-y-2 text-center text-nowrap px-3 py-0 rounded-[3.35544e+07px]"
            >
              <img
                src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-21.svg"
                alt="Icon"
                className="text-white/40 box-border caret-transparent shrink-0 h-4 outline-[3px] text-nowrap w-4 rounded-bl rounded-br rounded-tl rounded-tr"
              />
              <span className="box-border caret-transparent block min-h-[auto] min-w-[auto] outline-[3px] text-ellipsis text-nowrap overflow-hidden md:hidden md:min-h-0 md:min-w-0">
                UGC
              </span>
              <span className="box-border caret-transparent hidden min-h-0 min-w-0 outline-[3px] text-nowrap md:block md:min-h-[auto] md:min-w-[auto]">
                Create UGC
              </span>
            </button>
            <button
              type="button"
              className="text-[oklab(0.999994_0.0000455677_0.0000200868_/_0.8)] text-xs font-medium items-center bg-transparent caret-transparent gap-x-2 flex shrink-0 h-8 tracking-[0%] leading-[18px] min-h-[auto] min-w-[auto] outline-[3px] gap-y-2 text-center text-nowrap px-3 py-0 rounded-[3.35544e+07px]"
            >
              <img
                src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-22.svg"
                alt="Icon"
                className="text-white/40 box-border caret-transparent shrink-0 h-4 outline-[3px] text-nowrap w-4 rounded-bl rounded-br rounded-tl rounded-tr"
              />
              <span className="box-border caret-transparent block min-h-[auto] min-w-[auto] outline-[3px] text-ellipsis text-nowrap overflow-hidden md:hidden md:min-h-0 md:min-w-0">
                Marketing
              </span>
              <span className="box-border caret-transparent hidden min-h-0 min-w-0 outline-[3px] text-nowrap md:block md:min-h-[auto] md:min-w-[auto]">
                Run marketing
              </span>
            </button>
            <button
              type="button"
              className="text-[oklab(0.999994_0.0000455677_0.0000200868_/_0.8)] text-xs font-medium items-center bg-transparent caret-transparent gap-x-2 flex shrink-0 h-8 tracking-[0%] leading-[18px] min-h-[auto] min-w-[auto] outline-[3px] gap-y-2 text-center text-nowrap px-3 py-0 rounded-[3.35544e+07px]"
            >
              <img
                src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-23.svg"
                alt="Icon"
                className="text-white/40 box-border caret-transparent shrink-0 h-4 outline-[3px] text-nowrap w-4 rounded-bl rounded-br rounded-tl rounded-tr"
              />
              <span className="box-border caret-transparent block min-h-[auto] min-w-[auto] outline-[3px] text-ellipsis text-nowrap overflow-hidden md:hidden md:min-h-0 md:min-w-0">
                Cinema
              </span>
              <span className="box-border caret-transparent hidden min-h-0 min-w-0 outline-[3px] text-nowrap md:block md:min-h-[auto] md:min-w-[auto]">
                Shoot cinema
              </span>
            </button>
            <button
              type="button"
              className="text-[oklab(0.999994_0.0000455677_0.0000200868_/_0.8)] text-xs font-medium items-center bg-transparent caret-transparent gap-x-2 flex shrink-0 h-8 tracking-[0%] leading-[18px] min-h-[auto] min-w-[auto] outline-[3px] gap-y-2 text-center text-nowrap px-3 py-0 rounded-[3.35544e+07px]"
            >
              <img
                src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-24.svg"
                alt="Icon"
                className="text-white/40 box-border caret-transparent shrink-0 h-4 outline-[3px] text-nowrap w-4 rounded-bl rounded-br rounded-tl rounded-tr"
              />
              <span className="box-border caret-transparent block min-h-[auto] min-w-[auto] outline-[3px] text-ellipsis text-nowrap overflow-hidden md:hidden md:min-h-0 md:min-w-0">
                Cartoon
              </span>
              <span className="box-border caret-transparent hidden min-h-0 min-w-0 outline-[3px] text-nowrap md:block md:min-h-[auto] md:min-w-[auto]">
                Animate cartoon
              </span>
            </button>
          </div>
          <div className="box-border caret-transparent gap-x-1 flex flex-col min-h-[auto] min-w-[auto] outline-[3px] gap-y-1">
            <button
              type="button"
              className="items-start bg-transparent caret-transparent gap-x-2.5 flex min-h-[auto] min-w-[auto] outline-[3px] gap-y-2.5 text-left w-full p-2 rounded-[3.35544e+07px]"
            >
              <img
                src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-25.svg"
                alt="Icon"
                className="text-[oklab(0.999994_0.0000455678_0.0000200868_/_0.5)] box-border caret-transparent shrink-0 h-4 outline-[3px] w-4 mt-0.5 rounded-bl rounded-br rounded-tl rounded-tr"
              />
              <span className="text-[oklab(0.999994_0.0000455677_0.0000200868_/_0.8)] text-sm box-border caret-transparent block tracking-[0%] leading-5 min-h-[auto] outline-[3px] break-words">
                Create a marketing video using /ugc-flow
              </span>
            </button>
            <button
              type="button"
              className="items-start bg-transparent caret-transparent gap-x-2.5 flex min-h-[auto] min-w-[auto] outline-[3px] gap-y-2.5 text-left w-full p-2 rounded-[3.35544e+07px]"
            >
              <img
                src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-26.svg"
                alt="Icon"
                className="text-[oklab(0.999994_0.0000455678_0.0000200868_/_0.5)] box-border caret-transparent shrink-0 h-4 outline-[3px] w-4 mt-0.5 rounded-bl rounded-br rounded-tl rounded-tr"
              />
              <span className="text-[oklab(0.999994_0.0000455677_0.0000200868_/_0.8)] text-sm box-border caret-transparent block tracking-[0%] leading-5 min-h-[auto] outline-[3px] break-words">
                Discover skills from the community
              </span>
            </button>
            <button
              type="button"
              className="items-start bg-transparent caret-transparent gap-x-2.5 flex min-h-[auto] min-w-[auto] outline-[3px] gap-y-2.5 text-left w-full p-2 rounded-[3.35544e+07px]"
            >
              <span className="items-center box-border caret-transparent flex shrink-0 h-4 justify-center min-h-[auto] min-w-[auto] outline-[3px] w-4 mt-0.5">
                <span className="box-content caret-black inline h-auto min-h-0 min-w-0 opacity-100 outline-0 transform-none w-auto md:aspect-auto md:box-border md:caret-transparent md:flex md:h-4 md:min-h-[auto] md:min-w-[auto] md:opacity-[0.679228] md:outline-[3px] md:overscroll-x-auto md:overscroll-y-auto md:snap-align-none md:snap-normal md:snap-none md:decoration-auto md:underline-offset-auto md:w-4 md:[mask-position:0%] md:bg-left-top md:scroll-m-0 md:scroll-p-[auto] md:scale-[0.936984]"></span>
              </span>
              <span className="text-[oklab(0.999994_0.0000455677_0.0000200868_/_0.8)] text-sm box-border caret-transparent block tracking-[0%] leading-5 min-h-[auto] outline-[3px] break-words">
                Import skills &amp; memory from Claude, ChatGPT, Codex, Hermes
                Agent and OpenClaw
              </span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
