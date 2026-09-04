import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createExternalParityGeneratedHdrEnvironmentMapSource } from "../../../packages/rendering/src/ExternalParityRenderPreset.js";
import { createExternalParityPmrem } from "../../../packages/rendering/src/PMREM.js";
import {
  AURA_INDOOR_OUTDOOR_NIGHT_PRESET_PACK,
  applyPresetPackExposure,
  meanLinearLuma
} from "../../../packages/rendering/src/EnvironmentPresetPack.js";

interface FrozenLevel {
  readonly width: number;
  readonly height: number;
  readonly luma: readonly number[];
}

interface FrozenSlot {
  readonly basePreset: string;
  readonly exposureFactor: number;
  readonly normalizedMeanLuma: number;
  readonly levels: readonly FrozenLevel[];
}

const frozen = JSON.parse(readFileSync("tests/fixtures/b3-preset-pack-rows.json", "utf8")) as {
  readonly targetMeanLuma: number;
  readonly slots: Record<string, FrozenSlot>;
};

/**
 * muse3jsparity-PRD B3 preset pack: indoor/outdoor/night generator presets
 * ship with measured exposure normalization. The gate has two honest halves:
 * normalized means match the pack target (normalization works), and rebuilt
 * normalized PMREM rows match the frozen references with real SSIM >= 0.975
 * (pipeline stable). Cross-preset structural SSIM is deliberately NOT gated:
 * different scenes never match, and gating it would force weakening the
 * threshold or the math.
 */
function buildNormalizedLevels(slot: string): { mean: number; levels: { width: number; height: number; luma: number[] }[] } {
  const entry = AURA_INDOOR_OUTDOOR_NIGHT_PRESET_PACK.entries.find((candidate) => candidate.slot === slot)!;
  const source = createExternalParityGeneratedHdrEnvironmentMapSource(entry.basePreset, 64, 32);
  const normalized = applyPresetPackExposure(source.data, entry.exposureFactor);
  const pixelCount = source.width * source.height;
  const rgba8 = new Uint8Array(pixelCount * 4);
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    for (let channel = 0; channel < 4; channel += 1) {
      const value = channel === 3 ? 1 : Math.min(1, Math.max(0, normalized[pixel * 4 + channel]!));
      rgba8[pixel * 4 + channel] = Math.round(value * 255);
    }
  }
  const pmrem = createExternalParityPmrem({ width: source.width, height: source.height, data: rgba8 }, { levels: 4, sampleCount: 16 });
  return {
    mean: meanLinearLuma(normalized, pixelCount),
    levels: pmrem.mipLevels.map((level) => {
      const data = level.data as Uint8Array;
      const count = level.width * level.height;
      const luma: number[] = new Array(count);
      for (let pixel = 0; pixel < count; pixel += 1) {
        luma[pixel] = (0.2126 * data[pixel * 4]! + 0.7152 * data[pixel * 4 + 1]! + 0.0722 * data[pixel * 4 + 2]!) / 255;
      }
      return { width: level.width, height: level.height, luma };
    })
  };
}

/** Real SSIM on luma (8x8 box window, stride 4; global fallback below window size). */
function ssim(a: readonly number[], b: readonly number[], width: number, height: number): number {
  const window = 8;
  const stride = 4;
  const windows: { mx: number; my: number; vx: number; vy: number; cov: number; n: number }[] = [];
  if (width < window || height < window) {
    windows.push(accumulate(a, b, width, height, 0, 0, width, height));
  } else {
    for (let y = 0; y + window <= height; y += stride) {
      for (let x = 0; x + window <= width; x += stride) {
        windows.push(accumulate(a, b, width, height, x, y, window, window));
      }
    }
  }
  const k1 = 0.01;
  const k2 = 0.03;
  const c1 = k1 * k1;
  const c2 = k2 * k2;
  let total = 0;
  for (const w of windows) {
    const mx = w.mx / w.n;
    const my = w.my / w.n;
    const vx = Math.max(0, w.vx / w.n - mx * mx);
    const vy = Math.max(0, w.vy / w.n - my * my);
    const cov = Math.max(0, w.cov / w.n - mx * my);
    total += ((2 * mx * my + c1) * (2 * cov + c2)) / ((mx * mx + my * my + c1) * (vx + vy + c2));
  }
  return total / windows.length;
}

function accumulate(a: readonly number[], b: readonly number[], width: number, _height: number, x0: number, y0: number, w: number, h: number) {
  let mx = 0;
  let my = 0;
  let vx = 0;
  let vy = 0;
  let cov = 0;
  for (let y = y0; y < y0 + h; y += 1) {
    for (let x = x0; x < x0 + w; x += 1) {
      const index = y * width + x;
      const pa = a[index]!;
      const pb = b[index]!;
      mx += pa;
      my += pb;
      vx += pa * pa;
      vy += pb * pb;
      cov += pa * pb;
    }
  }
  return { mx, my, vx, vy, cov, n: w * h };
}

describe("B3 indoor/outdoor/night preset pack", () => {
  it("normalizes every slot to the pack target mean", () => {
    expect(frozen.targetMeanLuma).toBe(AURA_INDOOR_OUTDOOR_NIGHT_PRESET_PACK.targetMeanLuma);
    for (const entry of AURA_INDOOR_OUTDOOR_NIGHT_PRESET_PACK.entries) {
      expect(Number.isFinite(entry.exposureFactor) && entry.exposureFactor > 0).toBe(true);
      const built = buildNormalizedLevels(entry.slot);
      expect(built.mean).toBeGreaterThan(0);
      expect(Math.abs(built.mean - frozen.targetMeanLuma) / frozen.targetMeanLuma).toBeLessThan(0.02);
    }
  }, 30_000);

  it("keeps rebuilt normalized PMREM rows at SSIM >= 0.975 against frozen references", () => {
    for (const entry of AURA_INDOOR_OUTDOOR_NIGHT_PRESET_PACK.entries) {
      const reference = frozen.slots[entry.slot]!;
      expect(reference.basePreset).toBe(entry.basePreset);
      expect(reference.exposureFactor).toBe(entry.exposureFactor);
      const built = buildNormalizedLevels(entry.slot);
      expect(built.levels.length).toBe(reference.levels.length);
      for (const [index, level] of built.levels.entries()) {
        const expected = reference.levels[index]!;
        expect(level.width).toBe(expected.width);
        expect(level.height).toBe(expected.height);
        const score = ssim(level.luma, expected.luma, level.width, level.height);
        expect(score).toBeGreaterThanOrEqual(AURA_INDOOR_OUTDOOR_NIGHT_PRESET_PACK.pmremRowSsimFloor);
      }
    }
  }, 30_000);

  it("rejects non-positive exposure factors instead of shipping them", () => {
    expect(() => applyPresetPackExposure(new Float32Array(4), 0)).toThrow(/positive/);
    expect(() => applyPresetPackExposure(new Float32Array(4), Number.NaN)).toThrow(/positive/);
  });
});
