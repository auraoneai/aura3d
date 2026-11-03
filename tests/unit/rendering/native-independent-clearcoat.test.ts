import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import clearcoatDefault, {
  A3D_PRD04_CLEARCOAT_WGSL,
} from "../../../packages/rendering/src/shaders/independent-wgsl/Clearcoat";

type Vec3 = { x: number; y: number; z: number };
type Vec4 = Vec3 & { w: number };
type Lobes = {
  clearcoat: number;
  clearcoatRoughness: number;
  clearcoatNormal: Vec3;
  untouched: number;
};
type Candidate = {
  a3dPrd04CoatFresnel(cosine: number): number;
  a3dPrd04ClearcoatInit(
    lobes: Lobes, factor: number, roughness: number, factorTex: Vec4,
    roughnessTex: Vec4, normal: Vec3, geometryRoughness: number,
  ): void;
  a3dPrd04ClearcoatDirect(light: Vec3, view: Vec3, normal: Vec3, roughness: number): Vec3;
  a3dPrd04ClearcoatIndirect(normal: Vec3, view: Vec3, roughness: number, radiance: Vec3): Vec3;
  a3dPrd04ComposeClearcoat(
    base: Vec3, coverage: number, normal: Vec3, view: Vec3, direct: Vec3, indirect: Vec3,
  ): Vec3;
};

const v3 = (x: number, y = x, z = x): Vec3 => ({ x, y, z });
const v4 = (x: number, y: number, z: number, w: number): Vec4 => ({ x, y, z, w });
const n = v3(0, 0, 1);
const zero = v3(0);
const lobes = (): Lobes => ({ clearcoat: -1, clearcoatRoughness: -1, clearcoatNormal: zero, untouched: 19 });

/**
 * Execute this candidate's actual function bodies, not a second copy of its
 * equations. This deliberately small WGSL-to-JS adapter supports only the
 * scalar/vector-constructor subset used in this file. JS uses double precision;
 * this does not validate WGSL grammar, GPU compilation, or f32 behavior.
 */
