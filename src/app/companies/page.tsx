import type { Metadata } from "next";
import { LeaderboardTable } from "@/components/companies/leaderboard-table";
import { ViewerSiteHeader } from "@/components/companies/viewer-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { TrophyIcon } from "@/components/ui/icons";
import { SectionHeading } from "@/components/ui/section-heading";
import { getLeaderboard } from "@/lib/companies";

export const metadata: Metadata = {
  title: "Company leaderboard",
  description: "Companies ranked by the HDX Rating of the hot dogs they classify.",
};

const REGISTER_HREF = "/sign-in?next=/classify";

export default async function CompaniesPage() {
  const entries = await getLeaderboard();
  return (
    <>
      <ViewerSiteHeader />
      <main id="main" className="flex-1">
        <Container as="section" className="py-12 sm:py-16" aria-labelledby="leaderboard-title">
          <SectionHeading
            as="h1"
            size="page"
            eyebrow="Companies"
            title="Company leaderboard"
            titleId="leaderboard-title"
            lead="Every HOT DOG verdict comes with an HDX Rating from 0 to 100. A company's score is the average rating of its hot dogs, adjusted so one lucky photo can't top the table."
          />
          <ul className="mt-6 max-w-3xl list-disc space-y-1 pl-5 text-body">
            <li>Only companies with at least one HOT DOG are ranked.</li>
            <li>The score is weighted towards the overall average until a company has rated more hot dogs.</li>
            <li>Company owners can opt out of the public listing in workspace settings.</li>
          </ul>
          <div className="mt-8">
            {entries.length === 0 ? (
              <div className="rounded-card border border-hairline bg-white">
                <EmptyState
                  icon={<TrophyIcon size={28} />}
                  title="No companies ranked yet"
                  body="Register your company and classify a hot dog to take the first spot."
                  action={<Button href={REGISTER_HREF}>Register your company</Button>}
                />
              </div>
            ) : (
              <>
                <LeaderboardTable entries={entries} />
                <div className="mt-6">
                  <Button variant="secondary" href={REGISTER_HREF}>
                    Register your company
                  </Button>
                </div>
              </>
            )}
          </div>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}
