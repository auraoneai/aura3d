/**
 * 5.7.0 procedural VFX sheets in @aura3d/game: createFlipbookAtlas and createGradingLut must produce the same bytes as
 * the verbatim pre-5.7.0 shared copy (legacy/vfx-pack.ts), and the shared module must re-export them.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFlipbookAtlas, createGradingLut, type FlipbookKind, type GradingLutPreset } from "../../../packages/game/src/feel/index";
import { createFlipbookAtlas as legacyFlipbook, createGradingLut as legacyLut } from "./legacy/vfx-pack";
import * as sharedVfx from "../../../apps/showcase-port-shared/vfx-pack";

type Handle = ReturnType<typeof createFlipbookAtlas>["texture"];
const pixels = (handle: Handle): { width: number; height: number; data: Uint8Array } => {
  const t = handle.texture as unknown as { width: number; height: number; data: Uint8Array };
  return { width: t.width, height: t.height, data: t.data };
};
const digest = (data: Uint8Array): string => createHash("sha256").update(data).digest("hex");

const KINDS: readonly FlipbookKind[] = ["sparks", "dust", "ink", "plasma", "muzzle", "ripple"];
const PRESETS: readonly GradingLutPreset[] = ["cinema-warm", "broadcast-crisp", "cyber-neon"];

describe("createFlipbookAtlas", () => {
  it("builds an 8x4 sheet of 32 frames at 384x192 RGBA8", () => {
    const sheet = createFlipbookAtlas("sparks");
    expect(sheet).toMatchObject({ columns: 8, rows: 4, frameCount: 32 });
    const p = pixels(sheet.texture);
    expect(p.width).toBe(384);
    expect(p.height).toBe(192);
    expect(p.data).toBeInstanceOf(Uint8Array);
    expect(p.data.length).toBe(384 * 192 * 4);
  });

  it("is byte-identical to the pre-5.7.0 shared generator for every kind and a custom tint", () => {
    for (const kind of KINDS) {
      for (const tint of [undefined, [40, 180, 255] as const]) {
        const next = pixels(createFlipbookAtlas(kind, tint).texture).data;
        const old = pixels(legacyFlipbook(kind, tint).texture).data;
        expect(digest(next), `${kind} ${String(tint)}`).toBe(digest(old));
      }
    }
  });

  it("fades out: the last frame carries less alpha than the first", () => {
    const { data, width } = pixels(createFlipbookAtlas("dust").texture);
    const alphaIn = (col: number, row: number): number => {
      let sum = 0;
      for (let y = row * 48; y < row * 48 + 48; y += 1) for (let x = col * 48; x < col * 48 + 48; x += 1) sum += data[(y * width + x) * 4 + 3]!;
      return sum;
    };
    expect(alphaIn(0, 0)).toBeGreaterThan(alphaIn(7, 3));
  });
});

describe("createGradingLut", () => {
  it("builds a 16-size strip LUT at 256x16, byte-identical to the pre-5.7.0 generator", () => {
    for (const preset of PRESETS) {
      const lut = createGradingLut(preset);
      expect(lut.size).toBe(16);
      const p = pixels(lut.texture);
      expect([p.width, p.height]).toEqual([256, 16]);
      expect(digest(p.data)).toBe(digest(pixels(legacyLut(preset).texture).data));
      expect(digest(pixels(createGradingLut(preset, 8).texture).data)).toBe(digest(pixels(legacyLut(preset, 8).texture).data));
    }
  });

  it("is monotonic along each channel and keeps black dark and white bright", () => {
    const { data, width } = pixels(createGradingLut("broadcast-crisp").texture);
    const at = (r: number, g: number, b: number) => {
      const i = (g * width + b * 16 + r) * 4;
      return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
    };
    for (let r = 1; r < 16; r += 1) expect(at(r, 8, 8)[0]).toBeGreaterThanOrEqual(at(r - 1, 8, 8)[0]!);
    for (let g = 1; g < 16; g += 1) expect(at(8, g, 8)[1]).toBeGreaterThanOrEqual(at(8, g - 1, 8)[1]!);
    expect(Math.max(...at(0, 0, 0).slice(0, 3))).toBeLessThan(16);
    expect(Math.min(...at(15, 15, 15).slice(0, 3))).toBeGreaterThan(239);
    expect(at(7, 7, 7)[3]).toBe(255);
  });
});

describe("apps/showcase-port-shared/vfx-pack", () => {
  it("re-exports the library generators", () => {
    expect(sharedVfx.createFlipbookAtlas).toBe(createFlipbookAtlas);
    expect(sharedVfx.createGradingLut).toBe(createGradingLut);
  });
});
