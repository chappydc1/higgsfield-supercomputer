export const HeaderActions = () => {
  return (
    <div className="items-center box-border caret-transparent gap-x-1 grid shrink-0 grid-flow-col-dense outline-[3px] gap-y-1">
      <div className="items-center box-border caret-transparent gap-x-2 flex justify-end outline-[3px] gap-y-2">
        <a
          title="View Higgsfield AI pricing plans and subscription options"
          href="/pricing"
          className="text-white/60 text-sm font-medium items-center box-border caret-transparent gap-x-1 hidden grid-flow-col tracking-[0%] leading-5 outline-[3px] gap-y-1 text-nowrap px-2 py-1 rounded-[10px] md:grid"
        >
          <div className="relative text-white font-normal items-center backdrop-blur-md bg-white/10 shadow-[rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0.03)_0px_2px_1.5px_-0.5px,rgba(255,255,255,0.03)_0px_2px_3px_0px_inset] box-border caret-transparent gap-x-1.5 flex h-9 outline-[3px] gap-y-1.5 text-nowrap px-2 rounded-[10px]">
            <img
              src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-2.svg"
              alt="Icon"
              className="box-border caret-transparent h-4 outline-[3px] text-nowrap w-4"
            />
            Pricing
            <div className="absolute text-[10px] font-bold items-center bg-[radial-gradient(39.71%_136.54%_at_51.64%_117.31%,rgb(249,32,209)_0px,rgb(237,21,114)_100%)] box-border caret-transparent grid h-[18px] justify-items-center leading-[14px] min-w-14 outline-[3px] text-center text-nowrap px-1.5 py-0.5 rounded-md left-2/4 top-[30px]">
              30% OFF
            </div>
          </div>
        </a>
        <a
          title="See Higgsfield AI reels, posts, and creator spotlights on Instagram"
          href="https://www.instagram.com/higgsfield.ai"
          className="text-white/60 text-sm font-medium items-center box-border caret-transparent gap-x-1 grid grid-flow-col justify-self-end tracking-[0%] leading-5 outline-[3px] gap-y-1 text-nowrap px-1.5 py-1 rounded-[10px] md:hidden"
        >
          <img
            src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-3.svg"
            alt="Icon"
            className="box-border caret-transparent h-5 outline-[3px] text-nowrap w-5"
          />
        </a>
        <a
          type="button"
          href="/pricing"
          className="text-sm font-semibold content-center items-center box-border caret-transparent gap-x-1.5 grid grid-flow-col h-8 justify-center justify-self-end leading-5 max-w-full outline-[3px] gap-y-1.5 text-ellipsis text-nowrap overflow-hidden mr-2 px-2.5 rounded-[10px] border-2 border-solid border-[oklab(0.999994_0.0000455678_0.0000200868_/_0.1)] md:hidden"
        >
          Pricing
        </a>
        <a
          type="button"
          href="#"
          className="text-cyan-200 text-sm font-semibold content-center items-center backdrop-blur-sm bg-sky-400/20 box-border caret-transparent gap-x-1.5 grid grid-flow-col h-8 justify-center justify-self-end leading-5 max-w-full outline-lime-400/50 outline-[3px] gap-y-1.5 text-ellipsis text-nowrap overflow-hidden px-2.5 rounded-[10px] md:hidden"
        >
          Try Free
        </a>
        <div className="items-center box-border caret-transparent gap-x-2 hidden grid-flow-col-dense justify-self-end outline-[3px] gap-y-2 md:grid">
          <a
            type="button"
            href="#"
            className="text-cyan-200 text-sm font-semibold content-center items-center backdrop-blur-sm box-border caret-transparent gap-x-2 inline-grid grid-flow-col h-10 justify-center leading-5 max-w-full outline-lime-400/50 outline-[3px] gap-y-2 text-ellipsis text-nowrap border border-lime-400/10 overflow-hidden px-2.5 rounded-xl border-solid md:grid"
          >
            Login
          </a>
          <a
            type="button"
            href="#"
            className="text-neutral-900 text-sm font-semibold content-center items-center bg-cyan-200 box-border caret-transparent gap-x-2 inline-grid grid-flow-col h-10 justify-center leading-5 max-w-full outline-lime-400/50 outline-[3px] gap-y-2 text-ellipsis text-nowrap border border-cyan-200 overflow-hidden px-2.5 rounded-xl border-solid md:grid"
          >
            Sign up
          </a>
        </div>
      </div>
    </div>
  );
};
