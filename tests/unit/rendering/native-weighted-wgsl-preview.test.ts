import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd02";
import "../../../packages/rendering/src/lanes/prd03";
import "../../../packages/rendering/src/lanes/prd04";
import "../../../packages/rendering/src/lanes/prd06";
import "../../../packages/engine/src/agent-api/compiler/lines";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerShaderFeature, type ProgramFeatures } from "../../../packages/rendering/src/contracts/program";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { WebGPUDevice, type WebGPUDeviceLike } from "../../../packages/rendering/src/WebGPUDevice";
import { ProgramCache } from "../../../packages/rendering/src/program/ProgramCache";
import { deriveShaderDataLayout, writeShaderData } from "../../../packages/rendering/src/webgpu/ShaderDataLayout";
import { normalizeProgramFeatures, type ProgramGraphFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import {
  GENERATED_PROGRAM_MARKER, generateProgramImpl, generateWeightedTransparencyWgslPreview, isBuiltinGeneratedWgsl
} from "../../../packages/rendering/src/program/ProgramGenerator";
import { composeWeightedWgslFragment, weightedWgslPhaseContract, type WeightedWgslPhase } from "../../../packages/rendering/src/program/WeightedTransparency.wgsl";
import {
  accumulateWeightedTransparency, resolveWeightedTransparency, weightedTransparencyState,
  type WeightedTransparencyFragment
} from "../../../packages/rendering/src/transparency/WeightedTransparency";

const flags: QrFlags = { values: {}, on: () => true };
const axis = "a3d.transparency";
const map0 = { uvSet: 0, transform: false } as const;
const map1 = { uvSet: 1, transform: true } as const;
// Fifteen fragment textures plus one vertex-only bone texture. Weighted depth
// occupies the sixteenth guaranteed fragment texture slot.
const textureBoundary: Partial<ProgramGraphFeatures> = {
  lighting: "lit", environment: "equirect",
  lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false },
  skinning: { influences: 4, palette: "texture" },
  maps: { normal: map0, metallicRoughness: map0, occlusion: map0, emissive: map0, diffuseRoughness: map0, bump: map0 },
  extensions: [
    { lobe: "specular", maps: ["specular", "specularColor"], bits: {} },
    { lobe: "clearcoat", maps: ["clearcoat", "clearcoatRoughness", "clearcoatNormal"], bits: {} }
  ],
  features: { "prd02.localProbe": true, "prd06.deform": "skin4" }
};

function features(phase: WeightedWgslPhase, changes: Partial<ProgramGraphFeatures> = {}): ProgramGraphFeatures {
  return normalizeProgramFeatures({
    ...changes, target: "wgsl", alphaMode: changes.alphaMode ?? "blend",
    features: { ...changes.features, [axis]: phase }
  });
}

function preview(phase: WeightedWgslPhase, changes: Partial<ProgramGraphFeatures> = {}) {
  return generateWeightedTransparencyWgslPreview(features(phase, changes), { flags });
}

function withoutWeighted(f: ProgramGraphFeatures): ProgramGraphFeatures {
  const bits = { ...f.features };
  delete bits[axis];
  return normalizeProgramFeatures({ ...f, features: bits });
}

const combinations: readonly Partial<ProgramGraphFeatures>[] = [
  {},
  { lighting: "unlit", vertexColors: true, doubleSided: true, fog: "linear",
    maps: { baseColor: map1, emissive: map0 }, instancing: { color: true }, features: { "a3d.clipping": true } },
  { lighting: "unlit", fog: "exp2", features: { "a3d.nativePrimitive": "lines" } },
  { lighting: "unlit", fog: "height", vertexColors: true,
    features: { "a3d.nativePrimitive": "points", "prd15.parityPoints": 7, "a3d.clipping": true } },
  { lighting: "lit", lights: { dir: 1, point: 1, spot: 0, rect: 0, clustered: false, hemisphere: false },
    maps: { baseColor: map1, normal: map0, metallicRoughness: map0, occlusion: map1, emissive: map1 },
    vertexColors: true, doubleSided: true, flatShading: true, specularAntialiasing: true,
    instancing: { color: true }, fog: "height", features: { "a3d.clipping": true } },
  { lighting: "lit", fog: "linear", skinning: { influences: 4, palette: "texture" },
    features: { "prd06.deform": "skin4" }, maps: { baseColor: map0, emissive: map1 } },
  { lighting: "lit", extensions: [{ lobe: "clearcoat", maps: [], bits: {} }],
    lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: false } },
  textureBoundary
];

