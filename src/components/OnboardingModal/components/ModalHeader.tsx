export const ModalHeader = () => {
  return (
    <div className="absolute items-center box-border caret-transparent flex justify-between outline-[3px] z-40 top-4 inset-x-4 md:top-6 md:inset-x-6">
      <div className="text-sm font-medium items-center box-border caret-transparent gap-x-1 flex tracking-[0%] leading-5 min-h-[auto] min-w-[auto] outline-[3px] gap-y-1">
        <img
          src="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/icon-33.svg"
          alt="Icon"
          className="box-border caret-transparent h-4 outline-[3px] w-4"
        />
        <span className="box-border caret-transparent block min-h-[auto] min-w-[auto] outline-[3px]">
          Supercomputer
        </span>
      </div>
      <div className="absolute box-border caret-transparent outline-[3px] pointer-events-none left-2/4">
        <div className="items-center box-border caret-transparent gap-x-0.5 flex outline-[3px] gap-y-0.5">
          <button
            type="button"
            aria-label="Go to step 1"
            className="bg-white caret-transparent block h-2 min-h-[auto] min-w-[auto] outline-[3px] pointer-events-auto text-center w-2 p-0 rounded-[3.35544e+07px]"
          ></button>
          <button
            type="button"
            aria-label="Go to step 2"
            className="bg-white/10 caret-transparent block h-2 min-h-[auto] min-w-[auto] outline-[3px] pointer-events-auto text-center w-2 p-0 rounded-[3.35544e+07px]"
          ></button>
          <button
            type="button"
            aria-label="Go to step 3"
            className="bg-white/10 caret-transparent block h-2 min-h-[auto] min-w-[auto] outline-[3px] pointer-events-auto text-center w-2 p-0 rounded-[3.35544e+07px]"
          ></button>
          <button
            type="button"
            aria-label="Go to step 4"
            className="bg-white/10 caret-transparent block h-2 min-h-[auto] min-w-[auto] outline-[3px] pointer-events-auto text-center w-2 p-0 rounded-[3.35544e+07px]"
          ></button>
        </div>
      </div>
      <button
        type="button"
        className="text-xs font-medium items-center bg-white/10 caret-transparent flex h-8 justify-center tracking-[0%] leading-[18px] min-h-[auto] min-w-[auto] outline-[3px] text-center border px-2 py-0 rounded-[3.35544e+07px] border-[oklab(0_0_0_/_0.09)]"
      >
        Skip
      </button>
    </div>
  );
};
