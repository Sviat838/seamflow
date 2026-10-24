// Procedural "product photos" for the demo seed: SVG scenes rendered locally with sharp.
// Every shot is drawn from a seeded plan, so a company's image set is deterministic and each image
// is unique. Quality (0..1) drives how many defects the plan contains: burnt or tiny sausage, torn
// or soggy bun, condiment landslide, blur, darkness, off-centre framing.
import sharp from "sharp";

export type Rng = () => number;
export type Setting = "stadium" | "deli" | "truck" | "forecourt" | "vegan" | "cart";
export type ShotKind = "hot_dog" | "bun_only" | "sausage_only" | "sausage_roll" | "burger";

export interface ShotSpec {
  kind: ShotKind;
  setting: Setting;
  /** Plant-based sausages are drawn a little browner. */
  tint: "meat" | "plant";
  sausage: { length: number; thickness: number; doneness: "pale" | "golden" | "burnt"; seated: boolean };
  bun: { condition: "fresh" | "torn" | "soggy"; tilt: number };
  toppings: { mustard: "none" | "neat" | "sloppy" | "landslide"; ketchup: boolean; relish: boolean; onion: boolean; cheese: boolean };
  photo: { blur: number; brightness: number; offCentre: number; rotate: number; scale: number; clutter: boolean; grain: number };
  /** Seeds the background and grain, so even two "perfect" shots differ. */
  seed: number;
}

export const WIDTH = 1200;
export const HEIGHT = 900;

export function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const f = (n: number) => n.toFixed(1);
const gauss = (rng: Rng) => (rng() + rng() + rng() + rng() - 2) / 0.58; // ~N(0,1)

// ---------------------------------------------------------------------------
// Planning: quality -> concrete defects
// ---------------------------------------------------------------------------

export function planShot(rng: Rng, opts: { quality: number; setting: Setting; tint: "meat" | "plant"; kind: ShotKind }): ShotSpec {
  const q = clamp(opts.quality + gauss(rng) * 0.05, 0.02, 1);
  // Severity is flat (no defects) for the best companies and rises steeply below ~0.9, so the
  // leaderboard shows a clear spread even though the model rates stylised images generously.
  const sev = clamp((1 - q - 0.08) * 1.5, 0, 1);
  const r = () => rng();

  const tiny = r() < sev * 0.6;
  const huge = !tiny && r() < sev * 0.25;
  const doneRoll = r();
  const bunRoll = r();
  const mustardRoll = r();
  const dark = r() < sev * 0.5;
  const offCentre = r() < sev * 0.55;

  return {
    kind: opts.kind,
    setting: opts.setting,
    tint: opts.tint,
    sausage: {
      length: tiny ? between(rng, 0.5, 0.68) : huge ? 1.3 : between(rng, 1.03, 1.1),
      thickness: tiny ? between(rng, 0.55, 0.75) : between(rng, 0.94, 1.04),
      doneness: doneRoll < sev * 0.65 ? "burnt" : doneRoll < sev * 0.65 + sev * 0.2 ? "pale" : "golden",
      seated: r() > sev * 0.6,
    },
    bun: {
      condition: bunRoll < sev * 0.5 ? "torn" : bunRoll < sev ? "soggy" : "fresh",
      tilt: (r() - 0.5) * (2 + 12 * sev),
    },
    toppings: {
      mustard: mustardRoll < sev * 0.55 ? "landslide" : mustardRoll < sev * 0.9 ? "sloppy" : mustardRoll < sev ? "none" : "neat",
      ketchup: r() < 0.3 + 0.3 * sev,
      relish: r() < 0.3,
      onion: r() < 0.3,
      cheese: r() < 0.06 + 0.2 * sev,
    },
    photo: {
      blur: r() < sev * 0.6 ? between(rng, 3, 11) : 0,
      brightness: dark ? between(rng, 0.3, 0.55) : between(rng, 0.97, 1.12),
      offCentre: offCentre ? (r() < 0.5 ? -1 : 1) * between(rng, 330, 520) : (r() - 0.5) * 60,
      rotate: (r() - 0.5) * (3 + 36 * sev),
      scale: sev > 0.5 && r() < 0.5 ? between(rng, 0.85, 1.0) : between(rng, 1.2, 1.4),
      clutter: r() < sev * 0.75,
      grain: dark ? 0.32 : 0.08 + 0.15 * sev,
    },
    seed: Math.floor(rng() * 1e9),
  };
}

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

