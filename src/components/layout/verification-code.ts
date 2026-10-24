/** Certificate codes use a Crockford-style alphabet (no 0/O, 1/I/L or U), see the certificates migration. */
export const VERIFICATION_CODE_PATTERN = /^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/;

/**
 * "7kq2 m9xd", "7KQ2M9XD" or a pasted ".../v/7KQ2-M9XD" link -> "7KQ2-M9XD"; null when it
 * can't be a code.
 */
export function normalizeVerificationCode(input: string): string | null {
  let raw = input.trim();
  const fromUrl = raw.match(/\/v\/([^/?#\s]+)/i);
  if (fromUrl) raw = fromUrl[1];
  const compact = raw.toUpperCase().replace(/[\s-]/g, "");
  if (compact.length !== 8) return null;
  const code = `${compact.slice(0, 4)}-${compact.slice(4)}`;
  return VERIFICATION_CODE_PATTERN.test(code) ? code : null;
}