describe("source-only generated weighted WGSL", () => {
  it("keys both phases independently and never authorizes the runtime WGSL bridge", () => {
    const first = preview("accumulation", { features: { "a3d.clipping": true }, maps: { baseColor: map0 } });
    const again = preview("accumulation", { maps: { baseColor: { transform: false, uvSet: 0 } }, features: { "a3d.clipping": true } });
    const reveal = preview("revealage", { features: { "a3d.clipping": true }, maps: { baseColor: map0 } });
    const ordinary = generateProgramImpl(withoutWeighted(first.descriptor!.features), { flags });
    expect(first.key).toBe(again.key);
    expect(first.vertex).toBe(again.vertex);
    expect(first.fragment).toBe(again.fragment);
    expect(new Set([first.key, reveal.key, ordinary.key]).size).toBe(3);
    expect(first.descriptor?.features.features[axis]).toBe("accumulation");
    expect(reveal.descriptor?.features.features[axis]).toBe("revealage");
    expect(first.vertex).toMatch(/a3d-generated-program:[0-9a-f]+/);
    expect(first.fragment).toContain(first.vertex.match(/a3d-generated-program:[0-9a-f]+/)![0]);
    expect(isBuiltinGeneratedWgsl(first)).toBe(false);
    expect(isBuiltinGeneratedWgsl(ordinary)).toBe(true);
    expect(() => generateProgramImpl(features("accumulation"), { flags })).toThrow("WEIGHTED_TRANSPARENCY_UNSUPPORTED_WGSL");
    expect(() => generateProgramImpl(features("revealage"), { flags })).toThrow("WEIGHTED_TRANSPARENCY_UNSUPPORTED_WGSL");
  });

  it("keys resolved compiler flags as well as the feature record", () => {
    const f = features("accumulation", {
      lighting: "lit", environment: "equirect",
      lights: { dir: 1, point: 0, spot: 0, rect: 0, clustered: false, hemisphere: true },
      extensions: [{ lobe: "clearcoat", maps: [], bits: {} }]
    });
    const compilerOn = generateWeightedTransparencyWgslPreview(f, { flags });
    const compilerOff = generateWeightedTransparencyWgslPreview(f, {
      flags: { values: {}, on: (name) => name !== "A3D_QR_COMPILER" }
    });
    const sameResolution = generateWeightedTransparencyWgslPreview(f, { flags: { values: {}, on: () => true } });
    const stripMarker = (source: string) => source.replace(/^\/\/ a3d-generated-program:[0-9a-f]+\n/, "");
    expect(stripMarker(compilerOn.vertex)).toBe(stripMarker(compilerOff.vertex));
    expect(stripMarker(compilerOn.fragment)).not.toBe(stripMarker(compilerOff.fragment));
    expect(compilerOn.key).not.toBe(compilerOff.key);
    expect(compilerOn.key).toBe(sameResolution.key);
    expect(compilerOn.fragment).toBe(sameResolution.fragment);
    expect(new Map([[compilerOn.key, compilerOn.fragment], [compilerOff.key, compilerOff.fragment]]).size).toBe(2);
  });

  it("snapshots and freezes preview descriptors without freezing the caller's inputs", () => {
    const baseMap = { uvSet: 0 as 0 | 1, transform: false };
    const lobe = { lobe: "clearcoat", maps: [] as string[], bits: {} as Record<string, boolean> };
    const input = features("accumulation", { lighting: "lit", maps: { baseColor: baseMap }, extensions: [lobe] });
    const result = generateWeightedTransparencyWgslPreview(input, { flags });
    const descriptor = result.descriptor!;
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(descriptor.features)).toBe(true);
    expect(Object.isFrozen(descriptor.features.maps.baseColor)).toBe(true);
    expect(Object.isFrozen(descriptor.activeExtensions)).toBe(true);
    expect(Object.isFrozen(descriptor.activeExtensions[0]!.bits)).toBe(true);
    expect(Object.isFrozen(result.defines)).toBe(true);
    expect(Object.isFrozen(baseMap)).toBe(false);
    expect(Object.isFrozen(lobe)).toBe(false);
    baseMap.uvSet = 1;
    lobe.maps.push("clearcoat");
    lobe.bits.map = true;
    expect(descriptor.features.maps.baseColor).toEqual({ uvSet: 0, transform: false });
    expect(descriptor.activeExtensions[0]).toEqual({ lobe: "clearcoat", maps: [], bits: {} });
    expect(Reflect.set(descriptor.features.features, axis, "revealage")).toBe(false);
    expect(result.key).toContain('"a3d.transparency":"accumulation"');
  });

  it("does not activate explicitly disabled provider bits", () => {
    for (const lighting of ["unlit", "lit"] as const) {
      const disabled = preview("accumulation", { lighting, features: {
        "prd02.ibl": false, "prd02.shadowFilter": false, "prd03.indirectFraction": false
      } });
      const absent = preview("accumulation", { lighting });
      const stripMarker = (source: string) => source.replace(/^\/\/ a3d-generated-program:[0-9a-f]+\n/, "");
      expect(disabled.descriptor!.activeFeatures).toEqual([]);
      expect(stripMarker(disabled.fragment)).toBe(stripMarker(absent.fragment));
      expect(stripMarker(disabled.vertex)).toBe(stripMarker(absent.vertex));
    }
  });

  it("rejects noncanonical feature values before emitting or keying a preview", () => {
    for (const change of [
      { features: { "prd03.indirectFraction": true } },
      { features: { "prd03.indirectFraction": NaN } },
      { features: { "prd02.shadowFilter": Infinity } },
      { features: { "prd02.shadowFilter": 4 } },
      { vertexColors: "false" },
      { maps: { baseColor: { uvSet: 0, transform: "false" } } },
      { lights: { dir: 3 } },
      { shadows: { pcfTaps: 2 } },
      { extensions: [{ lobe: "clearcoat", maps: [], bits: { map: NaN } }] }
    ] as unknown as Array<Partial<ProgramGraphFeatures>>) {
      for (const lighting of ["unlit", "lit"] as const) for (const phase of ["accumulation", "revealage"] as const) {
        expect(() => preview(phase, { ...change, lighting }), JSON.stringify(change))
          .toThrow("INVALID_WEIGHTED_TRANSPARENCY_WGSL_FEATURES");
      }
    }
  });

  it.each(["accumulation", "revealage"] as const)("describes the exact %s target, depth bindings and blend state", (phase) => {
    const result = preview(phase);
    expect(result.weightedWgsl).toMatchObject({
      phase, colorFormat: "rgba16f", colorSpace: "linear", sampleCount: 1, location: 0, opaqueDepthFormat: "depth24",
      opaqueDepthSize: "match-color", requiresFloatBlend: true, maxFragmentsPerPixel: 1024,
      clear: phase === "accumulation" ? [0, 0, 0, 0] : [1, 1, 1, 1],
      state: weightedTransparencyState(phase),
      bindings: {
        controls: { group: 2, binding: 0, byteLength: 16, offsets: {
          u_a3dTransparencyDepthOrigin: 0, u_a3dTransparencyReversedDepth: 8, u_a3dTransparencyInputPremultiplied: 12
        } },
        opaqueDepth: { group: 2, binding: 1, sampleType: "depth", aspect: "depth-only", dimension: "2d", multisampled: false }
      }
    });
    expect(result.fragment).toContain("@group(2) @binding(0) var<uniform> a3dWeighted");
    expect(result.fragment).toContain("@group(2) @binding(1) var u_a3dOpaqueDepth: texture_depth_2d;");
    expect(result.fragment).toContain("textureLoad(u_a3dOpaqueDepth, pixel, 0)");
    expect(result.fragment).toContain("@fragment fn fs_main(input: FragmentInput) -> @location(0) vec4f");
    expect(result.fragment).not.toContain("@location(1) depthCoverage");
    expect(result.fragment).not.toContain("generatedUnlitEncodeOutput(");
  });

  it("matches the host-shareable WGSL uniform layout and writes the declared control bytes", () => {
    const result = preview("accumulation");
    const controls = result.weightedWgsl.bindings.controls;
    const fields = [
      { name: "u_a3dTransparencyDepthOrigin", type: { kind: "vector", element: "f32", length: 2 } },
      { name: "u_a3dTransparencyReversedDepth", type: "f32" },
      { name: "u_a3dTransparencyInputPremultiplied", type: "f32" }
    ] as const;
    const layout = deriveShaderDataLayout({ kind: "struct", fields }, "wgsl-uniform");
    expect(layout.size).toBe(controls.byteLength);
    expect(Object.fromEntries(layout.members!.map(({ name, offset }) => [name, offset]))).toEqual(controls.offsets);
    expect(result.fragment).toContain(
      "u_a3dTransparencyDepthOrigin: vec2f,\n  u_a3dTransparencyReversedDepth: f32,\n  u_a3dTransparencyInputPremultiplied: f32,"
    );
    const bytes = writeShaderData(layout, {
      u_a3dTransparencyDepthOrigin: [2, -3], u_a3dTransparencyReversedDepth: 1,
      u_a3dTransparencyInputPremultiplied: 0
    });
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    expect([0, 4, 8, 12].map((offset) => view.getFloat32(offset, true))).toEqual([2, -3, 1, 0]);
  });

  it.each(combinations.map((change, index) => [index, change] as const))(
    "retains the native material/vertex features in supported combination %i", (_index, change) => {
      const accumulated = preview("accumulation", change);
      const revealed = preview("revealage", change);
      const f = features("accumulation", change);
      const ordinary = generateProgramImpl(withoutWeighted(f), { flags });
      const glsl = generateProgramImpl({ ...f, target: "glsl300es" }, { flags });
      const glslReveal = generateProgramImpl({ ...features("revealage", change), target: "glsl300es" }, { flags });
      const stripMarker = (value: string) => value.replace(/^\/\/ a3d-generated-program:[0-9a-f]+\n/, "");
      expect(stripMarker(accumulated.vertex)).toBe(stripMarker(ordinary.vertex));
      expect(stripMarker(revealed.vertex)).toBe(stripMarker(ordinary.vertex));
      for (const result of [accumulated, revealed]) {
        expect(result.fragment).toContain("if (!a3dWeightedDepthRetains(input.position)) { discard; }");
        expect(result.fragment.indexOf("if (!a3dWeightedDepthRetains(input.position))")).toBeGreaterThan(result.fragment.lastIndexOf("textureSample("));
        expect(result.fragment.indexOf("if (!a3dWeightedDepthRetains(input.position))")).toBeGreaterThan(result.fragment.lastIndexOf("dpdx("));
        expect(result.fragment).not.toContain("let color = max(");
        expect(result.fragment).not.toContain("let unfogged = max(");
        expect(result.fragment).not.toContain("let unfoggedColor = max(");
        expect(result.fragment).not.toContain("generatedEncodeOutput(color)");
      }
      expect(accumulated.fragment).toContain("return a3dWeightedAccumulation(color,");
      expect(revealed.fragment).toContain("return a3dWeightedRevealage(");
      expect(glsl.fragment).toContain("a3dTestOpaqueDepth(a3dFragmentDepth);");
      expect(glsl.fragment).toContain("outColor = a3dWeightedAccumulation(a3dColor, a3dAlpha, a3dFragmentDepth);");
      expect(glsl.fragment).toContain("clamp(straight, vec3(-32.0), vec3(32.0)) * a * weight");
      expect(glsl.fragment).not.toContain("a3dColor = max(a3dColor, vec3(0.0));");
      expect(glslReveal.fragment).toContain("outColor = vec4(0.0, 0.0, 0.0, clamp(a3dAlpha, 0.0, 1.0));");
    }
  );

  it("preserves negative linear radiance through fog and does not alter the sorted shader", () => {
    for (const lighting of ["unlit", "lit"] as const) for (const fog of ["none", "linear", "exp2", "height"] as const) {
      const f = features("accumulation", { lighting, fog, maps: { emissive: map0 } });
      const weighted = generateWeightedTransparencyWgslPreview(f, { flags });
      const ordinary = generateProgramImpl(withoutWeighted(f), { flags });
      const colorName = fog === "none" ? "color" : lighting === "unlit" ? "unfogged" : "unfoggedColor";
      expect(ordinary.fragment).toContain(`let ${colorName} = max(`);
      expect(weighted.fragment).toContain(`let ${colorName} = `);
      expect(weighted.fragment).not.toContain(`let ${colorName} = max(`);
      if (fog !== "none") expect(weighted.fragment).toContain(`let color = mix(${colorName}, material.fogColor.rgb, fogAmount);`);
      expect(generateProgramImpl(withoutWeighted(f), { flags })).toEqual(ordinary);
    }
  });

  it("rejects invalid or incompatible shader axes rather than emitting an ordinary shader", () => {
    for (const change of [
      { pass: "depth" }, { alphaMode: "opaque" }, { alphaMode: "mask" }, { backgroundCoverage: true },
      { features: { "a3d.output.srgb": true } }, { features: { "a3d.logarithmicDepth": true } },
      { features: { "a3d.depthCoverage": true } }, { features: { "prd04.transmissionTarget": true } },
      { features: { "a3d.independentPhysicalPreview": true } }, { features: { "unknown.hook": true } },
      { drawId: "uniform" }, { graph: {} }, { extensions: [{ lobe: "unknown", maps: [], bits: {} }] },
      ...["transmission", "diffuse-transmission", "volume", "dispersion", "KHR_materials_transmission",
        "KHR_materials_diffuse_transmission", "KHR_materials_volume", "KHR_materials_dispersion"]
        .map((lobe) => ({ extensions: [{ lobe, maps: [], bits: {} }] }))
    ] as Array<Partial<ProgramGraphFeatures>>) {
      expect(() => preview("accumulation", change), JSON.stringify(change)).toThrow();
      expect(() => preview("revealage", change), JSON.stringify(change)).toThrow();
    }
    for (const phase of [undefined, false, true, "other"]) {
      const f = normalizeProgramFeatures({ target: "wgsl", alphaMode: "blend", features: { [axis]: phase } as ProgramFeatures["features"] });
      expect(() => generateWeightedTransparencyWgslPreview(f)).toThrow("INVALID_WEIGHTED_TRANSPARENCY_WGSL_PREVIEW");
    }
    expect(() => generateWeightedTransparencyWgslPreview({ ...features("accumulation"), target: "glsl300es" }))
      .toThrow("INVALID_WEIGHTED_TRANSPARENCY_WGSL_PREVIEW");
    expect(() => weightedWgslPhaseContract("bad" as never)).toThrow("INVALID_WEIGHTED_TRANSPARENCY_VARIANT");
  });

  it("rejects unknown contributor hooks, template drift, reserved bindings and exhausted texture stages", () => {
    const id = "test.weighted.customHook";
    const unregister = registerShaderFeature({ id, owner: "prd04", flag: "A3D_QR_CORE",
      hooks: ["fragment:end"], chunks: [], select: () => true, defines: () => ({}) });
    try {
      expect(() => preview("accumulation", { features: { [id]: true } })).toThrow(/contributor|feature/i);
    } finally { unregister(); }
    const f = features("accumulation");
    const ordinary = generateProgramImpl(withoutWeighted(f), { flags });
    const compose = (vertex: string, fragment: string, count: number) =>
      composeWeightedWgslFragment(vertex, fragment, f, "accumulation", count);
    expect(() => compose(ordinary.vertex, ordinary.fragment, 15)).not.toThrow();
    expect(() => compose(ordinary.vertex, ordinary.fragment, 16)).toThrow("WEIGHTED_TRANSPARENCY_WGSL_TEXTURE_LIMIT");
    expect(() => compose("@group(2) @binding(0) var<uniform> taken: vec4f;\n" + ordinary.vertex, ordinary.fragment, 0))
      .toThrow("WEIGHTED_TRANSPARENCY_WGSL_BINDING_COLLISION");
    expect(() => compose(ordinary.vertex, ordinary.fragment.replace("return vec4f(color, base.a);", "return vec4f(1.0);"), 0))
      .toThrow("WEIGHTED_TRANSPARENCY_WGSL_TEMPLATE_CHANGED");
  });

  it("rejects mismatched phase, undercounted textures and control-flow or output drift", () => {
    const f = features("accumulation", { maps: { baseColor: map0 } });
    const ordinary = generateProgramImpl(withoutWeighted(f), { flags });
    const compose = (fragment: string, count = 1) =>
      composeWeightedWgslFragment(ordinary.vertex, fragment, f, "accumulation", count);
    expect(() => compose(ordinary.fragment)).not.toThrow();
    expect(() => compose(ordinary.fragment, 0)).toThrow("WEIGHTED_TRANSPARENCY_WGSL_RESOURCE_MISMATCH");
    expect(() => composeWeightedWgslFragment(ordinary.vertex, ordinary.fragment, f, "revealage", 1))
      .toThrow("INVALID_WEIGHTED_TRANSPARENCY_WGSL_PREVIEW");
    expect(() => compose(ordinary.fragment.replace("  return vec4f(color, base.a);",
      "  if (base.a > 0.5) { return vec4f(1.0); }\n  return vec4f(color, base.a);")))
      .toThrow("WEIGHTED_TRANSPARENCY_WGSL_TEMPLATE_CHANGED");
    expect(() => compose(`${ordinary.fragment}\n@fragment fn extra() -> @location(0) vec4f { return vec4f(0.0); }`))
      .toThrow("WEIGHTED_TRANSPARENCY_WGSL_TEMPLATE_CHANGED");
    expect(() => compose(`struct ExtraDepth { @builtin(frag_depth) depth: f32 };\n${ordinary.fragment}`))
      .toThrow("WEIGHTED_TRANSPARENCY_WGSL_TEMPLATE_CHANGED");
    expect(() => compose(`fn a3dWeightedWeight() -> f32 { return 1.0; }\n${ordinary.fragment}`))
      .toThrow("WEIGHTED_TRANSPARENCY_WGSL_BINDING_COLLISION");
  });

  it("reserves one actual fragment texture slot without counting vertex-only bone textures", () => {
    const countTextures = (source: string) => source.match(/\bvar\s+\w+\s*:\s*texture_\w+/g)?.length ?? 0;
    for (const phase of ["accumulation", "revealage"] as const) {
      const boundary = preview(phase, textureBoundary);
      expect(countTextures(boundary.fragment)).toBe(16);
      expect(boundary.vertex).toContain("var u_boneTextureTexture: texture_2d<f32>;");
      const overLimit = { ...textureBoundary, maps: { ...textureBoundary.maps, baseColor: map0 } };
      const normal = generateProgramImpl(withoutWeighted(features(phase, overLimit)), { flags });
      expect(countTextures(normal.fragment)).toBe(16);
      expect(() => preview(phase, overLimit)).toThrow("WEIGHTED_TRANSPARENCY_WGSL_TEXTURE_LIMIT");
    }
  });

  it("leaves ProgramCache and the actual native device's descriptor path fail-closed", async () => {
    const f = features("accumulation");
    const mock = new MockRenderDevice();
    const cache = new ProgramCache(mock, { flags, parallelCompile: false });
    try {
      const handle = cache.acquire(f);
      expect(handle.status).toBe("failed");
      expect(handle.error).toContain("WEIGHTED_TRANSPARENCY_UNSUPPORTED_WGSL");
    } finally { cache.dispose(); mock.dispose(); }

    const modules: string[] = [];
    const native = {
      queue: { writeBuffer() {}, submit() {} },
      createBuffer() { return { destroy() {} }; },
      createShaderModule({ code }: { code: string }) { modules.push(code); return { code }; }
    } as unknown as WebGPUDeviceLike;
    const device = await WebGPUDevice.create({ adapter: { requestDevice: async () => native }, device: native });
    try {
      for (const lighting of ["unlit", "lit"] as const) {
        const source = preview("accumulation", { lighting });
        const glsl = generateProgramImpl({ ...source.descriptor!.features, target: "glsl300es" }, { flags });
        expect(() => device.createShaderProgram({ label: "weighted-source-only", marker: GENERATED_PROGRAM_MARKER,
          vertex: glsl.vertex, fragment: glsl.fragment, generatedProgram: source.descriptor })).toThrow(/a3d\.transparency/);
        expect(() => device.createShaderProgram({ label: "weighted-raw", marker: GENERATED_PROGRAM_MARKER,
          vertex: source.vertex, fragment: source.fragment, generatedProgram: source.descriptor }))
          .toThrow(/reflection/i);
      }
      expect(modules).toEqual([]);
    } finally { device.dispose(); }
  });
});

