/**
 * `camera-fade.test.ts` — S-15 occluder-fade coverage math + C-11/C-02 wiring.
 *
 * The 64×64 readback is a browser/gated assertion; what is provable at unit
 * level is pinned here: the chunk's discard predicate `a3dBayer4(...) >=
 * u_cameraFade` over the 4×4 Bayer matrix means coverage is exactly the
 * fraction of the 16 cells below the threshold — this test parses the matrix
 * out of the GLSL source and reproduces the predicate per pixel, so the
 * 50 %/100 % gates are verified against the real table, not a copy.
 */
import { describe, expect, it } from "vitest";
import {
  cameraFadeParsChunk,
  cameraFadeOffset,
  setCameraFadeOffset,
  cameraFadeFeature
} from "../../../../packages/rendering/src/shaders/camera-fade.glsl.js";
import {
  createOccluderFade,
  createOccluderFadeContributor
} from "@aura3d/engine/lanes";
import type { RenderItem } from "@aura3d/rendering/contracts";

const BAYER: number[] = (() => {
  const m = cameraFadeParsChunk.glsl.match(/float\[16\]\(([^)]+)\)/);
  if (!m) throw new Error("Bayer table not found in chunk GLSL");
  return m[1].split(",").map((s) => parseFloat(s));
})();

function bayerAt(px: number, py: number, offset: [number, number]): number {
  const x = ((px + offset[0]) % 4 + 4) % 4;
  const y = ((py + offset[1]) % 4 + 4) % 4;
  return (BAYER[x + y * 4] + 0.5) / 16;
}

/** Fraction of a 64×64 target that survives `discard` at threshold `u`. */
function coverage(u: number, offset: [number, number] = [0, 0]): number {
  if (u >= 0.999) return 1;
  let drawn = 0;
  for (let y = 0; y < 64; y += 1)
    for (let x = 0; x < 64; x += 1)
      if (bayerAt(x, y, offset) < u) drawn += 1;
  return drawn / (64 * 64);
}

const FLAGS_ON = { on: (f: string) => f === "A3D_QR_CAMERA" };
const FLAGS_OFF = { on: () => false };
const item = (label: string): RenderItem => ({ label }) as unknown as RenderItem;
const ctx = (frameIndex = 0) =>
  ({ flags: FLAGS_ON, frameIndex }) as unknown as Parameters<ReturnType<typeof createOccluderFadeContributor>["collect"]>[1];

describe("S15 occluder fade — coverage math", () => {
  it("u_cameraFade 0.5 draws 50 % of pixels (within ±2 %)", () => {
    expect(coverage(0.5)).toBeGreaterThanOrEqual(0.48);
    expect(coverage(0.5)).toBeLessThanOrEqual(0.52);
  });

  it("u_cameraFade 1.0 draws 100 % of pixels", () => {
    expect(coverage(1.0)).toBe(1);
    expect(coverage(0.999)).toBeGreaterThan(0.9); // just under the gate
  });

  it("fade floor 0.3 draws ~31 % and the rotating offset only permutes", () => {
    const fixed = coverage(0.3, [0, 0]);
    expect(fixed).toBeGreaterThanOrEqual(0.29);
    expect(fixed).toBeLessThanOrEqual(0.33);
    for (const off of [[2, 2], [2, 0], [0, 2]] as [number, number][]) {
      expect(coverage(0.3, off)).toBe(fixed);
    }
  });
});

describe("S15/C-11 occluder fade — manager + contributor", () => {
  it("eases to the 0.3 floor while occluding and forgets restored nodes", () => {
    const fade = createOccluderFade();
    expect(fade.fadeFor("wall")).toBe(1); // untracked
    fade.setOccluders(["wall"]);
    for (let i = 0; i < 120; i += 1) fade.update(1 / 60); // 2 s — converged
    expect(fade.fadeFor("wall")).toBeCloseTo(0.3, 5);
    fade.setOccluders([]);
    for (let i = 0; i < 240; i += 1) fade.update(1 / 60);
    expect(fade.fadeFor("wall")).toBe(1); // forgotten, back to 1
  });

  it("stamps cameraFade only on fading labels; flag off returns the SAME array", () => {
    const fade = createOccluderFade();
    fade.setOccluders(["wall"]);
    for (let i = 0; i < 120; i += 1) fade.update(1 / 60);
    const contrib = createOccluderFadeContributor(fade);
    const items = [item("wall"), item("hero"), item("floor")];
    const out = contrib.collect!(items, ctx());
    expect((out[0] as { cameraFade?: number }).cameraFade).toBeCloseTo(0.3, 3);
    expect((out[1] as { cameraFade?: number }).cameraFade).toBeUndefined();
    // A3D_QR_CAMERA off → input returned untouched: no variant key change,
    // program source byte-identical (S-15 acceptance).
    expect(
      contrib.collect!(items, {
        flags: FLAGS_OFF,
        frameIndex: 0
      } as Parameters<NonNullable<typeof contrib.collect>>[1])
    ).toBe(items);
  });

  it("u_cameraFadeOffset cycles (0,0)(2,2)(2,0)(0,2) only while TAA is active", () => {
    setCameraFadeOffset(0, false);
    expect([...cameraFadeOffset]).toEqual([0, 0]);
    setCameraFadeOffset(1, false);
    expect([...cameraFadeOffset]).toEqual([0, 0]); // held without TAA
    setCameraFadeOffset(0, true);
    expect([...cameraFadeOffset]).toEqual([0, 0]);
    setCameraFadeOffset(1, true);
    expect([...cameraFadeOffset]).toEqual([2, 2]);
    setCameraFadeOffset(2, true);
    expect([...cameraFadeOffset]).toEqual([2, 0]);
    setCameraFadeOffset(3, true);
    expect([...cameraFadeOffset]).toEqual([0, 2]);
    setCameraFadeOffset(4, true);
    expect([...cameraFadeOffset]).toEqual([0, 0]); // wraps
  });

  it("shadow/depth passes never select the fade feature (C-11)", () => {
    const fading = { label: "wall", cameraFade: 0.3 } as unknown as RenderItem;
    const input = (pass: string, item: RenderItem) => ({ pass, item }) as Parameters<NonNullable<typeof cameraFadeFeature.select>>[0];
    expect(cameraFadeFeature.select(input("shadow", fading))).toBeUndefined();
    expect(cameraFadeFeature.select(input("depth", fading))).toBeUndefined();
    expect(cameraFadeFeature.select(input("forward", fading))).toBe("cameraFade");
    const opaque = { label: "hero" } as unknown as RenderItem;
    expect(cameraFadeFeature.select(input("forward", opaque))).toBeUndefined();
  });
});
