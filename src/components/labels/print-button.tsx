"use client";

import { Button } from "@/components/ui/button";
import { PrinterIcon } from "@/components/ui/icons";

export function PrintButton() {
  return (
    <Button icon={<PrinterIcon size={18} />} onClick={() => window.print()}>
      Print labels
    </Button>
  );
}