type Callable = (...args: unknown[]) => unknown;
type Color = readonly [number, number, number, number];

/**
 * Execute the scalar subset extracted from the generated WGSL itself, not a
 * hand-translated reference. JS doubles are not WGSL f32, a WGSL compiler, or
 * GPU execution; unexpected WGSL syntax fails JS parsing.
 */
function scalarFunction(source: string, name: string, scope: Record<string, unknown>): Callable {
  const declaration = new RegExp(`\\bfn\\s+${name}\\s*\\(([^)]*)\\)\\s*->\\s*\\w+\\s*\\{`).exec(source);
  if (!declaration || declaration.index === undefined) throw new Error(`Missing WGSL function ${name}`);
  const start = declaration.index + declaration[0].length;
  let level = 1, end = start;
  while (level > 0 && end < source.length) {
    if (source[end] === "{") level++;
    if (source[end] === "}") level--;
    end++;
  }
  if (level !== 0) throw new Error(`Unclosed WGSL function ${name}`);
  const parameters = declaration[1]!.split(",").map((value) => value.split(":")[0]!.trim());
  const compiled = new Function(...Object.keys(scope), ...parameters, source.slice(start, end - 1)) as Callable;
  return (...args) => compiled(...Object.values(scope), ...args);
}

function shaderArithmetic(reversed: boolean, premultiplied: boolean) {
  const accumulation = preview("accumulation").fragment;
  const revealage = preview("revealage").fragment;
  const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));
  const vec4f = (x: number, y: number, z: number, w: number) => [x, y, z, w] as const;
  const a3dWeightedWeight = scalarFunction(accumulation, "a3dWeightedWeight", { clamp, pow: Math.pow });
  const a3dWeightedStraightChannel = scalarFunction(accumulation, "a3dWeightedStraightChannel", { clamp });
  const accumulate = scalarFunction(accumulation, "a3dWeightedAccumulation", {
    clamp, vec4f, a3dWeightedWeight, a3dWeightedStraightChannel,
    a3dWeighted: { u_a3dTransparencyReversedDepth: Number(reversed), u_a3dTransparencyInputPremultiplied: Number(premultiplied) }
  });
  return {
    accumulate: (color: readonly [number, number, number], alpha: number, depth: number) =>
      accumulate({ x: color[0], y: color[1], z: color[2] }, alpha, depth) as Color,
    reveal: scalarFunction(revealage, "a3dWeightedRevealage", { clamp, vec4f }) as (alpha: number) => Color,
    depth: scalarFunction(accumulation, "a3dWeightedDepthValueRetains", {}) as (depth: number, opaque: number, reversed: number) => boolean
  };
}

