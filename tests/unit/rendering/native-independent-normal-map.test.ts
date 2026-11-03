/**
 * Independent geometry contract for derivative normal mapping. The numerical
 * oracle below is ordinary TypeScript: it does not execute GLSL or emulate GPU
 * derivatives. The optional compiler tests separately check generated GLSL.
 */
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { normalizeProgramFeatures, PROGRAM_CLIPPING_FEATURE } from "../../../packages/rendering/src/program/ProgramFeatures";
import { NORMAL_CHUNK_GLSL } from "../../../packages/rendering/src/program/chunks/normal.glsl";

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
type NormalMapInput = {
  readonly positionDx: Vec3;
  readonly positionDy: Vec3;
  readonly uvDx: Vec2;
  readonly uvDy: Vec2;
  /** Supplied in world space and already oriented for the visible face. */
  readonly normal: Vec3;
  /** Linear RGB in the normal texture's [0, 1] range. */
  readonly texel: Vec3;
  readonly normalScale: number;
};

const X: Vec3 = [1, 0, 0];
const Y: Vec3 = [0, 1, 0];
const Z: Vec3 = [0, 0, 1];
const NEUTRAL: Vec3 = [0.5, 0.5, 1];
const TANGENT_X: Vec3 = [1, 0.5, 0.5];
const TANGENT_Y: Vec3 = [0.5, 1, 0.5];
const RELATIVE_DEGENERACY = 1e-6;

const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const multiply = (v: Vec3, scalar: number): Vec3 => [v[0] * scalar, v[1] * scalar, v[2] * scalar];
const subtract = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const length = (v: Vec3): number => Math.hypot(v[0], v[1], v[2]);

function unit(v: Vec3): Vec3 | undefined {
  const magnitude = length(v);
  return Number.isFinite(magnitude) && magnitude > 0 ? multiply(v, 1 / magnitude) : undefined;
}

/**
 * Solve the UV Jacobian for increasing-U and increasing-V surface directions.
 * T and B follow those world-space derivatives on either face; the supplied N
 * supplies the front/back orientation. Handedness is recovered from Braw, not
 * assumed positive. Undefined frames and decoded normals return the face N;
 * an undefined geometric N returns +Z. The relative condition avoids treating
 * uniformly tiny but orthogonal UV derivatives as a singular parameterization.
 */
function normalFromDerivatives(input: NormalMapInput): Vec3 {
  const n = unit(input.normal);
  if (!n) return Z;
  const { positionDx: px, positionDy: py, uvDx: ux, uvDy: uy } = input;
  // Scale each derivative row independently before assessing its direction.
  // A single common magnitude loses a valid, much smaller orthogonal row.
  const uxScale = Math.max(Math.abs(ux[0]), Math.abs(ux[1]));
  const uyScale = Math.max(Math.abs(uy[0]), Math.abs(uy[1]));
  const positionMagnitude = length(px) * length(py);
  if (!Number.isFinite(uxScale) || !Number.isFinite(uyScale) || !Number.isFinite(positionMagnitude) ||
      uxScale === 0 || uyScale === 0 || positionMagnitude === 0 ||
      length(cross(px, py)) <= RELATIVE_DEGENERACY * positionMagnitude) return n;

  const xDirection: Vec2 = [ux[0] / uxScale, ux[1] / uxScale];
  const yDirection: Vec2 = [uy[0] / uyScale, uy[1] / uyScale];
  const relativeArea = xDirection[0] * yDirection[1] - xDirection[1] * yDirection[0];
  const relativeMagnitude = Math.hypot(...xDirection) * Math.hypot(...yDirection);
  if (Math.abs(relativeArea) <= RELATIVE_DEGENERACY * relativeMagnitude) return n;

  // The positive common denominator only changes magnitude. Keep its sign so
  // mirrored UVs retain their orientation, without multiplying extreme rows.
  const sharedScale = Math.max(uxScale, uyScale);
  const weightedX: Vec2 = [xDirection[0] * (uxScale / sharedScale), xDirection[1] * (uxScale / sharedScale)];
  const weightedY: Vec2 = [yDirection[0] * (uyScale / sharedScale), yDirection[1] * (uyScale / sharedScale)];
  const determinantSign = relativeArea < 0 ? -1 : 1;
  const rawT = multiply(subtract(multiply(px, weightedY[1]), multiply(py, weightedX[1])), determinantSign);
  const rawB = multiply(subtract(multiply(py, weightedX[0]), multiply(px, weightedY[0])), determinantSign);
  const projectedT = subtract(rawT, multiply(n, dot(n, rawT)));
  if (length(projectedT) <= RELATIVE_DEGENERACY * length(rawT)) return n;
  const t = unit(projectedT);
  if (!t) return n;
  const perpendicular = cross(n, t);
  const orientation = dot(perpendicular, rawB);
  if (!Number.isFinite(orientation) || Math.abs(orientation) <= RELATIVE_DEGENERACY * length(rawB)) return n;
  const b = multiply(perpendicular, orientation < 0 ? -1 : 1);

  const tangentX = (2 * input.texel[0] - 1) * input.normalScale;
  const tangentY = (2 * input.texel[1] - 1) * input.normalScale;
  const tangentZ = 2 * input.texel[2] - 1;
  const mapped: Vec3 = [
    t[0] * tangentX + b[0] * tangentY + n[0] * tangentZ,
    t[1] * tangentX + b[1] * tangentY + n[1] * tangentZ,
    t[2] * tangentX + b[2] * tangentY + n[2] * tangentZ
  ];
  return unit(mapped) ?? n;
}

