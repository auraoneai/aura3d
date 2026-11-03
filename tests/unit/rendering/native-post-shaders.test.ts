import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { FXAA_185_FRAGMENT_GLSL, FXAA_185_FNS_GLSL } from "../../../packages/rendering/src/post/shaders/fxaa.glsl";
import { FXAA_185_FRAGMENT_WGSL, FXAA_185_FNS_WGSL, FXAA_NATIVE_INTERMEDIATE_WGSL } from "../../../packages/rendering/src/post/shaders/fxaa.wgsl";
import { GTAO_GLSL } from "../../../packages/rendering/src/post/shaders/gtao.glsl";
import { GTAO_NATIVE_APPLY_WGSL, GTAO_NATIVE_INTERMEDIATE_WGSL, GTAO_WGSL } from "../../../packages/rendering/src/post/shaders/gtao.wgsl";
import { SMAA_BLEND_GLSL } from "../../../packages/rendering/src/post/shaders/smaa.glsl";
import { SMAA_BLEND_WGSL } from "../../../packages/rendering/src/post/shaders/smaa.wgsl";
import { DISPLAY_GRADE_GLSL } from "../../../packages/rendering/src/post/shaders/displayGrade.glsl";
import { DISPLAY_GRADE_WGSL } from "../../../packages/rendering/src/post/shaders/displayGrade.wgsl";
import { FINALIZE_FXAA_FUSED_GLSL, FINALIZE_GLSL } from "../../../packages/rendering/src/post/shaders/finalize.glsl";
import { FINALIZE_FXAA_FUSED_WGSL, FINALIZE_WGSL } from "../../../packages/rendering/src/post/shaders/finalize.wgsl";
import { CAMERA_VELOCITY_GLSL, DEPTH_LINEARIZE_GLSL, DEPTH_MINMAX_HALF_GLSL } from "../../../packages/rendering/src/post/shaders/depthDownsample.glsl";
import { VELOCITY_DILATE_GLSL } from "../../../packages/rendering/src/post/shaders/velocityDilate.glsl";
import { generateSmaaAreaData, generateSmaaSearchData, SMAA_AREATEX_PNG, SMAA_SEARCHTEX_PNG } from "../../../packages/rendering/src/post/smaa/textures";
import { encodeViewDepth, linearizeDepth, negotiateDepthConvention, reconstructViewPosition, type DepthConvention } from "../../../packages/rendering/src/DepthConvention";

type Color = readonly [number, number, number, number];
type Vector = readonly [number, number, number];
const luminance = (c: Color): number => c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722;

/** Independent scalar example of straight-alpha interpolation in linear light. */
function associatedBlend(a: Color, b: Color, t: number): Color {
  const alpha = (1 - t) * a[3] + t * b[3];
  if (alpha === 0) return [0, 0, 0, 0];
  return [
    ((1 - t) * a[0] * a[3] + t * b[0] * b[3]) / alpha,
    ((1 - t) * a[1] * a[3] + t * b[1] * b[3]) / alpha,
    ((1 - t) * a[2] * a[3] + t * b[2] * b[3]) / alpha,
    alpha
  ];
}

/** Analytical visibility of one candidate in the normal-facing hemisphere. */
function candidateOcclusion(delta: Vector, radius: number, falloff: number, thickness: number): number {
  const distance = Math.hypot(...delta);
  if (radius <= 0 || distance < 1e-6 || distance >= radius || Math.abs(delta[2]) > thickness) return 0;
  const elevation = Math.max(0, delta[2] / distance - 0.02);
  return elevation * (1 - distance / radius) ** Math.max(falloff, 0.0001);
}

/** A two-neighbour edge example with a known luma contrast. */
function edgeBlendAmount(center: number, one: number, other: number): number {
  const contrast = Math.max(center, one, other) - Math.min(center, one, other);
  if (contrast <= Math.max(0.0312, Math.max(center, one, other) * 0.063)) return 0;
  return 0.5 * Math.min(1, Math.abs((one + other) / 2 - center) / contrast);
}

function alphaWeightedCross(center: Vector, neighbors: readonly Color[]): Vector {
  const alpha = neighbors.reduce((sum, neighbor) => sum + neighbor[3], 0);
  if (alpha === 0) return center;
  return [0, 1, 2].map((channel) => neighbors.reduce((sum, neighbor) => sum + neighbor[channel]! * neighbor[3], 0) / alpha) as unknown as Vector;
}

