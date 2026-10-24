/** Landing navigation. Anchors point at "/" so they work from every public page. */
export const SITE_NAV_LINKS = [
  { label: "Policy", href: "/#policy" },
  { label: "Use cases", href: "/#use-cases" },
  { label: "Live feed", href: "/#feed", live: true },
  { label: "Certificates", href: "/#certificates" },
  { label: "Plans", href: "/#plans" },
  { label: "Companies", href: "/companies" },
] as const;

export const CLASSIFY_HREF = "/#classify";
export const CONTACT_SALES_HREF = "/contact?source=header";
