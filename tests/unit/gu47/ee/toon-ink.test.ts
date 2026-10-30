/**
 * GU47 E-E (WP-5) item 2: `effects.toon({ inkSource, fadeDistance, inkColor })`. Without the new fields the pass is
 * the original Silt cel pass; `inkSource` picks the edge source, `fadeDistance` fades the ink out with view depth.
 * Pixel math runs through `toonInkWeights`, the CPU mirror of both fragments.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite.js";
import {
  TOON_DEPTH_EDGE_DEFAULT,
  TOON_FRAGMENT,
  TOON_INK_FRAGMENT,
  resolveToonPass,
  toonFadeRange,
  toonInkColor,
  toonInkMix,
  toonInkWeights,
  type AuraToonOptions,
  type ToonInkFrame
} from "../../../../packages/engine/src/agent-api/nodes/effects.toon.js";
import { customPassFragmentSource } from "../../../../packages/rendering/src/post/v2Stages";
import { OUTLINE_TARGET_SHADER_SOURCES } from "../../../../packages/rendering/src/renderer/OutlineTargets";

/** The uniforms `effects.toon` emitted before GU47 (Silt cel pass). */
const LEGACY_UNIFORMS = {
  u_texel: [1 / 640, 1 / 360],
  u_bands: 5,
  u_band_mix: 0.75,
  u_outline: 0.75,
  u_ink: [0.05, 0.09, 0.11],
  u_edge: [0.26, 0.6]
};

const W = 24;
const H = 12;

/** A frame from per-pixel functions (row 0 at the bottom, GL order). */
function frame(luma: (x: number, y: number) => number, viewZ?: (x: number, y: number) => number): ToonInkFrame {
  const l = new Float32Array(W * H);
  const z = viewZ ? new Float32Array(W * H) : null;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < W; x += 1) {
      l[y * W + x] = luma(x, y);
      if (z) z[y * W + x] = viewZ!(x, y);
    }
  }
  return { width: W, height: H, luma: l, viewZ: z };
}

const maxIn = (weights: Float32Array, x0: number, x1: number): number => {
  let m = 0;
  for (let y = 1; y < H - 1; y += 1) for (let x = x0; x < x1; x += 1) m = Math.max(m, weights[y * W + x]!);
  return m;
};

// Left half: a colour-only edge at x = 6 (flat depth 8 m). Right half: a depth-only silhouette at x = 18
// (an object at 6 m in front of a wall at 30 m, same luma).
const MIXED = frame(
  (x) => (x < 12 ? (x < 6 ? 0.1 : 0.9) : 0.5),
  (x) => (x < 12 ? 8 : x < 18 ? 6 : 30)
);

describe("GU47 E-E toon: defaults reproduce today's pass", () => {
  it("no new field: the original fragment, uniforms and inputs", () => {
    const pass = effects.toon({ size: [640, 360] });
    expect(pass.fragment.glsl).toBe(TOON_FRAGMENT);
    expect(pass.uniforms).toEqual(LEGACY_UNIFORMS);
    expect(pass.insertAt).toBe("after-tonemap");
    expect(pass.inputs ?? ["color"]).not.toContain("depth");
  });

  it("inkColor alone keeps the colour-only fragment and sets u_ink from the hex", () => {
    const pass = effects.toon({ size: [640, 360], inkColor: "#1b2236" });
    expect(pass.fragment.glsl).toBe(TOON_FRAGMENT);
    expect(pass.uniforms).toEqual({ ...LEGACY_UNIFORMS, u_ink: [0x1b / 255, 0x22 / 255, 0x36 / 255] });
  });

  it("inkSource 'color' without a fade is still the original pass", () => {
    expect(effects.toon({ inkSource: "color" }).fragment.glsl).toBe(TOON_FRAGMENT);
  });

  it("the CPU mirror of the default pass matches the depth fragment fed no depth", () => {
    const plain = toonInkWeights({ ...MIXED, viewZ: null });
    const both = toonInkWeights({ ...MIXED, viewZ: null }, { inkSource: "both" });
    expect(Array.from(both)).toEqual(Array.from(plain));
  });
});

describe("GU47 E-E toon: each inkSource selects its edge source", () => {
  it("emits the depth fragment with inputs color + depth and the source weights", () => {
    for (const [inkSource, mix] of [["depth", [0, 1]], ["both", [1, 1]]] as const) {
      const pass = effects.toon({ inkSource });
      expect(pass.fragment.glsl).toBe(TOON_INK_FRAGMENT);
      expect(pass.inputs).toEqual(["color", "depth"]);
      expect(pass.uniforms).toMatchObject({ u_ink_mix: mix, u_depth_edge: [...TOON_DEPTH_EDGE_DEFAULT], u_fade: [0, 0] });
    }
    expect(toonInkMix("color")).toEqual([1, 0]);
  });

  it("color inks the colour edge only; depth the silhouette only; both inks both", () => {
    const color = toonInkWeights(MIXED, { inkSource: "color" });
    const depth = toonInkWeights(MIXED, { inkSource: "depth" });
    const both = toonInkWeights(MIXED, { inkSource: "both" });
    expect(maxIn(color, 4, 8)).toBeCloseTo(0.75, 5);
    expect(maxIn(color, 14, 22)).toBe(0);
    expect(maxIn(depth, 4, 8)).toBe(0);
    expect(maxIn(depth, 16, 20)).toBeCloseTo(0.75, 5);
    expect(maxIn(both, 4, 8)).toBeCloseTo(0.75, 5);
    expect(maxIn(both, 16, 20)).toBeCloseTo(0.75, 5);
  });

  it("depth ink stays off a plane seen at a grazing angle and off the sky", () => {
    // Ground plane: view depth grows toward the horizon so inverse depth is linear in y (zero Laplacian).
    const ground = frame(() => 0.5, (_x, y) => 1 / (0.5 - y * 0.035));
    expect(maxIn(toonInkWeights(ground, { inkSource: "depth" }), 0, W)).toBe(0);
    const sky = frame(() => 0.62, () => 1000);
    expect(maxIn(toonInkWeights(sky, { inkSource: "both", fadeDistance: 600 }), 0, W)).toBe(0);
  });

  it("without bound depth the depth source falls back to colour ink", () => {
    const noDepth = toonInkWeights({ ...MIXED, viewZ: null }, { inkSource: "depth" });
    expect(maxIn(noDepth, 4, 8)).toBeCloseTo(0.75, 5);
  });
});

