"use client";

import { useState, useTransition } from "react";
import { updateCertificateProductAction } from "@/app/actions/certificates";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";

/** Product name + SKU printed on the certificate and labels. */
export function ProductForm({
  scanId,
  productName,
  sku,
}: {
  scanId: string;
  productName: string | null;
  sku: string | null;
}) {
  const [name, setName] = useState(productName ?? "");
  const [code, setCode] = useState(sku ?? "");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await updateCertificateProductAction(scanId, {
        productName: name.trim() || null,
        sku: code.trim() || null,
      });
      if (result.ok) setMessage("Saved.");
      else setError(result.error.message);
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="product-name" optional>
          Product name
        </Label>
        <Input id="product-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="product-sku" optional>
          SKU
        </Label>
        <Input id="product-sku" value={code} maxLength={40} onChange={(e) => setCode(e.target.value)} />
      </div>
      <div aria-live="polite">
        <FieldError id="product-error">{error}</FieldError>
        {message ? <p className="text-15 font-semibold text-status-green">{message}</p> : null}
      </div>
      <Button type="submit" variant="secondary" block pending={pending}>
        Save product details
      </Button>
    </form>
  );
}
