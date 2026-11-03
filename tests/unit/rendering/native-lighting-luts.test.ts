import { afterEach, describe, expect, it, vi } from "vitest";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import {
  DFG_LUT_RG16F,
  DFG_LUT_SIZE,
  generateDfgLut,
  integrateGgxDfg
} from "../../../packages/rendering/src/program/DFGLutData";
import {
  LTC_LUT_SIZE,
  fetchLtcLutTextures,
  generateLtcLutData
} from "../../../packages/rendering/src/probes/LtcLuts";

/** Independent midpoint integration over L, rather than sampling GGX normals. */
function hemisphereReference(roughness: number, ndotv: number): readonly [number, number] {
  const alpha2 = roughness ** 4;
  const vx = Math.sqrt(1 - ndotv * ndotv);
  const gv = Math.sqrt(alpha2 + (1 - alpha2) * ndotv * ndotv);
  const nMu = 256, nPhi = 512;
  let a = 0, b = 0;
  for (let i = 0; i < nMu; i += 1) {
    const nl = (i + 0.5) / nMu;
    const radius = Math.sqrt(1 - nl * nl);
    for (let j = 0; j < nPhi; j += 1) {
      const phi = 2 * Math.PI * (j + 0.5) / nPhi;
      const lx = radius * Math.cos(phi), ly = radius * Math.sin(phi);
      const norm = Math.hypot(vx + lx, ly, ndotv + nl);
      const nh = (ndotv + nl) / norm;
      const vh = (vx * (vx + lx) + ndotv * (ndotv + nl)) / norm;
      const denominator = nh * nh * (alpha2 - 1) + 1;
      const d = alpha2 / (Math.PI * denominator * denominator);
      const gl = Math.sqrt(alpha2 + (1 - alpha2) * nl * nl);
      const g = 2 * nl * ndotv / (nl * gv + ndotv * gl);
      const factor = d * g / (4 * ndotv);
      const fc = (1 - vh) ** 5;
      a += factor * (1 - fc);
      b += factor * fc;
    }
  }
  const area = 2 * Math.PI / (nMu * nPhi);
  return [a * area, b * area];
}

function fromFloat16(bits: number): number {
  const exponent = (bits >>> 10) & 31;
  const mantissa = bits & 1023;
  return exponent === 0 ? mantissa * 2 ** -24 : (1 + mantissa / 1024) * 2 ** (exponent - 15);
}

afterEach(() => vi.unstubAllGlobals());

describe("Aura3D directional-albedo lookup", () => {
  it("reproduces the baked binary16 table at roughness/N·V texel centers", () => {
    expect(DFG_LUT_RG16F).toHaveLength(DFG_LUT_SIZE * DFG_LUT_SIZE * 2);
    expect(generateDfgLut()).toEqual(DFG_LUT_RG16F);
    for (let i = 0; i < DFG_LUT_RG16F.length; i += 2) {
      const a = fromFloat16(DFG_LUT_RG16F[i]!);
      const b = fromFloat16(DFG_LUT_RG16F[i + 1]!);
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(a + b).toBeLessThanOrEqual(1.001);
    }
  });

  it("matches analytic smooth and normal-incidence rough limits", () => {
    const nv = 0.4;
    expect(integrateGgxDfg(0, nv)).toEqual([1 - (1 - nv) ** 5, (1 - nv) ** 5]);
    const [a, b] = integrateGgxDfg(1, 1, 8192);
    // The unit-Fresnel GGX integral at N·V=1 and alpha=1 is 1-ln(2).
    expect(a + b).toBeCloseTo(1 - Math.log(2), 3);
  });

  it("agrees with independent reflected-hemisphere quadrature", () => {
    for (const [roughness, nv] of [[0.4, 0.7], [0.7, 0.45], [1, 0.8]] as const) {
      const actual = integrateGgxDfg(roughness, nv, 8192);
      const reference = hemisphereReference(roughness, nv);
      expect(Math.abs(actual[0] - reference[0])).toBeLessThan(0.004);
      expect(Math.abs(actual[1] - reference[1])).toBeLessThan(0.004);
    }
  });

  it("stores coefficients close to independent integration at representative texel centers", () => {
    for (const [x, y] of [[6, 5], [11, 11]] as const) {
      const reference = hemisphereReference((x + 0.5) / DFG_LUT_SIZE, (y + 0.5) / DFG_LUT_SIZE);
      const offset = (y * DFG_LUT_SIZE + x) * 2;
      expect(Math.abs(fromFloat16(DFG_LUT_RG16F[offset]!) - reference[0])).toBeLessThan(0.006);
      expect(Math.abs(fromFloat16(DFG_LUT_RG16F[offset + 1]!) - reference[1])).toBeLessThan(0.006);
    }
  });

  it("rejects invalid parameters before integration", () => {
    for (const input of [[NaN, 1, 64], [-0.1, 1, 64], [0.5, 0, 64], [0.5, 1.1, 64], [0.5, 0.5, 15], [0.5, 0.5, 65537]]) {
      expect(() => integrateGgxDfg(input[0]!, input[1]!, input[2]!)).toThrow(RangeError);
    }
  });
});

