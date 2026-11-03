import { describe, expect, it, vi } from "vitest";
import "../../../packages/rendering/src/lanes/prd02";
import type { Texture } from "../../../packages/rendering/src/Texture";
import { packA3DEnvironmentUniforms } from "../../../packages/rendering/src/environment/EnvUniforms";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { createGeneratedPbrProgram } from "../../../packages/rendering/src/webgpu/GeneratedPbrProgram";
import {
  deferredProbeFromUniforms, deferredProbeWgsl, packDeferredProbe,
  type DeferredProbeInput, type DeferredProbeLease
} from "../../../packages/rendering/src/webgpu/DeferredProbe";
import { WebGPUResourceInterop } from "../../../packages/rendering/src/webgpu/ResourceInterop";

const bindings = { group: 0, uniformBinding: 6, samplerBinding: 7, textureBinding: 8 };

function makeLease(device: object = {}): DeferredProbeLease {
  return { device, resource: {}, view: {}, sampler: {}, assertUsable: vi.fn() };
}

function makeInput(lease: DeferredProbeLease): DeferredProbeInput {
  return {
    lease, sh: new Float32Array(28), mipCount: 1, rotation: 0,
    diffuseIntensity: 1, specularIntensity: 1,
    ambient: [0, 0, 0], hemiSky: [0, 0, 0], hemiGround: [0, 0, 0], hemiDirection: [0, 1, 0]
  };
}

/** Evaluate the emitted rotation expression with host arithmetic, not WGSL execution. */
function evaluateShaderRotation(shader: string, functionName: string, angle: number, direction: readonly number[]): number[] {
  const rotate = shader.match(new RegExp(`fn ${functionName}[\\s\\S]*?return vec3f\\(([^;]+)\\);`));
  expect(rotate).not.toBeNull();
  const rotationExpressions = rotate![1]!.split(",");
  expect(rotationExpressions).toHaveLength(3);
  const c = Math.cos(angle), s = Math.sin(angle);
  return rotationExpressions.map((expression) => {
    expect(expression).toMatch(/^[\s\d.csdxyz+*\-]+$/);
    const evaluate = new Function("c", "s", "d", `return ${expression}`) as (c: number, s: number, d: { x: number; y: number; z: number }) => number;
    return evaluate(c, s, { x: direction[0]!, y: direction[1]!, z: direction[2]! });
  });
}

/** Evaluate the actual WGSL's SH expression with independently reconstructed lanes. */
function evaluateShaderSh(shader: string, packed: Float32Array, normal: readonly number[]): number[] {
  const rotated = evaluateShaderRotation(shader, "a3dDeferredProbeRotateY", packed[29]!, normal);
  const length = Math.hypot(...rotated);
  const [x, y, z] = rotated.map((component) => component / length) as [number, number, number];

  const lanes: number[][] = [];
  for (const match of shader.matchAll(/let c([0-8]) = ([^;]+);/g)) {
    const selected: number[] = [];
    for (const reference of match[2]!.matchAll(/deferredProbe\.sh\[(\d+)\]\.([xyzw]+)/g)) {
      for (const component of reference[2]!) selected.push(Number(reference[1]) * 4 + "xyzw".indexOf(component));
    }
    lanes[Number(match[1])] = selected;
  }
  expect(lanes).toHaveLength(9);
  for (let index = 0; index < 9; index++) expect(lanes[index]).toEqual([index * 3, index * 3 + 1, index * 3 + 2]);
  const expression = shader.match(/let irradiance = ([\s\S]*?);/)?.[1];
  expect(expression).toBeDefined();
  expect(expression).toMatch(/^[\s\d.cxyz+*()\-]+$/);
  const evaluate = new Function("c0", "c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8", "x", "y", "z", `return ${expression}`) as (...values: number[]) => number;
  return [0, 1, 2].map((channel) => {
    const coefficients = lanes.map((indices) => packed[indices[channel]!]!);
    return Math.max(evaluate(...coefficients, x, y, z), 0) * packed[30]!;
  });
}

/**
 * Evaluate the generated shader's scalar formulas and operation choices on the
 * CPU. The synthetic sample below is an analytic function, not cubemap access.
 */
