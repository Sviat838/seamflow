"use client";

import { type MouseEvent, type ReactNode, useRef } from "react";
import { buttonClasses } from "@/components/ui/button";
import { CloseIcon, MenuIcon } from "@/components/ui/icons";

/**
 * Phone navigation for AppShell: a menu button and a modal <dialog> sliding in from the left.
 * showModal() gives focus trapping, Escape to close and an inert page for free.
 */
export function AppDrawer({ children, label = "Open menu" }: { children: ReactNode; label?: string }) {
  const dialog = useRef<HTMLDialogElement>(null);

  function onDialogClick(event: MouseEvent<HTMLDialogElement>) {
    const target = event.target as HTMLElement;
    // Clicking the backdrop (the dialog element itself) or following a link closes it.
    if (target === dialog.current || target.closest("a")) dialog.current?.close();
  }

  return (
    <>
      <button
        type="button"
        aria-label={label}
        aria-haspopup="dialog"
        onClick={() => dialog.current?.showModal()}
        className={buttonClasses({ variant: "ghost", iconOnly: true })}
      >
        <MenuIcon size={22} />
      </button>
      <dialog
        ref={dialog}
        aria-label="Workspace menu"
        onClick={onDialogClick}
        data-tone="navy"
        className="fixed inset-y-0 right-auto left-0 m-0 h-dvh max-h-none w-[min(20rem,88vw)] max-w-none overflow-y-auto bg-navy p-0 text-on-navy-sub"
      >
        <div className="relative flex min-h-full flex-col gap-5 px-4 py-5">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => dialog.current?.close()}
            className="absolute top-3 right-2 inline-flex size-11 cursor-pointer items-center justify-center rounded-card text-white hover:bg-navy-raised"
          >
            <CloseIcon size={22} />
          </button>
          {children}
        </div>
      </dialog>
    </>
  );
}
