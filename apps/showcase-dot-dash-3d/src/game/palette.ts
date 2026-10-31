// Glint Courier — per-board palette and perimeter layout. Pure (no engine imports) so it is unit-tested.
// Board 1 (Relay Grid) keeps the authored look the audit judged correct. Every other board takes its own hue from
// mazes.ts but keeps board 1's brightness, so later boards change colour without going darker.

import type { MazeDef } from "./grid.js";
import { mulberry32 } from "./grid.js";

const rgbCache = new Map<string, readonly [number, number, number]>();

/** "#rrggbb" -> linear-in-sRGB-space [0..1] triple, cached per string (the instanced pools ask for it ~900 times a frame). */
export function hexToRgb(hex: string): readonly [number, number, number] {
  let c = rgbCache.get(hex);
  if (!c) {
    const v = parseInt(hex.slice(1), 16);
    c = [((v >> 16) & 255) / 255, ((v >> 8) & 255) / 255, (v & 255) / 255];
    rgbCache.set(hex, c);
  }
  return c;
}

const toHex = (r: number, g: number, b: number): string => {
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
};

/** Rec. 709 luma of an sRGB hex colour, 0..255. */
export function luma(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 255 * (0.2126 * r + 0.7152 * g + 0.0722 * b);
}

/** `hex` scaled (hue and saturation kept) so its luma is `target`; channels clip at 255. */
export function withLuma(hex: string, target: number): string {
  const l = luma(hex);
  const [r, g, b] = hexToRgb(hex);
  if (l < 1e-3) return toHex(target, target, target);
  const k = target / l;
  return toHex(r * 255 * k, g * 255 * k, b * 255 * k);
}

/** Board 1's authored values (world.ts before the per-board palette). */
export const REFERENCE_LOOK = {
  slab: "#24443a",
  slabEmissive: "#17342c",
  wallEmissive: "#3a2210",
  wall: "#5c4630",
  background: "#0e1a17"
} as const;

export interface BoardLook {
  readonly slab: string;
  readonly slabEmissive: string;
  readonly wallEmissive: string;
  /** Wall and dressing instance colour. */
  readonly wall: string;
  readonly background: string;
}

export function boardLook(def: MazeDef): BoardLook {
  if (def.id === "classic") return { ...REFERENCE_LOOK, wall: def.palette.wall };
  return {
    slab: withLuma(def.palette.floor, luma(REFERENCE_LOOK.slab)),
    slabEmissive: withLuma(def.palette.floor, luma(REFERENCE_LOOK.slabEmissive)),
    wallEmissive: withLuma(def.palette.edge, luma(REFERENCE_LOOK.wallEmissive)),
    wall: withLuma(def.palette.wall, luma(REFERENCE_LOOK.wall)),
    background: withLuma(def.background, luma(REFERENCE_LOOK.background))
  };
}

export interface Pylon { readonly x: number; readonly z: number; readonly h: number; readonly w: number; readonly cap: boolean }

// Phase 3 (4.7.1): every theme's stubs are low (<= 1.4 tall); the tall grid, foundry and reactor stubs threw long
// black blobs across the bench margin and read as floating debris (rubric: shadows, composition).
const THEME_PYLONS: Record<MazeDef["theme"], { count: number; hMin: number; hRange: number; w: number }> = {
  grid: { count: 18, hMin: 0.35, hRange: 0.85, w: 0.55 },
  spiral: { count: 18, hMin: 0.3, hRange: 0.7, w: 0.45 },
  towers: { count: 16, hMin: 0.35, hRange: 0.8, w: 0.5 },
  garden: { count: 24, hMin: 0.35, hRange: 0.9, w: 0.45 },
  foundry: { count: 16, hMin: 0.4, hRange: 0.8, w: 0.7 },
  reactor: { count: 18, hMin: 0.4, hRange: 1.0, w: 0.4 }
};

function hashId(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Pylon stubs along both sides of the board. Board 1 keeps its original layout; the others are seeded from the board
 * id (so each board has its own skyline) with count, height and width from the board theme.
 */
export function pylonLayout(id: string, theme: MazeDef["theme"]): readonly Pylon[] {
  const out: Pylon[] = [];
  if (id === "classic") {
    for (let c = 0; c < 18; c++) {
      const r1 = Math.abs(Math.sin(c * 37.3 + 19)) % 1;
      const r2 = Math.abs(Math.sin(c * 91.7 + 21)) % 1;
      const side = c % 2 === 0 ? -1 : 1;
      out.push({ x: side * (12.6 + r1 * 3.5), z: -9.5 + r2 * 19, h: 0.35 + r1 * 0.85, w: 0.55, cap: r2 < 0.65 });
    }
    return out;
  }
  const t = THEME_PYLONS[theme];
  const rng = mulberry32(hashId(id));
  for (let c = 0; c < t.count; c++) {
    const r1 = rng(), r2 = rng(), r3 = rng();
    const side = c % 2 === 0 ? -1 : 1;
    out.push({ x: side * (12.6 + r1 * 3.5), z: -9.5 + r2 * 19, h: t.hMin + r3 * t.hRange, w: t.w, cap: r2 < 0.65 });
  }
  return out;
}