function evaluateShaderSpecular(shader: string, controls: Float32Array, dialect: "deferred" | "forward") {
  const bendPosition = shader.indexOf("let bent = normalize(mix(");
  expect(bendPosition).toBeGreaterThan(0);
  const reflectionPosition = shader.lastIndexOf("let reflected =", bendPosition);
  expect(reflectionPosition).toBeGreaterThan(0);
  const fragment = shader.slice(reflectionPosition);
  expect(fragment).toMatch(/^let reflected = reflect\(-view, n\);/);
  const bend = fragment.match(/let bent = normalize\(mix\(reflected, n, ([^)]+)\)\);/);
  expect(bend).not.toBeNull();
  expect(bend![1]).toMatch(/^[\s\d.roughnes+*()\-]+$/);
  const evaluateBend = new Function("roughness", `return ${bend![1]}`) as (roughness: number) => number;
  const roughness = 0.5;
  const weight = evaluateBend(roughness);
  const n = [0, 1, 0];
  const view = [Math.sqrt(3) / 2, 0.5, 0];
  const incident = view.map((value) => -value);
  const dot = incident.reduce((sum, value, index) => sum + value * n[index]!, 0);
  const reflected = incident.map((value, index) => value - 2 * dot * n[index]!);
  const mixed = reflected.map((value, index) => value * (1 - weight) + n[index]! * weight);
  const length = Math.hypot(...mixed);
  const bent = mixed.map((value) => value / length);

  const lodExpression = fragment.match(/let lod = ([^;]+);/)?.[1];
  expect(lodExpression).toBeDefined();
  const mipField = dialect === "deferred" ? "deferredProbe.controls.x" : "material.probe.x";
  expect(lodExpression).toContain(mipField);
  const scalarLod = lodExpression!.replace(mipField, "mipCount");
  expect(scalarLod).toMatch(/^[\s\d.a-zA-Z,+*()\-]+$/);
  const evaluateLod = new Function("mipCount", "roughness", "max", `return ${scalarLod}`) as (mipCount: number, roughness: number, max: typeof Math.max) => number;
  const lod = evaluateLod(controls[28]!, roughness, Math.max);

  const sample = fragment.match(/textureSampleLevel\(\s*(\w+),\s*(\w+),\s*(\w+)\(bent,\s*([^)]*)\),\s*lod\)\.rgb \* ([^;]+);/);
  expect(sample).not.toBeNull();
  const [texture, sampler, rotation, angle, intensity] = sample!.slice(1);
  expect([texture, sampler, rotation, angle, intensity]).toEqual(dialect === "deferred"
    ? ["deferredProbeTexture", "deferredProbeSampler", "a3dDeferredProbeRotateY", "deferredProbe.controls.y", "deferredProbe.controls.w"]
    : ["u_envSpecularTexture", "u_envSpecularSampler", "generatedRotateY", "material.probe.y", "material.probe.w"]);
  const direction = evaluateShaderRotation(shader, rotation!, controls[29]!, bent);
  // A direction- and LOD-dependent synthetic radiance makes both inputs observable.
  const syntheticSample = [4 + direction[0]! + lod, 2 + direction[1]!, 1 + direction[2]! * 0.5 + lod * 0.2];
  return { direction, lod, radiance: syntheticSample.map((value) => value * controls[31]!) };
}