interface Theme {
  top: [string, string];
  table: [string, string];
  tray: string;
  trayStripe: string;
  bokeh: string[];
}

const THEMES: Record<Setting, Theme> = {
  stadium: { top: ["#2a3d63", "#6c7fa6"], table: ["#8b8f98", "#5f636b"], tray: "#f3ede0", trayStripe: "#b3261e", bokeh: ["#ffffff", "#f2c94c", "#d64545", "#4f7cd6"] },
  deli: { top: ["#6b4a33", "#b78a5c"], table: ["#c9a074", "#8a6238"], tray: "#fbf7ee", trayStripe: "#2f5d3a", bokeh: ["#ffd27a", "#ffffff", "#e8a24a"] },
  truck: { top: ["#1f2a37", "#516173"], table: ["#b9c0c8", "#7d868f"], tray: "#fff4d6", trayStripe: "#c0392b", bokeh: ["#ffb347", "#ffffff", "#ff7a59", "#ffe08a"] },
  forecourt: { top: ["#cfd8e3", "#eef2f6"], table: ["#e2e4e8", "#b9bdc4"], tray: "#ffffff", trayStripe: "#d62828", bokeh: ["#ffffff", "#ffe066", "#f25c54"] },
  vegan: { top: ["#a9c9a0", "#dfeed8"], table: ["#e9dcc3", "#bfa77d"], tray: "#f6f1e4", trayStripe: "#4d8b45", bokeh: ["#7fb069", "#c9e4a1", "#ffffff"] },
  cart: { top: ["#e4572e", "#f7b267"], table: ["#d9c7a3", "#a58a5c"], tray: "#fff8e8", trayStripe: "#1d6fa5", bokeh: ["#ffffff", "#e4572e", "#29a3d6", "#ffd166"] },
};

function wave(x0: number, x1: number, y: number, amp: number, period: number, rng: Rng, jitter = 0): string {
  let d = `M${f(x0)} ${f(y)}`;
  let x = x0;
  let sign = -1;
  while (x < x1 - 1) {
    const step = Math.min((period / 2) * (1 + (rng() - 0.5) * jitter), x1 - x);
    const a = amp * (1 + (rng() - 0.5) * jitter);
    const endY = y + (jitter ? (rng() - 0.5) * jitter * 12 : 0);
    d += ` Q${f(x + step / 2)} ${f(y + sign * a * 2)} ${f(x + step)} ${f(endY)}`;
    x += step;
    sign = -sign;
  }
  return d;
}

function background(spec: ShotSpec, rng: Rng): string {
  const t = THEMES[spec.setting];
  const horizon = 440;
  let bokeh = "";
  for (let i = 0; i < 26; i++) {
    const color = t.bokeh[Math.floor(rng() * t.bokeh.length)];
    bokeh += `<circle cx="${f(rng() * WIDTH)}" cy="${f(rng() * horizon)}" r="${f(18 + rng() * 60)}" fill="${color}" opacity="${f(0.12 + rng() * 0.28)}"/>`;
  }
  let extras = "";
  if (spec.setting === "cart") {
    for (let i = 0; i < 12; i++) {
      extras += `<rect x="${i * 100}" y="0" width="50" height="${horizon - 60}" fill="#ffffff" opacity=".55"/>`;
    }
  } else if (spec.setting === "vegan") {
    for (let i = 0; i < 9; i++) {
      extras += `<ellipse cx="${f(rng() * WIDTH)}" cy="${f(60 + rng() * 300)}" rx="${f(40 + rng() * 60)}" ry="${f(14 + rng() * 24)}" fill="#3f7d3a" opacity=".35" transform="rotate(${f(rng() * 180)} 600 200)"/>`;
    }
  } else if (spec.setting === "forecourt") {
    extras = `<rect x="0" y="0" width="${WIDTH}" height="70" fill="#ffffff" opacity=".8"/><rect x="${f(200 + rng() * 500)}" y="120" width="260" height="90" fill="#d62828" opacity=".45"/>`;
  } else if (spec.setting === "stadium") {
    for (let i = 0; i < 14; i++) {
      extras += `<rect x="${f(i * 90 + rng() * 20)}" y="${f(180 + rng() * 120)}" width="62" height="${f(50 + rng() * 60)}" fill="${i % 2 ? "#c23b3b" : "#e9edf5"}" opacity=".35"/>`;
    }
  }
  return `
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.top[0]}"/><stop offset="1" stop-color="${t.top[1]}"/></linearGradient>
    <linearGradient id="table" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${t.table[0]}"/><stop offset="1" stop-color="${t.table[1]}"/></linearGradient>
    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="14"/></filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>
  <g filter="url(#soft)">${extras}${bokeh}</g>
  <rect y="${horizon}" width="${WIDTH}" height="${HEIGHT - horizon}" fill="url(#table)"/>
  <rect y="${horizon}" width="${WIDTH}" height="10" fill="#000" opacity=".12"/>`;
}

