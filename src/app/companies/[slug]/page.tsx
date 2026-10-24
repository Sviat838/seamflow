import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ViewerSiteHeader } from "@/components/companies/viewer-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { EmptyState } from "@/components/ui/empty-state";
import { formatCount, formatDate, formatPercent } from "@/components/ui/format";
import { Stat, StatList } from "@/components/ui/stat";
import { Table, TBody, Td, Th, THead, Tr } from "@/components/ui/table";
import { RatingBadge } from "@/components/verdict/rating-badge";
import { getCompanyProfile } from "@/lib/companies";

type Params = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { slug } = await params;
  const profile = await getCompanyProfile(slug);
  return profile
    ? { title: `${profile.name} · Companies`, description: `${profile.name} on the HDX company leaderboard.` }
    : { title: "Company not found" };
}

export default function CompanyPage({ params }: { params: Params }) {
  return (
    <>
      <ViewerSiteHeader />
      <main id="main" className="flex-1">
        <Container className="py-12 sm:py-16">
          <Suspense fallback={<p className="text-secondary">Loading company</p>}>
            <CompanyProfileView params={params} />
          </Suspense>
        </Container>
      </main>
      <SiteFooter />
    </>
  );
}

async function CompanyProfileView({ params }: { params: Params }) {
  const { slug } = await params;
  const profile = await getCompanyProfile(slug);
  if (!profile) notFound();
  const { entry, products } = profile;

  return (
    <>
      <nav aria-label="Breadcrumb" className="text-sm">
        <Link href="/companies" className="inline-flex min-h-11 items-center text-navy underline underline-offset-2">
          Company leaderboard
        </Link>
      </nav>
      <div className="mt-2 flex flex-wrap items-center gap-4">
        <h1 className="font-serif text-3xl font-semibold text-navy sm:text-4xl">{profile.name}</h1>
        {entry ? <RatingBadge rating={entry.score} size="lg" /> : null}
      </div>
      <p className="mt-2 text-secondary">
        {entry ? `Ranked #${entry.rank}` : "Not ranked yet: no HOT DOG classified"} · On HDX since{" "}
        {formatDate(profile.memberSince)}
      </p>

      {entry ? (
        <StatList columns={4} className="mt-8">
          <Stat label="Rated hot dogs" value={formatCount(entry.ratedHotDogs)} rule="top" />
          <Stat label="Certified products" value={formatCount(entry.certifiedHotDogs)} rule="top" />
          <Stat label="Total classifications" value={formatCount(entry.totalScans)} rule="top" />
          <Stat label="Hot-dog share" value={formatPercent(entry.hotDogShare)} rule="top" />
        </StatList>
      ) : null}

      <Card className="mt-10" aria-labelledby="products-title">
        <CardHeader title="Certified products" titleId="products-title" meta="Each links to its public verification record" />
        {products.length === 0 ? (
          <EmptyState as="h3" title="No certified products yet" body="Certificates issued to this company appear here." />
        ) : (
          <Table caption={`Certified products of ${profile.name}`} captionHidden>
            <THead>
              <Tr>
                <Th>Product</Th>
                <Th>Certificate</Th>
                <Th>Rating</Th>
                <Th>Issued</Th>
              </Tr>
            </THead>
            <TBody>
              {products.map((product) => (
                <Tr key={product.code}>
                  <Td strong>
                    <Link
                      href={`/v/${product.code}`}
                      className="inline-flex min-h-11 items-center text-navy underline underline-offset-2 hover:text-navy-hover"
                    >
                      {product.productName ?? "Unnamed product"}
                    </Link>
                    {product.sku ? <span className="ml-2 text-sm text-secondary">SKU {product.sku}</span> : null}
                  </Td>
                  <Td mono>{product.certificateNumber}</Td>
                  <Td>
                    <RatingBadge rating={product.rating} size="sm" />
                  </Td>
                  <Td numeric>{formatDate(product.issuedAt)}</Td>
                </Tr>
              ))}
            </TBody>
          </Table>
        )}
      </Card>
      <div className="mt-8">
        <Button variant="secondary" href="/companies">
          Back to the leaderboard
        </Button>
      </div>
    </>
  );
}
