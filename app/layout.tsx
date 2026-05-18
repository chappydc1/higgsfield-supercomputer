import type { Metadata } from "next";
import "./globals.css";
import { DesktopHeader } from "@/sections/DesktopHeader";
import { Footer } from "@/sections/Footer";
import { MobileBottomNav } from "@/sections/MobileBottomNav";

export const metadata: Metadata = {
  title: "Super Computer | Higgsfield",
  description:
    "Describe what you want. Higgsfield Supercomputer plans it, picks the models, and renders it. A full AI creative team in one chat. No prompts, no presets, no tool-hopping.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
      </head>
      <body className="text-neutral-100 text-base not-italic normal-nums font-normal accent-auto bg-[#131517] box-border caret-transparent grid [grid-template-areas:'header-promotion''header''main''footer''header-mobile'] grid-cols-[1fr] grid-rows-[auto_auto_1fr_auto_auto] h-full tracking-[normal] leading-6 list-outside list-disc outline-[3px] overscroll-x-none overscroll-y-none pointer-events-auto text-start indent-[0px] normal-case visible w-full overflow-hidden border-separate font-sans">
        <div className="box-border caret-transparent hidden outline-[3px]"></div>
        <header className="sticky text-cyan-200 text-sm bg-white box-border caret-transparent hidden col-end-[header-promotion] col-start-[header-promotion] row-end-[header-promotion] row-start-[header-promotion] h-12 leading-5 max-h-[68px] max-w-full outline-[3px] w-full z-[60] overflow-hidden top-0 md:static md:bg-rose-600 md:h-0 md:max-h-none md:max-w-none md:w-auto md:z-[3] md:top-auto"></header>
        <DesktopHeader />
        {children}
        <Footer />
        <MobileBottomNav />
        <section
          aria-label="Notifications Alt+T"
          className="box-border caret-transparent min-h-[auto] min-w-[auto] outline-[3px]"
        ></section>
        <div className="fixed box-border caret-transparent gap-x-2 flex flex-col outline-[3px] pointer-events-none gap-y-2 w-full z-[9999] px-4 left-4 top-4 md:w-auto md:px-0 md:left-6 md:top-6"></div>
        <div className="fixed box-border caret-transparent gap-x-2 flex flex-col outline-[3px] pointer-events-none gap-y-2 w-full z-[9999] px-4 left-2/4 top-4 md:w-auto md:px-0 md:top-6"></div>
        <div className="fixed box-border caret-transparent gap-x-2 flex flex-col outline-[3px] pointer-events-none gap-y-2 w-full z-[9999] px-4 right-4 top-4 md:w-auto md:px-0 md:right-6 md:top-6"></div>
        <div className="fixed box-border caret-transparent gap-x-2 flex flex-col outline-[3px] pointer-events-none gap-y-2 w-full z-[9999] px-4 left-4 bottom-4 md:w-auto md:px-0 md:left-6 md:bottom-6"></div>
        <div className="fixed box-border caret-transparent gap-x-2 flex flex-col outline-[3px] pointer-events-none gap-y-2 w-full z-[9999] px-4 left-2/4 bottom-4 md:w-auto md:px-0 md:bottom-6"></div>
        <div className="fixed box-border caret-transparent gap-x-2 flex flex-col outline-[3px] pointer-events-none gap-y-2 w-full z-[9999] px-4 right-4 bottom-4 md:w-auto md:px-0 md:right-6 md:bottom-6"></div>
        <div className="box-border caret-transparent min-h-[auto] min-w-[auto] outline-[3px]"></div>
        <div className="box-border caret-transparent hidden outline-[3px] md:contents">
          <div className="fixed box-border caret-transparent outline-[3px] pointer-events-none z-[9999] right-4 top-4 md:right-6 md:top-6"></div>
        </div>
        <div className="absolute box-border caret-transparent block outline-[3px]"></div>
        <div className="box-border caret-transparent min-h-[auto] min-w-[auto] outline-[3px]"></div>
      </body>
    </html>
  );
}
