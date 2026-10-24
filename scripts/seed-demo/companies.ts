// The ten imagined hot dog businesses behind `npm run seed:demo`. One account = one company.
// `quality` (0..1) is the average canonical-ness of the company's shots; `offKind` lists the
// non-hot-dog shots (borderline cases) mixed into its 20 images.
import type { RegionCode } from "@/lib/types";
import type { Setting, ShotKind } from "./render";

export interface SeedCompany {
  slug: string;
  name: string;
  /** Account display name and job title. */
  contact: { name: string; title: string };
  region: RegionCode;
  setting: Setting;
  tint: "meat" | "plant";
  quality: number;
  offKind: ShotKind[];
}

export const SEED_EMAIL_DOMAIN = "hdx-demo.example";
export const emailFor = (company: SeedCompany) => `qa+${company.slug}@${SEED_EMAIL_DOMAIN}`;
export const IMAGES_PER_COMPANY = 20;

export const SEED_COMPANIES: SeedCompany[] = [
  { slug: "stadium-frank-supply", name: "Stadium Frank Supply Co.", contact: { name: "Dana Kessler", title: "Head of Concessions Quality" }, region: "US-E", setting: "stadium", tint: "meat", quality: 0.97, offKind: [] },
  { slug: "frankfurter-and-sons", name: "Frankfurter & Sons Delicatessen", contact: { name: "Markus Frankfurter", title: "Master Sausage Maker" }, region: "EU-C", setting: "deli", tint: "meat", quality: 0.92, offKind: ["bun_only"] },
  { slug: "metropolitan-arena-concessions", name: "Metropolitan Arena Concessions", contact: { name: "Priya Raman", title: "VP Food Operations" }, region: "US-W", setting: "stadium", tint: "meat", quality: 0.86, offKind: ["burger"] },
  { slug: "nordic-polse-vogn", name: "Nordic Pølse Vogn", contact: { name: "Lars Eriksen", title: "Founder" }, region: "EU-N", setting: "truck", tint: "meat", quality: 0.8, offKind: ["sausage_only"] },
  { slug: "greenleaf-plant-based-franks", name: "GreenLeaf Plant-Based Franks", contact: { name: "Amélie Dubois", title: "Product Development Lead" }, region: "EU-W", setting: "vegan", tint: "plant", quality: 0.74, offKind: ["sausage_roll"] },
  { slug: "streetside-sausage-truck-no-9", name: "Streetside Sausage Truck No. 9", contact: { name: "Tomás Herrera", title: "Owner-Operator" }, region: "US-C", setting: "truck", tint: "meat", quality: 0.66, offKind: ["bun_only", "burger"] },
  { slug: "harbourside-snag-stand", name: "Harbourside Snag Stand", contact: { name: "Jess Whitfield", title: "Operations Manager" }, region: "AP-SE", setting: "cart", tint: "meat", quality: 0.58, offKind: ["sausage_only"] },
  { slug: "sunrise-street-carts-collective", name: "Sunrise Street Carts Collective", contact: { name: "Rafael Souza", title: "Collective Coordinator" }, region: "SA-E", setting: "cart", tint: "meat", quality: 0.46, offKind: ["bun_only", "sausage_roll"] },
  { slug: "quikstop-roller-grill-division", name: "QuikStop Roller Grill Division", contact: { name: "Brent Mackey", title: "Regional Category Manager" }, region: "US-C", setting: "forecourt", tint: "meat", quality: 0.33, offKind: ["sausage_only", "burger", "sausage_roll"] },
  { slug: "pitstop-pups-forecourt-group", name: "Pitstop Pups Forecourt Group", contact: { name: "Naledi Dlamini", title: "Forecourt Catering Lead" }, region: "AF-S", setting: "forecourt", tint: "meat", quality: 0.2, offKind: ["bun_only", "sausage_only", "burger"] },
];
