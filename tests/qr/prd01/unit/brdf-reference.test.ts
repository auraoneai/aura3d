import { describe, expect, it } from "vitest";
import { BRDF_CHUNK_GLSL } from "../../../../packages/rendering/src/program/chunks/brdf.glsl";
import { DFG_LUT_RG16F, DFG_LUT_SIZE, integrateGgxDfg } from "../../../../packages/rendering/src/program/DFGLutData";
import { dfgLutBinding, dfgLutRgba16f, dfgLutTexture } from "../../../../packages/rendering/src/program/DFGLut";

function decodeHalf(bits: number): number {
  const sign = bits & 0x8000 ? -1 : 1;
  const exponent = (bits >>> 10) & 0x1f;
  const mantissa = bits & 0x3ff;
  if (exponent === 0) return sign * mantissa * 2 ** -24;
  if (exponent === 31) return mantissa === 0 ? sign * Infinity : NaN;
  return sign * (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

/** Independently integrate reflected light directions over a hemisphere. */
function referenceDfg(roughness: number, nv: number): readonly [number, number] {
  const alphaSquared = roughness ** 4;
  const vx = Math.sqrt(1 - nv * nv);
  const rows = 128, columns = 256;
  let first = 0, second = 0;
  for (let row = 0; row < rows; row += 1) {
    const nl = (row + 0.5) / rows;
    const radial = Math.sqrt(1 - nl * nl);
    for (let column = 0; column < columns; column += 1) {
      const phi = 2 * Math.PI * (column + 0.5) / columns;
      const lx = radial * Math.cos(phi), ly = radial * Math.sin(phi);
      const halfLength = Math.hypot(vx + lx, ly, nv + nl);
      const nh = (nv + nl) / halfLength;
      const vh = (vx * (vx + lx) + nv * (nv + nl)) / halfLength;
      const distribution = alphaSquared / (Math.PI * (1 + nh * nh * (alphaSquared - 1)) ** 2);
      const gv = Math.sqrt(alphaSquared + (1 - alphaSquared) * nv * nv);
      const gl = Math.sqrt(alphaSquared + (1 - alphaSquared) * nl * nl);
      const visibility = 2 * nl * nv / (nl * gv + nv * gl);
      const weighted = distribution * visibility / (4 * nv);
      const fresnel = (1 - vh) ** 5;
      first += weighted * (1 - fresnel);
      second += weighted * fresnel;
    }
  }
  const cellArea = 2 * Math.PI / (rows * columns);
  return [first * cellArea, second * cellArea];
}

describe("native GGX directional-albedo reference", () => {
  it("matches exact smooth and normal-incidence rough limits", () => {
    const nv = 0.4;
    expect(integrateGgxDfg(0, nv)).toEqual([1 - (1 - nv) ** 5, (1 - nv) ** 5]);
    const [a, b] = integrateGgxDfg(1, 1, 8192);
    expect(a + b).toBeCloseTo(1 - Math.log(2), 3);
  });

  it("matches an independent hemisphere integral at representative material angles", () => {
    for (const [roughness, nv] of [[0.4, 0.7], [0.7, 0.45], [1, 0.8]] as const) {
      const actual = integrateGgxDfg(roughness, nv, 8192);
      const expected = referenceDfg(roughness, nv);
      expect(Math.abs(actual[0] - expected[0])).toBeLessThan(0.005);
      expect(Math.abs(actual[1] - expected[1])).toBeLessThan(0.005);
    }
  });

  it("stores finite nonnegative, energy-bounded binary16 coefficients", () => {
    expect(DFG_LUT_RG16F).toHaveLength(DFG_LUT_SIZE * DFG_LUT_SIZE * 2);
    for (let i = 0; i < DFG_LUT_RG16F.length; i += 2) {
      const a = decodeHalf(DFG_LUT_RG16F[i]!);
      const b = decodeHalf(DFG_LUT_RG16F[i + 1]!);
      expect(Number.isFinite(a) && Number.isFinite(b)).toBe(true);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(a + b).toBeLessThanOrEqual(1.001);
    }
  });

  it("preserves lookup coefficients while widening to a linear RGBA16F texture", () => {
    const rgba = dfgLutRgba16f();
    for (let i = 0; i < DFG_LUT_SIZE * DFG_LUT_SIZE; i += 1) {
      expect(rgba[i * 4]).toBe(DFG_LUT_RG16F[i * 2]);
      expect(rgba[i * 4 + 1]).toBe(DFG_LUT_RG16F[i * 2 + 1]);
      expect(rgba[i * 4 + 2]).toBe(0x0000);
      expect(rgba[i * 4 + 3]).toBe(0x3c00);
    }
    const texture = dfgLutTexture();
    expect([texture.width, texture.height, texture.format, texture.colorSpace]).toEqual([16, 16, "rgba16f", "linear"]);
    expect(dfgLutBinding().name).toBe("u_dfgLut");
    expect(dfgLutBinding().texture).toBe(texture);
    expect(dfgLutBinding()).toBe(dfgLutBinding());
  });

  it("the generated shader binds the GGX, Fresnel and independent lookup paths", () => {
    expect(BRDF_CHUNK_GLSL).toContain("uniform sampler2D u_dfgLut");
    expect(BRDF_CHUNK_GLSL).toContain("D_GGX(");
    expect(BRDF_CHUNK_GLSL).toContain("V_GGX_SmithCorrelated(");
    expect(BRDF_CHUNK_GLSL).toContain("F_Schlick(");
    expect(BRDF_CHUNK_GLSL).toContain("a3dDFG(");
  });
});
