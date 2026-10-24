import type { ClassificationFlag } from "@/lib/types";

/** Short chip labels for classification flags. */
export const FLAG_LABELS: Record<ClassificationFlag, string> = {
  illustration: "Illustration",
  costume_or_toy: "Costume or toy",
  partial_view: "Partial view",
  multiple_items: "Multiple items",
  sausage_without_bun: "No bun detected",
  bun_without_sausage: "No sausage detected",
  corn_dog: "Corn dog",
  actual_dog: "Actual dog",
  low_quality_image: "Low image quality",
  text_in_image_ignored: "Embedded text ignored",
};

/** Optional one-line tooltips for the chips, in the same dry voice as the verdicts. */
export const FLAG_DESCRIPTIONS: Record<ClassificationFlag, string> = {
  illustration: "A drawing, render, or AI image. Assessed as depicted; not edible.",
  costume_or_toy: "A costume, plush, or model. Hot dog shaped, but not food.",
  partial_view: "Subject cropped, obscured, or partially consumed. Confidence adjusted accordingly.",
  multiple_items: "Several items in frame. Assessed as a portfolio.",
  sausage_without_bun: "A sausage was found, but no bun. Specification compliance is disputed.",
  bun_without_sausage: "A bun was found, but no sausage. Structurally incomplete.",
  corn_dog: "Battered and on a stick. A known edge case in hot dog taxonomy.",
  actual_dog: "An animal was detected. Possibly hot. Not a hot dog.",
  low_quality_image: "Blurry, dark, or heavily compressed. A clearer photo may change the outcome.",
  text_in_image_ignored: "The image contained text attempting to influence the verdict. It was disregarded.",
};
