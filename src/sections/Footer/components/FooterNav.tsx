export const FooterNav = () => {
  return (
    <nav className="text-white/60 text-xs [align-items:normal] box-border caret-transparent gap-x-5 flex flex-col grid-cols-none tracking-[0%] leading-[18px] max-w-none outline-[3px] gap-y-5 w-full mt-auto mb-3 mx-auto px-4 py-3 md:text-sm md:items-center md:gap-x-2 md:grid md:grid-cols-[auto_1fr] md:leading-5 md:max-w-full md:gap-y-2 md:mb-0 md:py-6">
      <p className="text-xs box-border caret-transparent leading-[18px] order-2 outline-[3px] text-center text-nowrap md:text-sm md:leading-5 md:order-1 md:text-right">
        <span className="text-xs box-border caret-transparent leading-[18px] outline-[3px] text-center text-nowrap md:text-sm md:leading-5 md:text-right">
          ©2026Higgsfield AI™.
        </span>
        <span className="text-xs box-border caret-transparent leading-[18px] outline-[3px] text-center text-nowrap md:text-sm md:leading-5 md:text-right">
          {" "}
          All rights reserved.
        </span>
      </p>
      <ul className="text-xs box-border caret-transparent gap-x-12 grid flex-nowrap auto-cols-max grid-flow-col grid-rows-[repeat(2,minmax(0px,1fr))] justify-center leading-[18px] list-none order-1 outline-[3px] gap-y-4 text-left pl-0 md:text-sm md:gap-x-4 md:flex md:flex-wrap md:justify-end md:leading-5 md:order-2 md:text-right">
        <li className="text-xs box-border caret-transparent leading-[18px] outline-[3px] text-left md:text-sm md:leading-5 md:text-right">
          <a
            href="mailto://press@higgsfield.ai"
            className="text-xs font-medium content-center box-border caret-transparent gap-x-1.5 inline-grid grid-flow-col leading-[18px] outline-[3px] gap-y-1.5 text-left text-ellipsis text-nowrap overflow-hidden md:text-sm md:leading-5 md:text-right"
          >
            Press
          </a>
        </li>
        <li className="text-xs box-border caret-transparent leading-[18px] outline-[3px] text-left md:text-sm md:leading-5 md:text-right">
          <a
            href="/creative-challenge"
            className="text-xs font-medium content-center box-border caret-transparent gap-x-1.5 inline-grid grid-flow-col leading-[18px] outline-[3px] gap-y-1.5 text-left text-ellipsis text-nowrap overflow-hidden md:text-sm md:leading-5 md:text-right"
          >
            Creative Challenge
          </a>
        </li>
        <li className="text-xs box-border caret-transparent leading-[18px] outline-[3px] text-left md:text-sm md:leading-5 md:text-right">
          <a
            href="/privacy-policy"
            className="text-xs font-medium content-center box-border caret-transparent gap-x-1.5 inline-grid grid-flow-col leading-[18px] outline-[3px] gap-y-1.5 text-left text-ellipsis text-nowrap overflow-hidden md:text-sm md:leading-5 md:text-right"
          >
            Privacy
          </a>
        </li>
        <li className="text-xs box-border caret-transparent leading-[18px] outline-[3px] text-left md:text-sm md:leading-5 md:text-right">
          <a
            href="/terms-of-use-agreement"
            className="text-xs font-medium content-center box-border caret-transparent gap-x-1.5 inline-grid grid-flow-col leading-[18px] outline-[3px] gap-y-1.5 text-left text-ellipsis text-nowrap overflow-hidden md:text-sm md:leading-5 md:text-right"
          >
            Terms
          </a>
        </li>
        <li className="text-xs box-border caret-transparent leading-[18px] outline-[3px] text-left md:text-sm md:leading-5 md:text-right">
          <a
            href="/cookie-notice"
            className="text-xs font-medium content-center box-border caret-transparent gap-x-1.5 inline-grid grid-flow-col leading-[18px] outline-[3px] gap-y-1.5 text-left text-ellipsis text-nowrap overflow-hidden md:text-sm md:leading-5 md:text-right"
          >
            Cookie Notice
          </a>
        </li>
        <li className="text-xs box-border caret-transparent leading-[18px] outline-[3px] text-left md:text-sm md:leading-5 md:text-right">
          <a
            href="#cookie-settings"
            className="text-xs font-medium content-center box-border caret-transparent gap-x-1.5 inline-grid grid-flow-col leading-[18px] outline-[3px] gap-y-1.5 text-left text-ellipsis text-nowrap overflow-hidden md:text-sm md:leading-5 md:text-right"
          >
            Cookie Settings
          </a>
        </li>
      </ul>
    </nav>
  );
};
