import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PhotometricProfileAtlas } from "../../../packages/rendering/src/lighting/PhotometricProfileAtlas";
import { PHOTOMETRIC_PROFILE_GLSL } from "../../../packages/rendering/src/lighting/shaders/PhotometricProfile.glsl";
import { PHOTOMETRIC_PROFILE_WGSL } from "../../../packages/rendering/src/lighting/shaders/PhotometricProfile.wgsl";

type Vec3 = readonly [number, number, number];

const fullCircle = {
  verticalAngles: [0, 90, 180],
  horizontalAngles: [0, 90, 180, 270, 360],
  // Each horizontal row varies along vertical angles; the 0° and 360° rows
  // match, so the authored distribution is continuous across the seam.
  candela: [10, 20, 30, 10, 40, 30, 10, 100, 30, 10, 60, 30, 10, 20, 30],
  symmetry: "none" as const,
};

const quadrant = {
  verticalAngles: [0, 60, 180],
  horizontalAngles: [0, 45, 90],
  candela: [120, 60, 0, 120, 100, 0, 120, 140, 0],
  symmetry: "quadrant" as const,
};

const bilateral = {
  verticalAngles: [0, 60, 180],
  horizontalAngles: [0, 45, 180],
  candela: [120, 60, 0, 120, 100, 0, 120, 20, 0],
  symmetry: "bilateral" as const,
};

/** Independent coordinate reference for the documented light-space basis. */
function lightAngles(lightToPoint: Vec3, lightForward: Vec3): readonly [number, number] | null {
  const length = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);
  const normalize = (v: Vec3): Vec3 => {
    const magnitude = length(v);
    return [v[0] / magnitude, v[1] / magnitude, v[2] / magnitude];
  };
  const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a: Vec3, b: Vec3): Vec3 => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
  if (length(lightToPoint) === 0 || length(lightForward) === 0) return null;
  const forward = normalize(lightForward);
  const reference: Vec3 = Math.abs(forward[1]) < 0.99 ? [0, 1, 0] : [0, 0, 1];
  const right = normalize(cross(forward, reference));
  const up = normalize(cross(right, forward));
  const direction = normalize(lightToPoint);
  const vertical = Math.acos(Math.max(-1, Math.min(1, dot(direction, forward)))) * 180 / Math.PI;
  const x = dot(direction, right), y = dot(direction, up);
  const azimuth = x === 0 && y === 0 ? 0 : Math.atan2(y, x) * 180 / Math.PI;
  return [vertical, azimuth];
}

/** CPU reference only; this does not execute or emulate a GPU shader. */
function sourceReference(atlas: PhotometricProfileAtlas, id: string, delta: Vec3, forward: Vec3): number {
  const angles = lightAngles(delta, forward);
  return angles === null ? 0 : atlas.sample(id, angles[0], angles[1]);
}

function atLinearIndex(data: Float32Array, width: number, index: number): number {
  const x = index % width;
  const y = Math.floor(index / width);
  return data[y * width + x]!;
}

