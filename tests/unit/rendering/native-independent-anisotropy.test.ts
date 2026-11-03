import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import shader, { A3D_PRD04_ANISOTROPY_WGSL } from '../../../packages/rendering/src/shaders/independent-wgsl/Anisotropy';

type Vec3 = { x: number; y: number; z: number };
type Lobes = {
  anisotropy: number;
  anisotropyT: Vec3;
  anisotropyB: Vec3;
  alphaT: number;
  sentinel: number;
};
type ShaderFunction = (...args: unknown[]) => unknown;

const v3 = (x: number, y = x, z = x): Vec3 => ({ x, y, z });
const dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const unit = (v: Vec3): Vec3 => {
  const length = Math.sqrt(dot(v, v));
  return v3(v.x / length, v.y / length, v.z / length);
};
const blankLobes = (): Lobes => ({
  anisotropy: -1,
  anisotropyT: v3(0),
  anisotropyB: v3(0),
  alphaT: -1,
  sentinel: 123,
});

/**
 * Execute this candidate's deliberately small expression/statement subset on
 * the CPU. Bodies come from the WGSL string, rather than a translated copy of
 * the algorithm. Arithmetic here uses JS doubles, not shader f32; this is not
 * a WGSL compiler or a GPU validation test. Unsupported syntax fails to parse.
 */
function executableShader(): Record<string, ShaderFunction> {
  const names = [
    'a3dPrd04AnisotropyUnitOr',
    'a3dPrd04VGGXAnisotropic',
    'a3dPrd04DGGXAnisotropic',
    'a3dPrd04AnisotropyInit',
    'a3dPrd04AnisotropyDirect',
    'a3dPrd04AnisotropyBentNormal',
  ];
  const builtins: Record<string, unknown> = {
    abs: Math.abs,
    min: Math.min,
    max: Math.max,
    sqrt: Math.sqrt,
    inverseSqrt: (x: number) => 1 / Math.sqrt(x),
    clamp: (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x)),
    dot,
    vec3f: v3,
  };
  const api: Record<string, unknown> = { ...builtins };
  for (const name of names) {
    const { parameters, body } = extractFunction(name);
    const argumentNames = splitParameters(parameters).map((parameter) => parameter.split(':')[0].trim());
    const bodyAsJavaScript = body.replaceAll('(*lobes)', 'lobes');
    const available = [...Object.keys(builtins), ...names.filter((candidate) => candidate !== name)];
    const compile = new Function('api', ...argumentNames, `const { ${available.join(', ')} } = api;\n${bodyAsJavaScript}`) as
      (scope: Record<string, unknown>, ...args: unknown[]) => unknown;
    api[name] = (...args: unknown[]) => compile(api, ...args);
  }
  return api as Record<string, ShaderFunction>;
}

function extractFunction(name: string): { parameters: string; result: string; body: string } {
  const declaration = new RegExp(`\\bfn\\s+${name}\\s*\\(([^)]*)\\)\\s*(?:->\\s*(\\w+))?\\s*\\{`, 'm').exec(shader);
  if (!declaration || declaration.index === undefined) throw new Error(`Missing function ${name}`);
  const start = declaration.index + declaration[0].length;
  let depth = 1;
  for (let i = start; i < shader.length; i += 1) {
    if (shader[i] === '{') depth += 1;
    if (shader[i] === '}') depth -= 1;
    if (depth === 0) return { parameters: declaration[1], result: declaration[2] ?? '', body: shader.slice(start, i) };
  }
  throw new Error(`Unclosed function ${name}`);
}

