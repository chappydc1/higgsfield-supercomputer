export const MobileBottomNav = () => {
  return (
    <div className="sticky items-center backdrop-blur-sm bg-black/90 box-border caret-transparent hidden auto-cols-[minmax(0px,1fr)] grid-flow-col col-end-[header-mobile] col-start-[header-mobile] row-end-[header-mobile] row-start-[header-mobile] max-w-none outline-[3px] w-full z-50 border-zinc-300/0 m-auto px-1 py-3 border-t border-solid -bottom-px md:max-w-full">
      <a
        href="/"
        className="text-zinc-500 items-center box-border caret-transparent gap-x-0.5 flex flex-col justify-center outline-[3px] gap-y-0.5 text-center"
      >
        <img
          src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-28.svg"
          alt="Icon"
          className="box-border caret-transparent shrink-0 h-5 outline-[3px] w-5"
        />
        <p className="text-[10px] font-medium box-border caret-transparent tracking-[0%] leading-[14px] outline-[3px]">
          Home
        </p>
      </a>
      <a
        href="/project/submit"
        className="text-zinc-500 items-center box-border caret-transparent gap-x-0.5 flex flex-col justify-center outline-[3px] gap-y-0.5 text-center"
      >
        <img
          src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-29.svg"
          alt="Icon"
          className="box-border caret-transparent shrink-0 h-5 outline-[3px] w-5"
        />
        <p className="text-[10px] font-medium box-border caret-transparent tracking-[0%] leading-[14px] outline-[3px]">
          Community
        </p>
      </a>
      <div className="items-center box-border caret-transparent gap-x-1 flex flex-col h-full justify-end outline-[3px] gap-y-1">
        <button
          type="button"
          className="absolute items-center bg-cyan-200 shadow-[rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0.25)_0px_-4px_0px_0px_inset] caret-transparent grid h-11 justify-items-center outline-[3px] text-center w-14 p-0 rounded-[14px] -top-4"
        >
          <img
            src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-30.svg"
            alt="Icon"
            className="text-lime-950 box-border caret-transparent h-5 outline-[3px] w-5 mb-1"
          />
        </button>
        <p className="text-zinc-500 text-[10px] font-medium box-border caret-transparent tracking-[0%] leading-[14px] outline-[3px]">
          Generate
        </p>
      </div>
      <a
        href="/library/image"
        className="text-zinc-500 items-center box-border caret-transparent gap-x-0.5 flex flex-col justify-center outline-[3px] gap-y-0.5 text-center"
      >
        <img
          src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-31.svg"
          alt="Icon"
          className="box-border caret-transparent shrink-0 h-5 outline-[3px] w-5"
        />
        <p className="text-[10px] font-medium box-border caret-transparent tracking-[0%] leading-[14px] outline-[3px]">
          Library
        </p>
      </a>
      <a
        href="/profile"
        className="text-zinc-500 items-center box-border caret-transparent gap-x-0.5 flex flex-col justify-center outline-[3px] gap-y-0.5 text-center"
      >
        <img
          src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-32.svg"
          alt="Icon"
          className="box-border caret-transparent shrink-0 h-5 outline-[3px] w-5"
        />
        <p className="text-[10px] font-medium box-border caret-transparent tracking-[0%] leading-[14px] outline-[3px]">
          Profile
        </p>
      </a>
    </div>
  );
};
