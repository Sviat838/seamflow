/** "2.1" -> "clause-2-1": the id each clause row carries on /policy. */
export function clauseAnchorId(clauseId: string): string {
  const slug = clauseId
    .trim()
    .replace(/[^0-9a-zA-Z]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `clause-${slug || "unknown"}`;
}

/** "2.1" -> "/policy#clause-2-1". */
export function clauseHref(clauseId: string): string {
  return `/policy#${clauseAnchorId(clauseId)}`;
}