const input = (changes: Partial<NormalMapInput> = {}): NormalMapInput => ({
  positionDx: X,
  positionDy: Y,
  uvDx: [1, 0],
  uvDy: [0, 1],
  normal: Z,
  texel: NEUTRAL,
  normalScale: 1,
  ...changes
});

function expectVector(actual: Vec3, expected: Vec3): void {
  actual.forEach((value, index) => expect(value).toBeCloseTo(expected[index]!, 9));
  expect(actual.every(Number.isFinite)).toBe(true);
  expect(length(actual)).toBeCloseTo(1, 9);
}

/** Apply a 2D affine transform; offsets should disappear in derivatives. */
function transformUv(uv: Vec2, offset: Vec2): Vec2 {
  return [2 * uv[0] + uv[1] + offset[0], uv[0] + 3 * uv[1] + offset[1]];
}

function transformedDerivatives(offset: Vec2): readonly [Vec2, Vec2] {
  const origin: Vec2 = [0.25, 0.5];
  const base = transformUv(origin, offset);
  const alongX = transformUv([origin[0] + 1, origin[1]], offset);
  const alongY = transformUv([origin[0], origin[1] + 1], offset);
  return [[alongX[0] - base[0], alongX[1] - base[1]], [alongY[0] - base[0], alongY[1] - base[1]]];
}