function tray(spec: ShotSpec): string {
  const t = THEMES[spec.setting];
  return `
  <ellipse cx="0" cy="215" rx="470" ry="46" fill="#000" opacity=".22"/>
  <path d="M-440 70 L440 70 L390 210 L-390 210 Z" fill="${t.tray}" stroke="#00000022" stroke-width="3"/>
  <path d="M-428 100 L428 100 L420 124 L-420 124 Z" fill="${t.trayStripe}" opacity=".85"/>`;
}

function sausage(spec: ShotSpec, rng: Rng, bunLength: number, cy: number): { svg: string; top: number; x0: number; x1: number } {
  const { length, thickness, doneness } = spec.sausage;
  const ls = bunLength * length;
  const h = 104 * thickness;
  const x0 = -ls / 2;
  const top = cy - h / 2;
  const plant = spec.tint === "plant";
  const palette = {
    pale: plant ? ["#c99a78", "#a97650", "#bb8963"] : ["#e69a80", "#c7664b", "#d8806a"],
    golden: plant ? ["#b9764f", "#8a4a2c", "#a5603c"] : ["#cf5b3b", "#8e2d1b", "#b4452a"],
    burnt: ["#51271a", "#1d0c07", "#35190f"],
  }[doneness];
  let marks = "";
  const markCount = Math.floor(ls / 46);
  for (let i = 0; i < markCount; i++) {
    const x = x0 + 24 + i * 46 + rng() * 10;
    marks += `<line x1="${f(x)}" y1="${f(top - 6)}" x2="${f(x + 34)}" y2="${f(top + h + 6)}" stroke="#2a0d06" stroke-opacity="${doneness === "burnt" ? 0.55 : 0.25}" stroke-width="${doneness === "burnt" ? 12 : 7}"/>`;
  }
  let char = "";
  if (doneness === "burnt") {
    for (let i = 0; i < 9; i++) {
      char += `<ellipse cx="${f(x0 + rng() * ls)}" cy="${f(top + rng() * h)}" rx="${f(10 + rng() * 26)}" ry="${f(6 + rng() * 14)}" fill="#050202" opacity=".7"/>`;
    }
  }
  const svg = `
  <defs>
    <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${palette[0]}"/><stop offset=".55" stop-color="${palette[1]}"/><stop offset="1" stop-color="${palette[2]}"/></linearGradient>
    <clipPath id="sc"><rect x="${f(x0)}" y="${f(top)}" width="${f(ls)}" height="${f(h)}" rx="${f(h / 2)}"/></clipPath>
  </defs>
  <rect x="${f(x0)}" y="${f(top + 8)}" width="${f(ls)}" height="${f(h)}" rx="${f(h / 2)}" fill="#000" opacity=".25"/>
  <rect x="${f(x0)}" y="${f(top)}" width="${f(ls)}" height="${f(h)}" rx="${f(h / 2)}" fill="url(#sg)"/>
  <g clip-path="url(#sc)">${marks}${char}</g>
  <rect x="${f(x0 + h / 2)}" y="${f(top + 10)}" width="${f(ls - h)}" height="8" rx="4" fill="#fff" opacity="${doneness === "burnt" ? 0.06 : 0.28}"/>`;
  return { svg, top, x0, x1: x0 + ls };
}

function bunColors(condition: ShotSpec["bun"]["condition"]) {
  return condition === "soggy"
    ? { back: ["#b49a72", "#8f7752"], front: ["#c3aa82", "#9c845d"], edge: "#6e5a3e" }
    : { back: ["#e0a95a", "#b27632"], front: ["#f4cd88", "#d49a4e"], edge: "#a8692a" };
}

