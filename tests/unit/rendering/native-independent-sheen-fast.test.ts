import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import sheenFastDefault, {
  A3D_PRD04_SHEEN_FAST_WGSL,
} from "../../../packages/rendering/src/shaders/independent-wgsl/SheenFast";

interface Functions {
  a3dFastSheenExponent(roughness: number): number;
  a3dFastSheenOffset(roughness: number): number;
  a3dFastSheenShape(cosine: number, exponent: number, offset: number): number;
  a3dFastSheenNormalization(exponent: number, offset: number): number;
  a3dFastSheenDirect(viewWeight: number, lightWeight: number, normalization: number): number;
  a3dFastSheenCompensation(viewWeight: number, lightWeight: number, intensity: number): number;
  a3dFastSheenAlbedo(viewWeight: number): number;
}

/** Execute the candidate's actual scalar function bodies in JS double precision. */
function execute(source: string): Functions {
  const javascript = source.replace(/\bfn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*f32)?\s*\{/g,
    (_match, name: string, argumentsText: string) => {
      const args = argumentsText.replace(/:\s*f32\b/g, "");
      if (args.includes(":")) throw new Error(`unsupported argument in ${name}`);
      return `function ${name}(${args}) {`;
    });
  return runInNewContext(`${javascript}\n({
    a3dFastSheenExponent, a3dFastSheenOffset, a3dFastSheenShape,
    a3dFastSheenNormalization, a3dFastSheenDirect,
    a3dFastSheenCompensation, a3dFastSheenAlbedo
  })`, { clamp: (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x)), max: Math.max, pow: Math.pow }) as Functions;
}

const sheen = execute(A3D_PRD04_SHEEN_FAST_WGSL);
const curves = (roughness: number) => ({
  exponent: sheen.a3dFastSheenExponent(roughness),
  offset: sheen.a3dFastSheenOffset(roughness),
});
const shape = (cosine: number, exponent: number, offset: number) =>
  sheen.a3dFastSheenShape(cosine, exponent, offset);

