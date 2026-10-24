"use client";

import Link from "next/link";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { signOut } from "@/app/actions/auth";
import { Button, buttonClasses } from "@/components/ui/button";
import { cx } from "@/components/ui/cx";
import { ArrowRightIcon, CloseIcon, MenuIcon } from "@/components/ui/icons";
import { CLASSIFY_HREF, CONTACT_SALES_HREF, SITE_NAV_LINKS } from "./site-nav-links";
import { VerifyCodeForm } from "./verify-code-form";

const ROW = "flex min-h-12 items-center gap-2 border-b border-hairline px-1 text-17 font-semibold text-navy hover:bg-ground";

/** Phone/tablet menu for SiteHeader: a disclosure panel under the header bar. */
export function SiteMobileMenu({ signedIn, className }: { signedIn: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  // Any link inside closes the menu (same-page anchors don't unmount it).
  function onPanelClick(event: MouseEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("a")) setOpen(false);
  }

  return (
    <div className={className}>
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="site-menu"
        onClick={() => setOpen((v) => !v)}
        className={cx(buttonClasses({ variant: "ghost" }), "min-w-11 px-2.5")}
      >
        {open ? <CloseIcon size={22} /> : <MenuIcon size={22} />}
        <span className="max-sm:sr-only">{open ? "Close" : "Menu"}</span>
      </button>
      <div
        id="site-menu"
        hidden={!open}
        onClick={onPanelClick}
        className="absolute inset-x-0 top-full z-40 max-h-[calc(100dvh-4.5rem)] overflow-y-auto border-b border-hairline bg-white shadow-[0_16px_32px_rgb(11_31_58/0.14)]"
      >
        <div className="mx-auto flex max-w-page flex-col gap-6 px-4 pt-2 pb-6 sm:px-6">
          <nav aria-label="Primary">
            <ul>
              {SITE_NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={ROW}>
                    {"live" in link ? <span aria-hidden="true" className="inline-block size-2 rounded-full bg-status-green" /> : null}
                    {link.label}
                  </Link>
                </li>
              ))}
              <li>
                <Link href={CONTACT_SALES_HREF} className={ROW}>
                  Contact sales
                </Link>
              </li>
              {signedIn ? (
                <li>
                  <Link href="/classify" className={ROW}>
                    Open workspace
                  </Link>
                </li>
              ) : (
                <li>
                  <Link href="/sign-in" className={ROW}>
                    Sign in
                  </Link>
                </li>
              )}
            </ul>
          </nav>
          <VerifyCodeForm id="verify-code-menu" onNavigate={() => setOpen(false)} />
          <div className="flex flex-col gap-3">
            <Button href={CLASSIFY_HREF} size="lg" block iconRight={<ArrowRightIcon size={18} />}>
              Classify an image
            </Button>
            {signedIn ? (
              <form action={signOut}>
                <Button type="submit" variant="secondary" block>
                  Sign out
                </Button>
              </form>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
