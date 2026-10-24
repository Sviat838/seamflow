import { describe, expect, it } from "vitest";
import type { ViewerCompany } from "@/lib/types";
import { activeNavKey, BUSINESS_CONTACT_HREF, viewerRoleLine, workspaceNavItems } from "./workspace-nav-model";

const company: ViewerCompany = {
  id: "c1",
  name: "Ballpark Holdings",
  slug: "ballpark-holdings",
  plan: "free",
  role: "owner",
  isListed: true,
};

describe("workspaceNavItems", () => {
  it("gives signed-in viewers every page", () => {
    const items = workspaceNavItems({ isAuthenticated: true });
    expect(items.map((i) => i.label)).toEqual([
      "Classify",
      "History",
      "Certificates",
      "Audit log",
      "Settings",
      "Batch jobs",
      "API keys",
    ]);
    expect(items.slice(0, 5).every((i) => i.lock === null)).toBe(true);
    expect(items.find((i) => i.key === "certificates")?.href).toBe("/certificates");
  });

  it("locks company pages behind sign-in for visitors", () => {
    const items = workspaceNavItems({ isAuthenticated: false });
    expect(items.find((i) => i.key === "classify")).toMatchObject({ href: "/classify", lock: null });
    expect(items.find((i) => i.key === "cases")).toMatchObject({ href: "/cases", lock: null });
    expect(items.find((i) => i.key === "audit")).toMatchObject({ href: "/sign-in?next=%2Faudit", lock: "sign-in" });
  });

  it("always routes Business features to sales", () => {
    for (const authed of [true, false]) {
      const business = workspaceNavItems({ isAuthenticated: authed }).filter((i) => i.lock === "business");
      expect(business.map((i) => i.href)).toEqual([BUSINESS_CONTACT_HREF, BUSINESS_CONTACT_HREF]);
    }
  });
});

describe("activeNavKey", () => {
  it("maps paths to nav items", () => {
    expect(activeNavKey("/classify")).toBe("classify");
    expect(activeNavKey("/cases")).toBe("cases");
    expect(activeNavKey("/cases/HDX-2026-1024-7731")).toBe("cases");
    expect(activeNavKey("/labels/HDX-2026-1024-7731")).toBe("certificates");
    expect(activeNavKey("/audit")).toBe("audit");
    expect(activeNavKey("/settings")).toBe("settings");
    expect(activeNavKey("/")).toBeNull();
    expect(activeNavKey("/companies")).toBeNull();
    expect(activeNavKey(null)).toBeNull();
  });
});

describe("viewerRoleLine", () => {
  it("combines job title and role", () => {
    expect(viewerRoleLine({ jobTitle: "Quality Lead", company, needsOnboarding: false })).toBe("Quality Lead · Owner");
    expect(viewerRoleLine({ jobTitle: null, company: { ...company, role: "member" }, needsOnboarding: false })).toBe("Member");
  });

  it("explains a missing company", () => {
    expect(viewerRoleLine({ jobTitle: null, company: null, needsOnboarding: true })).toBe("Company not set up");
    expect(viewerRoleLine({ jobTitle: null, company: null, needsOnboarding: false })).toBe("");
  });
});