describe("Aura3D rectangle-light lookup", () => {
  it("generates bounded repeatable matrices and Fresnel coefficients from the stated axes", () => {
    const first = generateLtcLutData();
    const second = generateLtcLutData();
    expect(first.mInv).toEqual(second.mInv);
    expect(first.fresnel).toEqual(second.fresnel);
    for (let i = 0; i < first.mInv.length; i += 4) {
      expect(first.mInv[i]).toBeGreaterThan(0);
      expect(first.mInv[i + 1]).toBe(0);
      expect(first.mInv[i + 2]).toBeGreaterThan(0);
      expect(first.mInv[i + 3]).toBeGreaterThanOrEqual(0);
      const a = first.fresnel[i]!, b = first.fresnel[i + 1]!;
      expect(a).toBeGreaterThanOrEqual(0);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(a + b).toBeLessThanOrEqual(1.000001);
    }
    // At X=1 and Y=0 the albedo limit is 1-ln(2).
    const normalRough = (LTC_LUT_SIZE - 1) * 4;
    expect(first.fresnel[normalRough]! + first.fresnel[normalRough + 1]!).toBeCloseTo(1 - Math.log(2), 2);
    // A smooth surface reflects more directional energy than a rough one.
    expect(first.fresnel[0]! + first.fresnel[1]!).toBeGreaterThan(first.fresnel[normalRough]! + first.fresnel[normalRough + 1]!);
  });

  it("normalizes its transformed-cosine density for a representative matrix", () => {
    const data = generateLtcLutData().mInv;
    const offset = (16 * LTC_LUT_SIZE + 32) * 4;
    const scale = data[offset]!, stretch = data[offset + 2]!, shear = data[offset + 3]!;
    let total = 0, error = 0;
    const alpha = 32 / (LTC_LUT_SIZE - 1);
    const nv = Math.cos(16 * Math.PI / (LTC_LUT_SIZE - 1));
    const vx = Math.sqrt(1 - nv * nv), alpha2 = alpha * alpha;
    const gv = Math.sqrt(alpha2 + (1 - alpha2) * nv * nv);
    const reference = hemisphereReference(Math.sqrt(alpha), nv);
    const energy = reference[0] + reference[1];
    const fresnel = generateLtcLutData().fresnel;
    expect(Math.abs(fresnel[offset]! - reference[0])).toBeLessThan(0.015);
    expect(Math.abs(fresnel[offset + 1]! - reference[1])).toBeLessThan(0.015);
    const nMu = 256, nPhi = 512;
    for (let i = 0; i < nMu; i += 1) {
      const z = (i + 0.5) / nMu, radius = Math.sqrt(1 - z * z);
      for (let j = 0; j < nPhi; j += 1) {
        const phi = 2 * Math.PI * (j + 0.5) / nPhi;
        const x = radius * Math.cos(phi), y = radius * Math.sin(phi);
        const qx = x + shear * z, qy = stretch * y, qz = scale * z;
        const q2 = qx * qx + qy * qy + qz * qz;
        const approximation = scale * stretch * qz / (Math.PI * q2 * q2);
        total += approximation;
        const halfLength = Math.hypot(vx + x, y, nv + z);
        const nh = (nv + z) / halfLength;
        const d = alpha2 / (Math.PI * (nh * nh * (alpha2 - 1) + 1) ** 2);
        const gl = Math.sqrt(alpha2 + (1 - alpha2) * z * z);
        const g = 2 * z * nv / (z * gv + nv * gl);
        const target = d * g / (4 * nv * energy);
        error += Math.abs(approximation - target);
      }
    }
    const cellArea = 2 * Math.PI / (nMu * nPhi);
    expect(total * cellArea).toBeCloseTo(1, 2);
    // The independently integrated normalized GGX lobe bounds this fit's L1 error.
    expect(error * cellArea).toBeLessThan(0.18);
  });

  it("generates locally, shares pending/completed work, and recreates disposed textures", async () => {
    const fetch = vi.fn(() => { throw new Error("network access forbidden"); });
    vi.stubGlobal("fetch", fetch);
    const device = new MockRenderDevice();
    const first = fetchLtcLutTextures(device);
    expect(fetchLtcLutTextures(device)).toBe(first);
    const luts = await first;
    expect(fetch).not.toHaveBeenCalled();
    expect([luts.mInv.width, luts.mInv.height, luts.mInv.format, luts.mInv.colorSpace]).toEqual([64, 64, "rgba32f", "linear"]);
    expect(await fetchLtcLutTextures(device)).toBe(luts);
    luts.mInv.dispose();
    const replacement = await fetchLtcLutTextures(device);
    expect(replacement).not.toBe(luts);
    luts.fresnel.dispose();
    replacement.mInv.dispose();
    replacement.fresnel.dispose();
    device.dispose();
  });

  it("rejects invalid tables, evicts failed promises, and permits retry", async () => {
    const device = new MockRenderDevice();
    const invalid = new Float32Array(LTC_LUT_SIZE * LTC_LUT_SIZE * 4);
    invalid[5] = Number.NaN;
    await expect(fetchLtcLutTextures(device, { fetch: async () => invalid })).rejects.toThrow(/non-finite/);
    await expect(fetchLtcLutTextures(device, { fetch: async () => new Float32Array(4) })).rejects.toThrow(/size mismatch/);
    const singular = new Float32Array(invalid.length).fill(0.5);
    singular[0] = 0;
    await expect(fetchLtcLutTextures(device, { fetch: async () => singular })).rejects.toThrow(/singular/);
    const input = new Float32Array(invalid.length).fill(0.5);
    const result = await fetchLtcLutTextures(device, { fetch: async () => input });
    input.fill(0);
    expect((result.mInv.mipLevels[0]!.data as Float32Array)[0]).toBe(0.5);
    result.mInv.dispose();
    result.fresnel.dispose();
    device.dispose();
  });
});
