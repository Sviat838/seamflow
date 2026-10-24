import { Suspense } from "react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { usageSummary } from "@/components/ui/format";
import { KeyValueList } from "@/components/ui/table";
import { ListingToggle } from "@/components/workspace/listing-toggle";
import { PageLoading } from "@/components/workspace/page-loading";
import { requireViewer } from "@/lib/auth/viewer";
import { getUsage } from "@/lib/usage";

export const metadata: Metadata = { title: "Settings" };

async function SettingsContent() {
  const ctx = await requireViewer({ company: true, next: "/settings" });
  const usage = await getUsage(ctx);
  const company = ctx.viewer.company!;
  return (
    <div className="mt-6 grid max-w-3xl gap-6">
      <Card aria-labelledby="company-title">
        <CardHeader title="Company" titleId="company-title" />
        <KeyValueList
          rows={[
            { label: "Name", value: company.name },
            { label: "Your role", value: company.role === "owner" ? "Owner" : "Member" },
            { label: "Signed in as", value: ctx.viewer.email ?? "—" },
          ]}
        />
      </Card>

      <Card aria-labelledby="plan-title">
        <CardHeader title="Plan and usage" titleId="plan-title" />
        <CardBody className="space-y-4">
          <p className="text-17 font-semibold text-navy">{company.plan === "business" ? "Business" : "Free"}</p>
          <p>{usageSummary(usage)}</p>
          {company.plan !== "business" ? (
            <Button href="/contact?source=settings">Contact us about Business</Button>
          ) : (
            <Button variant="secondary" href="/contact?source=settings">
              Contact us
            </Button>
          )}
        </CardBody>
      </Card>

      <Card aria-labelledby="listing-title">
        <CardHeader title="Public leaderboard" titleId="listing-title" />
        <CardBody className="space-y-4">
          <ListingToggle initial={company.isListed} canEdit={company.role === "owner"} />
          {company.isListed ? (
            <Button variant="link" href={`/companies/${company.slug}`}>
              View your company page
            </Button>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader title="Settings" meta="Your company, plan and public listing." />
      <Suspense fallback={<PageLoading label="Loading settings" />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
