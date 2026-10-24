import { Wordmark } from "@/components/brand/wordmark";
import { Button } from "@/components/ui/button";
import { Container } from "@/components/ui/container";
import { VerifyCodeForm } from "@/components/layout/verify-code-form";

export default function CertificateNotFound() {
  return (
    <>
      <header className="border-b border-hairline bg-white">
        <Container className="flex h-14 items-center">
          <Wordmark size="sm" descriptor="none" />
        </Container>
      </header>
      <main id="main" className="bg-ground py-10">
        <Container size="narrow">
          <p className="text-13 font-bold uppercase tracking-wide text-danger">Not found</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold text-navy">We have no certificate with that code.</h1>
          <div className="mt-4 space-y-2 text-body">
            <p>Check the code printed under the QR on your label. It has eight letters and numbers, like 7KQ2-M9XD.</p>
            <p>Codes never contain 0, 1, O, I, L or U, so look again at any character that could be one of those, then type the code below.</p>
            <p>If the code still doesn&apos;t match, the label may not be genuine.</p>
          </div>
          <div className="mt-6">
            <VerifyCodeForm id="verify-retry" />
          </div>
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Button variant="secondary" href="/contact?source=suspicious-label">
              Report a suspicious label
            </Button>
            <Button variant="link" href="/">
              Go to HDX
            </Button>
          </div>
        </Container>
      </main>
    </>
  );
}
