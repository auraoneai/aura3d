/**
 * Aura Links 3D: which Idol image-to-3D model (speridlabs/idol/max, tools/idol/specs/aura-links-3d.json) stands in for each
 * code-built object. Pure lookups (no engine imports) so the choices are unit tested; the nodes are built in rig.ts / main.ts.
 * `?golfer=old` / `?look=original` keep the 100% procedural figures and props (reversibility, see rig.ts `golferVariant`).
 */
import type { GolferFit, Vec3 } from "./types";

/** one rigged golfer per studio polo swatch (POLO_SWATCHES in main.ts) */
export const IDOL_GOLFER_BY_POLO: Readonly<Record<string, IdolGolferKey>> = {
  "#2f6ea3": "linksIdolGolferBlue",
  "#b03030": "linksIdolGolferRed",
  "#f2f0e2": "linksIdolGolferWhite",
  "#1d2433": "linksIdolGolferNavy",
  // the lime-polo generation invented a waist-long braid on the back and was rejected; it wears the blue golfer until re-rolled
  "#9be84e": "linksIdolGolferBlue",
  "#ff7a1a": "linksIdolGolferOrange"
};
export type IdolGolferKey =
  | "linksIdolGolferBlue" | "linksIdolGolferRed" | "linksIdolGolferWhite"
  | "linksIdolGolferNavy" | "linksIdolGolferOrange";

const hexRgb = (h: string): [number, number, number] => {
  const m = /^#?([0-9a-f]{6})$/i.exec(h.trim());
  const n = m ? parseInt(m[1]!, 16) : 0x2f6ea3;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** the golfer whose baked polo is closest to the fit's polo colour (exact for every studio swatch) */
export function idolGolferKeyFor(fit: Pick<GolferFit, "polo"> | undefined): IdolGolferKey {
  const polo = (fit?.polo ?? "#2f6ea3").toLowerCase();
  const exact = IDOL_GOLFER_BY_POLO[polo];
  if (exact) return exact;
  const [r, g, b] = hexRgb(polo);
  let best: IdolGolferKey = "linksIdolGolferBlue";
  let bestD = Infinity;
  for (const [hex, key] of Object.entries(IDOL_GOLFER_BY_POLO)) {
    const [r2, g2, b2] = hexRgb(hex);
    const d = (r - r2) ** 2 + (g - g2) ** 2 + (b - b2) ** 2;
    if (d < bestD) { bestD = d; best = key; }
  }
  return best;
}

/** world height (m) each Idol tree GLB is normalised to (spec `size.height`) */
export const IDOL_TREE_HEIGHT: Readonly<Record<string, number>> = {
  linksIdolOakGreen: 8,
  linksIdolMapleRed: 8,
  linksIdolMapleOrange: 8
};

/**
 * Height (GLB metres, before the instance scale) of each Idol tree's trunk base above the GLB floor. Idol grounds a GLB at
 * its lowest vertex: the oak stands on a tilted grass mound whose FRONT lip is that vertex, while the mound's back and the
 * trunk base sit 0.3-0.75 m higher, so placing the GLB floor on the terrain left every oak hovering. Measured from the
 * meshes (vertical vertex profile): the oak's mound rim tops out at 0.7 m; the maples stand on their trunk.
 */
export const IDOL_TREE_BASE_LIFT: Readonly<Record<string, number>> = {
  linksIdolOakGreen: 0.7,
  linksIdolMapleRed: 0.05,
  linksIdolMapleOrange: 0.05
};

/** lowest terrain height over a disc footprint: the centre, and 8 points each on rings at radius / 2 and radius */
export function groundUnder(height: (x: number, z: number) => number, x: number, z: number, radius: number): number {
  let lo = height(x, z);
  for (const r of [radius * 0.5, radius]) {
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      lo = Math.min(lo, height(x + Math.cos(a) * r, z + Math.sin(a) * r));
    }
  }
  return lo;
}

/** how far below the lowest footprint ground every Idol set piece is sunk (m): never a gap on a slope */
export const IDOL_GROUND_SINK = 0.15;

/**
 * Broadleaf model for the i-th broadleaf of a course theme (parkland cycles autumn tones like the old canopy tints). Conifers
 * stay procedural: the Idol pine / snow-pine generations were stuck in the shared fal queue and cancelled.
 */
export function idolBroadleafKey(theme: string, i: number): string {
  if (theme === "parkland") return ["linksIdolMapleRed", "linksIdolMapleOrange", "linksIdolMapleRed", "linksIdolOakGreen", "linksIdolMapleOrange"][i % 5]!;
  return "linksIdolOakGreen";
}

/** the corridor tree at index i of a hole's tree list is a broadleaf (else a conifer); the procedural and Idol looks share the split */
export function treeIsBroadleaf(theme: string, i: number): boolean {
  return theme === "parkland" ? i % 4 !== 3 : theme === "dunes" ? i % 2 === 0 : theme === "alpine" ? false : i % 3 === 0;
}

/**
 * Instance transform of an Idol broadleaf (art/idolModels.ts draws it, game/treeSpots.ts builds its collider from it):
 * normalised to IDOL_TREE_HEIGHT so `h / height` gives the world height, narrowed to the old procedural canopy footprint
 * (the Idol canopies are ~1.05x as wide as tall, the procedural ones ~0.75x), trunk base on the LOWEST ground under the
 * trunk + mound footprint, sunk a little.
 */
export function idolTreePlacement(
  height: (x: number, z: number) => number,
  tr: { readonly x: number; readonly z: number; readonly h: number; readonly yaw: number },
  theme: string,
  key: string
): { position: Vec3; rotation: Vec3; scale: Vec3 } {
  const lean = theme === "dunes" ? 0.09 : 0.03;
  const rotation: Vec3 = [Math.sin(tr.yaw) * lean, tr.yaw, Math.cos(tr.yaw) * lean];
  const s = tr.h / (IDOL_TREE_HEIGHT[key] ?? 8);
  const sy = theme === "dunes" ? s * 0.9 : s;
  const y = groundUnder(height, tr.x, tr.z, 1.6 * s) - (IDOL_TREE_BASE_LIFT[key] ?? 0) * sy - IDOL_GROUND_SINK;
  const w = s * 0.74;
  const scale: Vec3 = theme === "dunes" ? [w * 1.12, s * 0.9, w * 1.08] : [w, s, w];
  return { position: [tr.x, y, tr.z], rotation, scale };
}

/** Idol grass clump per course theme (replaces the smooth cone tufts in the rough; Mare keeps its regolith pebbles) */
export const IDOL_CLUMP_BY_THEME: Readonly<Record<string, { readonly key: string; readonly height: number }>> = {
  dunes: { key: "linksIdolClumpDunes", height: 0.55 },
  parkland: { key: "linksIdolClumpParkland", height: 0.45 },
  alpine: { key: "linksIdolClumpAlpine", height: 0.4 },
  nightCity: { key: "linksIdolClumpNight", height: 0.45 },
  volcanic: { key: "linksIdolClumpAsh", height: 0.4 }
};
/** one Idol clump per this many cone tufts (a 1.5k-triangle model instead of a 12-triangle cone) */
export const IDOL_CLUMP_STRIDE = 6;

/** the four gallery spectator figures, cycled around the green and on the grandstands */
export const IDOL_SPECTATORS = ["linksIdolSpectatorA", "linksIdolSpectatorB", "linksIdolSpectatorC", "linksIdolSpectatorD"] as const;
