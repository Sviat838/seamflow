// Renders a contact sheet of the planned shots without touching the network or the database:
// `npm run seed:demo -- --preview <dir>`.
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { IMAGES_PER_COMPANY, SEED_COMPANIES } from "./companies";
import { planCompanyShots } from "./plan";
import { renderShot } from "./render";

export async function writePreview(dir: string, perCompany = 6): Promise<void> {
  mkdirSync(dir, { recursive: true });
  const cell = { w: 300, h: 225 };
  const tiles: OverlayOptions[] = [];
  for (const [row, company] of SEED_COMPANIES.entries()) {
    const shots = planCompanyShots(company).slice(0, Math.min(perCompany, IMAGES_PER_COMPANY));
    for (const [col, shot] of shots.entries()) {
      const jpeg = await renderShot(shot.spec);
      tiles.push({ input: await sharp(jpeg).resize(cell.w, cell.h).toBuffer(), left: col * cell.w, top: row * cell.h });
    }
  }
  const file = join(dir, "contact-sheet.jpg");
  await sharp({ create: { width: cell.w * perCompany, height: cell.h * SEED_COMPANIES.length, channels: 3, background: "#222" } })
    .composite(tiles)
    .jpeg({ quality: 80 })
    .toFile(file);
  console.log(`Wrote ${file} (${perCompany} shots x ${SEED_COMPANIES.length} companies, rows in company order)`);
}