function pngPixels(url: string): { width: number; height: number; pixels: Buffer } {
  const encoded = url.match(/^data:image\/png;base64,(.+)$/)?.[1];
  if (!encoded) throw new Error("expected a PNG data URL");
  const bytes = Buffer.from(encoded, "base64");
  expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  let offset = 8;
  let width = 0;
  let height = 0;
  const blocks: Buffer[] = [];
  while (offset < bytes.length) {
    const size = bytes.readUInt32BE(offset);
    const type = bytes.toString("ascii", offset + 4, offset + 8);
    const data = bytes.subarray(offset + 8, offset + 8 + size);
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      expect([...data.subarray(8)]).toEqual([8, 0, 0, 0, 0]);
    }
    if (type === "IDAT") blocks.push(data);
    offset += size + 12;
    if (type === "IEND") break;
  }
  const raw = inflateSync(Buffer.concat(blocks));
  expect(raw[0]).toBe(0);
  return { width, height, pixels: raw.subarray(1) };
}

function perspective(near: number, far: number, reversed: boolean, zeroToOne: boolean): { projection: number[]; inverse: number[] } {
  // Matrix coefficients follow from the requested NDC values at near and far.
  const nearNdc = reversed ? 1 : zeroToOne ? 0 : -1;
  const farNdc = reversed ? (zeroToOne ? 0 : -1) : 1;
  const b = (nearNdc - farNdc) * near * far / (far - near);
  const a = b / near - nearNdc;
  return {
    projection: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, a, -1, 0, 0, b, 0],
    inverse: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1 / b, 0, 0, -1, a / b]
  };
}

function orthographic(near: number, far: number, reversed: boolean, zeroToOne: boolean): { projection: number[]; inverse: number[] } {
  const nearNdc = reversed ? 1 : zeroToOne ? 0 : -1;
  const farNdc = reversed ? (zeroToOne ? 0 : -1) : 1;
  const a = (nearNdc - farNdc) / (far - near);
  const b = nearNdc + a * near;
  return {
    projection: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, a, 0, 0, 0, b, 1],
    inverse: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1 / a, 0, 0, 0, -b / a, 1]
  };
}

function ndcFromViewDepth(inverse: readonly number[], x: number, y: number, depth: number): number {
  const homogeneousZ = inverse[2]! * x + inverse[6]! * y + inverse[14]!;
  const homogeneousW = inverse[3]! * x + inverse[7]! * y + inverse[15]!;
  return -(homogeneousZ + depth * homogeneousW) / (inverse[10]! + depth * inverse[11]!);
}

function convention(mode: DepthConvention["mode"], zeroToOne: boolean): DepthConvention {
  return negotiateDepthConvention({ mode }, { clipRange: zeroToOne ? "zero-to-one" : "minus-one-to-one", reversed: true, logarithmic: true });
}

function hasCommand(name: string): boolean {
  return spawnSync(name, ["--version"], { stdio: "ignore" }).status === 0;
}

function fullscreenModule(fragment: string): string {
  return `struct TestVertex { @builtin(position) position: vec4<f32>, @location(0) uv: vec2<f32>, };
@vertex fn vs_test(@builtin(vertex_index) index: u32) -> TestVertex {
  let p = array<vec2<f32>, 3>(vec2<f32>(-1.0,-1.0), vec2<f32>(3.0,-1.0), vec2<f32>(-1.0,3.0));
  var o: TestVertex;
  o.position = vec4<f32>(p[index], 0.0, 1.0);
  o.uv = (p[index] + vec2<f32>(1.0)) * 0.5;
  return o;
}
${fragment}`;
}

