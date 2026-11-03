import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import sheenDefault, { A3D_PRD04_SHEEN_WGSL } from "../../../packages/rendering/src/shaders/independent-wgsl/Sheen";

type Vec3 = { x: number; y: number; z: number };
type Vec4 = Vec3 & { w: number };
type Lobes = { sheenColor: Vec3; sheenRoughness: number; marker: number };
type SheenFunctions = {
  a3dPrd04SheenInit: (lobes: Lobes, factor: Vec3, roughness: number, color: Vec4, roughnessTexture: Vec4) => void;
  a3dPrd04DCharlie: (roughness: number, dotNH: number) => number;
  a3dPrd04VNeubelt: (dotNV: number, dotNL: number) => number;
  a3dPrd04SheenEnergyScale: (roughness: number) => number;
  a3dPrd04SheenAlbedoBound: (dotNV: number, roughness: number) => number;
  a3dPrd04SheenDirect: (light: Vec3, view: Vec3, normal: Vec3, color: Vec3, roughness: number) => Vec3;
  a3dPrd04IBLSheen: (dotNV: number, roughness: number) => number;
  a3dPrd04SheenIndirect: (normal: Vec3, view: Vec3, roughness: number, color: Vec3, irradiance: Vec3) => Vec3;
  a3dPrd04SheenEnergyCompensation: (normal: Vec3, view: Vec3, light: Vec3, color: Vec3, roughness: number) => number;
  a3dPrd04SheenEnergyCompensationIndirect: (normal: Vec3, view: Vec3, color: Vec3, roughness: number) => number;
};

const vector = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const normal = vector(0, 0, 1);
const white = vector(1, 1, 1);
const black = vector(0, 0, 0);

/**
 * Execute the expressions and control flow of this candidate, not a separate
 * reimplementation. This deliberately small translator covers only the WGSL
 * constructs used here; it is not a WGSL parser, type checker, f32 emulator,
 * compiler, or GPU test. Unsupported syntax should fail as JavaScript instead
 * of silently being replaced with expected results.
 */
