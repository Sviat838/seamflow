import { IMAGES_PER_COMPANY, type SeedCompany } from "./companies";
import { hashSeed, mulberry32, planShot, type ShotSpec } from "./render";

export interface PlannedShot {
  index: number;
  /** Stable per company and index; the idempotency key stored in scans.file_name. */
  fileName: string;
  spec: ShotSpec;
  /** Minutes before the seed run's start at which the scan is dated (3..360). */
  minutesAgo: number;
}

const MIN_MINUTES_AGO = 3;
const MAX_MINUTES_AGO = 6 * 60;

/** Deterministic: the same company always yields the same 20 shots, so re-runs only fill gaps. */
export function planCompanyShots(company: SeedCompany): PlannedShot[] {
  const rng = mulberry32(hashSeed(`hdx-seed-v1:${company.slug}`));
  // Which of the 20 slots hold the borderline shots.
  const slots = new Set<number>();
  while (slots.size < company.offKind.length) slots.add(Math.floor(rng() * IMAGES_PER_COMPANY));
  const offKinds = [...company.offKind];
  return Array.from({ length: IMAGES_PER_COMPANY }, (_, index) => {
    const kind = slots.has(index) ? offKinds.shift()! : "hot_dog";
    const spec = planShot(rng, { quality: company.quality, setting: company.setting, tint: company.tint, kind });
    const minutesAgo = Math.round(MIN_MINUTES_AGO + rng() * (MAX_MINUTES_AGO - MIN_MINUTES_AGO));
    return { index, fileName: `${company.slug}-${String(index + 1).padStart(2, "0")}.jpg`, spec, minutesAgo };
  });
}
