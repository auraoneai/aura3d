/**
 * Chapter 0 physical world of the original, as data and formulas read from the captured bundle: the canal trench along
 * `x = 82 + sin(z * 0.006) * 8`, the flat 0.6 plain with a gentle rise outside it, the cistern bridge arch, cliff terraces,
 * ramps, rooftop platforms and the deep-chapter bridges (original `Tt`, `Mo`, `_i`, `km`, `Bm`, `Um`, `rv`, `sv`, `T0`, `w0`),
 * plus the 1400 measured colliders. A platform only counts as floor when the rider is within 2.5 m above its deck.
 */
import { CHAPTER0_COLLIDERS } from "./colliders-ch0";
import type { Collider } from "./collide";
import type { World } from "./sim";

export const canalCentre = (z: number): number => 82 + Math.sin(z * 0.006) * 8;

const inVillage = (x: number, z: number): boolean => x > -70 && x < 225 && z > -365 && z < 115;
const trench = (x: number, z: number): number => {
  const t = Math.abs(x - canalCentre(z));
  return t < 25 ? -3 + 3.6 * (t / 25) ** 8 : 0.6;
};

/** Terrain height under (x, z) (original `y` for chapters 0 and 6). */
export function ground0(x: number, z: number): number {
  if (inVillage(x, z)) return trench(x, z);
  if (Math.abs(x - canalCentre(z)) < 30) return trench(x, z);
  return Math.abs(x) < 90 ? 0.15 + Math.sin(z * 0.035) * 0.07 : 0.4 + Math.max(0, Math.abs(x) - 90) * 0.06 + Math.sin(x * 0.023) ** 2 * Math.cos(z * 0.016) ** 2 * 5;
}

/** The cistern bridge: an arch over the canal at z = -180 (original `_i`). */
export const bridgeArch = (x: number, z: number): number | null => (x < 37 || x > 132 || Math.abs(z + 180) > 10 ? null : 0.6 + 3.6 * Math.sin((Math.PI * (x - 37)) / 95));

interface Box { x: number; z: number; y: number; w: number; d: number }
export const TERRACES: readonly Box[] = [
  { x: 247, z: 45, y: 21, w: 70, d: 130 }, { x: 249, z: -122, y: 27, w: 76, d: 160 }, { x: 251, z: -307, y: 18, w: 75, d: 135 },
  { x: -110, z: 10, y: 14, w: 84, d: 140 }, { x: -110, z: -150, y: 20, w: 90, d: 135 }, { x: -111, z: -320, y: 15, w: 85, d: 130 },
  { x: 343, z: -90, y: 59, w: 100, d: 340 }, { x: -226, z: -155, y: 47, w: 124, d: 390 }, { x: 91, z: -485, y: 14, w: 74, d: 105 },
  { x: -96, z: -566, y: 21, w: 73, d: 105 }, { x: 113, z: -714, y: 27, w: 78, d: 114 }, { x: -123, z: -856, y: 31, w: 81, d: 135 },
  { x: 137, z: -1000, y: 35, w: 85, d: 125 }
];
export const PADS: readonly Box[] = [{ x: 110, z: -36, y: 0.6, w: 16, d: 32 }, { x: 109, z: -102, y: 0.6, w: 16, d: 30 }];
interface Ramp { a: { x: number; z: number }; b: { x: number; z: number }; y: number; w: number }
export const RAMPS: readonly Ramp[] = [
  { a: { x: -40, z: 45 }, b: { x: -77, z: 45 }, y: 14, w: 8 }, { a: { x: -40, z: -115 }, b: { x: -76, z: -115 }, y: 20, w: 8 },
  { a: { x: 195, z: 90 }, b: { x: 225, z: 90 }, y: 21, w: 8 }, { a: { x: 193, z: -165 }, b: { x: 225, z: -165 }, y: 27, w: 8 }
];

const ramp = (x: number, z: number, y: number): number => {
  let best = -Infinity;
  for (const r of RAMPS) {
    const sx = r.b.x - r.a.x, sz = r.b.z - r.a.z, len = Math.hypot(sx, sz);
    const l = ((x - r.a.x) * sx + (z - r.a.z) * sz) / (len * len);
    const c = Math.abs((x - r.a.x) * sz - (z - r.a.z) * sx) / len;
    if (l >= 0 && l <= 1 && c <= r.w / 2) {
      const h = 0.6 + (r.y - 0.6) * Math.ceil(l * 48) / 48;
      if (y >= h - 2.5) best = Math.max(best, h);
    }
  }
  return best;
};

const platform = (x: number, z: number, y: number): number => {
  let best = -Infinity;
  for (const b of [...TERRACES, ...PADS]) if (Math.abs(x - b.x) < b.w / 2 && Math.abs(z - b.z) < b.d / 2 && y >= b.y - 2.5) best = Math.max(best, b.y);
  return best;
};

const BRIDGE_SPECS = [{ z: -431, y: 0, scale: 1.45 }, { z: -710, y: 24, scale: 2.05 }, { z: -1030, y: 0, scale: 2.2 }, { z: -1260, y: 0, scale: 1.5 }] as const;
const BRIDGES = BRIDGE_SPECS.map((b) => {
  const n = 42 * b.scale, centres = [0];
  for (const o of [-1, 1]) for (let a = 1; o * (o * (a - 1) * n) + 22.5 * b.scale < 172; a++) centres.push(o * a * n);
  centres.sort((p, q) => p - q);
  return { ...b, deckY: b.y + 36.05 * b.scale, left: centres[0]! - 22.5 * b.scale, right: centres[centres.length - 1]! + 22.5 * b.scale };
});

const bridgeDeck = (x: number, z: number, y: number): number => {
  let best = -Infinity;
  for (const b of BRIDGES) if (Math.abs(z - b.z) < 6.5 * b.scale && x > b.left - 14 && x < b.right + 14 && y >= b.deckY - 2.5) best = Math.max(best, b.deckY);
  return best;
};

/** Floor under the rider (original `_` for chapter 0): terrain, bridge arch, bridges, terraces, pads and ramps. */
export function floor0(x: number, z: number, y: number): number {
  return Math.max(0, ground0(x, z), bridgeDeck(x, z, y), bridgeArch(x, z) ?? 0, platform(x, z, y), ramp(x, z, y));
}

export const CHAPTER0_WORLD_COLLIDERS: readonly Collider[] = CHAPTER0_COLLIDERS.map(([x, z, r, bottom, top, halfX, halfZ]) => ({
  x, z, r, bottom, top, ...(halfX >= 0 ? { halfX, halfZ } : {})
}));

/** Floor and colliders for a chapter, where the port has them; `undefined` otherwise (the sim then keeps the road baseline). */
export function chapterWorld(chapter: number): Partial<World> | undefined {
  return chapter === 0 ? { floor: floor0, colliders: CHAPTER0_WORLD_COLLIDERS } : undefined;
}