function executeSheenSubset(source: string): SheenFunctions {
  const javascript = source
    .replace(/\/\/[^\n]*/g, "")
    .replace(/:\s*ptr<\s*function\s*,\s*A3DPrd04Lobes\s*>/g, ": pointer")
    .replace(/\bfn\s+(\w+)\s*\(([^)]*)\)\s*(?:->\s*\w+)?\s*\{/g, (_match, name: string, args: string) => {
      const parameters = args.replace(/:\s*(?:pointer|vec3f|vec4f|f32)\b/g, "");
      if (parameters.includes(":")) throw new Error(`Unsupported WGSL argument in ${name}`);
      return `function ${name}(${parameters}) {`;
    })
    .replace(/\(\*(\w+)\)\./g, "$1.");
  const builtins = {
    clamp: (x: number, low: number, high: number) => Math.min(Math.max(x, low), high),
    cos: Math.cos,
    dot: (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z,
    f32: Number,
    inverseSqrt: (x: number) => 1 / Math.sqrt(x),
    max: Math.max,
    min: Math.min,
    pow: Math.pow,
    sin: Math.sin,
    sqrt: Math.sqrt,
    vec3f: vector,
  };
  return runInNewContext(`${javascript}\n({
    a3dPrd04SheenInit, a3dPrd04DCharlie, a3dPrd04VNeubelt,
    a3dPrd04SheenEnergyScale, a3dPrd04SheenAlbedoBound,
    a3dPrd04SheenDirect, a3dPrd04IBLSheen, a3dPrd04SheenIndirect,
    a3dPrd04SheenEnergyCompensation, a3dPrd04SheenEnergyCompensationIndirect
  })`, builtins) as SheenFunctions;
}

const sheen = executeSheenSubset(A3D_PRD04_SHEEN_WGSL);

function expectVectorClose(actual: Vec3, expected: Vec3, digits = 10): void {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

/**
 * Gauss-Legendre nodes on [0, 1], generated from polynomial roots rather than
 * a fixture. The reference integrates over incident directions with weights
 * different from the shader's view-adaptive midpoint rule and calls the actual
 * direct shader function. JS doubles are not evidence of GPU/f32 precision.
 */
function gaussLegendre(order: number): Array<{ mu: number; weight: number }> {
  const nodes: Array<{ mu: number; weight: number }> = [];
  for (let k = 1; k <= order; k++) {
    let root = Math.cos(Math.PI * (k - 0.25) / (order + 0.5));
    let derivative = 0;
    for (let iteration = 0; iteration < 30; iteration++) {
      let previous = 1;
      let polynomial = root;
      for (let n = 2; n <= order; n++) {
        const next = ((2 * n - 1) * root * polynomial - (n - 1) * previous) / n;
        previous = polynomial;
        polynomial = next;
      }
      derivative = order * (root * polynomial - previous) / (root * root - 1);
      const delta = polynomial / derivative;
      root -= delta;
      if (Math.abs(delta) < 1e-15) break;
    }
    nodes.push({ mu: (root + 1) / 2, weight: 1 / ((1 - root * root) * derivative * derivative) });
  }
  return nodes;
}

function integrateIncident(
  nv: number,
  roughness: number,
  nodes: readonly { mu: number; weight: number }[],
  azimuths: number,
  includeLambertSubstrate = false,
): number {
  const view = vector(Math.sqrt(1 - nv * nv), 0, nv);
  let integral = 0;
  for (const { mu: nl, weight } of nodes) {
    const radial = Math.sqrt(1 - nl * nl);
    for (let j = 0; j < azimuths; j++) {
      const phi = 2 * Math.PI * (j + 0.5) / azimuths;
      const light = vector(radial * Math.cos(phi), radial * Math.sin(phi), nl);
      const substrate = includeLambertSubstrate
        ? sheen.a3dPrd04SheenEnergyCompensation(normal, view, light, white, roughness) / Math.PI
        : 0;
      integral += (sheen.a3dPrd04SheenDirect(light, view, normal, white, roughness).x + substrate) * nl * weight;
    }
  }
  return integral * 2 * Math.PI / azimuths;
}

describe("independent WGSL sheen candidate", () => {
  it("declares the exact recorded sheen interface and both TypeScript exports", () => {
    const api = JSON.parse(readFileSync(new URL("../../../docs/prds/aura3d-independent-shader-api.json", import.meta.url), "utf8")) as {
      modules: Array<{ name: string; wgsl: { functions: Array<{ signature: string }> } }>;
    };
    const sheenContract = api.modules.find((entry) => entry.name === "sheen");
    expect(sheenContract?.wgsl.functions).toHaveLength(8);
    for (const { signature } of sheenContract!.wgsl.functions) {
      expect(A3D_PRD04_SHEEN_WGSL).toContain(`${signature} {`);
    }
    expect(sheenDefault).toBe(A3D_PRD04_SHEEN_WGSL);
  });

  it("initializes only the lobe's sheen fields from linear RGB and alpha", () => {
    const lobes: Lobes = { sheenColor: black, sheenRoughness: 0, marker: 37 };
    sheen.a3dPrd04SheenInit(lobes, vector(0.8, 0.6, 0.4), 0.8,
      { x: 0.25, y: 0.5, z: 0.75, w: 0.01 }, { x: 0.9, y: 0.8, z: 0.7, w: 0.25 });
    expectVectorClose(lobes.sheenColor, vector(0.2, 0.3, 0.3));
    expect(lobes.sheenRoughness).toBeCloseTo(0.2);
    expect(lobes.marker).toBe(37);

    sheen.a3dPrd04SheenInit(lobes, vector(-2, 3, 0), 2,
      { x: 1, y: 1, z: 1, w: 1 }, { x: 1, y: 1, z: 1, w: 1 });
    expectVectorClose(lobes.sheenColor, vector(0, 1, 0));
    expect(lobes.sheenRoughness).toBe(1);
  });

  it("normalizes the Charlie distribution and handles zero roughness explicitly", () => {
    const samples = 20_000;
    for (const roughness of [0.2, 0.5, 1]) {
      // Integrate D(h) cos(theta_h) over a hemisphere; a valid NDF integrates to one.
      let projectedArea = 0;
      for (let i = 0; i < samples; i++) {
        const mu = (i + 0.5) / samples;
        projectedArea += 2 * Math.PI * sheen.a3dPrd04DCharlie(roughness, mu) * mu / samples;
      }
      expect(projectedArea).toBeCloseTo(1, 3);
      expect(sheen.a3dPrd04DCharlie(roughness, 1)).toBe(0);
      expect(sheen.a3dPrd04DCharlie(roughness, 0)).toBeGreaterThan(0);
    }
    for (const nh of [0, 0.001, 0.5, 1]) {
      const zero = sheen.a3dPrd04DCharlie(0, nh);
      expect(Number.isFinite(zero)).toBe(true);
      expect(zero).toBe(sheen.a3dPrd04DCharlie(0.02, nh));
    }
  });

  it("keeps visibility and direct reflection reciprocal and finite at grazing", () => {
    expect(sheen.a3dPrd04VNeubelt(1, 1)).toBeCloseTo(1 / 4, 12);
    expect(sheen.a3dPrd04VNeubelt(0.5, 0.5)).toBeCloseTo(1 / 3, 12);
    expect(sheen.a3dPrd04VNeubelt(0.1, 0.8)).toBe(sheen.a3dPrd04VNeubelt(0.8, 0.1));
    expect(Number.isFinite(sheen.a3dPrd04VNeubelt(0, 0))).toBe(true);

    const view = vector(Math.sqrt(0.75), 0, 0.5);
    const light = vector(-0.6, 0, 0.8);
    const color = vector(0.2, 0.5, 0.9);
    const reflected = sheen.a3dPrd04SheenDirect(light, view, normal, color, 0.5);
    expectVectorClose(reflected, sheen.a3dPrd04SheenDirect(view, light, normal, color, 0.5));
    expect(reflected.x).toBeGreaterThan(0);
    expectVectorClose(sheen.a3dPrd04SheenDirect(light, view, normal, black, 0), black);
    expectVectorClose(sheen.a3dPrd04SheenDirect(vector(0, 0, -1), view, normal, white, 0.5), black);
    // Opposite tangent vectors have no defined half-vector.
    expectVectorClose(sheen.a3dPrd04SheenDirect(vector(-1, 0, 0), vector(1, 0, 0), normal, white, 0), black);
    const theoreticalBound = ((2 + 1 / 0.001) / (2 * Math.PI)) / (4 * 0.0001);
    for (const roughness of [0, 0.02, 0.5, 1]) {
      for (const elevation of [0, 1e-9, 1e-4, 0.01]) {
        const tangent = vector(Math.sqrt(1 - elevation * elevation), 0, elevation);
        const sample = sheen.a3dPrd04SheenDirect(tangent, tangent, normal, white, roughness);
        for (const component of [sample.x, sample.y, sample.z]) {
          expect(Number.isFinite(component)).toBe(true);
          expect(component).toBeGreaterThanOrEqual(0);
          expect(component).toBeLessThanOrEqual(theoreticalBound * (1 + 1e-12));
        }
      }
    }
  });

  it("keeps the normalized direct BRDF reciprocal over roughness and grazing views", () => {
    for (const roughness of [0, 0.03, 0.2, 0.5, 1]) {
      for (const nv of [0.000001, 0.1, 1]) {
        for (const nl of [0.001, 0.5, 1]) {
          const view = vector(Math.sqrt(1 - nv * nv), 0, nv);
          const light = vector(0, Math.sqrt(1 - nl * nl), nl);
          const forward = sheen.a3dPrd04SheenDirect(light, view, normal, white, roughness);
          const reverse = sheen.a3dPrd04SheenDirect(view, light, normal, white, roughness);
          expectVectorClose(forward, reverse, 10);
        }
      }
    }
  });

  it("approximates an independently integrated normal-view directional albedo", () => {
    // At n·v = 1, V = 1/4 and sin²(theta_h) = (1 - n·l)/2.
    // Integrating D * V * (n·l) over the hemisphere gives this closed form.
    for (const roughness of [0.3, 0.5, 0.75, 1]) {
      const distributionRoughness = Math.max(roughness * roughness, 0.001);
      const exponent = 1 / (2 * distributionRoughness);
      const analytic = 2 ** (-exponent - 1) / (exponent + 2) * sheen.a3dPrd04SheenEnergyScale(roughness);
      expect(Math.abs(sheen.a3dPrd04IBLSheen(1, roughness) - analytic)).toBeLessThan(0.001);
    }
    for (const roughness of [0, 0.02, 0.5, 1]) {
      for (const nv of [0, 0.00001, 0.25, 0.75, 1]) {
        const albedo = sheen.a3dPrd04IBLSheen(nv, roughness);
        expect(Number.isFinite(albedo)).toBe(true);
        expect(albedo).toBeGreaterThanOrEqual(0);
        expect(albedo).toBeLessThanOrEqual(1);
      }
    }
  });

  it("tracks a finer integration of the direct BRDF for moderate roughness", () => {
    // This evaluates the direct shader function on a finer grid instead of
    // repeating the internal albedo integrand, with no external fixture.
    const elevations = 96;
    const azimuths = 192;
    for (const nv of [0.2, 0.55]) {
      const view = vector(Math.sqrt(1 - nv * nv), 0, nv);
      for (const roughness of [0.5, 1]) {
        let integral = 0;
        for (let i = 0; i < elevations; i++) {
          const nl = (i + 0.5) / elevations;
          const radial = Math.sqrt(1 - nl * nl);
          for (let j = 0; j < azimuths; j++) {
            const phi = 2 * Math.PI * (j + 0.5) / azimuths;
            const light = vector(radial * Math.cos(phi), radial * Math.sin(phi), nl);
            integral += sheen.a3dPrd04SheenDirect(light, view, normal, white, roughness).x * nl;
          }
        }
        integral *= 2 * Math.PI / (elevations * azimuths);
        expect(Math.abs(sheen.a3dPrd04IBLSheen(nv, roughness) - integral)).toBeLessThan(0.015);
      }
    }
  });

  it("normalizes the formerly super-unit grazing subset before direct lighting", () => {
    // Restrict the incident integral to 0.001 <= N·L <= 0.02 and azimuths
    // within ±π/2 of a near-horizon view. Over this subset V·L >= 0, hence
    // N·H² <= (N·L + N·V)² / 2. Bounding the Charlie distribution from
    // below and N·L * V from below gives a conservative closed-form bound.
    // The actual full hemisphere integral can only be larger. This is an
    // lower bound applied to the unscaled distribution exceeded two, which
    // is why simply clamping the IBL estimate was insufficient.
    const nv = 0.000001;
    const low = 0.001;
    const high = 0.02;
    const exponent = 1000; // 1 / the candidate's minimum distribution roughness
    const maxNhSquared = (high + nv) ** 2 / 2;
    const minimumD = (2 + exponent) / (2 * Math.PI) * (1 - maxNhSquared) ** (exponent / 2);
    const lowerBound = minimumD * (low / (low + nv)) * (high - low) * Math.PI / 4;
    expect(lowerBound).toBeGreaterThan(2);

    const rows = 64;
    const columns = 64;
    const view = vector(Math.sqrt(1 - nv * nv), 0, nv);
    let integral = 0;
    for (let i = 0; i < rows; i++) {
      const nl = low + (high - low) * (i + 0.5) / rows;
      const radial = Math.sqrt(1 - nl * nl);
      for (let j = 0; j < columns; j++) {
        const phi = -Math.PI / 2 + Math.PI * (j + 0.5) / columns;
        const light = vector(radial * Math.cos(phi), radial * Math.sin(phi), nl);
        integral += sheen.a3dPrd04SheenDirect(light, view, normal, white, 0).x * nl;
      }
    }
    integral *= (high - low) * Math.PI / (rows * columns);
    expect(integral).toBeGreaterThanOrEqual(lowerBound * sheen.a3dPrd04SheenEnergyScale(0));
    expect(integral).toBeLessThan(sheen.a3dPrd04SheenAlbedoBound(nv, 0));
  });

  it("bounds direct hemispherical energy and compares IBL against independent quadrature", () => {
    const nodes = gaussLegendre(80);
    expect(nodes.reduce((sum, node) => sum + node.weight, 0)).toBeCloseTo(1, 12);
    for (const roughness of [0, 0.05, 0.2, 0.5, 1]) {
      const scale = sheen.a3dPrd04SheenEnergyScale(roughness);
      expect(scale).toBeGreaterThan(0);
      expect(scale).toBeLessThanOrEqual(0.98);
      for (const nv of [0, 0.000001, 0.01, 0.1, 0.5, 1]) {
        const actual = integrateIncident(nv, roughness, nodes, 256);
        const bound = sheen.a3dPrd04SheenAlbedoBound(nv, roughness);
        const ibl = sheen.a3dPrd04IBLSheen(nv, roughness);
        expect(actual, `direct energy r=${roughness} nv=${nv}`).toBeGreaterThanOrEqual(0);
        expect(actual, `direct energy r=${roughness} nv=${nv}`).toBeLessThanOrEqual(bound + 0.0002);
        expect(bound).toBeLessThanOrEqual(0.98);
        expect(ibl).toBeGreaterThanOrEqual(0);
        expect(ibl).toBeLessThanOrEqual(bound);
        expect(Math.abs(ibl - actual), `IBL error r=${roughness} nv=${nv}`).toBeLessThan(0.03);
      }
    }
  }, 30_000);

  it("checks the incident-integration reference against a finer grid and a closed form", () => {
    const nodes = gaussLegendre(80);
    const finerNodes = gaussLegendre(128);
    for (const [nv, roughness] of [[0, 0], [0.01, 0.05], [0.1, 0.5], [1, 1]]) {
      const standard = integrateIncident(nv, roughness, nodes, 256);
      const finer = integrateIncident(nv, roughness, finerNodes, 512);
      expect(Math.abs(standard - finer), `r=${roughness} nv=${nv}`).toBeLessThan(0.003);
    }
    for (const roughness of [0.05, 0.2, 0.5, 1]) {
      const exponent = 1 / (2 * Math.max(roughness * roughness, 0.001));
      const exact = 2 ** (-exponent - 1) / (exponent + 2) * sheen.a3dPrd04SheenEnergyScale(roughness);
      expect(Math.abs(integrateIncident(1, roughness, nodes, 256) - exact)).toBeLessThan(0.00001);
    }
  }, 30_000);

  it("retains energy headroom when sheen overlays a unit-energy Lambert substrate", () => {
    const nodes = gaussLegendre(80);
    for (const roughness of [0, 0.5, 1]) {
      for (const nv of [0.000001, 0.1, 1]) {
        const layered = integrateIncident(nv, roughness, nodes, 256, true);
        expect(layered, `r=${roughness} nv=${nv}`).toBeLessThanOrEqual(1.0002);
        expect(layered).toBeGreaterThanOrEqual(0);
      }
    }
  }, 30_000);

  it("uses physical irradiance units and preserves indirect linearity", () => {
    const roughness = 0.75;
    const albedo = sheen.a3dPrd04IBLSheen(1, roughness);
    const irradiance = vector(Math.PI, 2 * Math.PI, 4 * Math.PI);
    const color = vector(0.25, 0.5, 1);
    const indirect = sheen.a3dPrd04SheenIndirect(normal, normal, roughness, color, irradiance);
    expectVectorClose(indirect, vector(0.25 * albedo, albedo, 4 * albedo));
    expectVectorClose(sheen.a3dPrd04SheenIndirect(normal, normal, roughness, black, irradiance), black);
    expectVectorClose(sheen.a3dPrd04SheenIndirect(normal, normal, roughness, white, black), black);
    expectVectorClose(sheen.a3dPrd04SheenIndirect(normal, vector(0, 0, -1), roughness, white, irradiance), black);
  });

  it("bounds substrate compensation, preserves zero sheen and is symmetric in light/view", () => {
    const view = vector(Math.sqrt(0.75), 0, 0.5);
    const light = vector(-0.6, 0, 0.8);
    for (const roughness of [0, 0.5, 1]) {
      expect(sheen.a3dPrd04SheenEnergyCompensation(normal, view, light, black, roughness)).toBe(1);
      expect(sheen.a3dPrd04SheenEnergyCompensationIndirect(normal, view, black, roughness)).toBe(1);
      const weak = sheen.a3dPrd04SheenEnergyCompensation(normal, view, light, vector(0.2, 0.1, 0.1), roughness);
      const strong = sheen.a3dPrd04SheenEnergyCompensation(normal, view, light, white, roughness);
      expect(strong).toBeGreaterThanOrEqual(0);
      expect(strong).toBeLessThanOrEqual(weak);
      expect(weak).toBeLessThanOrEqual(1);
      expect(strong).toBe(sheen.a3dPrd04SheenEnergyCompensation(normal, light, view, white, roughness));
      expect(sheen.a3dPrd04SheenEnergyCompensation(normal, view, view, white, roughness))
        .toBeCloseTo(sheen.a3dPrd04SheenEnergyCompensationIndirect(normal, view, white, roughness), 12);
    }
    expect(sheen.a3dPrd04SheenEnergyCompensation(normal, view, vector(0, 0, -1), white, 0.5)).toBe(1);
    expect(sheen.a3dPrd04SheenEnergyCompensationIndirect(normal, vector(0, 0, -1), white, 0.5)).toBe(1);
  });
});