describe("GU47 E-E toon: ink fades past fadeDistance", () => {
  /** A depth silhouette at x = 12: the object at `near` metres, the background twice as far. */
  const silhouette = (near: number) => frame(() => 0.5, (x) => (x < 12 ? near : near * 2));

  it("full ink up to half the distance, partial between, none past it", () => {
    expect(toonFadeRange(50)).toEqual([25, 50]);
    expect(toonFadeRange(undefined)).toEqual([0, 0]);
    const options: AuraToonOptions = { inkSource: "depth", fadeDistance: 50 };
    expect(maxIn(toonInkWeights(silhouette(10), options), 0, W)).toBeCloseTo(0.75, 5);
    const mid = maxIn(toonInkWeights(silhouette(36), options), 0, 12);
    expect(mid).toBeGreaterThan(0.05);
    expect(mid).toBeLessThan(0.7);
    expect(maxIn(toonInkWeights(silhouette(60), options), 0, W)).toBe(0);
    // Without a fade the far silhouette keeps full ink.
    expect(maxIn(toonInkWeights(silhouette(60), { inkSource: "depth" }), 0, W)).toBeCloseTo(0.75, 5);
  });

  it("a fade alone (colour source) also switches to the depth fragment and fades the colour ink", () => {
    const pass = effects.toon({ fadeDistance: 80 });
    expect(pass.fragment.glsl).toBe(TOON_INK_FRAGMENT);
    expect(pass.uniforms).toMatchObject({ u_ink_mix: [1, 0], u_fade: [40, 80] });
    const far = frame((x) => (x < 12 ? 0.1 : 0.9), () => 120);
    expect(maxIn(toonInkWeights(far, { fadeDistance: 80 }), 0, W)).toBe(0);
    expect(maxIn(toonInkWeights({ ...far, viewZ: null }, { fadeDistance: 80 }), 0, W)).toBeCloseTo(0.75, 5);
  });
});

describe("GU47 E-E toon: validation and ink colour", () => {
  it("rejects a bad inkSource, fadeDistance or inkColor loudly", () => {
    expect(() => effects.toon({ inkSource: "normal" as never })).toThrow(/inkSource/);
    expect(() => effects.toon({ fadeDistance: 0 })).toThrow(/fadeDistance/);
    expect(() => effects.toon({ fadeDistance: Number.NaN })).toThrow(/fadeDistance/);
    expect(() => effects.toon({ inkColor: "plum" })).toThrow(/inkColor/);
  });

  it("inkColor is display sRGB after tonemap and linearised on earlier slots; it wins over ink", () => {
    expect(toonInkColor("#fff")).toEqual([1, 1, 1]);
    const display = resolveToonPass({ inkColor: "#808080", ink: [0, 0, 0] }).uniforms.u_ink as number[];
    const linear = resolveToonPass({ inkColor: "#808080", order: "before-tonemap" }).uniforms.u_ink as number[];
    expect(display[0]).toBeCloseTo(128 / 255, 6);
    expect(linear[0]).toBeCloseTo(0.2158605, 5);
  });
});

const glslang = spawnSync("glslangValidator", ["--version"]).status === 0;

function compiles(files: Record<string, string>): { status: number | null; output: string } {
  const dir = mkdtempSync(join(tmpdir(), "gu47-ee-glsl-"));
  try {
    for (const [name, source] of Object.entries(files)) writeFileSync(join(dir, name), source);
    const result = spawnSync("glslangValidator", Object.keys(files).map((name) => join(dir, name)), { encoding: "utf8" });
    return { status: result.status, output: `${result.stdout}${result.stderr}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe.skipIf(!glslang)("GU47 E-E GLSL compiles under #version 300 es", () => {
  it("the depth-aware toon fragment compiles behind the C-13 custom-pass prelude", () => {
    const result = compiles({ "p.frag": customPassFragmentSource(TOON_INK_FRAGMENT) });
    expect(result.status, result.output).toBe(0);
  });

  it("the outline-target ink program links", () => {
    const result = compiles({ "p.vert": OUTLINE_TARGET_SHADER_SOURCES.vertex, "p.frag": OUTLINE_TARGET_SHADER_SOURCES.fragment });
    expect(result.status, result.output).toBe(0);
  });
});