describe("independent analytic fast sheen preview", () => {
  it("exports a scalar, resource-free constant-cost shader", () => {
    expect(sheenFastDefault).toBe(A3D_PRD04_SHEEN_FAST_WGSL);
    expect(A3D_PRD04_SHEEN_FAST_WGSL).not.toMatch(/@group|@binding|\bfor\s*\(|\bwhile\s*\(|textureSample|\b(?:sin|cos)\s*\(/);
    expect([...A3D_PRD04_SHEEN_FAST_WGSL.matchAll(/\bpow\s*\(/g)]).toHaveLength(1);
  });

  it("bounds parameter and angular responses over physical and clamped inputs", () => {
    expect(curves(0)).toEqual({ exponent: 8, offset: 0 });
    expect(curves(1)).toEqual({ exponent: 1, offset: 0.125 });
    expect(curves(-1)).toEqual(curves(0));
    expect(curves(2)).toEqual(curves(1));
    for (const roughness of [0, 0.05, 0.25, 0.5, 0.75, 1]) {
      const { exponent, offset } = curves(roughness);
      expect(exponent).toBeGreaterThanOrEqual(1);
      expect(exponent).toBeLessThanOrEqual(8);
      expect(offset).toBeGreaterThanOrEqual(0);
      expect(offset).toBeLessThanOrEqual(0.125);
      expect(shape(0, exponent, offset)).toBeCloseTo(1, 12);
      expect(shape(1, exponent, offset)).toBeCloseTo(offset, 12);
      let previous = 1;
      for (const cosine of [0, 0.000001, 0.1, 0.5, 0.9, 1]) {
        const weight = shape(cosine, exponent, offset);
        expect(weight).toBeGreaterThanOrEqual(0);
        expect(weight).toBeLessThanOrEqual(previous);
        previous = weight;
      }
      expect(Number.isFinite(sheen.a3dFastSheenNormalization(exponent, offset))).toBe(true);
      expect(sheen.a3dFastSheenNormalization(exponent, offset)).toBeGreaterThan(0);
      expect(sheen.a3dFastSheenNormalization(exponent, offset)).toBeLessThan(15);
    }
  });

  it("is reciprocal and integrates to its analytic directional albedo", () => {
    // Uniform-cosine midpoint integration is independent of the closed-form
    // normalization and evaluates the shader's actual direct helper bodies.
    const samples = 4096;
    for (const roughness of [0, 0.05, 0.25, 0.5, 0.75, 1]) {
      const { exponent, offset } = curves(roughness);
      const normalization = sheen.a3dFastSheenNormalization(exponent, offset);
      for (const nv of [0, 0.000001, 0.01, 0.1, 0.5, 1]) {
        const viewWeight = shape(nv, exponent, offset);
        let integral = 0;
        let reciprocityError = 0;
        for (let i = 0; i < samples; i++) {
          const nl = (i + 0.5) / samples;
          const lightWeight = shape(nl, exponent, offset);
          const direct = sheen.a3dFastSheenDirect(viewWeight, lightWeight, normalization);
          reciprocityError = Math.max(reciprocityError, Math.abs(direct - sheen.a3dFastSheenDirect(lightWeight, viewWeight, normalization)));
          integral += direct * nl;
        }
        integral *= 2 * Math.PI / samples;
        const expected = sheen.a3dFastSheenAlbedo(viewWeight);
        expect(reciprocityError).toBe(0);
        expect(Math.abs(integral - expected), `r=${roughness} nv=${nv}`).toBeLessThan(0.000002);
        expect(integral).toBeGreaterThanOrEqual(0);
        expect(integral).toBeLessThanOrEqual(0.980002);
      }
    }
  }, 30_000);

  it("bounds a white Lambert substrate and colored sheen together at grazing views", () => {
    const samples = 2048;
    for (const roughness of [0, 0.25, 0.5, 1]) {
      const { exponent, offset } = curves(roughness);
      const normalization = sheen.a3dFastSheenNormalization(exponent, offset);
      for (const nv of [0, 0.000001, 0.1, 0.5, 1]) {
        const viewWeight = shape(nv, exponent, offset);
        for (const intensity of [0, 0.25, 1]) {
          let energy = 0;
          let symmetryError = 0;
          for (let i = 0; i < samples; i++) {
            const nl = (i + 0.5) / samples;
            const lightWeight = shape(nl, exponent, offset);
            const compensation = sheen.a3dFastSheenCompensation(viewWeight, lightWeight, intensity);
            symmetryError = Math.max(symmetryError, Math.abs(compensation - sheen.a3dFastSheenCompensation(lightWeight, viewWeight, intensity)));
            energy += (compensation / Math.PI + intensity * sheen.a3dFastSheenDirect(viewWeight, lightWeight, normalization)) * nl;
          }
          energy *= 2 * Math.PI / samples;
          expect(symmetryError).toBe(0);
          expect(energy, `r=${roughness} nv=${nv} intensity=${intensity}`).toBeLessThanOrEqual(1.000002);
          expect(energy).toBeGreaterThanOrEqual(0);
          const viewCompensation = sheen.a3dFastSheenCompensation(viewWeight, 0, intensity);
          expect(viewCompensation + intensity * sheen.a3dFastSheenAlbedo(viewWeight)).toBeCloseTo(1, 12);
        }
      }
    }
  }, 30_000);

  it("uses the largest color channel to keep every layered channel within its energy budget", () => {
    const color = [0.1, 0.45, 1];
    const intensity = Math.max(...color);
    const { exponent, offset } = curves(0.4);
    const viewWeight = shape(0.2, exponent, offset);
    const normalization = sheen.a3dFastSheenNormalization(exponent, offset);
    const samples = 4096;
    const integrals = [0, 0, 0];
    for (let i = 0; i < samples; i++) {
      const nl = (i + 0.5) / samples;
      const lightWeight = shape(nl, exponent, offset);
      const substrate = sheen.a3dFastSheenCompensation(viewWeight, lightWeight, intensity) / Math.PI;
      const direct = sheen.a3dFastSheenDirect(viewWeight, lightWeight, normalization);
      for (let channel = 0; channel < color.length; channel++) integrals[channel] += (substrate + color[channel] * direct) * nl;
    }
    for (const energy of integrals) {
      expect(energy * 2 * Math.PI / samples).toBeLessThanOrEqual(1.000002);
    }
    expect(integrals[0]).toBeLessThan(integrals[1]);
    expect(integrals[1]).toBeLessThan(integrals[2]);
  });
});
