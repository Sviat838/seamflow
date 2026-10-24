// Company names and URL slugs. Pure: shared by the onboarding service, validation and tests.

export const COMPANY_NAME_MIN_LENGTH = 2;
export const COMPANY_NAME_MAX_LENGTH = 80;
/** Matches the companies.slug check constraint. */
export const SLUG_MAX_LENGTH = 60;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
/** Used when a name has nothing slug-able left (emoji, scripts we don't transliterate). */
const FALLBACK_SLUG = "company";

// Letters NFKD can't decompose into ASCII. Cyrillic follows the Ukrainian national
// transliteration (KMU 2010), with the Russian-only letters added.
const ASCII_FOLDS: Record<string, string> = {
  ß: "ss", æ: "ae", œ: "oe", ø: "o", đ: "d", ð: "d", ł: "l", þ: "th", ı: "i", ħ: "h",
  а: "a", б: "b", в: "v", г: "h", ґ: "g", д: "d", е: "e", є: "ie", ж: "zh", з: "z", и: "y",
  і: "i", ї: "i", й: "i", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s",
  т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ь: "", ю: "iu",
  я: "ia", ё: "e", ы: "y", э: "e", ъ: "",
};

/**
 * A company name or job title as stored: NFC, control and zero-width characters removed, whitespace
 * collapsed. The unique index compares lower(btrim(name)), so "Acme  Inc" and "acme inc" collide.
 */
export function normalizeText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .replace(/[\u0000-\u001f\u007f\u200b-\u200d\u2060\ufeff]/g, "")
    .replace(/ {2,}/g, " ")
    .trim();
}

/** "Café Royal & Sons, Inc." -> "cafe-royal-and-sons-inc". Always a valid slug of 2..60 chars. */
export function slugify(name: string): string {
  // Fold on composed text (NFKD would turn "й" into "и" + breve), then strip the remaining accents.
  const folded = Array.from(name.toLowerCase().normalize("NFC"), (ch) => ASCII_FOLDS[ch] ?? ch).join("");
  const slug = trimSlug(
    folded
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/&/g, " and ")
      .replace(/['\u2019]/g, "") // "Joe's" -> "joes", not "joe-s"
      .replace(/[^a-z0-9]+/g, "-"),
    SLUG_MAX_LENGTH,
  );
  return slug.length >= 2 ? slug : FALLBACK_SLUG;
}

function trimSlug(slug: string, maxLength: number): string {
  return slug.slice(0, maxLength).replace(/^-+|-+$/g, "");
}

/** `base` with a numeric suffix, shortened so the result still fits SLUG_MAX_LENGTH. */
export function withSlugSuffix(base: string, suffix: string): string {
  return `${trimSlug(base, SLUG_MAX_LENGTH - suffix.length - 1)}-${suffix}`;
}

/** Slugs to try for a new company, in order: base, base-2, base-3, ... */
export function slugCandidates(base: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => (i === 0 ? base : withSlugSuffix(base, String(i + 1))));
}

export function isCompanySlug(value: unknown): value is string {
  return typeof value === "string" && value.length >= 2 && value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);
}