describe("photometric shader source and atlas handoff", () => {
  it("exports both angular and light-direction helpers using integer texture fetches", () => {
    for (const source of [PHOTOMETRIC_PROFILE_GLSL, PHOTOMETRIC_PROFILE_WGSL]) {
      expect(source).toContain("a3dPhotometricCandela");
      expect(source).toContain("a3dPhotometricSampleAngles");
      expect(source.match(/\ba3dPhotometricSampleAngles\s*\(/g)?.length).toBeGreaterThanOrEqual(2);
      expect(source).toMatch(/\b12u?\b/); // at most 4096 ordered angular samples
      expect(source).toMatch(/\b(?:acos|atan|atan2)\s*\(/);
    }
    expect(PHOTOMETRIC_PROFILE_GLSL).toMatch(/\btexelFetch\s*\(/);
    expect(PHOTOMETRIC_PROFILE_GLSL).toMatch(/\btextureSize\s*\(/);
    expect(PHOTOMETRIC_PROFILE_WGSL).toMatch(/\btextureLoad\s*\(/);
    expect(PHOTOMETRIC_PROFILE_WGSL).toMatch(/\btextureDimensions\s*\(/);
  });

  it("provides fresh shader arguments with the exact nonuniform table offsets", () => {
    const atlas = new PhotometricProfileAtlas([
      { id: "leading", profile: { verticalAngles: [0, 90, 180], horizontalAngles: [0], candela: [12, 6, 0], symmetry: "rotational" } },
      { id: "profile", profile: fullCircle, scale: 2, rotation: Math.PI / 2 },
    ], { maxTextureDimension: 8 });
    try {
      const entry = atlas.entries[1]!;
      const args = atlas.shaderArguments("profile");
      expect(Array.from(args.offsetsAndVerticalCount)).toEqual([
        entry.verticalOffset, entry.horizontalOffset, entry.candelaOffset, 3,
      ]);
      expect(Array.from(args.horizontalCountAndSymmetry)).toEqual([5, 3]);
      expect(args.scaleRotation[0]).toBe(2);
      expect(args.scaleRotation[1]).toBe(Math.fround(Math.PI / 2));

      const data = atlas.texture.data as Float32Array;
      const width = atlas.texture.width;
      // This table crosses physical texture rows; offsets are scalar texels,
      // not byte offsets or horizontal row numbers.
      expect(Math.floor(entry.candelaOffset / width)).not.toBe(Math.floor((entry.candelaOffset + 14) / width));
      expect([0, 1, 2].map((i) => atLinearIndex(data, width, entry.verticalOffset + i))).toEqual([0, 90, 180]);
      expect([0, 1, 2, 3, 4].map((i) => atLinearIndex(data, width, entry.horizontalOffset + i))).toEqual([0, 90, 180, 270, 360]);
      expect([0, 1, 2, 3, 4].map((row) => atLinearIndex(data, width, entry.candelaOffset + row * 3 + 1))).toEqual([20, 40, 100, 60, 20]);

      // Uniform upload arrays belong to the caller, not to the atlas.
      args.offsetsAndVerticalCount[0] = -1;
      args.horizontalCountAndSymmetry[1] = -1;
      args.scaleRotation[0] = -1;
      const fresh = atlas.shaderArguments("profile");
      expect(fresh.offsetsAndVerticalCount[0]).toBe(entry.verticalOffset);
      expect(fresh.horizontalCountAndSymmetry[1]).toBe(3);
      expect(fresh.scaleRotation[0]).toBe(2);
    } finally {
      atlas.dispose();
    }
  });

  it("has independent axis and rotation expectations for a two-dimensional profile", () => {
    const atlas = new PhotometricProfileAtlas([
      { id: "base", profile: fullCircle },
      { id: "turned", profile: fullCircle, rotation: Math.PI / 2, scale: 2 },
    ]);
    const forward: Vec3 = [0, 0, -1];
    try {
      // Looking along -Z makes +X local right and +Y local up.
      expect(sourceReference(atlas, "base", [1, 0, 0], forward)).toBeCloseTo(20);
      expect(sourceReference(atlas, "base", [0, 1, 0], forward)).toBeCloseTo(40);
      expect(sourceReference(atlas, "base", [-1, 0, 0], forward)).toBeCloseTo(100);
      expect(sourceReference(atlas, "base", [0, -1, 0], forward)).toBeCloseTo(60);
      expect(sourceReference(atlas, "turned", [0, 1, 0], forward)).toBeCloseTo(40);
      expect(sourceReference(atlas, "turned", [1, 0, 0], forward)).toBeCloseTo(120);
      // Forward +Y chooses +Z as the fallback reference, yielding +X right
      // and +Z up. Scaling a vector does not change its angle.
      expect(sourceReference(atlas, "base", [5, 0, 0], [0, 3, 0])).toBeCloseTo(20);
      expect(sourceReference(atlas, "base", [0, 0, 9], [0, 3, 0])).toBeCloseTo(40);
    } finally {
      atlas.dispose();
    }
  });

  it("has independent nonuniform, fold, pole and zero-vector expectations", () => {
    const atlas = new PhotometricProfileAtlas([
      { id: "quarter", profile: quadrant },
      { id: "half", profile: bilateral },
      { id: "full", profile: fullCircle },
    ]);
    try {
      const forward: Vec3 = [0, 0, -1];
      // 45° from forward, 45° in azimuth: the quadrant row at 45°
      // interpolates 120→100 cd by three quarters of the 0°→60° span.
      expect(sourceReference(atlas, "quarter", [0.5, 0.5, -Math.SQRT1_2], forward)).toBeCloseTo(105);
      expect(atlas.sample("half", 60, 112.5)).toBeCloseTo(60);
      expect(atlas.sample("half", 60, 247.5)).toBeCloseTo(60);
      expect(atlas.sample("full", 90, -45)).toBeCloseTo(40);
      expect(atlas.sample("full", 90, 315)).toBeCloseTo(40);
      expect(sourceReference(atlas, "full", [0, 0, -2], forward)).toBeCloseTo(10);
      expect(sourceReference(atlas, "full", [0, 2, 0], [0, 4, 0])).toBeCloseTo(10);
      expect(sourceReference(atlas, "full", [0, 0, 0], forward)).toBe(0);
      expect(sourceReference(atlas, "full", [1, 0, 0], [0, 0, 0])).toBe(0);
    } finally {
      atlas.dispose();
    }
  });
});

const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;
const hasNaga = spawnSync("naga", ["--version"], { stdio: "ignore" }).status === 0;

describe("standalone photometric shader compilation", () => {
  it.runIf(hasGlslang)("links the real GLSL helper in a synthetic fragment program", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-photometric-glsl-"));
    try {
      const vertex = join(directory, "source.vert"), fragment = join(directory, "source.frag");
      writeFileSync(vertex, `#version 300 es
precision highp float;
void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }
`);
      writeFileSync(fragment, `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_profile;
layout(location = 0) out vec4 outColor;
${PHOTOMETRIC_PROFILE_GLSL}
void main() {
  float direct = a3dPhotometricCandela(u_profile, ivec4(0, 4, 5, 4), ivec2(1, 0), vec2(1.0, 0.0), vec3(0.0, 0.0, -1.0), vec3(0.0, 0.0, -1.0));
  float angular = a3dPhotometricSampleAngles(u_profile, ivec4(0, 4, 5, 4), ivec2(1, 0), vec2(1.0, 0.0), 30.0, 45.0);
  outColor = vec4(direct, angular, 0.0, 1.0);
}
`);
      const linked = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
      expect(linked).toContain("u_profile");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  // Optional source-only WGSL validation; a skipped test is not proof that the
  // helper compiles or produces correct results on any WebGPU implementation.
  it.runIf(hasNaga)("validates the real WGSL helper in a synthetic fragment program", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-photometric-wgsl-"));
    try {
      const file = join(directory, "source.wgsl");
      writeFileSync(file, `${PHOTOMETRIC_PROFILE_WGSL}
@group(0) @binding(0) var profile: texture_2d<f32>;
@fragment fn fragment_main() -> @location(0) vec4<f32> {
  let direct = a3dPhotometricCandela(profile, vec4<i32>(0, 4, 5, 4), vec2<i32>(1, 0), vec2<f32>(1.0, 0.0), vec3<f32>(0.0, 0.0, -1.0), vec3<f32>(0.0, 0.0, -1.0));
  let angular = a3dPhotometricSampleAngles(profile, vec4<i32>(0, 4, 5, 4), vec2<i32>(1, 0), vec2<f32>(1.0, 0.0), 30.0, 45.0);
  return vec4<f32>(direct, angular, 0.0, 1.0);
}
`);
      expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