function toppings(spec: ShotSpec, rng: Rng, s: { top: number; x0: number; x1: number }): { onSausage: string; overflow: string } {
  const { mustard, ketchup, relish, onion, cheese } = spec.toppings;
  const lineY = s.top + 24;
  const a = s.x0 + 36;
  const b = s.x1 - 36;
  let onSausage = "";
  let overflow = "";
  if (cheese) {
    onSausage += `<path d="${wave(a, b, lineY + 6, 12, 90, rng, 0.4)}" stroke="#f0a02c" stroke-width="26" stroke-linecap="round" fill="none" opacity=".92"/>`;
  }
  if (relish) {
    for (let i = 0; i < 46; i++) {
      onSausage += `<circle cx="${f(a + rng() * (b - a))}" cy="${f(lineY - 6 + rng() * 22)}" r="${f(3 + rng() * 3)}" fill="#6aa53d"/>`;
    }
  }
  if (onion) {
    for (let i = 0; i < 40; i++) {
      onSausage += `<rect x="${f(a + rng() * (b - a))}" y="${f(lineY - 10 + rng() * 26)}" width="${f(6 + rng() * 6)}" height="${f(5 + rng() * 5)}" rx="2" fill="#f4ecd8" opacity=".95"/>`;
    }
  }
  if (ketchup) {
    onSausage += `<path d="${wave(a + 10, b - 10, lineY + 14, 8, 64, rng, mustard === "neat" ? 0 : 0.5)}" stroke="#b3121b" stroke-width="10" stroke-linecap="round" fill="none"/>`;
  }
  if (mustard !== "none") {
    const jitter = mustard === "neat" ? 0 : 0.7;
    const width = mustard === "landslide" ? 24 : mustard === "sloppy" ? 15 : 12;
    const d = wave(a, b, lineY, mustard === "neat" ? 9 : 16, mustard === "neat" ? 72 : 54, rng, jitter);
    onSausage += `<path d="${d}" stroke="#f1bd0a" stroke-width="${width}" stroke-linecap="round" fill="none"/><path d="${d}" stroke="#ffe680" stroke-width="3.5" stroke-linecap="round" fill="none" transform="translate(0 -3)" opacity=".8"/>`;
  }
  if (mustard === "landslide") {
    for (let i = 0; i < 12; i++) {
      const x = a + rng() * (b - a);
      const color = rng() < 0.5 ? "#f1bd0a" : "#b3121b";
      overflow += `<ellipse cx="${f(x)}" cy="${f(40 + rng() * 150)}" rx="${f(14 + rng() * 26)}" ry="${f(16 + rng() * 40)}" fill="${color}" opacity=".95"/>`;
    }
    overflow += `<ellipse cx="${f(rng() * 200 - 100)}" cy="190" rx="220" ry="26" fill="#f1bd0a" opacity=".85"/><ellipse cx="${f(rng() * 200 - 100)}" cy="200" rx="160" ry="20" fill="#b3121b" opacity=".85"/>`;
  } else if (mustard === "sloppy") {
    for (let i = 0; i < 5; i++) {
      overflow += `<ellipse cx="${f(a + rng() * (b - a))}" cy="${f(62 + rng() * 60)}" rx="${f(8 + rng() * 14)}" ry="${f(9 + rng() * 18)}" fill="#f1bd0a" opacity=".95"/>`;
    }
  }
  return { onSausage, overflow };
}