describe("independent native post source contracts", () => {
  it("preserves flat color and selects a bounded blend at high contrast", () => {
    expect(edgeBlendAmount(0.5, 0.5, 0.5)).toBe(0);
    expect(edgeBlendAmount(0.5, 0.51, 0.49)).toBe(0);
    expect(edgeBlendAmount(0, 0, 1)).toBeCloseTo(0.25, 12);
    expect(edgeBlendAmount(0, 1, 1)).toBeCloseTo(0.5, 12);
    for (const source of [FXAA_185_FNS_GLSL, FXAA_185_FNS_WGSL]) {
      expect(source).toContain("0.0312");
      expect(source).toContain("0.063");
      expect(source).toContain("0.5 * clamp");
      expect(source).toContain("clamp(uv, half");
      expect(source).toContain("premul");
    }
  });

  it("keeps hidden transparent colors out of AA and preserves alpha", () => {
    const red: Color = [1, 0, 0, 1];
    const clearGreen: Color = [0, 1, 0, 0];
    expect(associatedBlend(red, clearGreen, 0.25)).toEqual([1, 0, 0, 0.75]);
    expect(associatedBlend([1, 0, 0, 0], clearGreen, 0.5)).toEqual([0, 0, 0, 0]);
    expect(associatedBlend(red, [0, 1, 0, 1], 0.25)).toEqual([0.75, 0.25, 0, 1]);
    expect(associatedBlend(clearGreen, red, 0.75)).toEqual([1, 0, 0, 0.75]);
    expect(luminance(red)).not.toBe(red[3]);
    for (const source of [SMAA_BLEND_GLSL, SMAA_BLEND_WGSL]) {
      expect(source).toContain("premultiplied");
      expect(source).toMatch(/center\.a/);
      expect(source).toMatch(/other\.a/);
      expect(source).toMatch(/a3dToLinear|a3d_to_linear/);
      expect(source).toMatch(/a3dToDisplay|a3d_to_display/);
    }
    for (const source of [DISPLAY_GRADE_GLSL, DISPLAY_GRADE_WGSL, FINALIZE_GLSL, FINALIZE_WGSL]) expect(source).toContain("source.a");
    expect(FINALIZE_FXAA_FUSED_GLSL).toContain("#define AURA_LUMA_ALPHA 0");
    expect(FINALIZE_FXAA_FUSED_GLSL).toContain("c.a");
    expect(FINALIZE_FXAA_FUSED_GLSL).toContain("color.a");
    expect(FINALIZE_FXAA_FUSED_WGSL).toMatch(/FXAA_LUMA_ALPHA:\s*i32\s*=\s*0/);
    expect(FINALIZE_FXAA_FUSED_WGSL).toContain("c.a");
    expect(FINALIZE_FXAA_FUSED_WGSL).toContain("color.a");
  });

  it("generates small symmetrical lookup images from the declared coverage equation", () => {
    const area = generateSmaaAreaData();
    const search = generateSmaaSearchData();
    expect(area).toHaveLength(81);
    expect(search).toHaveLength(256);
    expect([area[0], area[1], area[2], area[10]]).toEqual([255, 128, 85, 255]);
    expect([...search]).toEqual(Array.from({ length: 256 }, (_, index) => index));
    for (let y = 0; y <= 8; y += 1) for (let x = 0; x <= 8; x += 1) expect(area[x + y * 9]).toBe(area[y + x * 9]);
    const areaPng = pngPixels(SMAA_AREATEX_PNG);
    const searchPng = pngPixels(SMAA_SEARCHTEX_PNG);
    expect([areaPng.width, areaPng.height, ...areaPng.pixels]).toEqual([81, 1, ...area]);
    expect([searchPng.width, searchPng.height, ...searchPng.pixels]).toEqual([256, 1, ...search]);
  });

  it("keeps opaque sharpening unchanged and excludes hidden transparent RGB", () => {
    const center: Vector = [0.2, 0.3, 0.4];
    const samples: Color[] = [[1, 0, 0, 1], [0, 1, 0, 1], [0, 0, 1, 1], [1, 1, 1, 1]];
    expect(alphaWeightedCross(center, samples)).toEqual([0.5, 0.5, 0.5]);
    expect(alphaWeightedCross(center, [samples[0]!, samples[1]!, samples[2]!, [900, 500, 700, 0]])).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(alphaWeightedCross(center, [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [4, 4, 4, 0]])).toEqual(center);
    expect(FINALIZE_GLSL).toContain("south.rgb * south.a");
    expect(FINALIZE_WGSL).toContain("south.rgb * south.a");
  });

  it("leaves a flat surface visible and rejects out-of-radius or rear-facing samples", () => {
    expect(candidateOcclusion([0.1, 0, 0], 0.35, 1, 1)).toBe(0);
    expect(candidateOcclusion([0.1, 0, -0.1], 0.35, 1, 1)).toBe(0);
    expect(candidateOcclusion([0.4, 0, 0.1], 0.35, 1, 1)).toBe(0);
    expect(candidateOcclusion([0.04, 0, 0.1], 0, 1, 1)).toBe(0);
    expect(candidateOcclusion([0.04, 0, 0.1], 0.35, 1, 0.05)).toBe(0);
    const near = candidateOcclusion([0.04, 0, 0.1], 0.35, 1, 1);
    expect(near).toBeGreaterThan(0.6);
    expect(near).toBeLessThan(0.7);
    expect(1 - 0 * near).toBe(1);
    expect(1 - near).toBeLessThan(1);
    for (const source of [GTAO_GLSL, GTAO_WGSL]) {
      expect(source).toContain("2.9e38");
      expect(source).toContain("0.02");
      expect(source).toContain("96.0");
      expect(source).toMatch(/u_radius <= 0\.0|u_params\.radius <= 0\.0/);
      expect(source).toMatch(/u_intensity <= 0\.0|u_params\.intensity <= 0\.0/);
      expect(source).toMatch(/positive = max\(positive/);
      expect(source).toMatch(/negative = max\(negative/);
      expect(source).toMatch(/greaterThanEqual\(sampleUv|sample_uv >=/);
    }
    expect(GTAO_GLSL).toContain("!u_ortho && depth <= 0.0");
    expect(GTAO_WGSL).toContain("u_params.ortho == 0 && depth <= 0.0");
    expect(GTAO_WGSL).toContain("1.0 - uv.y");
  });

  it("retains the three native modules and their fullscreen helper binding layouts", () => {
    for (const source of [FXAA_NATIVE_INTERMEDIATE_WGSL, GTAO_NATIVE_INTERMEDIATE_WGSL, GTAO_NATIVE_APPLY_WGSL]) {
      expect(source).toContain("@fragment");
      expect(source).toContain("@binding(0) var<uniform>");
      expect(source).toMatch(/@binding\(1\) var \w+: sampler/);
      expect(source).toMatch(/@binding\(2\) var \w+: texture_2d<f32>/);
    }
    expect(GTAO_NATIVE_APPLY_WGSL).toMatch(/@binding\(3\) var \w+: texture_2d<f32>/);
    expect(FXAA_NATIVE_INTERMEDIATE_WGSL).not.toContain("triangular_dither");
  });
});

describe("depth convention references", () => {
  for (const zeroToOne of [false, true]) for (const reversed of [false, true]) {
    for (const projectionKind of ["perspective", "orthographic"] as const) {
      it(`round-trips ${projectionKind} distances (${zeroToOne ? "zero-to-one" : "minus-one-to-one"}, ${reversed ? "reversed" : "standard"})`, () => {
        const { projection, inverse } = (projectionKind === "perspective" ? perspective : orthographic)(1, 11, reversed, zeroToOne);
        const mode = convention(reversed ? "reversed" : "standard", zeroToOne);
        for (const distance of [1, 2, 5, 11]) {
          const encoded = encodeViewDepth(distance, projection, mode);
          expect(encoded).toBeGreaterThanOrEqual(-1e-12);
          expect(encoded).toBeLessThanOrEqual(1 + 1e-12);
          expect(linearizeDepth(Math.min(1, Math.max(0, encoded)), inverse, mode)).toBeCloseTo(distance, 10);
          const actualClipZ = projection[10]! * -distance + projection[14]!;
          const actualClipW = projection[11]! * -distance + projection[15]!;
          expect(ndcFromViewDepth(inverse, 0.4, -0.2, distance)).toBeCloseTo(actualClipZ / actualClipW, 10);
        }
      });
    }
  }

  it("preserves signed orthographic distances and reserves the clear value for sky", () => {
    for (const zeroToOne of [false, true]) for (const reversed of [false, true]) {
      const { projection, inverse } = orthographic(-2, 3, reversed, zeroToOne);
      const mode = convention(reversed ? "reversed" : "standard", zeroToOne);
      for (const distance of [-2, -1, 0, 1, 2.5]) {
        const encoded = encodeViewDepth(distance, projection, mode);
        expect(linearizeDepth(encoded, inverse, mode)).toBeCloseTo(distance, 10);
        expect(reversed ? encoded <= 0 : encoded >= 1).toBe(false);
      }
      // In the absence of a coverage texture, the far plane and clear value
      // are identical. The shader deliberately treats this endpoint as sky.
      const farDepth = encodeViewDepth(3, projection, mode);
      expect(farDepth).toBeCloseTo(reversed ? 0 : 1, 12);
    }
    expect(DEPTH_LINEARIZE_GLSL).toContain("u_depthMode == 1 && depth <= 0.0");
    expect(DEPTH_LINEARIZE_GLSL).toContain("u_depthMode != 1 && depth >= 1.0");
    expect(DEPTH_LINEARIZE_GLSL).toContain(": viewDepth;");
    expect(DEPTH_LINEARIZE_GLSL).not.toContain("max(viewDepth, 0.0)");
    expect(CAMERA_VELOCITY_GLSL).not.toContain("linearDepth >= u_far * 0.999");
  });

  it("decodes log depth on asymmetric rays and supports an infinite far endpoint", () => {
    const { projection, inverse } = perspective(1, 11, false, false);
    inverse[12] = 0.2;
    inverse[13] = -0.1;
    const log = convention("logarithmic", false);
    const depth = encodeViewDepth(4, projection, log, { near: 1, far: 16 });
    expect(depth).toBeCloseTo(0.5, 12);
    const position = reconstructViewPosition(depth, 0.4, -0.2, inverse, log, { near: 1, far: 16 });
    expect(position[0]).toBeCloseTo(2.4, 12);
    expect(position[1]).toBeCloseTo(-1.2, 12);
    expect(position[2]).toBeCloseTo(-4, 12);
    const infiniteInverse = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, -0.5, 0, 0, -1, 0.5];
    expect(linearizeDepth(1, infiniteInverse, convention("standard", false))).toBe(Infinity);
    expect(() => encodeViewDepth(2, projection, log, { near: 1, far: Infinity })).toThrow(/finite/);
    for (const source of [DEPTH_LINEARIZE_GLSL, CAMERA_VELOCITY_GLSL]) {
      expect(source).toContain("u_invProjMatrix");
      expect(source).toContain("u_clipRangeZeroToOne");
      expect(source).toContain("u_depthMode");
      expect(source).toContain("AURA_SKY_DEPTH = 3e38");
      expect(source).toContain("exp(mix(log(u_near), log(u_far), depth))");
    }
    expect(CAMERA_VELOCITY_GLSL).toContain("auraLogNdcDepth");
    expect(DEPTH_MINMAX_HALF_GLSL).toContain("min(p + ivec2(1, 1), last)");
    expect(DEPTH_LINEARIZE_GLSL).toContain("gl_FragCoord.xy / u_outputSize");
    expect(DEPTH_LINEARIZE_GLSL).toContain("clamp(ivec2(uv * vec2(size)), ivec2(0), size - ivec2(1))");
  });
});

describe("offline shader validation", () => {
  it.runIf(process.env.A3D_REQUIRE_NAGA === "1")("requires naga when the source gate requests it", () => {
    expect(hasCommand("naga"), "naga is required for native post WGSL validation").toBe(true);
  });

  it.runIf(hasCommand("glslangValidator"))("validates the modified WebGL shader modules", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura-native-post-glsl-"));
    try {
      [FXAA_185_FRAGMENT_GLSL, GTAO_GLSL, DEPTH_LINEARIZE_GLSL, DEPTH_MINMAX_HALF_GLSL, CAMERA_VELOCITY_GLSL, VELOCITY_DILATE_GLSL].forEach((source, index) => {
        const file = join(dir, `${index}.frag`);
        writeFileSync(file, source);
        expect(() => execFileSync("glslangValidator", ["-S", "frag", file], { encoding: "utf8" })).not.toThrow();
      });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.runIf(hasCommand("naga"))("validates the native WebGPU modules with naga", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura-native-post-wgsl-"));
    try {
      [FXAA_185_FRAGMENT_WGSL, FXAA_NATIVE_INTERMEDIATE_WGSL, GTAO_WGSL, GTAO_NATIVE_INTERMEDIATE_WGSL, GTAO_NATIVE_APPLY_WGSL, SMAA_BLEND_WGSL].forEach((source, index) => {
        const file = join(dir, `${index}.wgsl`);
        writeFileSync(file, fullscreenModule(source));
        expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
      });
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
