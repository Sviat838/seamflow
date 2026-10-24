type SiteEnv = Record<string, string | undefined>;

/**
 * Canonical origin for metadata (metadataBase, Open Graph). Vercel sets these at build time
 * without a protocol. For URLs printed on certificates or labels use the request origin instead.
 */
export function siteUrl(env: SiteEnv = process.env): URL {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  if (!host) return new URL("http://localhost:3000");
  return new URL(/^https?:\/\//.test(host) ? host : `https://${host}`);
}