function executeSource(source: string): Candidate {
  const clean = source.replace(/\/\/[^\n]*/g, "");
  const start = /\bfn\s+(\w+)\s*\(([\s\S]*?)\)\s*(?:->\s*\w+\s*)?\{/g;
  const definitions: string[] = [];
  const names: string[] = [];
  for (;;) {
    const match = start.exec(clean);
    if (!match) break;
    const name = match[1];
    const parameters = [...match[2].matchAll(/(\w+)\s*:\s*(?:ptr<[^>]+>|\w+)/g)].map((part) => part[1]);
    let cursor = start.lastIndex;
    let depth = 1;
    while (cursor < clean.length && depth > 0) {
      if (clean[cursor] === "{") depth++;
      if (clean[cursor] === "}") depth--;
      cursor++;
    }
    if (depth !== 0) throw new Error(`Unclosed function ${name}`);
    const body = clean.slice(start.lastIndex, cursor - 1)
      .replace(/\(\*lobes\)/g, "lobes")
      .replace(/\blet\b/g, "const");
    definitions.push(`function ${name}(${parameters.join(",")}) {${body}}`);
    names.push(name);
    start.lastIndex = cursor;
  }
  if (names.length === 0) throw new Error("No WGSL functions found");
  const create = new Function("abs", "min", "max", "sqrt", "clamp", "vec3f",
    `"use strict"; ${definitions.join("\n")} return {${names.join(",")}};`) as (
      abs: typeof Math.abs, min: typeof Math.min, max: typeof Math.max, sqrt: typeof Math.sqrt,
      clamp: (x: number, lo: number, hi: number) => number, vec3f: typeof v3,
    ) => Candidate;
  return create(Math.abs, Math.min, Math.max, Math.sqrt, (x, lo, hi) => Math.min(Math.max(x, lo), hi), v3);
}

const shader = executeSource(A3D_PRD04_CLEARCOAT_WGSL);

function expectVectorClose(actual: Vec3, expected: Vec3, digits = 10): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

describe("independent clearcoat WGSL candidate", () => {
  it("declares the requested API and exports one source string", () => {
    expect(clearcoatDefault).toBe(A3D_PRD04_CLEARCOAT_WGSL);
    const manifest = JSON.parse(readFileSync(new URL("../../../docs/prds/aura3d-independent-shader-api.json", import.meta.url), "utf8")) as {
      modules: Array<{ name: string; wgsl: { functions: Array<{ signature: string }> } }>;
    };
    const declaration = manifest.modules.find((module) => module.name === "clearcoat");
    expect(declaration).toBeDefined();
    const compactSource = A3D_PRD04_CLEARCOAT_WGSL.replace(/\s+/g, "");
    for (const { signature } of declaration!.wgsl.functions) {
      expect(compactSource).toContain(signature.replace(/\s+/g, ""));
    }
  });

  it("initializes coverage, normal, and quadrature roughness from the selected texture channels", () => {
    const material = lobes();
    shader.a3dPrd04ClearcoatInit(material, 0.8, 0.6, v4(0.25, 0.8, 0.6, 0.4), v4(0.5, 0.7, 0.3, 0.2), v3(0, 3, 4), 0.4);
    expect(material.clearcoat).toBeCloseTo(0.8 * 0.25);
    expect(material.clearcoatRoughness).toBeCloseTo(Math.hypot(0.6 * 0.7, 0.4));
    expectVectorClose(material.clearcoatNormal, v3(0, 3 / 5, 4 / 5));
    expect(material.untouched).toBe(19);

    const unusedChannelsChanged = lobes();
    shader.a3dPrd04ClearcoatInit(unusedChannelsChanged, 0.8, 0.6, v4(0.25, 0, 1, 1), v4(0.1, 0.7, 1, 1), v3(0, 3, 4), 0.4);
    expect(unusedChannelsChanged).toEqual(material);

    const changed = lobes();
    shader.a3dPrd04ClearcoatInit(changed, 0.8, 0.6, v4(0.75, 0.8, 0.6, 0.4), v4(0.5, 1, 0.3, 0.2), n, 0.4);
    expect(changed.clearcoat).toBeGreaterThan(material.clearcoat);
    expect(changed.clearcoatRoughness).toBeGreaterThan(material.clearcoatRoughness);
  });

  it("keeps coverage and initialized roughness in range, including zero and full values", () => {
    const empty = lobes();
    shader.a3dPrd04ClearcoatInit(empty, 0, 0, v4(1, 1, 1, 1), v4(1, 1, 1, 1), n, 0);
    expect(empty.clearcoat).toBe(0);
    expect(empty.clearcoatRoughness).toBe(0);
    const full = lobes();
    shader.a3dPrd04ClearcoatInit(full, 2, 2, v4(2, 0, 0, 0), v4(0, 2, 0, 0), n, 0);
    expect(full.clearcoat).toBe(1);
    expect(full.clearcoatRoughness).toBe(1);
    const greenZero = lobes();
    shader.a3dPrd04ClearcoatInit(greenZero, 1, 1, v4(1, 0, 0, 0), v4(1, 0, 0, 0), n, 0);
    expect(greenZero.clearcoatRoughness).toBe(0);
    const clipped = lobes();
    shader.a3dPrd04ClearcoatInit(clipped, -2, -2, v4(1, 0, 0, 0), v4(1, 0, 0, 0), zero, -1);
    expect(clipped.clearcoat).toBe(0);
    expect(clipped.clearcoatRoughness).toBe(0);
    expect(clipped.clearcoatNormal).toEqual(zero);
  });

  it("has dielectric Fresnel endpoints and stays bounded and monotone between them", () => {
    expect(shader.a3dPrd04CoatFresnel(1)).toBeCloseTo(0.04, 12);
    expect(shader.a3dPrd04CoatFresnel(0)).toBeCloseTo(1, 12);
    let previous = 1;
    for (let i = 0; i <= 100; i++) {
      const f = shader.a3dPrd04CoatFresnel(i / 100);
      expect(f).toBeGreaterThanOrEqual(0.04);
      expect(f).toBeLessThanOrEqual(previous);
      previous = f;
    }
  });

  it("matches the analytic aligned GGX peak and changes with roughness and normal", () => {
    for (const roughness of [0.1, 0.3, 0.7, 1]) {
      const peak = shader.a3dPrd04ClearcoatDirect(n, n, n, roughness);
      // At N=L=V, D=1/(π·alpha²), both Smith factors are 1, and F=0.04.
      const analytic = 0.04 / (4 * Math.PI * roughness ** 4);
      expectVectorClose(peak, v3(analytic), 8);
    }
    const smooth = shader.a3dPrd04ClearcoatDirect(n, n, n, 0.2).x;
    const rough = shader.a3dPrd04ClearcoatDirect(n, n, n, 0.8).x;
    expect(smooth).toBeGreaterThan(rough);
    const tilted = shader.a3dPrd04ClearcoatDirect(n, n, v3(0.6, 0, 0.8), 0.2).x;
    expect(tilted).toBeLessThan(smooth);
    expectVectorClose(shader.a3dPrd04ClearcoatDirect(n, n, n, 0), shader.a3dPrd04ClearcoatDirect(n, n, n, 0.04));
  });

  it("obeys BRDF reciprocity after removing the incident cosine", () => {
    const light = v3(0.6, 0, 0.8);
    const view = v3(0, 0.8, 0.6);
    for (const roughness of [0.1, 0.5, 1]) {
      const forward = shader.a3dPrd04ClearcoatDirect(light, view, n, roughness).x / light.z;
      const reverse = shader.a3dPrd04ClearcoatDirect(view, light, n, roughness).x / view.z;
      expect(forward).toBeCloseTo(reverse, 10);
    }
  });

  it("makes indirect response linear in radiance, bounded, and roughness-sensitive off axis", () => {
    const radiance = v3(2, 0.5, 4);
    expectVectorClose(shader.a3dPrd04ClearcoatIndirect(n, n, 0.4, radiance), v3(0.08, 0.02, 0.16));
    const view = v3(Math.sqrt(0.75), 0, 0.5);
    const smooth = shader.a3dPrd04ClearcoatIndirect(n, view, 0.1, radiance);
    const rough = shader.a3dPrd04ClearcoatIndirect(n, view, 1, radiance);
    expect(smooth.x).toBeGreaterThan(rough.x);
    expectVectorClose(shader.a3dPrd04ClearcoatIndirect(n, view, 0.5, v3(4, 1, 8)),
      (() => { const c = shader.a3dPrd04ClearcoatIndirect(n, view, 0.5, radiance); return v3(2 * c.x, 2 * c.y, 2 * c.z); })());
    for (const cosine of [0.00001, 0.1, 0.5, 1]) {
      const direction = v3(Math.sqrt(1 - cosine * cosine), 0, cosine);
      for (const roughness of [0, 0.2, 0.6, 1]) {
        const result = shader.a3dPrd04ClearcoatIndirect(n, direction, roughness, radiance);
        for (const [channel, input] of [[result.x, radiance.x], [result.y, radiance.y], [result.z, radiance.z]]) {
          expect(channel).toBeGreaterThanOrEqual(0);
          expect(channel).toBeLessThanOrEqual(input);
        }
      }
    }
  });

  it("composes zero/full/partial coverage with view-side Fresnel attenuation", () => {
    const base = v3(1, 2, 3);
    const direct = v3(0.2, 0.1, 0.4);
    const indirect = v3(0.3, 0.1, 0.2);
    const compose = shader.a3dPrd04ComposeClearcoat;
    expect(compose(base, 0, n, n, direct, indirect)).toEqual(base);
    const full = compose(base, 1, n, n, direct, indirect);
    expectVectorClose(full, v3(base.x * 0.96 + 0.5, base.y * 0.96 + 0.2, base.z * 0.96 + 0.6));
    expectVectorClose(compose(base, 0.25, n, n, direct, indirect),
      v3(base.x * 0.75 + full.x * 0.25, base.y * 0.75 + full.y * 0.25, base.z * 0.75 + full.z * 0.25));
    expectVectorClose(compose(base, 2, n, n, direct, indirect), full);
    expectVectorClose(compose(base, 1, n, v3(1, 0, 0), zero, zero), zero);
    expect(compose(base, 1, zero, n, direct, indirect)).toEqual(base);
    expect(compose(base, 1, n, v3(0, 0, -1), direct, indirect)).toEqual(base);
  });

  it("handles zero, opposed, scaled and grazing directions without non-finite results", () => {
    const direct = shader.a3dPrd04ClearcoatDirect;
    expect(direct(zero, n, n, 0)).toEqual(zero);
    expect(direct(n, zero, n, 0)).toEqual(zero);
    expect(direct(n, n, zero, 0)).toEqual(zero);
    expect(direct(n, v3(0, 0, -1), n, 0)).toEqual(zero);
    expect(shader.a3dPrd04ClearcoatIndirect(zero, n, 0, v3(1))).toEqual(zero);
    expect(shader.a3dPrd04ClearcoatIndirect(n, zero, 0, v3(1))).toEqual(zero);
    const reference = direct(n, n, n, 0.4);
    expectVectorClose(direct(v3(0, 0, 1e30), v3(0, 0, 1e-20), v3(0, 0, 15), 0.4), reference);
    for (const roughness of [0, 0.04, 0.2, 1]) {
      for (const z of [1e-12, 0.01, 0.5, 1]) {
        const grazing = v3(Math.sqrt(1 - z * z), 0, z);
        const value = direct(grazing, grazing, n, roughness);
        expect(Number.isFinite(value.x)).toBe(true);
        expect(value.x).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("keeps integrated single-scattering reflection below unit incident radiance", () => {
    // Midpoint quadrature over the hemisphere, dω = dφ d(cos θ). This is an
    // energy bound, not a parity fixture or a claim about layered IBL energy.
    const samplesCos = 64;
    const samplesPhi = 128;
    const solidAngle = (2 * Math.PI) / (samplesCos * samplesPhi);
    for (const viewCosine of [0.2, 0.6, 1]) {
      const view = v3(Math.sqrt(1 - viewCosine ** 2), 0, viewCosine);
      for (const roughness of [0.4, 0.7, 1]) {
        let integral = 0;
        for (let i = 0; i < samplesCos; i++) {
          const z = (i + 0.5) / samplesCos;
          const radius = Math.sqrt(1 - z * z);
          for (let j = 0; j < samplesPhi; j++) {
            const phi = (j + 0.5) * 2 * Math.PI / samplesPhi;
            const light = v3(radius * Math.cos(phi), radius * Math.sin(phi), z);
            integral += shader.a3dPrd04ClearcoatDirect(light, view, n, roughness).x * solidAngle;
          }
        }
        expect(integral).toBeGreaterThan(0);
        expect(integral).toBeLessThanOrEqual(1);
      }
    }
  });
});