describe("independent derivative normal-map geometry oracle", () => {
  it("maps neutral, tangent-axis, and tilted samples and applies normal scale before normalization", () => {
    expectVector(normalFromDerivatives(input()), Z);
    expectVector(normalFromDerivatives(input({ texel: TANGENT_X })), X);
    expectVector(normalFromDerivatives(input({ texel: TANGENT_Y })), Y);
    const invSqrt2 = 1 / Math.sqrt(2);
    expectVector(normalFromDerivatives(input({ texel: [1, 0.5, 1] })), [invSqrt2, 0, invSqrt2]);
    expectVector(normalFromDerivatives(input({ texel: [1, 0.5, 1], normalScale: 0 })), Z);
  });

  it("tracks increasing U/V through mirrored and rotated texture coordinates", () => {
    const uMirror = { uvDx: [-1, 0] as Vec2, uvDy: [0, 1] as Vec2 };
    expectVector(normalFromDerivatives(input({ ...uMirror, texel: TANGENT_X })), [-1, 0, 0]);
    expectVector(normalFromDerivatives(input({ ...uMirror, texel: TANGENT_Y })), Y);
    const vMirror = { uvDx: [1, 0] as Vec2, uvDy: [0, -1] as Vec2 };
    expectVector(normalFromDerivatives(input({ ...vMirror, texel: TANGENT_X })), X);
    expectVector(normalFromDerivatives(input({ ...vMirror, texel: TANGENT_Y })), [0, -1, 0]);
    const quarterTurn = { uvDx: [0, 1] as Vec2, uvDy: [-1, 0] as Vec2 };
    expectVector(normalFromDerivatives(input({ ...quarterTurn, texel: TANGENT_X })), [0, -1, 0]);
    expectVector(normalFromDerivatives(input({ ...quarterTurn, texel: TANGENT_Y })), X);
  });

  it("orthogonalizes a sheared, nonuniform UV transform and ignores UV translation", () => {
    const [uvDx, uvDy] = transformedDerivatives([0, 0]);
    const [shiftedDx, shiftedDy] = transformedDerivatives([23, -11]);
    const invSqrt10 = 1 / Math.sqrt(10);
    const expectedT: Vec3 = [3 * invSqrt10, -invSqrt10, 0];
    const expectedB: Vec3 = [invSqrt10, 3 * invSqrt10, 0];
    expectVector(normalFromDerivatives(input({ uvDx, uvDy, texel: TANGENT_X })), expectedT);
    expectVector(normalFromDerivatives(input({ uvDx, uvDy, texel: TANGENT_Y })), expectedB);
    expectVector(normalFromDerivatives(input({ uvDx: shiftedDx, uvDy: shiftedDy, texel: TANGENT_X })), expectedT);
    expectVector(normalFromDerivatives(input({ uvDx: shiftedDx, uvDy: shiftedDy, texel: TANGENT_Y })), expectedB);
  });

  it("uses the face-adjusted normal while retaining increasing-U/V directions", () => {
    const back: Vec3 = [0, 0, -2];
    expectVector(normalFromDerivatives(input({ normal: back })), [0, 0, -1]);
    expectVector(normalFromDerivatives(input({ normal: back, texel: TANGENT_X })), X);
    expectVector(normalFromDerivatives(input({ normal: back, texel: TANGENT_Y })), Y);
    const invSqrt2 = 1 / Math.sqrt(2);
    expectVector(normalFromDerivatives(input({ normal: back, texel: [1, 0.5, 1] })), [invSqrt2, 0, -invSqrt2]);
  });

  it("returns the face normal for undefined UV, geometry, or sampled directions", () => {
    const fallback: Vec3 = [0, 0, -1];
    const cases: Partial<NormalMapInput>[] = [
      { uvDx: [0, 0], uvDy: [0, 0] },
      { uvDx: [1, 0], uvDy: [2, 0] },
      { uvDx: [1, 0], uvDy: [1, 1e-12] },
      { positionDx: [0, 0, 0] },
      { positionDy: [2, 0, 0] },
      { positionDy: [1, 1e-12, 0] },
      { texel: [0.5, 0.5, 0.5] }
    ];
    for (const changes of cases) {
      expectVector(normalFromDerivatives(input({ texel: TANGENT_X, ...changes, normal: fallback })), fallback);
    }
    expectVector(normalFromDerivatives(input({ normal: [0, 0, 0], texel: TANGENT_X })), Z);
  });

  it("accepts very small, well-conditioned UV derivatives and normalizes non-unit inputs", () => {
    const tiny = { uvDx: [1e-12, 0] as Vec2, uvDy: [0, 1e-12] as Vec2, normal: [0, 0, 7] as Vec3 };
    expectVector(normalFromDerivatives(input({ ...tiny, texel: TANGENT_X })), X);
    expectVector(normalFromDerivatives(input({ ...tiny, texel: TANGENT_Y })), Y);
    expectVector(normalFromDerivatives(input({ ...tiny, texel: [0.75, 0.75, 0.75] })),
      [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)]);
  });

  it("uses relative conditioning on either side of the UV degeneracy threshold", () => {
    expectVector(normalFromDerivatives(input({ uvDx: [1, 0], uvDy: [1, 0.5e-6], texel: TANGENT_X })), Z);
    expectVector(normalFromDerivatives(input({ uvDx: [1, 0], uvDy: [1, 2e-6], texel: TANGENT_X })), X);
  });

  it("preserves both directions when orthogonal UV derivative rows have vastly different magnitudes", () => {
    const cases: readonly { readonly uvDx: Vec2; readonly uvDy: Vec2; readonly tangent: Vec3; readonly bitangent: Vec3 }[] = [
      { uvDx: [1, 0], uvDy: [0, 1e-23], tangent: X, bitangent: Y },
      { uvDx: [1e-23, 0], uvDy: [0, 1], tangent: X, bitangent: Y },
      { uvDx: [-1, 0], uvDy: [0, 1e-23], tangent: [-1, 0, 0], bitangent: Y },
      { uvDx: [1e-23, 0], uvDy: [0, -1], tangent: X, bitangent: [0, -1, 0] }
    ];
    for (const sample of cases) {
      expectVector(normalFromDerivatives(input({ uvDx: sample.uvDx, uvDy: sample.uvDy, texel: TANGENT_X })), sample.tangent);
      expectVector(normalFromDerivatives(input({ uvDx: sample.uvDx, uvDy: sample.uvDy, texel: TANGENT_Y })), sample.bitangent);
    }
  });

  it("judges near-parallel UV rows by their relative angle even when one row is tiny", () => {
    const uvDx: Vec2 = [1, 0];
    expectVector(normalFromDerivatives(input({ uvDx, uvDy: [1e-23, 0.5e-29], texel: TANGENT_X })), Z);
    expectVector(normalFromDerivatives(input({ uvDx, uvDy: [1e-23, 2e-29], texel: TANGENT_X })), X);
  });

  it("normalizes finite extreme normal scales without losing tangent orientation", () => {
    const extreme = { texel: [1, 1, 1] as Vec3, normalScale: 1e38 };
    const diagonal = Math.SQRT1_2;
    expectVector(normalFromDerivatives(input(extreme)), [diagonal, diagonal, 0]);
    expectVector(normalFromDerivatives(input({ ...extreme, uvDx: [-1, 0], uvDy: [0, 1e-23] })),
      [-diagonal, diagonal, 0]);
  });
});

