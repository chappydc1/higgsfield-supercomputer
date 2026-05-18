export type ModalActionsProps = {
  containerVariant: string;
  buttonVariant: string;
  buttonText: string;
  showContent: boolean;
  title: string;
  subtitle: string;
};

export const ModalActions = (props: ModalActionsProps) => {
  return (
    <div
      className={`absolute box-border caret-transparent outline-[3px] z-30 px-4 inset-x-0 ${props.containerVariant}`}
    >
      {props.showContent ? (
        <div className="text-xl font-medium box-border caret-transparent blur-0 tracking-[-1%] leading-7 min-h-0 min-w-0 outline-[3px] md:text-2xl md:leading-[30px] md:min-h-[auto] md:min-w-[auto]">
          <p className="text-xl box-border caret-transparent leading-7 outline-[3px] md:text-2xl md:leading-[30px]">
            {props.title}
          </p>
          <p className="text-[oklab(0.999994_0.0000455677_0.0000200868_/_0.6)] text-xl box-border caret-transparent leading-7 outline-[3px] md:text-2xl md:leading-[30px]">
            {props.subtitle}
          </p>
        </div>
      ) : null}
      <button
        type="button"
        className={`text-neutral-900 text-sm font-semibold items-center bg-white shadow-[rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0)_0px_0px_0px_0px,rgba(0,0,0,0.18)_0px_12px_40px_0px] caret-transparent flex justify-center tracking-[0%] leading-5 outline-[3px] border rounded-[3.35544e+07px] border-[oklab(0_0_0_/_0.1)] ${props.buttonVariant}`}
      >
        {props.buttonText}
      </button>
    </div>
  );
};
