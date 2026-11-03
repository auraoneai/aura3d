import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NativeLightmapBake } from "../../../packages/rendering/src/lighting/NativeLightBaking";
import { NativeLightProbeGrid } from "../../../packages/rendering/src/lighting/NativeLightProbeGrid";
import { VoxelIndirectLighting } from "../../../packages/rendering/src/lighting/VoxelIndirectLighting";
import { NATIVE_LIGHTMAP_GLSL } from "../../../packages/rendering/src/shaders/advanced-lighting/native-lightmap.glsl";
import { NATIVE_LIGHTMAP_WGSL } from "../../../packages/rendering/src/shaders/advanced-lighting/native-lightmap.wgsl";
import { NATIVE_PROBE_GLSL } from "../../../packages/rendering/src/shaders/advanced-lighting/native-probe.glsl";
import { NATIVE_PROBE_WGSL } from "../../../packages/rendering/src/shaders/advanced-lighting/native-probe.wgsl";
import { NATIVE_VOXEL_GLSL } from "../../../packages/rendering/src/shaders/advanced-lighting/native-voxel.glsl";
import { NATIVE_VOXEL_WGSL } from "../../../packages/rendering/src/shaders/advanced-lighting/native-voxel.wgsl";

// Evaluate the actual scalar SH expressions from each shader against the
// producer's independent CPU evaluation, rather than copying its constants.
function shaderBasis(source: string, language: "glsl" | "wgsl", normal: readonly number[]): number[] {
  const expressions = language === "glsl"
    ? Array.from(source.matchAll(/basis\[\d\]\s*=\s*([^;]+);/g), (match) => match[1]!)
    : source.match(/var basis = array<f32, 9>\(([\s\S]*?)\);/)?.[1]?.split(",").map((part) => part.trim()).filter(Boolean) ?? [];
  expect(expressions).toHaveLength(9);
  const length = Math.hypot(...normal);
  const n = { x: normal[0]! / length, y: normal[1]! / length, z: normal[2]! / length };
  return expressions.map((expression) => {
    // Only arithmetic and the normal's three components occur in these static
    // shader expressions; reject anything else before evaluating them.
    expect(expression).toMatch(/^[\d.eE+*()\-\sxyz n.]+$/);
    return Function("n", `return (${expression});`)(n) as number;
  });
}

function packedProbeSample(grid: NativeLightProbeGrid, point: readonly [number, number, number]): Float64Array {
  const { texture, dimensions, min, max } = grid.renderData();
  const data = texture.getMipLevel(0)!.data as Float32Array;
  const coordinate = point.map((p, axis) => (p - min[axis]!) / (max[axis]! - min[axis]!) * (dimensions[axis]! - 1));
  const lo = coordinate.map(Math.floor);
  const hi = lo.map((value, axis) => Math.min(value + 1, dimensions[axis]! - 1));
  const f = coordinate.map((value, axis) => value - lo[axis]!);
  const result = new Float64Array(27);
  for (let z = 0; z <= 1; z += 1) for (let y = 0; y <= 1; y += 1) for (let x = 0; x <= 1; x += 1) {
    const weight = (x ? f[0]! : 1 - f[0]!) * (y ? f[1]! : 1 - f[1]!) * (z ? f[2]! : 1 - f[2]!);
    const px = x ? hi[0]! : lo[0]!, py = y ? hi[1]! : lo[1]!, pz = z ? hi[2]! : lo[2]!;
    for (let k = 0; k < 9; k += 1) for (let channel = 0; channel < 3; channel += 1) {
      const texel = (py + pz * dimensions[1]) * texture.width + px * 9 + k;
      result[k * 3 + channel] += weight * data[texel * 4 + channel]!;
    }
  }
  return result;
}