function buns(spec: ShotSpec, rng: Rng, lb: number) {
  const c = bunColors(spec.bun.condition);
  const x0 = -lb / 2;
  const defs = `
  <linearGradient id="bb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.back[0]}"/><stop offset="1" stop-color="${c.back[1]}"/></linearGradient>
  <linearGradient id="bf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${c.front[0]}"/><stop offset="1" stop-color="${c.front[1]}"/></linearGradient>`;
  const back = `
  <rect x="${f(x0)}" y="-104" width="${f(lb)}" height="170" rx="82" fill="url(#bb)"/>
  <rect x="${f(x0 + 50)}" y="-96" width="${f(lb - 100)}" height="14" rx="7" fill="#fff" opacity=".16"/>`;

  const frontRect = (clip: string, transform = "") => `
  <g ${clip ? `clip-path="url(#${clip})"` : ""} ${transform ? `transform="${transform}"` : ""}>
    <rect x="${f(x0 + 6)}" y="6" width="${f(lb - 12)}" height="112" rx="58" fill="url(#bf)"/>
    <rect x="${f(x0 + 6)}" y="6" width="${f(lb - 12)}" height="9" fill="${c.edge}" opacity=".55"/>
    <rect x="${f(x0 + 50)}" y="40" width="${f(lb - 100)}" height="10" rx="5" fill="#fff" opacity=".18"/>
  </g>`;
  let front: string;
  let extras = "";
  let clipDefs = "";
  if (spec.bun.condition === "torn") {
    const cut = (rng() - 0.5) * lb * 0.4;
    const zig = (side: number) =>
      Array.from({ length: 9 }, (_, i) => `${f(cut + side * (i % 2 ? 16 : -4) + (rng() - 0.5) * 8)},${f(i * 18 - 10)}`);
    const left = [`${f(x0 - 30)},-10`, ...zig(0), `${f(x0 - 30)},150`].join(" ");
    const right = [`${f(cut + 40)},-10`, ...zig(1).map((p) => p), `${f(lb)},150`, `${f(lb)},-10`].join(" ");
    clipDefs = `<clipPath id="cl"><polygon points="${left}"/></clipPath><clipPath id="cr"><polygon points="${right}"/></clipPath>`;
    front = frontRect("cl", `rotate(${f(-3 - rng() * 3)} ${f(cut)} 60)`) + frontRect("cr", `translate(26 16) rotate(${f(5 + rng() * 5)} ${f(cut)} 60)`);
    for (let i = 0; i < 18; i++) {
      extras += `<circle cx="${f(cut - 70 + rng() * 150)}" cy="${f(100 + rng() * 120)}" r="${f(2 + rng() * 4)}" fill="#e9c68c"/>`;
    }
    extras += `<polyline points="${zig(0).join(" ")}" fill="none" stroke="#fff3d6" stroke-width="5" opacity=".8"/>`;
  } else {
    front = frontRect("");
    if (spec.bun.condition === "soggy") {
      for (let i = 0; i < 7; i++) {
        extras += `<ellipse cx="${f(x0 + 60 + rng() * (lb - 120))}" cy="${f(40 + rng() * 60)}" rx="${f(26 + rng() * 40)}" ry="${f(10 + rng() * 18)}" fill="#5a4630" opacity=".28"/>`;
      }
    }
  }
  return { defs: defs + clipDefs, back, front, extras };
}

function hotDog(spec: ShotSpec, rng: Rng): string {
  const lb = 720;
  const sy = spec.sausage.seated ? -22 : -96;
  const b = buns(spec, rng, lb);
  const s = sausage(spec, rng, lb, sy);
  const t = toppings(spec, rng, s);
  return `<defs>${b.defs}</defs>${tray(spec)}
  <g transform="rotate(${f(spec.bun.tilt)})">${b.back}${s.svg}${t.onSausage}${b.front}${b.extras}${t.overflow}</g>`;
}

function bunOnly(spec: ShotSpec, rng: Rng): string {
  const lb = 700;
  const b = buns(spec, rng, lb);
  const mustard = spec.toppings.mustard !== "none" ? `<path d="${wave(-250, 250, -20, 10, 70, rng, 0.3)}" stroke="#f1bd0a" stroke-width="12" stroke-linecap="round" fill="none"/>` : "";
  return `<defs>${b.defs}</defs>${tray(spec)}<g>${b.back}<rect x="${-lb / 2 + 20}" y="-30" width="${lb - 40}" height="60" rx="30" fill="#8a5a24" opacity=".55"/>${mustard}${b.front}</g>`;
}

function sausageOnly(spec: ShotSpec, rng: Rng): string {
  const s = sausage(spec, rng, 700, 0);
  const t = toppings({ ...spec, toppings: { ...spec.toppings, cheese: false } }, rng, s);
  return `<ellipse cx="0" cy="40" rx="470" ry="150" fill="#fdfdfb" stroke="#00000022" stroke-width="4"/><ellipse cx="0" cy="40" rx="390" ry="110" fill="none" stroke="#d9d9d4" stroke-width="3"/>
  <g transform="translate(0 40)">${s.svg}${t.onSausage}</g>
  <g transform="translate(330 -20) rotate(24)"><rect x="-8" y="-20" width="16" height="160" rx="6" fill="#c9ced6"/><rect x="-30" y="-70" width="60" height="60" rx="10" fill="#c9ced6"/></g>`;
}

