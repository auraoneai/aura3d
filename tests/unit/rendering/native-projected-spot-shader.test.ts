import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateLightingRigLightAt, type LightingRigLightDescriptor } from "../../../packages/rendering/src/LightingRig";
import { PROJECTED_SPOT_GLSL } from "../../../packages/rendering/src/lighting/ProjectedSpotShader";

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
type ShaderUv = { readonly valid: boolean; readonly uv: { readonly x: number; readonly y: number } };

/** Extract the actual scalar GLSL body, including nested blocks if introduced. */
function bodyOf(name: string): string {
  const signature = PROJECTED_SPOT_GLSL.indexOf(`${name}(`);
  if (signature < 0) throw new Error(`Missing GLSL helper ${name}`);
  const open = PROJECTED_SPOT_GLSL.indexOf("{", signature);
  let depth = 1;
  let end = open + 1;
  for (; end < PROJECTED_SPOT_GLSL.length && depth > 0; end += 1) {
    if (PROJECTED_SPOT_GLSL[end] === "{") depth += 1;
    if (PROJECTED_SPOT_GLSL[end] === "}") depth -= 1;
  }
  if (depth !== 0) throw new Error(`Unclosed GLSL helper ${name}`);
  return PROJECTED_SPOT_GLSL.slice(open + 1, end - 1);
}

// Evaluate the helper's actual scalar expressions in JS and compare them to
// Aura's separate LightingRig CPU reference. This is not GPU execution and
// does not claim f32 precision or rendered-pixel validation.
const evaluateShader = new Function("lightToPoint", "lightForward", "spotAngle", "offset", "scale", "rotation", `
  const { abs, max, sqrt, tan, sin, cos } = Math;
  const isnan = Number.isNaN;
  const isinf = value => !Number.isFinite(value) && !Number.isNaN(value);
  const vec2 = (x, y = x) => ({ x, y });
  const a3dProjectedSpotFinite = value => { ${bodyOf("a3dProjectedSpotFinite")} };
  let uv;
  const valid = (() => { ${bodyOf("a3dProjectedSpotUV").replace(/\bfloat\s+/g, "let ")} })();
  return { valid, uv };
`) as (
  point: { x: number; y: number; z: number }, forward: { x: number; y: number; z: number },
  angle: number, offset: { x: number; y: number }, scale: { x: number; y: number }, rotation: number
) => ShaderUv;

function projected(point: Vec3, forward: Vec3 = [0, 0, -1], angle = Math.PI / 4,
                   offset: Vec2 = [0, 0], scale: Vec2 = [1, 1], rotation = 0): ShaderUv {
  return evaluateShader(
    { x: point[0], y: point[1], z: point[2] }, { x: forward[0], y: forward[1], z: forward[2] },
    angle, { x: offset[0], y: offset[1] }, { x: scale[0], y: scale[1] }, rotation
  );
}

function expectUv(result: ShaderUv, expected: Vec2, precision = 7): void {
  expect(result.valid).toBe(true);
  expect(result.uv.x).toBeCloseTo(expected[0], precision);
  expect(result.uv.y).toBeCloseTo(expected[1], precision);
}

const image = { kind: "aura-asset-ref", type: "texture", id: "spot-pattern", url: "/pattern.png" } as const;
const light: LightingRigLightDescriptor = {
  id: "spot", kind: "spot", role: "accent", color: [0.8, 0.6, 0.4], intensity: 20,
  position: [0, 0, 0], direction: [0, 0, -1], range: 10, spotAngle: Math.PI / 4,
  penumbra: 0, width: 0, height: 0, castsShadow: true, claimBoundary: "reference",
  projectedImage: { texture: image }
};

