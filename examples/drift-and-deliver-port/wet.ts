/**
 * Gridlock Courier (GU47 WP-28 GC-M1): the streets just after rain. `wetRoad(g, px)` darkens the asphalt bands of an
 * already painted road tile toward wet charcoal (#2b2f36) and `paintWetRoughness(g, px)` paints the matching
 * roughness map: damp asphalt 0.42, standing puddles 0.04 along the gutters and in seeded dips, dry pavements 0.85.
 * Both follow the road tile layout of `textures.ts` (streets on the tile borders, `ASPHALT_HALF` either side).
 */
import { ASPHALT_HALF, KERB_HALF, TILE_M, rng } from "./textures";

export interface WetCtx {
  fillStyle: string | CanvasGradient | CanvasPattern;
  globalAlpha: number;
  globalCompositeOperation: GlobalCompositeOperation;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  ellipse(x: number, y: number, rx: number, ry: number, rotation: number, start: number, end: number): void;
  fill(): void;
}

/** Roughness values (0..1) the map encodes. */
/** GU47 phase 3: damp asphalt 0.62 (0.42 mirrored the warm sky into a pink-brown sheen the panel read as muddy haze). */
export const WET = { asphalt: 0.62, puddle: 0.04, pavement: 0.85, block: 0.8 } as const;

const grey = (v: number): string => {
  const b = Math.round(Math.max(0, Math.min(1, v)) * 255);
  return `rgb(${b},${b},${b})`;
};

/** Puddles in tile metres: centre, radii, rotation. Deterministic (seeded). */
export function puddles(seed = 0x7e7): readonly { x: number; z: number; rx: number; rz: number; rot: number }[] {
  const r = rng(seed);
  const out: { x: number; z: number; rx: number; rz: number; rot: number }[] = [];
  for (const c of [0, TILE_M]) {
    for (let k = 0; k < 7; k++) {
      const along = 4 + r() * (TILE_M - 8);
      const side = r() < 0.5 ? -1 : 1;
      // gutters: just inside the kerb line
      const across = c + side * (ASPHALT_HALF - 0.6 - r() * 0.5);
      const rx = 0.8 + r() * 1.8;
      const rz = 0.35 + r() * 0.5;
      out.push(r() < 0.5 ? { x: along, z: across, rx, rz, rot: 0 } : { x: across, z: along, rx: rz, rz: rx, rot: 0 });
    }
    // a few dips mid-lane
    for (let k = 0; k < 3; k++) {
      const along = 6 + r() * (TILE_M - 12);
      const across = c + (r() - 0.5) * 5;
      const rx = 0.6 + r() * 1.2;
      out.push(r() < 0.5 ? { x: along, z: across, rx, rz: rx * 0.6, rot: r() } : { x: across, z: along, rx: rx * 0.6, rz: rx, rot: r() });
    }
  }
  return out;
}

function asphaltBands(g: WetCtx, m: (v: number) => number): void {
  for (const c of [0, TILE_M]) {
    g.fillRect(0, m(c - ASPHALT_HALF), m(TILE_M), m(2 * ASPHALT_HALF));
    g.fillRect(m(c - ASPHALT_HALF), 0, m(2 * ASPHALT_HALF), m(TILE_M));
  }
}

/** Darkens the painted asphalt toward wet charcoal and deepens the puddles (multiply pass over the albedo). */
export function wetRoad(g: WetCtx, px: number): void {
  const S = px / TILE_M;
  const m = (v: number): number => v * S;
  g.globalCompositeOperation = "multiply";
  g.globalAlpha = 1;
  g.fillStyle = "#6d717a";
  asphaltBands(g, m);
  g.fillStyle = "#8a8f98";
  for (const p of puddles()) {
    g.beginPath();
    g.ellipse(m(p.x), m(p.z), m(p.rx), m(p.rz), p.rot, 0, Math.PI * 2);
    g.fill();
  }
  // damp kerb edges
  g.globalAlpha = 0.5;
  g.fillStyle = "#b9b4aa";
  for (const c of [0, TILE_M]) {
    for (const s of [-1, 1]) {
      g.fillRect(0, m(c + s * ASPHALT_HALF - (s < 0 ? 0 : 0.4)), m(TILE_M), m(0.4));
      g.fillRect(m(c + s * ASPHALT_HALF - (s < 0 ? 0 : 0.4)), 0, m(0.4), m(TILE_M));
    }
  }
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
}

/** The roughness map for the wet road tile (sampled in every channel; glTF reads green). */
export function paintWetRoughness(g: WetCtx, px: number): void {
  const S = px / TILE_M;
  const m = (v: number): number => v * S;
  g.globalCompositeOperation = "source-over";
  g.globalAlpha = 1;
  g.fillStyle = grey(WET.block);
  g.fillRect(0, 0, px, px);
  g.fillStyle = grey(WET.pavement);
  for (const c of [0, TILE_M]) {
    g.fillRect(0, m(c - KERB_HALF), m(TILE_M), m(2 * KERB_HALF));
    g.fillRect(m(c - KERB_HALF), 0, m(2 * KERB_HALF), m(TILE_M));
  }
  g.fillStyle = grey(WET.asphalt);
  asphaltBands(g, m);
  g.fillStyle = grey(WET.puddle);
  for (const p of puddles()) {
    g.beginPath();
    g.ellipse(m(p.x), m(p.z), m(p.rx), m(p.rz), p.rot, 0, Math.PI * 2);
    g.fill();
  }
}
