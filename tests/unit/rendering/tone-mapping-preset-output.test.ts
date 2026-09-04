import { describe, expect, it } from "vitest";
import {
  applyToneMappingPreset,
  resolveToneMappingPreset,
  toneMappingPresets,
  type ToneMappingPresetName,
} from "@aura3d/rendering";

const WIDTH = 128;
const HEIGHT = 96;
const SUBJECT = { x0: 28, y0: 18, x1: 99, y1: 78 } as const;

const PRESET_NAMES = Object.keys(toneMappingPresets) as readonly ToneMappingPresetName[];

/** Same fixture as tests/browser/postprocess-comprehensive-harness.ts. */
function createComprehensiveFixture(): Uint8Array {
  const pixels = new Uint8Array(WIDTH * HEIGHT * 4);
  for (let y = 0; y < HEIGHT; y += 1) {
    for (let x = 0; x < WIDTH; x += 1) {
      const index = (y * WIDTH + x) * 4;
      const inside = x >= SUBJECT.x0 && x <= SUBJECT.x1 && y >= SUBJECT.y0 && y <= SUBJECT.y1;
      const disc = Math.hypot(x - 64, y - 47) < 23;
      const stripe = ((x + y * 2) % 13) < 6;
      pixels[index] = inside ? (disc ? 246 : stripe ? 206 : 46) : 10 + Math.round(x * 0.12);
      pixels[index + 1] = inside ? (disc ? 174 : stripe ? 54 : 166) : 13 + Math.round(y * 0.1);
      pixels[index + 2] = inside ? (disc ? 42 : stripe ? 238 : 76) : 22 + Math.round((x + y) * 0.05);
      pixels[index + 3] = 255;
    }
  }
  return pixels;
}

function pngStats(pixels: Uint8Array): { nonBlack: number; buckets: number } {
  let nonBlack = 0;
  const buckets = new Set<number>();
  for (let pixel = 0; pixel < WIDTH * HEIGHT; pixel += 1) {
    const i = pixel * 4;
    if ((pixels[i] ?? 0) + (pixels[i + 1] ?? 0) + (pixels[i + 2] ?? 0) > 12) nonBlack += 1;
    buckets.add((((pixels[i] ?? 0) >> 4) << 8) | (((pixels[i + 1] ?? 0) >> 4) << 4) | ((pixels[i + 2] ?? 0) >> 4));
  }
  return { nonBlack, buckets: buckets.size };
}

describe("tone mapping preset display output", () => {
  it("defaults every preset to srgb output (display-referred chains)", () => {
    for (const name of PRESET_NAMES) {
      expect(resolveToneMappingPreset(name).toneMapping.outputColorSpace).toBe("srgb");
    }
  });

  it("keeps explicit outputColorSpace overrides", () => {
    expect(resolveToneMappingPreset("cinematic", { outputColorSpace: "linear" }).toneMapping.outputColorSpace).toBe("linear");
  });

  it("renders the cinematic preset without crushing the comprehensive fixture", () => {
    const source = createComprehensiveFixture();
    const result = applyToneMappingPreset(source, WIDTH, HEIGHT, "cinematic", {
      previousExposure: 1,
      deltaTimeSeconds: 1 / 60,
    });
    const stats = pngStats(result.pixels);
    expect(stats.nonBlack).toBeGreaterThan(4_000);
    expect(stats.buckets).toBeGreaterThan(6);
  });
});