describe("weighted WGSL scalar arithmetic and coordinate contracts", () => {
  it("matches the CPU reference for alpha edges, signed HDR, depth and premultiplication", () => {
    for (const convention of ["standard", "reversed"] as const) for (const premultiplied of [false, true]) {
      const shader = shaderArithmetic(convention === "reversed", premultiplied);
      for (const alpha of [-2, 0, 1e-9, 0.125, 0.5, 1, 2]) for (const depth of [0, 0.2, 0.5, 0.9, 1]) {
        const color = [-50, 0.25, 40] as const;
        const result = shader.accumulate(color, alpha, depth);
        const reference = accumulateWeightedTransparency([{ color, alpha, depth, premultiplied }], convention);
        for (let channel = 0; channel < 3; channel++) expect(result[channel]).toBeCloseTo(reference.color[channel]!, 12);
        expect(result[3]).toBeCloseTo(reference.alpha, 12);
        const reveal = shader.reveal(alpha);
        expect(reveal.slice(0, 3)).toEqual([0, 0, 0]);
        expect(1 - reveal[3]).toBeCloseTo(reference.revealage, 12);
        expect(result.every(Number.isFinite)).toBe(true);
      }
      const straight = shaderArithmetic(convention === "reversed", false).accumulate([0.8, -0.4, 0.2], 0.25, 0.3);
      const premul = shaderArithmetic(convention === "reversed", true).accumulate([0.2, -0.1, 0.05], 0.25, 0.3);
      expect(premul).toEqual(straight);
    }
  });

  it("matches additive/multiplicative blend and premultiplied resolve for multiple layers", () => {
    const fragments: WeightedTransparencyFragment[] = [
      { color: [2, -1, 0], alpha: 0.25, depth: 0.2, opaqueDepth: 0.8 },
      { color: [0, 0.5, 4], alpha: 0.5, depth: 0.5, opaqueDepth: 0.8 },
      { color: [1, 1, 1], alpha: 1, depth: 0.9, opaqueDepth: 0.8 },
      { color: [99, 0, 0], alpha: 0, depth: 0.1, opaqueDepth: 0.8 }
    ];
    const shader = shaderArithmetic(false, false);
    const blended = (items: readonly WeightedTransparencyFragment[]) => {
      const color = [0, 0, 0], sum = { alpha: 0, revealage: 1 };
      for (const item of items) {
        if (!shader.depth(item.depth, item.opaqueDepth!, 0)) continue;
        const output = shader.accumulate(item.color, item.alpha, item.depth);
        for (let channel = 0; channel < 3; channel++) color[channel]! += output[channel]!;
        sum.alpha += output[3];
        sum.revealage *= 1 - shader.reveal(item.alpha)[3];
      }
      return { color: color as [number, number, number], ...sum };
    };
    const reference = accumulateWeightedTransparency(fragments);
    const actual = blended(fragments), reordered = blended([...fragments].reverse());
    for (let channel = 0; channel < 3; channel++) {
      expect(actual.color[channel]).toBeCloseTo(reference.color[channel]!, 12);
      expect(reordered.color[channel]).toBeCloseTo(reference.color[channel]!, 12);
    }
    expect(actual.alpha).toBeCloseTo(reference.alpha, 12);
    expect(actual.revealage).toBeCloseTo(reference.revealage, 12);
    expect(resolveWeightedTransparency(actual)).toEqual(resolveWeightedTransparency(reference));
    expect(resolveWeightedTransparency(actual)[3]).toBeCloseTo(0.625, 12);
  });

  it("retains depth ties, rejects occluded fragments, and mirrors GL bottom-left offsets", () => {
    const shader = shaderArithmetic(false, false);
    for (const reversed of [0, 1]) for (const depth of [0, 0.2, 0.5, 1]) for (const opaque of [0, 0.2, 0.5, 1]) {
      const expected = reversed ? depth >= opaque : depth <= opaque;
      expect(shader.depth(depth, opaque, reversed)).toBe(expected);
      const ref = accumulateWeightedTransparency([{ color: [1, 1, 1], alpha: 0.5, depth, opaqueDepth: opaque }],
        reversed ? "reversed" : "standard");
      expect(ref.alpha > 0).toBe(expected);
    }
    const source = preview("revealage").fragment;
    expect(source).toContain("let pixel = vec2i(position.xy) + vec2i(offset.x, -offset.y);");
    expect(source).toContain("if (any(pixel < vec2i(0)) || any(pixel >= size)) { return false; }");
    const [width, height] = [9, 7];
    for (const [x, y, dx, dy] of [[0, 0, 0, 0], [4, 1, 2, -3], [8, 6, -2, 1], [1, 5, -2, 3]]) {
      const glPixel = [x + dx, height - 1 - y + dy];
      const nativePixel = [x + dx, y - dy];
      expect(nativePixel).toEqual([glPixel[0], height - 1 - glPixel[1]!]);
      const glInside = glPixel[0]! >= 0 && glPixel[0]! < width && glPixel[1]! >= 0 && glPixel[1]! < height;
      const nativeInside = nativePixel[0]! >= 0 && nativePixel[0]! < width && nativePixel[1]! >= 0 && nativePixel[1]! < height;
      expect(nativeInside).toBe(glInside);
    }
  });
});