function program(options: { readonly uv?: 0 | 1; readonly flat?: boolean; readonly clipping?: boolean } = {}) {
  return generateProgramImpl(normalizeProgramFeatures({
    lighting: "lit",
    maps: options.uv === undefined ? {} : { normal: { uvSet: options.uv, transform: true } },
    flatShading: options.flat ?? false,
    doubleSided: true,
    features: options.clipping ? { [PROGRAM_CLIPPING_FEATURE]: true } : {}
  }));
}

describe("generated derivative normal-map routing", () => {
  it.each([0, 1] as const)("uses transformed UV%i without requiring a tangent attribute", (uvSet) => {
    const result = program({ uv: uvSet });
    const varying = uvSet === 0 ? "v_uv" : "v_uv1";
    expect(result.defines.USE_NORMAL_MAP).toBe(true);
    expect(result.defines[uvSet === 0 ? "A3D_NEED_UV0" : "A3D_NEED_UV1"]).toBe(true);
    expect(result.defines.A3D_HAS_TANGENT).toBeUndefined();
    expect(result.vertex).not.toMatch(/layout\s*\(\s*location\s*=\s*3\s*\)\s*in\s+vec4\s+a_tangent\s*;/);
    expect(result.fragment).toContain(
      `a3dTangentNormal(v_worldPosition, geometryNormal, a3dCoreMapUv(${varying}, u_normalTextureOffset, u_normalTextureScale, u_normalTextureRotation))`
    );
  });

  it("places clipping discard after normal evaluation so derivatives are evaluated first", () => {
    const result = program({ uv: 1, clipping: true });
    expect(result.defines.A3D_CLIPPING).toBe(true);
    const main = result.fragment.slice(result.fragment.lastIndexOf("void main()"));
    const normalAt = main.indexOf("a3dTangentNormal(");
    const discardAt = main.indexOf("if (a3dClipped) discard;");
    expect(normalAt).toBeGreaterThanOrEqual(0);
    expect(discardAt).toBeGreaterThan(normalAt);
  });
});

const validatorAvailable = spawnSync("glslangValidator", ["--version"], { encoding: "utf8" }).status === 0;

describe.skipIf(!validatorAvailable)("generated normal-map GLSL compile and link", () => {
  const cases = [
    { name: "smooth without a normal map", options: {} },
    { name: "smooth normal map with UV0", options: { uv: 0 as const } },
    { name: "smooth normal map with transformed UV1 and clipping", options: { uv: 1 as const, clipping: true } },
    { name: "flat normal without a normal map", options: { flat: true } },
    { name: "flat normal with a normal map", options: { flat: true, uv: 0 as const } }
  ];
  for (const sample of cases) {
    it(`compiles and links ${sample.name}`, () => {
      const generated = program(sample.options);
      expect(generated.fragment).toContain(NORMAL_CHUNK_GLSL);
      const directory = mkdtempSync(join(tmpdir(), "aura-normal-map-"));
      try {
        const vertex = join(directory, "normal.vert");
        const fragment = join(directory, "normal.frag");
        writeFileSync(vertex, generated.vertex);
        writeFileSync(fragment, generated.fragment);
        const result = spawnSync("glslangValidator", ["-l", vertex, fragment], { encoding: "utf8" });
        expect(result.status, result.stderr || result.stdout || result.error?.message || "GLSL link failed").toBe(0);
      } finally {
        rmSync(directory, { recursive: true, force: true });
      }
    });
  }
});
