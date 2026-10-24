import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { UploadCard } from "@/components/upload";

export const metadata: Metadata = { title: "Classify" };
// Classification can take a while on a cold model.
export const maxDuration = 60;

export default function ClassifyPage() {
  return (
    <div className="px-4 py-6 sm:px-6 lg:py-8">
      <PageHeader title="Classify an image" meta="One question. Two possible answers. A certificate for every HOT DOG." />
      <div className="mt-6 max-w-3xl">
        <UploadCard variant="workspace" />
      </div>
    </div>
  );
}
