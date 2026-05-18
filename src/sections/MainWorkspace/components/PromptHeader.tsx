export const PromptHeader = () => {
  return (
    <div className="items-center box-border caret-transparent gap-x-2 flex flex-col justify-center min-h-[auto] min-w-[auto] outline-[3px] gap-y-2 ml-0 pt-10 md:gap-x-6 md:flex-row md:justify-start md:gap-y-6 md:ml-3">
      <figure className="relative box-border caret-transparent shrink-0 h-24 min-h-[auto] min-w-[auto] outline-[3px] w-24 overflow-hidden rounded-[5px] md:h-28 md:w-28">
        <video
          autoplay=""
          loop=""
          playsinline=""
          preload="auto"
          poster="https://c.animaapp.com/mpaqnk8rhqfcCD/assets/v4-fallback.webp"
          className="box-border caret-transparent h-full max-w-full outline-[3px] w-full"
        >
          <source
            src="https://static.higgsfield.ai/claudesfield/avatar/empty-v3.mov"
            type="video/quicktime"
            className="text-black box-border caret-transparent leading-[normal] outline-[3px] font-times_new_roman"
          />
          <source
            src="https://static.higgsfield.ai/claudesfield/avatar/empty-v3.webm"
            type="video/webm"
            className="text-black box-border caret-transparent leading-[normal] outline-[3px] font-times_new_roman"
          />
        </video>
      </figure>
      <h2 className="text-[22px] font-black box-border caret-transparent block tracking-[-0.44px] leading-[26px] max-w-full min-h-[auto] min-w-[auto] outline-[3px] break-words text-center w-full overflow-visible font-doto md:text-[40px] md:flow-root md:tracking-[-0.8px] md:leading-[42px] md:max-w-[450px] md:text-left md:overflow-hidden">
        <span className="text-transparent text-[22px] bg-clip-text bg-[linear-gradient(in_oklab,rgb(255,255,255)_0px,rgb(137,138,139)_100%)] box-border tracking-[-0.44px] leading-[26px] outline-[3px] break-words text-center md:text-[40px] md:tracking-[-0.8px] md:leading-[42px] md:text-left">
          What are we creating today?
        </span>
      </h2>
    </div>
  );
};
