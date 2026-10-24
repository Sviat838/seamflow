import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { VerifyRecord } from "@/components/verify/verify-record";
import { getPublicCertificate } from "@/lib/certificates/service";

type Props = { params: Promise<{ code: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const cert = await getPublicCertificate(code).catch(() => null);
  if (!cert) return { title: "Certificate not found · HDX", robots: { index: false } };
  const state = cert.status === "revoked" ? "Revoked certificate" : "Verified certificate";
  return {
    title: `${state} ${cert.number} · HDX`,
    description: `${cert.productName ?? "Product"} issued to ${cert.issuedTo}. Verification code ${cert.code}.`,
    robots: { index: false },
  };
}

async function VerifyLoader({ params }: Props) {
  const { code } = await params;
  const cert = await getPublicCertificate(code, { recordVerification: true });
  if (!cert) notFound();
  return <VerifyRecord cert={cert} />;
}

export default function VerifyPage(props: Props) {
  return (
    <Suspense
      fallback={
        <main id="main" className="min-h-screen bg-ground p-6 text-body" aria-busy="true">
          Checking certificate…
        </main>
      }
    >
      <VerifyLoader {...props} />
    </Suspense>
  );
}
