/**
 * Per-act instanced foliage and coin-sparkle consolidation (SR-A2).
 *
 * Pure planner: everything here is deterministic game-space math. main.ts converts
 * the placements into scene points and renders each act as ONE instanced node, so
 * the whole foliage + sparkle layer costs a fixed handful of draw calls regardless
 * of how many fronds or shard halos exist.
 *
 * Tints come only from the existing act palettes, so the ferns of Home Grove, the
 * steel scrub of Sentry Pass and the aurora grass of the Crown all inherit the same
 * colour contract as the sky bands they stand under.
 */
import { blendSkyBandColor } from "@aura3d/engine";
import { getSkylineActPalette } from "./act-palette";
import { SKYLINE_SECTION_COUNT, SKYLINE_SECTION_LAYOUTS, SKYLINE_SECTION_STRIDE } from "./level-layout";

export interface SkylineFoliagePlacement {
  readonly id: string;
  readonly section: number;
  readonly act: number;
  /** Game-space position on top of a certified platform (decorative only). */
  readonly x: number;
  readonly y: number;
  /** Relative depth bias behind the gameplay plane (0..1, rendered by main.ts). */
  readonly depthBias: number;
  readonly scale: number;
  /** Blend along the act ground-emissive ramp (0..1). */
  readonly tint: number;
}

/** Deterministic PRNG so retained evidence reproduces frame-for-frame. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function skylineFoliageNodeId(act: number): string {
  return "skyline-foliage-pool-act-" + act;
}

export function skylineSparkleNodeId(act: number): string {
  return "skyline-sparkle-halo-pool-act-" + act;
}

export interface SkylineFoliagePlatform {
  readonly id: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Plans the per-act foliage instances. Instances sit ON certified platforms but are
 * strictly decorative: main.ts renders them behind the gameplay plane with no
 * physics, so collision surfaces stay untouched.
 */
export function planSkylineFoliage(options: {
  readonly platforms: readonly SkylineFoliagePlatform[];
  readonly perSection?: number;
  readonly seed?: number;
}): readonly SkylineFoliagePlacement[] {
  const perSection = Math.max(1, options.perSection ?? 6);
  const rng = mulberry32(options.seed ?? 20260817);
  const placements: SkylineFoliagePlacement[] = [];
  for (let section = 0; section < SKYLINE_SECTION_COUNT; section += 1) {
    const minX = section * SKYLINE_SECTION_STRIDE;
    const maxX = minX + SKYLINE_SECTION_STRIDE;
    const local = options.platforms
      .filter((platform) => platform.x + platform.width > minX && platform.x < maxX)
      .sort((left, right) => left.x - right.x);
    if (local.length === 0) continue;
    const act = SKYLINE_SECTION_LAYOUTS[section]?.act ?? 0;
    for (let index = 0; index < perSection; index += 1) {
      const platform = local[index % local.length]!;
      // Keep clear of platform edges so nothing reads as standing on air.
      const frac = 0.12 + rng() * 0.76;
      placements.push({
        id: "skyline-foliage-" + section + "-" + index,
        section,
        act,
        x: platform.x + platform.width * frac,
        y: platform.y + platform.height + 0.02,
        depthBias: rng(),
        scale: 0.55 + rng() * 0.45,
        tint: rng()
      });
    }
  }
  return placements;
}

/** Act-tinted colour for one foliage instance, from the existing ground ramp. */
export function skylineFoliageTint(actIndex: number, tint: number): string {
  const ramp = getSkylineActPalette(actIndex).groundEmissiveRamp;
  return blendSkyBandColor(ramp[0], ramp[1], Math.max(0, Math.min(1, tint)));
}

export interface SkylineSparklePlacement {
  readonly id: string;
  readonly act: number;
  readonly x: number;
  readonly y: number;
  /** Depth jitter behind the shard marker (0..1), consumed by main.ts. */
  readonly depthBias: number;
  readonly scale: number;
  readonly tint: number;
}

/**
 * Coin-sparkle consolidation: every sky-shard halo comes from ONE instanced pool
 * per act instead of an individually animated node. The per-shard state marker
 * (hidden the moment the shard is collected) stays in main.ts because runtime node
 * handles cannot mutate a single instance; the halo layer itself is fully instanced.
 */
export interface SkylineShardSeed {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export function planSkylineShardSparkles(
  collectibles: readonly SkylineShardSeed[]
): readonly SkylineSparklePlacement[] {
  return collectibles.map((collectible) => {
    const section = Math.max(0, Math.min(SKYLINE_SECTION_COUNT - 1,
      Math.floor(Math.max(0, collectible.x) / SKYLINE_SECTION_STRIDE)));
    const act = SKYLINE_SECTION_LAYOUTS[section]?.act ?? 0;
    const seedFrac = Math.abs(Math.sin(collectible.id.length * 12.9898)) % 1;
    return {
      id: "skyline-sparkle-" + collectible.id,
      act,
      x: collectible.x,
      y: collectible.y,
      depthBias: seedFrac,
      scale: 0.7 + seedFrac * 0.6,
      tint: seedFrac
    };
  });
}

/** Act-tinted halo colour, from the existing sky-emissive ramp. */
export function skylineSparkleTint(actIndex: number, tint: number): string {
  const ramp = getSkylineActPalette(actIndex).skyEmissiveRamp;
  return blendSkyBandColor(ramp[0], ramp[1], Math.max(0, Math.min(1, tint)));
}