describe("advanced lighting shader resource contracts", () => {
  it("matches the producer's directional SH9 evaluation from packed coefficients", () => {
    const grid = new NativeLightProbeGrid({ min: [0, -2, 0], max: [4, 2, 6], dimensions: [2, 1, 2] });
    try {
      for (let z = 0; z < 2; z += 1) for (let x = 0; x < 2; x += 1) {
        const coefficients = Float32Array.from({ length: 27 }, (_, index) => {
          if (index < 3) return 9 + x * 2 + z * 3 + index;
          return (index % 2 ? -1 : 1) * (index + 1) * (1 + x + z) / 60;
        });
        grid.setProbe(x, 0, z, coefficients);
      }
      const point = [1, 1, 4.5] as const;
      const coefficients = packedProbeSample(grid, point);
      const sampled = grid.sample(point)!;
      for (let index = 0; index < 27; index += 1) expect(coefficients[index]).toBeCloseTo(sampled[index]!, 5);
      for (const normal of [[1, 2, 3], [-2, 1, -3], [0, 1, 0], [0, 0, -1]]) {
        const expected = grid.evaluate(point, normal as [number, number, number])!;
        for (const [shader, language] of [[NATIVE_PROBE_GLSL, "glsl"], [NATIVE_PROBE_WGSL, "wgsl"]] as const) {
          const basis = shaderBasis(shader, language, normal);
          for (let channel = 0; channel < 3; channel += 1) {
            const actual = Math.max(0, basis.reduce((sum, value, k) => sum + value * coefficients[k * 3 + channel]!, 0));
            expect(actual).toBeCloseTo(expected[channel]!, 5);
          }
        }
      }
      expect(grid.evaluate([-0.01, 1, 1], [0, 1, 0])).toBeNull();
      expect(NATIVE_PROBE_GLSL).toContain("index.x * 9 + coefficient, index.y + index.z * dimensions.y");
      expect(NATIVE_PROBE_WGSL).toContain("index.x * 9 + coefficient, index.y + index.z * dimensions.y");
    } finally { grid.dispose(); }
  });

  it("preserves odd mip-cell centers and bounded partial-opacity cone composition", () => {
    const volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [3, 1, 1] }, quality: "low", resolution: [3, 1, 1] });
    try {
      volume.updateVoxel([0, 0, 0], { radiance: [2, 0, 0], opacity: 0.5 });
      volume.updateVoxel([1, 0, 0], { radiance: [4, 0, 0], opacity: 1 });
      volume.updateVoxel([2, 0, 0], { radiance: [8, 0, 0], opacity: 0.25 });
      const { texture, levels } = volume.renderData();
      expect(levels.map((level) => [level.dimensions, level.scale, level.offset])).toEqual([
        [[3, 1, 1], 1, 0], [[2, 1, 1], 2, 3], [[1, 1, 1], 4, 5]
      ]);
      const rgba = texture.getMipLevel(0)!.data as Float32Array;
      expect(rgba[3 * 4]).toBeCloseTo(2.5); // first two base cells, premultiplied
      expect(rgba[4 * 4]).toBeCloseTo(2); // odd last base cell
      expect(rgba[5 * 4]).toBeCloseTo(7 / 3); // full-volume mean
      for (const source of [NATIVE_VOXEL_GLSL, NATIVE_VOXEL_WGSL]) {
        const centerExpression = source.match(/return \(([^;]+)\) \* 0\.5;/)?.[1];
        expect(centerExpression).toBeDefined();
        const jsExpression = centerExpression!.replace(/\b(?:float|f32)\(/g, "Number(").replace(/\bmin\(/g, "Math.min(");
        expect(jsExpression).toMatch(/^[\w.+*(),\s]+$/);
        const center = Function("index", "scale", "resolution", `return (${jsExpression}) * 0.5;`) as (index: number, scale: number, resolution: number) => number;
        expect(center(0, 2, 3)).toBe(1);
        expect(center(1, 2, 3)).toBe(2.5);
        expect(center(0, 4, 3)).toBe(1.5);
        const diameterExpression = source.match(/(?:float|let) diameter = ([^;]+);/)?.[1];
        expect(diameterExpression).toBeDefined();
        expect(diameterExpression).toMatch(/^[\w.+*(),\s/]+$/);
        const diameter = Function("base", "distance", "halfAngle", "max", "tan", `return ${diameterExpression};`) as
          (base: number, distance: number, halfAngle: number, max: typeof Math.max, tan: typeof Math.tan) => number;
        expect(diameter(1, 0.5, Math.PI / 4, Math.max, Math.tan)).toBeCloseTo(1);
        expect(diameter(1, 1.5, Math.PI / 4, Math.max, Math.tan)).toBeCloseTo(3);
        expect(source).toMatch(/step\s*<\s*128/);
        expect(source).toMatch(/cone\s*<\s*9/);
        expect(source).toMatch(/transmittance\s*\*=\s*1\.0\s*-\s*clamp\(sampleValue\.a/);
      }
      // At x=1 the base sample is (2.5, 0.75). At x=2 the
      // level-1/level-2 samples are 13/6 and 7/3, with lod log2(3).
      const outgoing = 2.5 + 0.25 * (13 / 6 + (Math.log2(3) - 1) / 6);
      expect(volume.sampleIndirect([0.5, 0.5, 0.5], [1, 0, 0])[0]).toBeCloseTo(outgoing, 5);
      expect(outgoing * Math.PI).toBeCloseTo(9.632249, 5);
      expect(volume.traceCone({ origin: [-1, 2, 0.5], direction: [1, 0, 0] }).radiance).toEqual([0, 0, 0]);
    } finally { volume.dispose(); }
  });

  it("preserves constant unit-albedo radiance across every bounded hemisphere tier", () => {
    for (const [quality, maxSteps, cones] of [["low", 32, 1], ["medium", 64, 5], ["high", 128, 9]] as const) {
      const volume = new VoxelIndirectLighting({ bounds: { min: [0, 0, 0], max: [3, 3, 3] }, quality, resolution: 3 });
      try {
        for (let z = 0; z < 3; z += 1) for (let y = 0; y < 3; y += 1) for (let x = 0; x < 3; x += 1) {
          volume.updateVoxel([x, y, z], { radiance: [3, 2, 1], opacity: 1 });
        }
        const render = volume.renderData();
        expect([render.maxConeSteps, render.hemisphereCones]).toEqual([maxSteps, cones]);
        for (const normal of [[1, 0, 0], [1, 2, 3], [0, 1, 0]] as const) {
          const outgoing = volume.sampleIndirect([1.5, 1.5, 1.5], normal);
          for (let channel = 0; channel < 3; channel += 1) {
            expect(outgoing[channel]).toBeCloseTo(3 - channel, 5);
            expect(outgoing[channel]! * Math.PI).toBeCloseTo((3 - channel) * Math.PI, 5);
          }
        }
      } finally { volume.dispose(); }
    }
  });

  it("uses coverage once at lightmap chart edges and preserves the baked UV channel", () => {
    const bake = new NativeLightmapBake({
      atlas: { width: 8, height: 8, uvChannel: 1, gutter: 0, texelDensity: 4,
        charts: [{ x: 1, y: 1, width: 4, height: 4, triangles: [0, 1] }] },
      mesh: { positions: [0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 1, 0],
        uvs: [1 / 8, 1 / 8, 5 / 8, 1 / 8, 5 / 8, 5 / 8, 1 / 8, 5 / 8], indices: [0, 1, 2, 0, 2, 3] },
      lights: [], indirect: () => [2, 4, 8]
    });
    while (bake.status !== "complete") bake.step(16);
    const { texture, uvChannel } = bake.createRenderData();
    try {
      expect(uvChannel).toBe(1);
      const rgba = texture.getMipLevel(0)!.data as Float32Array;
      const texel = (x: number, y: number, channel: number) => rgba[(y * 8 + x) * 4 + channel]!;
      // Bottom-left UV (5/8, 2.5/8) sits halfway between a covered
      // chart texel and an uncovered texel, with no y interpolation.
      const covered = Array.from({ length: 4 }, (_, channel) => (texel(4, 2, channel) + texel(5, 2, channel)) / 2);
      expect(covered).toEqual([1, 2, 4, 0.5]);
      const local = covered.slice(0, 3).map((value) => value / covered[3]!);
      expect(local).toEqual([2, 4, 8]);
      expect(local.map((value) => 10 * (1 - covered[3]!) + value * covered[3]!)).toEqual([6, 7, 9]);
      expect(NATIVE_LIGHTMAP_GLSL).toContain("covered.rgb / covered.a");
      expect(NATIVE_LIGHTMAP_WGSL).toContain("covered.rgb / covered.a");
      expect(NATIVE_LIGHTMAP_GLSL).toContain("greaterThan(uv, vec2(1.0))");
      expect(NATIVE_LIGHTMAP_WGSL).toContain("uv > vec2f(1.0)");
    } finally { texture.dispose(); }
  });

  it("uses exact integer texture loads and no float-filtering requirement", () => {
    for (const shader of [NATIVE_PROBE_GLSL, NATIVE_VOXEL_GLSL, NATIVE_LIGHTMAP_GLSL]) {
      expect(shader).toContain("texelFetch(");
      expect(shader).not.toMatch(/\btexture(?:Lod)?\s*\(/);
    }
    for (const shader of [NATIVE_PROBE_WGSL, NATIVE_VOXEL_WGSL, NATIVE_LIGHTMAP_WGSL]) {
      expect(shader).toContain("textureLoad(");
      expect(shader).not.toMatch(/\btextureSample/);
    }
  });
});

const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;
const hasNaga = spawnSync("naga", ["--version"], { stdio: "ignore" }).status === 0;

describe("advanced lighting standalone shader compilation", () => {
  it.runIf(process.env.A3D_REQUIRE_NAGA === "1")("requires Naga when requested by the source gate", () => {
    expect(hasNaga, "Naga is required for WGSL validation").toBe(true);
  });

  it.runIf(hasGlslang)("compiles GLSL helpers together as a fragment shader", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-advanced-light-glsl-"));
    try {
      const file = join(dir, "advanced.frag");
      writeFileSync(file, `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D source;
out vec4 color;
${NATIVE_PROBE_GLSL}
${NATIVE_VOXEL_GLSL}
${NATIVE_LIGHTMAP_GLSL}
void main() {
  vec4 levels[7];
  for (int i = 0; i < 7; i += 1) levels[i] = vec4(1.0, 1.0, 1.0, 0.0);
  color = a3dNativeProbeIrradiance(source, vec3(0.5), vec3(0.0, 1.0, 0.0), vec3(0.0), vec3(1.0), ivec3(1));
  color += a3dNativeVoxelIrradiance(source, vec3(0.5), vec3(0.0, 1.0, 0.0), vec3(0.0), vec3(1.0), ivec3(1), levels, 1, 32, 1, 1.0);
  color += a3dNativeLightmapIrradiance(source, vec2(0.5));
}`);
      const result = spawnSync("glslangValidator", ["-S", "frag", file], { encoding: "utf8" });
      expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it.runIf(hasNaga)("validates WGSL helpers together with Naga", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-advanced-light-wgsl-"));
    try {
      const file = join(dir, "advanced.wgsl");
      writeFileSync(file, `@group(0) @binding(0) var source: texture_2d<f32>;
${NATIVE_PROBE_WGSL}
${NATIVE_VOXEL_WGSL}
${NATIVE_LIGHTMAP_WGSL}
@fragment fn main() -> @location(0) vec4f {
  var levels: array<vec4f, 7>;
  for (var i = 0; i < 7; i += 1) { levels[i] = vec4f(1.0, 1.0, 1.0, 0.0); }
  var color = a3dNativeProbeIrradiance(source, vec3f(0.5), vec3f(0.0, 1.0, 0.0), vec3f(0.0), vec3f(1.0), vec3i(1));
  color += a3dNativeVoxelIrradiance(source, vec3f(0.5), vec3f(0.0, 1.0, 0.0), vec3f(0.0), vec3f(1.0), vec3i(1), levels, 1, 32, 1, 1.0);
  return color + a3dNativeLightmapIrradiance(source, vec2f(0.5));
}`);
      expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
