/**
 * PRD-10 §7.1.6 / T4.6 — `world.water` builder types + `AuraWaterHandle`.
 *
 * The handle's `heightAt`/`normalAt`/`isUnderwater` run the same
 * `gerstnerEvaluate` twin the `a3d_prd10_gerstner` vertex chunk implements on
 * the GPU — one source for physics and pixels (§"one source").
 *
 * As with `world.terrain`, the builder is the lane-local
 * `AuraWorldNodeBuilder` facade until qr-request #135 lands the
 * `AuraSceneNode` union carve for world kinds.
 */
import type { AuraColor, AuraVec3 } from "../index.js";
import type { AuraTiered, AuraWorldNodeBase } from "./types.js";
import { AuraWorldNodeBuilder, type AuraWorldShape } from "./terrain.js";
import {
  packGerstnerWaves,
  resolveGerstnerWaves,
  gerstnerEvaluate,
  type GerstnerWaveSpec,
  type GerstnerWaveUniforms
} from "@aura3d/rendering/world";

// ---------------------------------------------------------------- options --

export type AuraGerstnerWave = GerstnerWaveSpec;

export type AuraWaterShape = AuraWorldShape | { readonly kind: "infinite"; readonly radius: number };

export interface AuraWaterOptions extends AuraWorldNodeBase {
  /** Stable node id (diagnostics + water records); auto-assigned when omitted. */
  readonly id?: string;
  readonly kind: "ocean" | "lake" | "river" | "pool";
  readonly shape: AuraWaterShape;
  /** World Y of the rest surface, default 0. */
  readonly height?: number;
  readonly shallowColor?: AuraColor;
  readonly deepColor?: AuraColor;
  /** Beer-Lambert absorption per metre; default ocean `[0.45, 0.09, 0.06]`. */
  readonly absorption?: readonly [number, number, number];
  readonly scatterColor?: AuraColor;
  /** Wave field — presets resolve to 4/8 waves (§4.5 tier caps apply). */
  readonly waves?: readonly AuraGerstnerWave[] | "calm" | "moderate" | "rough";
  readonly normalScale?: number;
  readonly normalSpeed?: number;
  readonly reflection?: AuraTiered<"ibl" | "ssr" | "planar">;
  readonly reflectionLayers?: readonly string[];
  readonly refraction?: AuraTiered<boolean>;
  readonly foam?: { readonly shoreDepth?: number; readonly crest?: number };
  /** River: scroll the detail normals along this azimuth (degrees). */
  readonly flowDirectionDeg?: number;
  readonly underwater?: boolean;
  readonly caustics?: boolean;
}

export interface AuraWaterNode extends AuraWorldNodeBase {
  readonly kind: "water";
  readonly id: string;
  readonly options: AuraWaterOptions;
}

// ----------------------------------------------------------------- handle --

export interface AuraWaterHandle {
  readonly id: string;
  /** Surface height at world (x, z) — the vertex shader's Gerstner sum. */
  heightAt(x: number, z: number, timeSeconds: number): number;
  normalAt(x: number, z: number, timeSeconds: number): AuraVec3;
  isUnderwater(point: AuraVec3, timeSeconds: number): boolean;
}

export interface WaterRecord {
  readonly node: AuraWaterNode;
  readonly options: AuraWaterOptions;
  readonly height: number;
  readonly waves: GerstnerWaveUniforms;
}

const waterRecords = new Map<string, WaterRecord>();

export function waterRecordFor(id: string): WaterRecord | null {
  return waterRecords.get(id) ?? null;
}

export function waterRecordIds(): readonly string[] {
  return [...waterRecords.keys()];
}

/** Lane-internal: the C-36 water handler clears records on scene swap. */
export function clearWaterRecords(): void {
  waterRecords.clear();
}

export function createWaterHandle(record: WaterRecord): AuraWaterHandle {
  return {
    id: record.node.id,
    heightAt: (x, z, t) => record.height + gerstnerEvaluate(record.waves, x, z, t).position[1],
    normalAt: (x, z, t) => gerstnerEvaluate(record.waves, x, z, t).normal,
    isUnderwater: (point, t) => point[1] < record.height + gerstnerEvaluate(record.waves, point[0], point[2], t).position[1]
  };
}

// ---------------------------------------------------------------- builder --

let waterSeq = 0;

export type AuraWaterBuilder = AuraWorldNodeBuilder<AuraWaterNode> & { readonly handle: AuraWaterHandle };

/** §7.1.6 `world.water(options)` — also the flag-on body of `water.surface`. */
export function worldWater(options: AuraWaterOptions): AuraWaterBuilder {
  if (!options.shape) throw new Error("world.water: shape is required");
  if (options.shape.kind === "infinite" && (!Number.isFinite(options.shape.radius) || options.shape.radius <= 0)) {
    throw new Error("world.water: infinite shape requires a positive radius");
  }
  const waves = resolveGerstnerWaves(options.waves);
  if (waves.length === 0) throw new Error("world.water: at least one wave is required");
  for (const w of waves) {
    if (!Number.isFinite(w.wavelength) || w.wavelength <= 0) {
      throw new Error("world.water: wavelength must be positive metres");
    }
    if (!Number.isFinite(w.steepness) || w.steepness < 0) {
      throw new Error("world.water: steepness must be a non-negative number");
    }
  }
  const id = options.id ?? `water-${++waterSeq}`;
  const node: AuraWaterNode = {
    kind: "water",
    id,
    name: options.name ?? id,
    options
  };
  const record: WaterRecord = {
    node,
    options,
    height: options.height ?? 0,
    waves: packGerstnerWaves(waves)
  };
  waterRecords.set(id, record);
  const builder = new AuraWorldNodeBuilder<AuraWaterNode>({ ...node }) as AuraWaterBuilder;
  Object.defineProperty(builder, "handle", { value: createWaterHandle(record), enumerable: true });
  return builder;
}
