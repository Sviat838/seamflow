/** Suspense fallback for workspace pages. */
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="px-4 py-10 text-secondary sm:px-6">
      {label}…
    </div>
  );
}