describe("projected spotlight GLSL source contract", () => {
  it("projects the center, horizontal and vertical axes using a top-left image origin", () => {
    expectUv(projected([0, 0, -2]), [0.5, 0.5]);
    expectUv(projected([1, 0, -2]), [0.75, 0.5]);
    expectUv(projected([-1, 0, -2]), [0.25, 0.5]);
    expectUv(projected([0, 1, -2]), [0.5, 0.25]);
    expectUv(projected([0, -1, -2]), [0.5, 0.75]);
    // At either vertical pole the reference axis switches to +Z.
    expectUv(projected([1, 2, 0], [0, 3, 0]), [0.75, 0.5]);
    expectUv(projected([0, 2, 1], [0, 3, 0]), [0.5, 0.25]);
    expectUv(projected([-1, -2, 0], [0, -3, 0]), [0.75, 0.5]);
  });

  it("rotates around the center before signed nonuniform scale and offset", () => {
    const uv = projected([0.4, 0.3, -2], [0, 0, -1], Math.PI / 4, [-0.1, 0.2], [2, 0.5], Math.PI / 2);
    expectUv(uv, [0.55, 0.75]);
    expectUv(projected([1, 0, -2], [0, 0, -1], Math.PI / 4, [0, 0], [-1, 1]), [0.25, 0.5]);
  });

  it("matches the separate Aura CPU reference for varied directions and transforms", () => {
    const cases: readonly {
      readonly position: Vec3; readonly point: Vec3; readonly direction: Vec3;
      readonly offset: Vec2; readonly scale: Vec2; readonly rotation: number; readonly angle: number;
    }[] = [
      { position: [0, 0, 0], point: [1, 0, -2], direction: [0, 0, -1], offset: [0, 0], scale: [1, 1], rotation: 0, angle: Math.PI / 4 },
      { position: [3, 2, -1], point: [3.4, 2.3, -3], direction: [0, 0, -2], offset: [-0.1, 0.2], scale: [2, 0.5], rotation: Math.PI / 2, angle: Math.PI / 4 },
      { position: [1, 1, 1], point: [2, 3, 1], direction: [0, 1, 0], offset: [0.05, -0.1], scale: [-0.6, 0.8], rotation: -0.7, angle: 0.9 },
      { position: [0, 0, 0], point: [0.1, 0.2, -3], direction: [0.1, 0.2, -1], offset: [0.02, 0.01], scale: [0.9, 1.2], rotation: 0.3, angle: 0.8 }
    ];
    for (const testCase of cases) {
      const candidate: LightingRigLightDescriptor = {
        ...light, position: testCase.position, direction: testCase.direction, spotAngle: testCase.angle,
        projectedImage: { texture: image, offset: testCase.offset, scale: testCase.scale, rotation: testCase.rotation }
      };
      const cpu = evaluateLightingRigLightAt(candidate, testCase.point, { sampleProjection: (u, v) => [u, v, 0.25], shadowVisibility: 0.4 });
      const delta: Vec3 = [testCase.point[0] - testCase.position[0], testCase.point[1] - testCase.position[1], testCase.point[2] - testCase.position[2]];
      const result = projected(delta, testCase.direction, testCase.angle, testCase.offset, testCase.scale, testCase.rotation);
      expect(cpu.uv).not.toBeNull();
      expectUv(result, cpu.uv!, 4); // CPU reference rounds normalized basis components to five decimals.
      expect(cpu.rgb[0]).toBeCloseTo(20 * 0.8 * cpu.uv![0] * 0.4);
      expect(cpu.rgb[1]).toBeCloseTo(20 * 0.6 * cpu.uv![1] * 0.4);
      expect(cpu.rgb[2]).toBeCloseTo(20 * 0.4 * 0.25 * 0.4);
    }
  });

  it("includes exact image borders and rejects behind, out-of-bounds and malformed inputs", () => {
    expectUv(projected([0, 0, -1], [0, 0, -1], Math.PI / 4, [-0.5, -0.5]), [0, 0]);
    expectUv(projected([0, 0, -1], [0, 0, -1], Math.PI / 4, [0.5, 0.5]), [1, 1]);
    expect(projected([0, 0, -1], [0, 0, -1], Math.PI / 4, [0.5001, 0]).valid).toBe(false);
    expect(projected([4, 0, -1]).valid).toBe(false);
    expect(projected([0, 0, 1]).valid).toBe(false);
    expect(projected([1, 0, 0]).valid).toBe(false);
    expect(projected([0, 0, 0]).valid).toBe(false);
    expect(projected([0, 0, -1], [0, 0, 0]).valid).toBe(false);
    for (const angle of [0, -1, Math.PI / 2, Math.PI, NaN, Infinity]) expect(projected([0, 0, -1], [0, 0, -1], angle).valid).toBe(false);
    expect(projected([0, 0, -1], [0, 0, -1], Math.PI / 4, [0, 0], [0, 1]).valid).toBe(false);
    expect(projected([0, 0, -1], [0, 0, -1], Math.PI / 4, [NaN, 0]).valid).toBe(false);
    expect(projected([Infinity, 0, -1]).valid).toBe(false);
  });

  it("normalizes large and small finite direction magnitudes before projection", () => {
    for (const magnitude of [1e-30, 1, 1e30]) {
      expectUv(projected([magnitude, 0, -2 * magnitude], [0, 0, -magnitude]), [0.75, 0.5]);
    }
  });

  it("samples only the admitted texture's linear RGB at level zero and returns black outside", () => {
    const imageBody = bodyOf("a3dProjectedSpotImage");
    expect(imageBody).toMatch(/if\s*\(!a3dProjectedSpotUV\([\s\S]+\)\)\s*return vec3\(0\.0\)/);
    expect(imageBody).toContain("textureLod(source, uv, 0.0).rgb");
    expect(imageBody).not.toMatch(/\.a\b|\bpow\s*\(|\btexture\s*\(/);
    expect(PROJECTED_SPOT_GLSL).not.toMatch(/\buniform\s/);
  });
});

const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;

describe("standalone projected spotlight shader compilation", () => {
  it.runIf(hasGlslang)("links the helper into a GLSL ES 3.00 fragment program", () => {
    const directory = mkdtempSync(join(tmpdir(), "aura-projected-spot-"));
    try {
      const vertex = join(directory, "source.vert"), fragment = join(directory, "source.frag");
      writeFileSync(vertex, `#version 300 es
precision highp float;
void main() { gl_Position = vec4(0.0, 0.0, 0.0, 1.0); }
`);
      writeFileSync(fragment, `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D u_projectedSpotMap;
layout(location = 0) out vec4 outColor;
${PROJECTED_SPOT_GLSL}
void main() {
  vec3 pattern = a3dProjectedSpotImage(u_projectedSpotMap, vec3(0.0, 0.0, -2.0), vec3(0.0, 0.0, -1.0), 0.7, vec2(0.0), vec2(1.0), 0.0);
  outColor = vec4(pattern, 1.0);
}
`);
      const result = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
      expect(result).toContain("u_projectedSpotMap");
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
