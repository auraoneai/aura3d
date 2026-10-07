import type { ExternalParityEnvironmentPreset } from "./ExternalParityRenderPreset";
import type { QrFlags } from "./contracts/core";
import { rendererQrFlags } from "./renderer/FrameGraph";

export type EnvironmentPresetPackSlot = "indoor" | "outdoor" | "night";

export interface EnvironmentPresetPackEntry {
  readonly slot: EnvironmentPresetPackSlot;
  readonly basePreset: ExternalParityEnvironmentPreset;
  /**
   * Measured exposure gain applied to the generated HDR source so every
   * slot's mean linear luma matches the pack target (outdoor daylight).
   * Measured 2026-09-03 from 64x32 generated sources, not guessed.
   */
  readonly exposureFactor: number;
  readonly evidence: string;
}

export interface EnvironmentPresetPack {
  /** Pack-wide mean-luma target: the measured outdoor daylight source mean. */
  readonly targetMeanLuma: number;
  readonly entries: readonly EnvironmentPresetPackEntry[];
  /** Frozen-reference SSIM floor for exposure-normalized PMREM rows. */
  readonly pmremRowSsimFloor: 0.975;
}

export const AURA_INDOOR_OUTDOOR_NIGHT_PRESET_PACK: EnvironmentPresetPack = {
  targetMeanLuma: 0.60698,
  entries: [
    {
      slot: "indoor",
      basePreset: "softbox",
      exposureFactor: 0.866755,
      evidence: "softbox interior source mean 0.70029 normalized to the daylight target 0.60698"
    },
    {
      slot: "outdoor",
      basePreset: "daylight",
      exposureFactor: 1,
      evidence: "daylight source mean 0.60698 defines the pack target; identity gain"
    },
    {
      slot: "night",
      basePreset: "evening",
      exposureFactor: 2.114618,
      evidence: "evening source mean 0.28704 normalized to the daylight target 0.60698"
    }
  ],
  pmremRowSsimFloor: 0.975
};

/**
 * PRD-10 T6.5 (L9): with `A3D_QR_WORLD_BIOME` on, the night slot keeps its own
 * exposure — multiplying an evening source by 2.11 to match daylight luma
 * removes the night look the biome is supposed to produce. Flag off → the
 * measured normalization factor (legacy behavior).
 */
export function presetPackExposureFactor(
  entry: EnvironmentPresetPackEntry,
  flags?: QrFlags
): number {
  const qr = flags ?? rendererQrFlags();
  if (entry.slot === "night" && worldBiomeSubflagOn(qr)) return 1;
  return entry.exposureFactor;
}

/**
 * T6.5 second half: flag on → the SSIM gate compares per-preset frozen
 * references (each slot against its own source's PMREM rows) instead of the
 * shared daylight-normalized reference set. The owner-15 gate fixture adopts
 * this selector when the per-preference references are regenerated.
 */
export type PresetPackSsimReference = "normalized-to-target" | "per-preset";
export function presetPackSsimReference(flags?: QrFlags): PresetPackSsimReference {
  const qr = flags ?? rendererQrFlags();
  return worldBiomeSubflagOn(qr) ? "per-preset" : "normalized-to-target";
}

/**
 * §13 default-on, rendering-side copy of `worldSubflagOn` (engine can't be
 * imported from this package): `A3D_QR_WORLD_BIOME` follows `A3D_QR_WORLD`
 * unless it was set explicitly.
 */
function worldBiomeSubflagOn(qr: QrFlags): boolean {
  const v = qr.values["A3D_QR_WORLD_BIOME"];
  if (v !== undefined) return v !== false && v !== "off" && v !== "0";
  return qr.on("A3D_QR_WORLD");
}

/**
 * Applies a pack entry's measured exposure gain to generated HDR float
 * data (pure linear gain: structure-preserving by construction, which is
 * what lets the frozen-reference SSIM gate isolate pipeline regressions
 * from exposure intent).
 */
export function applyPresetPackExposure(
  data: Float32Array,
  exposureFactor: number
): Float32Array {
  if (!Number.isFinite(exposureFactor) || exposureFactor <= 0) {
    throw new RangeError(`Preset pack exposure factor must be finite and positive, got ${exposureFactor}.`);
  }
  const out = new Float32Array(data.length);
  for (let index = 0; index < data.length; index += 1) {
    out[index] = data[index]! * exposureFactor;
  }
  return out;
}

export function meanLinearLuma(data: Float32Array, pixelCount: number): number {
  let sum = 0;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const base = pixel * 4;
    sum += 0.2126 * data[base]! + 0.7152 * data[base + 1]! + 0.0722 * data[base + 2]!;
  }
  return sum / Math.max(1, pixelCount);
}