describe("deferred global environment probe", () => {
  it("packs forward-convolved interleaved SH and the distinct ambient and hemisphere units", () => {
    const radiance = Float32Array.from({ length: 27 }, (_, i) => (i + 1) / 8);
    const environment = packA3DEnvironmentUniforms({
      probe: { specularCube: {} as Texture, mipCount: 6, sh9: radiance },
      rotation: Math.PI / 2, diffuseIntensity: 1.5, specularIntensity: 0.25,
      ambient: { color: [0.5, 1, 2], intensity: Math.PI },
      hemisphere: { sky: [0.2, 0.4, 0.8], ground: [0.5, 0.25, 0.125], intensity: 2, direction: [0, 0, 1] }
    });
    const lease = makeLease();
    const input = deferredProbeFromUniforms(environment.uniforms, lease);
    const packed = packDeferredProbe(input, lease.device);
    expect(packed.lease).toBe(lease);
    expect(packed.uniforms).toHaveLength(48);
    for (let coefficient = 0; coefficient < 9; coefficient++) {
      const scale = coefficient === 0 ? Math.PI : coefficient < 4 ? 2 * Math.PI / 3 : Math.PI / 4;
      for (let channel = 0; channel < 3; channel++) {
        const i = coefficient * 3 + channel;
        expect(packed.uniforms[i]).toBe(Math.fround(radiance[i]! * scale));
      }
    }
    expect(packed.uniforms[27]).toBe(0);
    expect(Array.from(packed.uniforms.slice(28, 32))).toEqual([6, Math.fround(Math.PI / 2), 1.5, 0.25]);
    expect(Array.from(packed.uniforms.slice(32, 36))).toEqual([0.5, 1, 2, 0]);
    expect(Array.from(packed.uniforms.slice(36, 40))).toEqual([Math.fround(0.4), Math.fround(0.8), Math.fround(1.6), 0]);
    expect(Array.from(packed.uniforms.slice(40, 44))).toEqual([1, 0.5, 0.25, 0]);
    expect(Array.from(packed.uniforms.slice(44, 48))).toEqual([0, 0, 1, 0]);
    radiance.fill(100);
    expect(packed.uniforms[0]).toBe(Math.fround(Math.PI / 8));
  });

  it("evaluates every packed SH band and the forward Y rotation against an independent analytic direction", () => {
    const sh = new Float32Array(27);
    for (let coefficient = 0; coefficient < 9; coefficient++) {
      for (let channel = 0; channel < 3; channel++) sh[coefficient * 3 + channel] = coefficient === 0 ? 8 + channel : (coefficient + 1) * (channel + 1) / 16;
    }
    const environment = packA3DEnvironmentUniforms({
      probe: { specularCube: {} as Texture, mipCount: 4, sh9: sh }, rotation: Math.PI / 2, diffuseIntensity: 0.75
    });
    const lease = makeLease();
    const { uniforms } = packDeferredProbe(deferredProbeFromUniforms(environment.uniforms, lease), lease.device);
    const sqrt14 = Math.sqrt(14);
    const actual = evaluateShaderSh(deferredProbeWgsl(bindings), uniforms, [1 / sqrt14, 2 / sqrt14, 3 / sqrt14]);
    // A quarter turn maps [1,2,3]/sqrt(14) to [-3,2,1]/sqrt(14).
    const basis = [0.282095, -0.488603 * 2 / sqrt14, 0.488603 / sqrt14, 0.488603 * 3 / sqrt14,
      -1.092548 * 6 / 14, 1.092548 * 2 / 14, -0.315392 * 11 / 14, -1.092548 * 3 / 14, 0.546274 * 5 / 14];
    for (let channel = 0; channel < 3; channel++) {
      let expected = 0;
      for (let i = 0; i < 9; i++) {
        const scale = i === 0 ? Math.PI : i < 4 ? 2 * Math.PI / 3 : Math.PI / 4;
        expected += Math.fround(sh[i * 3 + channel]! * scale) * basis[i]!;
      }
      expect(actual[channel]).toBeCloseTo(Math.max(expected, 0) * 0.75, 6);
    }
  });

  it("matches the generated forward specular operations at a nonzero fractional mip level", () => {
    const features = normalizeProgramFeatures({
      lighting: "lit", maps: {}, extensions: [], environment: "pmrem-cube", features: { "prd02.ibl": true }
    });
    const descriptor = generateProgramImpl(features, { flags: { values: {}, on: () => true } }).descriptor;
    expect(descriptor).toBeDefined();
    const forward = createGeneratedPbrProgram(descriptor!).fragment;
    const deferred = deferredProbeWgsl(bindings);
    const lease = makeLease();
    const { uniforms } = packDeferredProbe({ ...makeInput(lease), mipCount: 6, rotation: Math.PI / 2, specularIntensity: 0.25 }, lease.device);
    const expectedDirection = [0, 17 / (2 * Math.sqrt(241)), -15 * Math.sqrt(3) / (2 * Math.sqrt(241))];
    const expectedRadiance = [
      (4 + 3.75) / 4,
      (2 + 17 / (2 * Math.sqrt(241))) / 4,
      (1 - 15 * Math.sqrt(3) / (4 * Math.sqrt(241)) + 0.75) / 4
    ];
    for (const [shader, dialect] of [[deferred, "deferred"], [forward, "forward"]] as const) {
      const actual = evaluateShaderSpecular(shader, uniforms, dialect);
      expect(actual.lod).toBe(3.75);
      for (let i = 0; i < 3; i++) {
        expect(actual.direction[i]).toBeCloseTo(expectedDirection[i]!, 6);
        expect(actual.radiance[i]).toBeCloseTo(expectedRadiance[i]!, 6);
      }
    }
  });

  it("keeps ambient and hemispherical light separate when both probe intensities are zero", () => {
    const lease = makeLease();
    const environment = packA3DEnvironmentUniforms({
      probe: { specularCube: {} as Texture, mipCount: 3, sh9: new Float32Array(27).fill(3) },
      diffuseIntensity: 0, specularIntensity: 0,
      ambient: { color: [1, 0.5, 0.25], intensity: Math.PI },
      hemisphere: { sky: [1, 2, 3], ground: [0, 0, 0], intensity: 2, direction: [0, 1, 0] }
    });
    const { uniforms } = packDeferredProbe(deferredProbeFromUniforms(environment.uniforms, lease), lease.device);
    expect(evaluateShaderSh(deferredProbeWgsl(bindings), uniforms, [0, 1, 0])).toEqual([0, 0, 0]);
    expect(uniforms[31]).toBe(0);
    // At the sky pole, ambient exit radiance and hemisphere irradiance / pi survive.
    const expectedDiffuse = [1 + 2 / Math.PI, 0.5 + 4 / Math.PI, 0.25 + 6 / Math.PI];
    for (let channel = 0; channel < 3; channel++) {
      expect(uniforms[32 + channel]! + uniforms[36 + channel]! / Math.PI).toBeCloseTo(expectedDiffuse[channel]!, 6);
    }
    const shader = deferredProbeWgsl(bindings);
    expect(shader).toMatch(/a3dPhysicalIndirect\(dot\(n, view\), radiance, a3dDeferredProbeIrradiance\(n\), material, dfg\)/);
    expect(shader).toMatch(/deferredProbe\.ambient\.rgb \+ hemi \/ A3D_PHYSICAL_PI/);
    expect(shader).toMatch(/textureSampleLevel\([\s\S]*?\)\.rgb \* deferredProbe\.controls\.w/);
    expect(shader).toContain("roughness * roughness * roughness * roughness");
    expect(shader).toContain("roughness * (2.0 - roughness)");
  });

  it("validates uniform values, device identity, binding indices, and an existing cube even at zero intensity", () => {
    const lease = makeLease();
    const input = makeInput(lease);
    expect(() => packDeferredProbe(input, {})).toThrow(/receiving native WebGPU device/);
    expect(() => packDeferredProbe({ ...input, lease: { ...lease, view: null }, specularIntensity: 0 }, lease.device)).toThrow(/cube view/);
    expect(() => packDeferredProbe({ ...input, sh: new Float32Array(27) }, lease.device)).toThrow(/28 values/);
    expect(() => packDeferredProbe({ ...input, rotation: NaN }, lease.device)).toThrow(/finite/);
    expect(() => packDeferredProbe({ ...input, diffuseIntensity: -1 }, lease.device)).toThrow(/non-negative/);
    expect(() => packDeferredProbe({ ...input, specularIntensity: Infinity }, lease.device)).toThrow(/finite/);
    expect(() => packDeferredProbe({ ...input, mipCount: 1.5 }, lease.device)).toThrow(/positive integer/);
    expect(() => packDeferredProbe({ ...input, ambient: [0, 0, 1e100] }, lease.device)).toThrow(/float32/);
    expect(() => deferredProbeFromUniforms(new Map(), lease)).toThrow(/u_envSH/);
    expect(() => deferredProbeWgsl({ ...bindings, samplerBinding: 6 })).toThrow(/distinct/);
    expect(() => deferredProbeWgsl({ ...bindings, group: -1 })).toThrow(/non-negative/);
    expect(deferredProbeWgsl({ group: 2, uniformBinding: 3, samplerBinding: 4, textureBinding: 5 })).toContain("@group(2) @binding(5) var deferredProbeTexture");
  });

  it("borrows the native texture, validates liveness again at submission, and leaves destruction to its owner", async () => {
    const device = {};
    let finish!: () => void;
    const fence = new Promise<void>((resolve) => { finish = resolve; });
    const queue = { submit: vi.fn(), onSubmittedWorkDone: () => fence };
    const interop = new WebGPUResourceInterop(queue, 1);
    const destroy = vi.fn();
    const resource = interop.register({}, destroy);
    const lease: DeferredProbeLease = { device, resource, view: {}, sampler: {}, assertUsable: () => interop.assertUsable(resource) };
    const packed = packDeferredProbe(makeInput(lease), device);
    expect(destroy).not.toHaveBeenCalled();
    interop.submit([{}], [{ resource: packed.lease.resource, mode: "read" }]);
    const retirement = interop.retire(resource);
    expect(destroy).not.toHaveBeenCalled();
    expect(() => packDeferredProbe(makeInput(lease), device)).toThrow(/RETIRED_RESOURCE/);
    expect(() => interop.submit([{}], [{ resource: packed.lease.resource, mode: "read" }])).toThrow(/RETIRED_RESOURCE/);
    expect(queue.submit).toHaveBeenCalledTimes(1);
    finish();
    await retirement;
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