function splitParameters(parameters: string): string[] {
  let depth = 0;
  let start = 0;
  const parts: string[] = [];
  for (let i = 0; i < parameters.length; i += 1) {
    if (parameters[i] === '<') depth += 1;
    if (parameters[i] === '>') depth -= 1;
    if (parameters[i] === ',' && depth === 0) {
      parts.push(parameters.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (parameters.slice(start).trim()) parts.push(parameters.slice(start).trim());
  return parts;
}

const functions = executableShader();
const D = (...args: number[]): number => functions.a3dPrd04DGGXAnisotropic(...args) as number;
const visibility = (...args: number[]): number => functions.a3dPrd04VGGXAnisotropic(...args) as number;
const init = (lobes: Lobes, factor: { x: number; y: number }, texel: { x: number; y: number; z: number; w: number }, useTexture: boolean, tangent: Vec3, bitangent: Vec3, roughness: number): void => {
  functions.a3dPrd04AnisotropyInit(lobes, factor, texel, useTexture, tangent, bitangent, roughness);
};
const direct = (light: Vec3, view: Vec3, normal: Vec3, f0: Vec3, f90: number, roughness: number, lobes: Lobes): Vec3 =>
  functions.a3dPrd04AnisotropyDirect(light, view, normal, f0, f90, roughness, lobes) as Vec3;
const bent = (view: Vec3, normal: Vec3, roughness: number, bitangent: Vec3, strength: number): Vec3 =>
  functions.a3dPrd04AnisotropyBentNormal(view, normal, roughness, bitangent, strength) as Vec3;
const texel = (x: number, y: number, z: number, w = 1) => ({ x, y, z, w });
const xAxis = v3(1, 0, 0);
const yAxis = v3(0, 1, 0);
const zAxis = v3(0, 0, 1);

function expectVector(actual: Vec3, expected: Vec3, precision = 12): void {
  expect(actual.x).toBeCloseTo(expected.x, precision);
  expect(actual.y).toBeCloseTo(expected.y, precision);
  expect(actual.z).toBeCloseTo(expected.z, precision);
}

describe('independently authored anisotropic WGSL candidate', () => {
  it('declares the captured API, with only the lobe struct as an external dependency', () => {
    const manifest = JSON.parse(readFileSync(new URL('../../../docs/prds/aura3d-independent-shader-api.json', import.meta.url), 'utf8')) as {
      modules: Array<{ name: string; wgsl: { functions: Array<{ name: string; signature: string }>; exports: Array<{ name: string }> } }>;
    };
    const module = manifest.modules.find((candidate) => candidate.name === 'anisotropy');
    expect(module).toBeDefined();
    expect(module?.wgsl.exports.map((entry) => entry.name)).toEqual(['A3D_PRD04_ANISOTROPY_WGSL', 'default']);
    expect(shader).toBe(A3D_PRD04_ANISOTROPY_WGSL);
    for (const declaration of module?.wgsl.functions ?? []) {
      const parsed = extractFunction(declaration.name);
      const actual = `fn ${declaration.name}(${parsed.parameters})${parsed.result ? ` -> ${parsed.result}` : ''}`;
      const compact = (value: string) => value.replace(/\s+/g, ' ').trim();
      expect(compact(actual)).toBe(compact(declaration.signature));
    }
    expect(shader).not.toMatch(/@group\s*\(|@binding\s*\(|\bstruct\s+/);
    expect([...shader.matchAll(/\(\*lobes\)\.(\w+)\s*=/g)].map((match) => match[1]).sort())
      .toEqual(['alphaT', 'anisotropy', 'anisotropyB', 'anisotropyT'].sort());
  });

  it('recovers the analytic GGX limits and rotates anisotropic axes consistently', () => {
    for (const alpha of [0.08, 0.3, 0.7, 1]) {
      expect(D(alpha, alpha, 1, 0, 0)).toBeCloseTo(1 / (Math.PI * alpha * alpha), 9);
      const h = unit(v3(0.3, -0.5, 0.8));
      const isotropic = alpha * alpha / (Math.PI * (1 + (alpha * alpha - 1) * h.z * h.z) ** 2);
      expect(D(alpha, alpha, h.z, h.x, h.y)).toBeCloseTo(isotropic, 10);
    }
    for (const h of [zAxis, unit(v3(1, 2, 3)), unit(v3(-3, 1, 0.01))]) {
      expect(D(1, 1, h.z, h.x, h.y)).toBeCloseTo(1 / Math.PI, 12);
      expect(D(0.23, 0.79, h.z, h.x, h.y)).toBeCloseTo(D(0.79, 0.23, h.z, h.y, h.x), 12);
    }
    expect(D(0.3, 0.7, 0, 1, 0)).toBe(0);
    expect(D(0.3, 0.7, -1, 0, 0)).toBe(0);
  });

  it('normalizes the normal distribution over the hemisphere', () => {
    // Midpoint quadrature of integral D(h) * cos(theta) d(omega) = 1;
    // integrate uniformly in mu=cos(theta) and phi, with no shader fixture.
    const rows = 320;
    const columns = 256;
    for (const [alphaT, alphaB] of [[0.3, 0.7], [0.55, 0.55], [1, 1]]) {
      let sum = 0;
      for (let row = 0; row < rows; row += 1) {
        const mu = (row + 0.5) / rows;
        const radial = Math.sqrt(1 - mu * mu);
        for (let column = 0; column < columns; column += 1) {
          const phi = 2 * Math.PI * (column + 0.5) / columns;
          sum += D(alphaT, alphaB, mu, radial * Math.cos(phi), radial * Math.sin(phi)) * mu;
        }
      }
      const integral = sum * 2 * Math.PI / (rows * columns);
      expect(Math.abs(integral - 1)).toBeLessThan(0.002);
    }
  });

  it('agrees with the independently computed Smith Lambda formulation', () => {
    // Heitz eqs. 80, 86, 99: G2 = 1 / (1 + Lambda(v) + Lambda(l)).
    const lambda = (alphaT: number, alphaB: number, direction: Vec3): number =>
      (Math.sqrt(1 + ((alphaT * direction.x) ** 2 + (alphaB * direction.y) ** 2) / direction.z ** 2) - 1) / 2;
    for (const [at, ab] of [[0.17, 0.61], [0.6, 0.6], [1, 1]]) {
      for (const view of [zAxis, unit(v3(0.8, 0.3, 0.2)), unit(v3(-0.1, 0.7, 0.9))]) {
        for (const light of [zAxis, unit(v3(0.2, -0.5, 0.7))]) {
          const expected = 1 / (4 * view.z * light.z * (1 + lambda(at, ab, view) + lambda(at, ab, light)));
          const actual = visibility(at, ab, view.x, view.y, light.x, light.y, view.z, light.z);
          expect(actual).toBeCloseTo(expected, 11);
        }
      }
      expect(visibility(at, ab, 0, 0, 0, 0, 1, 1)).toBeCloseTo(0.25, 12);
    }
    expect(visibility(0.3, 0.7, 1, 0, 0, 0, 0, 1)).toBe(0);
    expect(visibility(0.3, 0.7, 0, 0, 1, 0, 1, -0.1)).toBe(0);
    // The factor-two form of the denominator matches the host's equivalent
    // 0.5/max(sum, 1e-6) cap, including a near-double-horizon input.
    expect(visibility(0.5, 0.5, 1, 0, 1, 0, 1e-8, 1e-8)).toBe(500_000);
  });

  it('initializes strength, rotated orthonormal axes, and the declared alpha mapping', () => {
    const lobe = blankLobes();
    init(lobe, { x: 0, y: 0.6 }, texel(0.5, 1, 0.5), true, xAxis, yAxis, 0.5);
    // Two quarter-turns compose to a half-turn; blue halves the strength.
    expect(lobe.anisotropy).toBeCloseTo(0.3, 12);
    expectVector(lobe.anisotropyT, v3(-1, 0, 0));
    expectVector(lobe.anisotropyB, v3(0, -1, 0));
    expect(lobe.alphaT).toBeCloseTo(0.25 * (1 - 0.3 ** 2) + 0.3 ** 2, 12);
    expect(lobe.sentinel).toBe(123);

    const untextured = blankLobes();
    init(untextured, { x: 0.3, y: 0.4 }, texel(0, 0, 0), false, xAxis, yAxis, 0.7);
    expect(untextured.anisotropy).toBeCloseTo(0.5, 12);
    expectVector(untextured.anisotropyT, v3(0.6, 0.8, 0));
    expectVector(untextured.anisotropyB, v3(-0.8, 0.6, 0));
    expect(untextured.alphaT).toBeCloseTo(0.49 * 0.75 + 0.25, 12);

    for (const [factor, roughness] of [[{ x: 0, y: 0 }, 0.4], [{ x: 1, y: 0 }, 0.4], [{ x: 1, y: 0 }, 1]] as const) {
      const result = blankLobes();
      init(result, factor, texel(0.5, 0.5, 1), true, v3(0), v3(0), roughness);
      expect(result.anisotropy).toBe(factor.x);
      expect(result.alphaT).toBeCloseTo(roughness ** 2 * (1 - factor.x ** 2) + factor.x ** 2, 12);
      expect(dot(result.anisotropyT, result.anisotropyT)).toBeCloseTo(1, 12);
      expect(dot(result.anisotropyB, result.anisotropyB)).toBeCloseTo(1, 12);
      expect(dot(result.anisotropyT, result.anisotropyB)).toBeCloseTo(0, 12);
    }
    const collinearFrame = blankLobes();
    init(collinearFrame, { x: 1, y: 0 }, texel(0.5, 0.5, 1), true, v3(0, 0, 4), v3(0, 0, -3), 0.6);
    expect(dot(collinearFrame.anisotropyT, collinearFrame.anisotropyT)).toBeCloseTo(1, 12);
    expect(dot(collinearFrame.anisotropyB, collinearFrame.anisotropyB)).toBeCloseTo(1, 12);
    expect(dot(collinearFrame.anisotropyT, collinearFrame.anisotropyB)).toBeCloseTo(0, 12);
  });

  it('returns a reciprocal BRDF with the expected normal-incidence and horizon limits', () => {
    const lobe = blankLobes();
    init(lobe, { x: 0.6, y: 0 }, texel(1, 0.5, 1), false, xAxis, yAxis, 0.5);
    const normal = direct(zAxis, zAxis, zAxis, v3(0.2, 0.5, 1), 1, 0.5, lobe);
    const scale = 1 / (4 * Math.PI * lobe.alphaT * 0.25);
    expectVector(normal, v3(0.2 * scale, 0.5 * scale, scale));
    const view = unit(v3(0.5, 0.2, 0.7));
    const light = unit(v3(-0.3, 0.6, 0.4));
    expectVector(direct(light, view, zAxis, v3(0.04, 0.3, 0.7), 1, 0.5, lobe), direct(view, light, zAxis, v3(0.04, 0.3, 0.7), 1, 0.5, lobe));

    // Symmetric grazing directions have h=n, so D, Smith G2, and the
    // fifth-power Fresnel can each be computed without using the WGSL helpers.
    const grazingView = unit(v3(1, 0, 0.1));
    const grazingLight = v3(-grazingView.x, 0, grazingView.z);
    const lambda = (Math.sqrt(1 + (lobe.alphaT * grazingView.x / grazingView.z) ** 2) - 1) / 2;
    const g2 = 1 / (1 + 2 * lambda);
    const scalar = g2 / (4 * grazingView.z ** 2 * Math.PI * lobe.alphaT * 0.25);
    const f0 = v3(0.04, 0.2, 0.5);
    const f90 = 0.8;
    const grazingFresnel = (base: number) => base + (f90 - base) * (1 - grazingView.z) ** 5;
    expectVector(direct(grazingLight, grazingView, zAxis, f0, f90, 0.5, lobe),
      v3(scalar * grazingFresnel(f0.x), scalar * grazingFresnel(f0.y), scalar * grazingFresnel(f0.z)));

    expectVector(direct(xAxis, zAxis, zAxis, v3(1), 1, 0.5, lobe), v3(0));
    expectVector(direct(v3(0, 0, -1), zAxis, zAxis, v3(1), 1, 0.5, lobe), v3(0));
    expectVector(direct(zAxis, v3(0), zAxis, v3(1), 1, 0.5, lobe), v3(0));
  });

  it('reduces to the host single-scatter isotropic term at zero strength', () => {
    // Derive isotropic GGX and correlated Smith directly from N·H, N·L and
    // N·V. The generated host subtracts this term once before adding the
    // anisotropic BRDF, including the same regularization near the horizon.
    const f0 = v3(0.04, 0.3, 0.8);
    const f90 = 0.9;
    for (const roughness of [0.0525, 0.3, 1]) {
      const lobe = blankLobes();
      init(lobe, { x: 0, y: 0 }, texel(1, 0.5, 1), false, unit(v3(1, 1, 0)), unit(v3(-1, 1, 0)), roughness);
      for (const [view, light] of [
        [zAxis, zAxis],
        [unit(v3(0.5, 0.2, 0.7)), unit(v3(-0.3, 0.6, 0.4))],
        [unit(v3(1, 0, 1e-8)), unit(v3(0, 1, 1e-8))],
        [unit(v3(1, 0, 0.001)), unit(v3(-1, 0, 0.001))],
      ] as const) {
        const h = unit(v3(view.x + light.x, view.y + light.y, view.z + light.z));
        const alpha = roughness * roughness;
        const alpha2 = alpha * alpha;
        const denominator = 1 + (alpha2 - 1) * h.z * h.z;
        const distribution = alpha2 / (Math.PI * Math.max(denominator * denominator, 1e-12));
        const root = (cosine: number) => Math.sqrt(alpha2 + (1 - alpha2) * cosine * cosine);
        const visibility = 0.5 / Math.max(light.z * root(view.z) + view.z * root(light.z), 1e-6);
        const fifthPower = (1 - Math.min(1, Math.max(0, dot(view, h)))) ** 5;
        const brdf = (base: number) => (base + (f90 - base) * fifthPower) * distribution * visibility;
        const actual = direct(light, view, zAxis, f0, f90, roughness, lobe);
        for (const [observed, expected] of [[actual.x, brdf(f0.x)], [actual.y, brdf(f0.y)], [actual.z, brdf(f0.z)]]) {
          expect(Math.abs(observed - expected)).toBeLessThanOrEqual(1e-7 * Math.max(1, Math.abs(expected)));
        }
      }
    }
  });

  it('keeps integrated single-scattering reflectance bounded for sampled frames', () => {
    // White Fresnel isolates the microfacet distribution and masking. Integrate
    // the actual candidate BRDF against N·L, uniformly in cos(theta) and phi.
    // This finite grid samples moderate-width lobes, not the sharp delta limit.
    const rows = 96;
    const columns = 192;
    for (const roughness of [0.5, 1]) {
      for (const strength of [0, 0.7, 1]) {
        const lobe = blankLobes();
        init(lobe, { x: strength, y: 0 }, texel(1, 0.5, 1), false, xAxis, yAxis, roughness);
        for (const nv of [0.25, 1]) {
          const view = v3(Math.sqrt(1 - nv * nv), 0, nv);
          let integral = 0;
          for (let row = 0; row < rows; row += 1) {
            const nl = (row + 0.5) / rows;
            const radial = Math.sqrt(1 - nl * nl);
            for (let column = 0; column < columns; column += 1) {
              const phi = 2 * Math.PI * (column + 0.5) / columns;
              const light = v3(radial * Math.cos(phi), radial * Math.sin(phi), nl);
              integral += direct(light, view, zAxis, v3(1), 1, roughness, lobe).x * nl;
            }
          }
          integral *= 2 * Math.PI / (rows * columns);
          expect(Number.isFinite(integral)).toBe(true);
          expect(integral).toBeGreaterThan(0);
          expect(integral).toBeLessThanOrEqual(1.01);
          // For alphaT = alphaB = 1 and N = V, integration of the Smith
          // expression reduces independently to integral_0^1 mu/(1+mu) dmu.
          if (roughness === 1 && nv === 1) {
            expect(integral).toBeCloseTo(1 - Math.log(2), 5);
          }
        }
      }
    }
  });

  it('keeps bent normals normalized, stable at limiting parameters, and within the surface hemisphere', () => {
    const view = unit(v3(0.6, 0.3, 0.8));
    expectVector(bent(view, zAxis, 0.2, yAxis, 0), zAxis);
    expectVector(bent(view, zAxis, 1, yAxis, 1), zAxis);
    expectVector(bent(view, zAxis, 0, v3(0), 1), zAxis);
    expectVector(bent(v3(0, 0, -1), zAxis, 0, yAxis, 1), zAxis);
    const bentNormal = bent(view, zAxis, 0, yAxis, 1);
    expectVector(bentNormal, unit(v3(view.x, 0, view.z)));
    expect(dot(bentNormal, bentNormal)).toBeCloseTo(1, 12);
    expect(dot(bentNormal, zAxis)).toBeGreaterThan(0);
  });

  it('regularizes finite degenerate and out-of-range inputs without altering unrelated fields', () => {
    for (const alpha of [-10, 0, 1e-30, 1, 1e30]) {
      for (const nh of [-1, 0, 1e-30, 1]) {
        expect(Number.isFinite(D(alpha, alpha, nh, 0, 0))).toBe(true);
      }
      for (const nv of [-1, 0, 1e-30, 1]) {
        expect(Number.isFinite(visibility(alpha, alpha, 0, 0, 0, 0, nv, 1))).toBe(true);
      }
    }
    const result = blankLobes();
    init(result, { x: 1e30, y: -1e30 }, texel(3, -2, 4), true, v3(0), v3(0), -1e30);
    for (const number of [result.anisotropy, result.alphaT, ...Object.values(result.anisotropyT), ...Object.values(result.anisotropyB)]) {
      expect(Number.isFinite(number)).toBe(true);
    }
    expect(result.anisotropy).toBeGreaterThanOrEqual(0);
    expect(result.anisotropy).toBeLessThanOrEqual(1);
    expect(result.sentinel).toBe(123);
    for (const number of Object.values(direct(v3(0), zAxis, zAxis, v3(1), 1, 0, result))) {
      expect(Number.isFinite(number)).toBe(true);
    }
  });
});