function sausageRoll(spec: ShotSpec, rng: Rng): string {
  let flakes = "";
  for (let i = 0; i < 9; i++) {
    flakes += `<line x1="${-260 + i * 64}" y1="-70" x2="${-230 + i * 64}" y2="60" stroke="#8a5a1c" stroke-width="7" opacity=".55"/>`;
  }
  for (let i = 0; i < 26; i++) {
    flakes += `<ellipse cx="${f(-300 + rng() * 600)}" cy="${f(-60 + rng() * 110)}" rx="6" ry="3" fill="#fff6dc" opacity=".8"/>`;
  }
  return `${tray(spec)}<defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e8b862"/><stop offset="1" stop-color="#b9792e"/></linearGradient></defs>
  <rect x="-330" y="-90" width="660" height="170" rx="70" fill="url(#pg)"/><g>${flakes}</g>`;
}

function burger(spec: ShotSpec, rng: Rng): string {
  let seeds = "";
  for (let i = 0; i < 28; i++) {
    seeds += `<ellipse cx="${f(-190 + rng() * 380)}" cy="${f(-150 + rng() * 60)}" rx="7" ry="4" fill="#fbeed1"/>`;
  }
  return `${tray(spec)}
  <rect x="-260" y="40" width="520" height="60" rx="30" fill="#c98a3d"/>
  <rect x="-270" y="14" width="540" height="40" rx="18" fill="#5b2a17"/>
  <path d="${wave(-280, 280, 6, 10, 60, rng, 0.2)}" stroke="#5aa832" stroke-width="22" fill="none" stroke-linecap="round"/>
  <path d="M-270 -4 L270 -4 L240 30 L-240 30 Z" fill="#f2b632"/>
  <path d="M-270 -4 A270 150 0 0 1 270 -4 Z" fill="#e0a350"/>${seeds}`;
}

function clutter(rng: Rng): string {
  let fries = "";
  for (let i = 0; i < 16; i++) {
    fries += `<rect x="${f(-60 + rng() * 120)}" y="${f(-20 + rng() * 40)}" width="14" height="${f(90 + rng() * 40)}" rx="4" fill="#f2c94c" transform="rotate(${f(-35 + rng() * 70)})"/>`;
  }
  return `<g transform="translate(-560 150)"><path d="M-70 -10 L70 -10 L54 150 L-54 150 Z" fill="#d62828"/>${fries}</g>
  <g transform="translate(560 160)"><rect x="-48" y="-110" width="96" height="190" rx="12" fill="#fff" stroke="#d62828" stroke-width="10"/><ellipse cx="0" cy="-112" rx="54" ry="14" fill="#fdfdfd"/></g>`;
}

export function sceneSvg(spec: ShotSpec): string {
  const rng = mulberry32(spec.seed);
  const body =
    spec.kind === "bun_only" ? bunOnly(spec, rng)
    : spec.kind === "sausage_only" ? sausageOnly(spec, rng)
    : spec.kind === "sausage_roll" ? sausageRoll(spec, rng)
    : spec.kind === "burger" ? burger(spec, rng)
    : hotDog(spec, rng);
  const { offCentre, rotate, scale, clutter: withClutter, grain } = spec.photo;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  ${background(spec, rng)}
  <g transform="translate(${f(WIDTH / 2 + offCentre)} 450) rotate(${f(rotate)}) scale(${f(scale)})">
    ${withClutter ? clutter(rng) : ""}${body}
  </g>
  <defs>
    <radialGradient id="vg" cx=".5" cy=".5" r=".75"><stop offset=".55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".5"/></radialGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" seed="${spec.seed % 1000}"/><feColorMatrix type="saturate" values="0"/></filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#vg)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" filter="url(#grain)" opacity="${f(grain)}"/>
</svg>`;
}

/** Renders a planned shot to a JPEG (the app accepts jpeg/png/webp/gif up to 5 MB). */
export async function renderShot(spec: ShotSpec): Promise<Buffer> {
  let image = sharp(Buffer.from(sceneSvg(spec)));
  if (spec.photo.blur > 0.3) image = image.blur(spec.photo.blur);
  image = image.modulate({ brightness: spec.photo.brightness });
  return image.jpeg({ quality: 86 }).toBuffer();
}