const hasNaga = spawnSync("naga", ["--version"], { stdio: "ignore" }).status === 0;
const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;

describe("offline shader compilation (not GPU acceptance)", () => {
  it.runIf(process.env.A3D_REQUIRE_NAGA === "1")("requires Naga when explicitly requested", () => {
    expect(hasNaga, "Naga is required for weighted WGSL validation").toBe(true);
  });

  it.runIf(hasNaga)("validates both WGSL stages for each supported feature combination and phase", () => {
    const directory = mkdtempSync(join(tmpdir(), "a3d-weighted-wgsl-"));
    try {
      for (const [index, change] of combinations.entries()) for (const phase of ["accumulation", "revealage"] as const) {
        const result = preview(phase, change);
        for (const stage of ["vertex", "fragment"] as const) {
          const file = join(directory, `${index}-${phase}-${stage}.wgsl`);
          writeFileSync(file, result[stage]);
          expect(() => execFileSync("naga", [file], { encoding: "utf8" })).not.toThrow();
        }
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.runIf(hasGlslang)("links the existing GLSL weighted accumulation and revealage", () => {
    const directory = mkdtempSync(join(tmpdir(), "a3d-weighted-glsl-"));
    try {
      for (const [index, change] of combinations.entries()) for (const phase of ["accumulation", "revealage"] as const) {
        const result = generateProgramImpl({ ...features(phase, change), target: "glsl300es" }, { flags });
        const vertex = join(directory, `${index}-${phase}.vert`), fragment = join(directory, `${index}-${phase}.frag`);
        writeFileSync(vertex, result.vertex);
        writeFileSync(fragment, result.fragment);
        expect(() => execFileSync("glslangValidator", ["-l", vertex, fragment], { encoding: "utf8" })).not.toThrow();
      }
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
