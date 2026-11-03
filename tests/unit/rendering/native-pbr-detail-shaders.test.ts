import { describe, expect, it, vi } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DirectionalLight, PointLight, RectAreaLight, SpotLight } from "@aura3d/scene";
import "../../../packages/rendering/src/lanes/prd01";
import "../../../packages/rendering/src/lanes/prd04";
import "../../../packages/rendering/src/lanes/prd06";
import { MaterialBinding } from "../../../packages/rendering/src/MaterialBinding";
import { MaterialInstance } from "../../../packages/rendering/src/MaterialInstance";
import { ForwardPass, forwardContactParticipantSafe, forwardDrawReplaySafe, forwardItemBucket, hasForwardDrawHooks, registerForwardDrawHook } from "../../../packages/rendering/src/ForwardPass";
import { Renderer } from "../../../packages/rendering/src/Renderer";
import { TemporalHistory } from "../../../packages/rendering/src/TemporalHistory";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { collectLight } from "../../../packages/rendering/src/LightCollector";
import { CLUSTER_TILE_SIZE, MAX_LIGHTS_PER_CLUSTER, createClusteredForwardLighting } from "../../../packages/rendering/src/ClusteredForwardLighting";
import { PBRMaterial } from "../../../packages/rendering/src/PBRMaterial";
import { InstancedPBRMaterial } from "../../../packages/rendering/src/InstancedPBRMaterial";
import { InstancedUnlitMaterial } from "../../../packages/rendering/src/InstancedUnlitMaterial";
import { SkinnedLitMaterial } from "../../../packages/rendering/src/SkinnedLitMaterial";
import { TexturedPBRMaterial } from "../../../packages/rendering/src/TexturedPBRMaterial";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { Material } from "../../../packages/rendering/src/Material";
import { MockRenderBuffer, MockRenderDevice, type DrawCommand, type RenderShaderProgram, type ShaderSources, type UniformValue } from "../../../packages/rendering/src/RenderDevice";
import { createDefaultShaderLibrary } from "../../../packages/rendering/src/ShaderLibrary";
import { Texture } from "../../../packages/rendering/src/Texture";
import { Sampler } from "../../../packages/rendering/src/Sampler";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { VertexFormat } from "../../../packages/rendering/src/VertexFormat";
import { isTextureBinding, TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { QUALITY_TIERS } from "../../../packages/rendering/src/contracts/quality";
import { createTrustedQrFlags } from "../../../packages/rendering/src/contracts/core";
import { registerShaderFeature } from "../../../packages/rendering/src/contracts/program";
import { featuresForGeometry } from "../../../packages/rendering/src/program/MaterialFeatures";
import { bindShaderFeatureUniforms, selectShaderFeatureBits } from "../../../packages/rendering/src/program/FeatureSelect";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import { generateProgramImpl } from "../../../packages/rendering/src/program/ProgramGenerator";
import { ProgramCache, subscribeProgramReadiness } from "../../../packages/rendering/src/program/ProgramCache";
import { compileShaderGraph, type ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler";
import { setRendererQrFlags } from "../../../packages/rendering/src/renderer/FrameGraph";
import { PRD02_ITEM_PROBE_BINDINGS, PRD02_LOCAL_PROBE_FEATURE } from "../../../packages/rendering/src/probes/ProbeBoxProjection";
import { clearCapturedTransmissionTarget, publishCapturedTransmissionTarget } from "../../../packages/rendering/src/forward/transmissionTargetStore";
import { createContactShadowMaskTarget, setContactShadowMask } from "../../../packages/rendering/src/forward/contactShadowMaskStore";
import type { FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import { createProductionPrimitiveMaterial, createProductionRuntimePrimitiveEntries } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createProductionPrimitiveTextureIntent, mergedTransform, upgradeProductionPrimitiveTextures } from "../../../packages/engine/src/agent-api/compiler/textures";
import { primitives } from "../../../packages/engine/src/agent-api/nodes/primitives";
import { TextureHandle } from "../../../packages/engine/src/agent-api/nodes/texture";
import { defineAuraAssets } from "../../../packages/engine/src/agent-api/nodes/assets";
import type { AuraTextureTransform } from "../../../packages/engine/src/agent-api/nodes/types";
import { setTypedGLBActorQrFlags, typedGLBActorQrFlags } from "../../../packages/engine/src/production-runtime/actor/extensions";
import { PRD04_SHADER_FEATURES, uvTransformMatrix } from "../../../packages/rendering/src/materials/features";
import { withLivePhysicalMapFeatures } from "../../../packages/rendering/src/materials/PhysicalFeatures";
import { PRD04_MATERIAL_LOBES } from "../../../packages/rendering/src/materials/lobes";
import { bindVelocityUniforms, setVelocityUniformBinder } from "../../../packages/rendering/src/forward/Velocity";

const flags = { values: {}, on: () => false };
const ctx = { flags, tier: QUALITY_TIERS.high };
const pixel = () => new Texture({ width: 1, height: 1, colorSpace: "linear", data: new Uint8Array([64, 96, 128, 255]) });
const binding = (name: string, texture: Texture) => new TextureBinding({
  name, texture, transform: { offset: [0.2, 0.3], scale: [2, 3], rotation: 0.4 }
});
const deformFlags = { values: { A3D_QR_ANIMATION: true, A3D_QR_MATERIALS: true },
  on: (name: string) => name === "A3D_QR_ANIMATION" || name === "A3D_QR_MATERIALS" };
const hasGlslang = spawnSync("glslangValidator", ["--version"], { stdio: "ignore" }).status === 0;

function skinInstancingProgram(influences: 4 | 8, color = true, emissive = false, jointTypes?: readonly ["float" | "uint" | "sint", "float" | "uint" | "sint"]) {
  return generateProgramImpl(normalizeProgramFeatures({
    lighting: "lit", skinning: { influences, palette: "texture" }, instancing: { color },
    features: { "prd06.deform": `skin${influences}`, ...(emissive ? { "prd04.instanceColorTarget": "emissive" } : {}),
      ...(jointTypes ? { "prd06.joint0Type": jointTypes[0], ...(influences === 8 ? { "prd06.joint1Type": jointTypes[1] } : {}) } : {}) }
  }), { flags: deformFlags });
}

function localOnlyShadowProgram() {
  return generateProgramImpl(normalizeProgramFeatures({
    lighting: "lit", lights: { dir: 0, point: 1, spot: 0, rect: 0, clustered: false, hemisphere: false },
    shadows: { cascades: 0, pcfTaps: 1, localShadows: 6, contact: false }
  }), { flags });
}

function standaloneShadowProgram() {
  return generateProgramImpl(normalizeProgramFeatures({
    lighting: "lit", lights: { dir: 1, point: 1, spot: 1, rect: 0, clustered: false, hemisphere: false },
    shadows: { cascades: 1, pcfTaps: 4, localShadows: 6, contact: true },
    features: { "a3d.legacyPointShadow": true, "a3d.legacySpotShadow": true }
  }), { flags });
}

describe("PBR detail shader integration", () => {
  it("invalidates static frames after deferred and asynchronous program compilation", async () => {
    class DeferredDevice extends MockRenderDevice {
      pending: { source: ShaderSources; resolve: (program: RenderShaderProgram) => void }[] = [];
      compileAsync(source: ShaderSources): Promise<RenderShaderProgram> {
        return new Promise((resolve) => { this.pending.push({ source, resolve }); });
      }
    }
    const device = new DeferredDevice();
    const asyncCache = new ProgramCache(device, { parallelCompile: true });
    const syncCache = new ProgramCache(device, { parallelCompile: false, maxSyncCompilesPerFrame: 1 });
    let notifications = 0;
    const unsubscribe = subscribeProgramReadiness(device, () => { notifications += 1; });
    try {
      const base = normalizeProgramFeatures({ lighting: "lit" });
      const pending = asyncCache.acquire(base);
      expect(pending.status).toBe("pending");
      const request = device.pending[0]!;
      request.resolve(device.createShaderProgram(request.source));
      await Promise.resolve();
      await Promise.resolve();
      expect(pending.status).toBe("ready");
      expect(notifications).toBe(1);
      expect(syncCache.acquire(base).status).toBe("ready");
      const deferred = syncCache.acquire(normalizeProgramFeatures({ lighting: "unlit" }));
      expect(deferred.status).toBe("pending");
      await Promise.resolve();
      expect(notifications).toBe(2);
      syncCache.beginFrame();
      expect(syncCache.acquire(normalizeProgramFeatures({ lighting: "unlit" })).status).toBe("ready");
      unsubscribe();
      syncCache.acquire(normalizeProgramFeatures({ lighting: "lit", fog: "linear" }));
      await Promise.resolve();
      expect(notifications).toBe(2);
    } finally { unsubscribe(); asyncCache.dispose(); syncCache.dispose(); device.dispose(); }
  });

  it("reports active user draw hooks to replay planning", () => {
    expect(hasForwardDrawHooks()).toBe(false);
    const remove = registerForwardDrawHook({ id: "replay-hook-test", bind: () => {} });
    try { expect(hasForwardDrawHooks()).toBe(true); }
    finally { remove(); }
    expect(hasForwardDrawHooks()).toBe(false);
  });

  it("admits only unchanged built-in materials and providers for draw replay", () => {
    const replayFlags = createTrustedQrFlags({ A3D_QR_MATERIALS: true });
    const geometry = Geometry.box(), material = new PBRMaterial(), unlit = new UnlitMaterial(), instancedUnlit = new InstancedUnlitMaterial();
    const impostor = new Material({ shaderKey: "aura3d/pbr-direct" });
    let selections = 0;
    try {
      expect(forwardDrawReplaySafe([{ geometry, material }, { geometry, material: unlit }, { geometry, material: instancedUnlit }], replayFlags)).toBe(true);
      Object.defineProperty(instancedUnlit, "getParameters", { configurable: true, value: () => { selections += 1; return new Map(); } });
      try { expect(forwardDrawReplaySafe([{ geometry, material: instancedUnlit }], replayFlags)).toBe(false); }
      finally { Reflect.deleteProperty(instancedUnlit, "getParameters"); }
      expect(forwardContactParticipantSafe({ geometry, material }, replayFlags)).toBe(true);
      const accessorItem = { geometry, material };
      Object.defineProperty(accessorItem, "geometry", { get: () => { selections += 1; return geometry; } });
      expect(forwardContactParticipantSafe(accessorItem, replayFlags)).toBe(false);
      expect(selections).toBe(0);
      Object.defineProperty(material, "getParameters", { configurable: true, value: () => { selections += 1; return new Map(); } });
      try { expect(forwardContactParticipantSafe({ geometry, material }, replayFlags)).toBe(false); }
      finally { Reflect.deleteProperty(material, "getParameters"); }
      expect(selections).toBe(0);
      const togglingFlags = { values: Object.freeze({}), on: () => { selections += 1; return selections > 1; } };
      expect(forwardDrawReplaySafe([{ geometry, material }], togglingFlags)).toBe(false);
      expect(selections).toBe(0);
      expect(forwardDrawReplaySafe([{ geometry, material: impostor }], replayFlags)).toBe(false);
      expect(forwardDrawReplaySafe([{ geometry, material, onBeforeRender: () => {} }], replayFlags)).toBe(false);
      const remove = registerShaderFeature({ id: "prd04.userReplayProbe", owner: "prd04", flag: "A3D_QR_MATERIALS",
        chunks: [], hooks: [], select: () => { selections += 1; return true; }, defines: () => ({}) });
      try {
        expect(forwardDrawReplaySafe([{ geometry, material }], replayFlags)).toBe(false);
        expect(selections).toBe(0);
      } finally { remove(); }
      const feature = PRD04_SHADER_FEATURES[0]!, originalSelect = feature.select;
      Object.assign(feature, { select: () => { selections += 1; return undefined; } });
      try { expect(forwardDrawReplaySafe([{ geometry, material }], replayFlags)).toBe(false); }
      finally { Object.assign(feature, { select: originalSelect }); }
      const lobe = PRD04_MATERIAL_LOBES[0]!, originalBind = lobe.bind;
      Object.assign(lobe, { bind: () => { selections += 1; } });
      try { expect(forwardDrawReplaySafe([{ geometry, material }], replayFlags)).toBe(false); }
      finally { Object.assign(lobe, { bind: originalBind }); }
      const originalVelocity = bindVelocityUniforms;
      setVelocityUniformBinder(() => { selections += 1; });
      try { expect(forwardDrawReplaySafe([{ geometry, material }], replayFlags)).toBe(false); }
      finally { setVelocityUniformBinder(originalVelocity); }
      expect(selections).toBe(0);
      expect(forwardDrawReplaySafe([{ geometry, material }], replayFlags)).toBe(true);
    } finally { geometry.dispose(); material.dispose(); unlit.dispose(); instancedUnlit.dispose(); impostor.dispose(); }
  });

  it("rejects replaced built-in methods and texture callbacks before replay", () => {
    const replayFlags = createTrustedQrFlags({ A3D_QR_MATERIALS: true });
    const geometry = Geometry.box(), material = new PBRMaterial(), texture = pixel();
    material.setParameter("u_baseColorTexture", new TextureBinding({ name: "u_baseColorTexture", texture }));
    let calls = 0;
    try {
      expect(forwardDrawReplaySafe([{ geometry, material }], replayFlags)).toBe(true);
      for (const [prototype, name] of [
        [PBRMaterial.prototype, "programFeatures"], [Material.prototype, "getParameters"],
        [Geometry.prototype, "uploadVertexBuffers"], [VertexBuffer.prototype, "upload"],
        [VertexFormat.prototype, "getAttribute"], [TextureBinding.prototype, "validate"]
      ] as const) {
        const original = Object.getOwnPropertyDescriptor(prototype, name)!;
        Object.defineProperty(prototype, name, { ...original, value: () => { calls += 1; } });
        try { expect(forwardDrawReplaySafe([{ geometry, material }], replayFlags)).toBe(false); }
        finally { Object.defineProperty(prototype, name, original); }
      }
      Object.defineProperty(geometry, "uploadVertexBuffers", { configurable: true, value: () => { calls += 1; } });
      try { expect(forwardDrawReplaySafe([{ geometry, material }], replayFlags)).toBe(false); }
      finally { Reflect.deleteProperty(geometry, "uploadVertexBuffers"); }
      texture.pollContentRevision = () => { calls += 1; };
      expect(forwardDrawReplaySafe([{ geometry, material }], replayFlags)).toBe(false);
      texture.pollContentRevision = undefined;
      expect(forwardDrawReplaySafe([{ geometry, material }], replayFlags)).toBe(true);
      expect(calls).toBe(0);
    } finally { texture.dispose(); geometry.dispose(); material.dispose(); }
  });

  it("keeps eight-influence skinning and instance matrices on distinct portable locations", () => {
    const four = skinInstancingProgram(4);
    const eight = skinInstancingProgram(8);
    const emissive = skinInstancingProgram(8, false, true);
    for (let index = 0; index < 4; index += 1) {
      expect(four.vertex).toContain(`layout(location = ${8 + index}) in vec4 a_instanceMatrix${index};`);
      expect(eight.vertex).toContain(`layout(location = ${10 + index}) in vec4 a_instanceMatrix${index};`);
    }
    expect(eight.vertex).toContain("layout(location = 8) in vec4 a_joints1;");
    expect(eight.vertex).toContain("layout(location = 9) in vec4 a_weights1;");
    expect(eight.vertex).toContain("layout(location = 14) in vec4 a_instanceColor;");
    expect(emissive.vertex).toContain("layout(location = 14) in vec4 a_a3dInstanceEmissive;");
    expect(() => skinInstancingProgram(8, true, true)).toThrow(/GENERATED_INSTANCE_COLOR_LAYOUT_UNSUPPORTED/);
  });

  it("receives local shadow tiles without selecting a directional map", () => {
    const local = localOnlyShadowProgram();
    expect(local.descriptor?.features.shadows).toMatchObject({ cascades: 0, localShadows: 6 });
    expect(local.fragment).toContain("uniform highp sampler2DShadow u_localShadowAtlas;");
    expect(local.fragment).toContain("radiance *= a3dLocalLightShadow(");
    expect(local.fragment).not.toContain("uniform sampler2D u_shadowMapTexture;");
  });

  it("matches clustered producer tiles at partial viewport boundaries", () => {
    const program = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", lights: { dir: 0, point: 8, spot: 0, rect: 0, clustered: true, hemisphere: false } }), { flags });
    expect(program.fragment).toContain("floor(min(fragCoord, u_clusterViewportSize) / 64.0)");
    expect(program.fragment).not.toContain("u_clusterViewportSize / u_clusterGridSize");
    expect(CLUSTER_TILE_SIZE).toBe(64);
    if (hasGlslang) {
      const dir = mkdtempSync(join(tmpdir(), "aura3d-cluster-tiles-"));
      try {
        const vertex = join(dir, "source.vert"), fragment = join(dir, "source.frag");
        writeFileSync(vertex, program.vertex); writeFileSync(fragment, program.fragment);
        const linked = execFileSync("glslangValidator", ["-l", "-q", vertex, fragment], { encoding: "utf8" });
        expect(linked).toContain("u_clusterViewportSize");
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    const matrix = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    for (const size of [63, 64, 65, 127, 128, 129]) {
      const grid = Math.ceil(size / CLUSTER_TILE_SIZE);
      const samples = Array.from({ length: grid }, (_, tile) => tile * CLUSTER_TILE_SIZE + 0.5);
      const lights = samples.flatMap((y, row) => samples.map((x, column) => ({ kind: "point" as const,
        color: [1, 1, 1] as const, intensity: 1, position: [2 * x / size - 1, 2 * y / size - 1, 0] as const,
        direction: [0, 0, -1] as const, range: 0, spotAngle: 0, penumbra: 0, castsShadow: false,
        layerMask: 0xffffffff, source: new PointLight(`tile-${row}-${column}`) })));
      const clustered = createClusteredForwardLighting(lights, size, size, matrix);
      try {
        const pixels = clustered.lightIndices.texture!.mipLevels[0]!.data as Float32Array;
        expect(clustered.diagnostics.gridWidth).toBe(grid);
        expect(clustered.diagnostics.gridHeight).toBe(grid);
        for (const [row, y] of samples.entries()) for (const [column, x] of samples.entries()) {
          const tile = Math.floor(y / CLUSTER_TILE_SIZE) * grid + Math.floor(x / CLUSTER_TILE_SIZE);
          const offset = tile * MAX_LIGHTS_PER_CLUSTER * 4;
          expect(pixels[offset]).toBe(row * grid + column);
          expect(pixels[offset + 1]).toBe(1);
        }
      } finally { clustered.dispose(); }
    }
  });

  it.skipIf(!hasGlslang)("links generated eight-influence instancing with base and emissive colors", () => {
    const dir = mkdtempSync(join(tmpdir(), "aura3d-skin-instance-"));
    const vertex = join(dir, "generated.vert"), fragment = join(dir, "generated.frag");
    try {
      for (const program of [skinInstancingProgram(8), skinInstancingProgram(8, false, true), skinInstancingProgram(8, true, false, ["uint", "sint"]), localOnlyShadowProgram(), standaloneShadowProgram()]) {
        writeFileSync(vertex, program.vertex);
        writeFileSync(fragment, program.fragment);
        expect(() => execFileSync("glslangValidator", ["-l", vertex, fragment], { stdio: "pipe" })).not.toThrow();
      }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });

  it("submits a generated eight-influence instanced draw with its palette and color stream", () => {
    const device = new MockRenderDevice();
    setRendererQrFlags({
      values: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_ANIMATION: true, A3D_QR_MATERIALS: true },
      on: (name) => ["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_ANIMATION", "A3D_QR_MATERIALS"].includes(name)
    }, device);
    const vertices = new VertexBuffer(VertexFormat.P3N3J8W8, 3);
    for (let index = 0; index < 3; index += 1) {
      vertices.setAttribute(index, "position", [index === 1 ? 1 : 0, index === 2 ? 1 : 0, 0]);
      vertices.setAttribute(index, "normal", [0, 0, 1]);
      vertices.setAttribute(index, "joints", [0, 0, 0, 0]);
      vertices.setAttribute(index, "weights", [0.5, 0, 0, 0]);
      vertices.setAttribute(index, "joints1", [1, 0, 0, 0]);
      vertices.setAttribute(index, "weights1", [0.5, 0, 0, 0]);
    }
    const geometry = new Geometry(vertices, null, "triangles");
    const material = new SkinnedLitMaterial({ extraInfluences: true });
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    const translated = [...identity]; translated[12] = 3;
    const secondJoint = [...identity]; secondJoint[13] = 2;
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry, material, skinning: { jointCount: 2, matrices: new Float32Array([...identity, ...secondJoint]), extraInfluences: true },
        instanceTransforms: new Float32Array([...identity, ...translated]), instanceColors: new Float32Array([1, 0, 0, 1, 0, 1, 0, 1]) }] })
        .execute({ device, width: 8, height: 8 });
      device.endFrame();
      expect(device.drawCommands).toHaveLength(1);
      const draw = device.drawCommands[0]!;
      expect(draw.instanceCount).toBe(2);
      expect(draw.shader?.reflection.attributes.get("a_joints1")).toBe(8);
      expect(draw.shader?.reflection.attributes.get("a_weights1")).toBe(9);
      for (let index = 0; index < 4; index += 1) expect(draw.shader?.reflection.attributes.get(`a_instanceMatrix${index}`)).toBe(10 + index);
      expect(draw.shader?.reflection.attributes.get("a_instanceColor")).toBe(14);
      expect(draw.instanceAttributes?.map((attribute) => attribute.shaderName)).toEqual([
        "a_instanceMatrix0", "a_instanceMatrix1", "a_instanceMatrix2", "a_instanceMatrix3", "a_instanceColor"
      ]);
      const bone = draw.uniforms?.get("u_boneTexture");
      expect(isTextureBinding(bone)).toBe(true);
      expect(Array.from((bone as TextureBinding).texture!.data as Float32Array).slice(16, 32)).toEqual(secondJoint);
      const matrixBuffer = draw.instanceAttributes![0]!.buffer as MockRenderBuffer;
      expect(new Float32Array(matrixBuffer.bytes.buffer)[28]).toBe(3);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("selects mixed integer joint shader inputs for a generated WebGL draw", () => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        this.sources.push(source);
        return super.createShaderProgram(source);
      }
    }
    const device = new CaptureDevice();
    Object.defineProperty(device, "kind", { value: "webgl2" });
    setRendererQrFlags({
      values: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_ANIMATION: true },
      on: (name) => ["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_ANIMATION"].includes(name)
    }, device);
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
      { semantic: "joints", components: 4, offset: 24, type: "uint8", integer: true },
      { semantic: "weights", components: 4, offset: 28 },
      { semantic: "joints1", components: 4, offset: 44, type: "int16", integer: true },
      { semantic: "weights1", components: 4, offset: 52 }
    ], 68);
    const vertices = new VertexBuffer(format, 3);
    for (let index = 0; index < 3; index += 1) {
      vertices.setAttribute(index, "position", [index === 1 ? 1 : 0, index === 2 ? 1 : 0, 0]);
      vertices.setAttribute(index, "normal", [0, 0, 1]);
      vertices.setAttribute(index, "joints", [0, 0, 0, 0]);
      vertices.setAttribute(index, "weights", [0.5, 0, 0, 0]);
      vertices.setAttribute(index, "joints1", [1, 0, 0, 0]);
      vertices.setAttribute(index, "weights1", [0.5, 0, 0, 0]);
    }
    const geometry = new Geometry(vertices, null, "triangles");
    const material = new SkinnedLitMaterial({ extraInfluences: true });
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry, material, skinning: { jointCount: 2, matrices: new Float32Array([...identity, ...identity]), extraInfluences: true },
        instanceTransforms: new Float32Array([...identity, ...identity]) }] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      const descriptor = device.sources.find((source) => source.generatedProgram)?.generatedProgram;
      expect(descriptor?.features.skinning).toEqual({ influences: 8, palette: "texture" });
      expect(descriptor?.features.features).toMatchObject({ "prd06.joint0Type": "uint", "prd06.joint1Type": "sint" });
      expect(descriptor?.defines).toMatchObject({ A3D_JOINT0_UINT: true, A3D_JOINT1_SINT: true });
      expect(device.drawCommands[0]?.instanceCount).toBe(2);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects integer shader inputs for generated skin weights", () => {
    const device = new MockRenderDevice();
    setRendererQrFlags({
      values: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_ANIMATION: true },
      on: (name) => ["A3D_QR_CORE", "A3D_QR_CORE_GENERATOR", "A3D_QR_ANIMATION"].includes(name)
    }, device);
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
      { semantic: "joints", components: 4, offset: 24 },
      { semantic: "weights", components: 4, offset: 40, type: "uint8", integer: true }
    ], 44);
    const geometry = new Geometry(new VertexBuffer(format, 3), null, "triangles");
    const material = new SkinnedLitMaterial();
    const identity = new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
    try {
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [{ geometry, material, skinning: { jointCount: 1, matrices: identity } }] })
        .execute({ device, width: 8, height: 8 })).toThrow(/weights require float or normalized inputs/);
      expect(device.drawCommands).toHaveLength(0);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("does not fall back to a different native shader after generated compilation or binding fails", () => {
    class NativeFailureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      failGenerated = false;
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        this.sources.push(source);
        if (this.failGenerated && source.generatedProgram) throw new Error("unsupported generated feature");
        return super.createShaderProgram(source);
      }
    }
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      for (const failGenerated of [true, false]) {
        const device = new NativeFailureDevice();
        Object.defineProperty(device, "kind", { value: "webgpu" });
        device.failGenerated = failGenerated;
        setRendererQrFlags({ values: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true },
          on: (name) => name === "A3D_QR_CORE" || name === "A3D_QR_CORE_GENERATOR" }, device);
        const geometry = Geometry.box(), material = new PBRMaterial();
        if (!failGenerated) material.setParameter("u_roughness", Number.NaN);
        try {
          device.beginFrame(8, 8);
          expect(() => new ForwardPass({ items: [{ geometry, material }] }).execute({ device, width: 8, height: 8 }))
            .toThrow(failGenerated ? /generated program failed to compile/ : /Material binding validation failed/);
          expect(device.drawCommands).toHaveLength(0);
          expect(device.sources).toHaveLength(1);
          expect(device.sources[0]?.generatedProgram).toBeDefined();
        } finally { geometry.dispose(); material.dispose(); device.dispose(); }
      }
    } finally { errorLog.mockRestore(); }
  });

  it("shades a finite one-sided rectangle in packed and clustered generated programs", () => {
    const on = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_MATERIALS: true });
    const device = new MockRenderDevice(), geometry = Geometry.box();
    const material = new PBRMaterial({ clearcoatFactor: 0.5, sheenColorFactor: [0.2, 0.3, 0.4], anisotropyStrength: 0.2,
      iridescenceFactor: 0.4, diffuseTransmissionFactor: 0.3 });
    setRendererQrFlags(on, device);
    const rect = new RectAreaLight("rect"); rect.width = 2; rect.height = 1; rect.range = 10; rect.intensity = 2;
    rect.castsShadow = true; rect.transform.setPosition(0, 0, 2); rect.transform.updateWorld(undefined, true);
    const light = collectLight(rect);
    try {
      const record = material.programFeatures({ flags: on, tier: QUALITY_TIERS.high });
      const programs = [false, true].map((clustered) => generateProgramImpl(normalizeProgramFeatures({ ...record,
        lights: { dir: 0, point: 0, spot: 0, rect: 1, clustered, hemisphere: false } }), { flags: on }));
      for (const program of programs) {
        const start = program.fragment.indexOf("for (int a3dRectSample = 0;");
        const sample = program.fragment.slice(start, program.fragment.indexOf("continue;", start));
        expect(sample).toContain("0.28867513459");
        expect(program.fragment).toContain("a3dRectDimensions.x * a3dRectDimensions.y * 0.25");
        expect(sample).toContain("max(dot(a3dRectNormal, -L), 0.0)");
        expect(sample).toContain("a3dGetDistanceAttenuation(a3dRectDistance, a3dRectPosition.w, 2.0)");
        expect(sample).toContain("a3dDirectLight(L, radiance, V, N, material");
        expect(sample).toContain("a3dPrd04CoatDirect += radiance");
        expect(sample).toContain("a3dPrd04SheenDirectSum += radiance");
        expect(sample).toContain("a3dDiffuseTransmissionDirect += max(radiance");
      }
      expect(programs[1]!.fragment).toContain("texelFetch(u_clusterLightData, ivec2(5, lightIndex), 0)");
      const saturated = generateProgramImpl(normalizeProgramFeatures({ ...record,
        lights: { dir: 0, point: 0, spot: 0, rect: 4, clustered: false, hemisphere: false } }), { flags: on });
      expect(saturated.fragment).toContain("for (int i = 0; i < 16; ++i)");
      const removeHook = registerShaderFeature({ id: "rect.unknown-light-hook", owner: "prd04", flag: "A3D_QR_CORE",
        hooks: ["fragment:lights"], chunks: [], select: () => true, defines: () => ({}) });
      try {
        expect(() => generateProgramImpl(normalizeProgramFeatures({ ...record, features: { ...record.features, "rect.unknown-light-hook": true },
          lights: { dir: 0, point: 0, spot: 0, rect: 1, clustered: false, hemisphere: false } }), { flags: on }))
          .toThrow(/GENERATED_RECT_LIGHT_HOOK_UNSUPPORTED/);
      } finally { removeHook(); }
      if (hasGlslang) {
        const dir = mkdtempSync(join(tmpdir(), "aura3d-rect-light-"));
        try {
          const vertex = join(dir, "source.vert"), fragment = join(dir, "source.frag");
          for (const program of programs) {
            writeFileSync(vertex, program.vertex); writeFileSync(fragment, program.fragment);
            expect(() => execFileSync("glslangValidator", ["-l", vertex, fragment], { stdio: "pipe" })).not.toThrow();
          }
        } finally { rmSync(dir, { recursive: true, force: true }); }
      }
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry, material }], lights: [light] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      const packed = device.drawCommands[0]!.uniforms!.get("u_lightData") as Float32Array;
      expect(Array.from(packed.slice(0, 4))).toEqual([1, 1, 1, 2]);
      expect(Array.from(packed.slice(4, 8))).toEqual([0, 0, 2, 10]);
      expect(packed[11]).toBe(3);
      expect(Array.from(packed.slice(12, 15))).toEqual([2, 1, 0]);
      expect(Array.from(packed.slice(16, 19))).toEqual([1, 0, 0]);
      expect(Array.from(packed.slice(20, 23))).toEqual([0, 1, 0]);
      new ForwardPass({ items: [{ geometry, material }], lights: Array.from({ length: 5 }, () => light) })
        .execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(2);
      expect(device.drawCommands[1]!.uniforms!.get("u_lightCount")).toBe(5);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("binds the raw native local atlas without a dummy directional map", () => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        this.sources.push(source);
        return super.createShaderProgram(source);
      }
    }
    const device = new CaptureDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    const light = { kind: "point" as const, color: [1, 1, 1] as const, intensity: 1, position: [0, 0, 0] as const,
      direction: [0, -1, 0] as const, range: 4, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: new PointLight("local-shadow") };
    const texture = pixel();
    const raw = new TextureBinding({ name: "u_localShadowAtlas", texture, required: true,
      sampler: new Sampler({ minFilter: "nearest", magFilter: "nearest" }) });
    const geometry = Geometry.box(), material = new PBRMaterial();
    const shadowMap = { texture: new TextureBinding({ name: "unused-shadow", required: false }), lightMatrix: new Float32Array(16), strength: 0,
      localShadows: { slots: new Map([[light, 0]]), rawTexture: raw, atlasSize: 1, matrices: new Float32Array(96), rects: new Float32Array(24),
        texelScale: new Float32Array(8), strength: 1, biasTexels: 0, slopeBiasTexels: 0, normalBiasTexels: 0 } };
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry, material }], lights: [light], shadowMap }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      expect(device.drawCommands[0]?.uniforms?.get("u_localShadowAtlas")).toBe(raw);
      const descriptor = device.sources.find((source) => source.generatedProgram)?.generatedProgram;
      expect(descriptor?.features.shadows).toMatchObject({ cascades: 0, localShadows: 6 });
      expect(device.sources[0]?.fragment).not.toContain("uniform sampler2D u_shadowMapTexture;");

      new ForwardPass({ items: [{ geometry, material, receiveShadow: false }], lights: [light], shadowMap }).execute({ device, width: 8, height: 8 });
      const disabled = device.sources.find((source) => source.generatedProgram?.features.shadows.localShadows === 0);
      expect(disabled?.generatedProgram?.features.shadows.cascades).toBe(0);
      expect(device.drawCommands).toHaveLength(2);
    } finally { geometry.dispose(); material.dispose(); texture.dispose(); device.dispose(); }
  });

  it("selects a current-frame contact mask independently of a directional map", () => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      readonly clusteredDraws: { texture: Texture; pixels: Float32Array; disposedAtDraw: boolean }[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        this.sources.push(source);
        return super.createShaderProgram(source);
      }
      override draw(command: DrawCommand): void {
        super.draw(command);
        const clusterBinding = command.uniforms?.get("u_clusterLightData");
        const texture = isTextureBinding(clusterBinding) ? clusterBinding.texture : null;
        const pixels = texture?.mipLevels[0]?.data;
        if (texture && pixels instanceof Float32Array) {
          // The pass releases its transient textures before execute() returns.
          this.clusteredDraws.push({ texture, pixels: pixels.slice(), disposedAtDraw: texture.disposed });
        }
      }
    }
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new PBRMaterial();
    const target = createContactShadowMaskTarget(device, 1, 1), mask = target.colorTexture;
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    const light = { kind: "directional" as const, color: [1, 1, 1] as const, intensity: 1, position: [0, 0, 0] as const,
      direction: [0, -1, 0] as const, range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: new DirectionalLight("contact") };
    const frame = { device, width: 8, height: 8, postScopeId: {}, viewId: "main", frameIndex: 3, timeSeconds: 0, blackboard: new Map(), rasterViewportIsFull: true,
      camera: { position: [0, 0, 1], viewProjectionMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) } } as unknown as FrameContributorContext;
    const publication = { texture: mask, width: 8, height: 8, strength: 0.0001, cameraPosition: [0, 0, 1] as const, sourceLight: light.source };
    try {
      device.beginFrame(8, 8);
      frame.blackboard.set("prd02.contactShadowMask", mask);
      setContactShadowMask(device, publication, frame, target);
      new ForwardPass({ items: [{ geometry, material }], lights: [light], frameContext: frame }).execute({ device, width: 8, height: 8 });
      const active = device.sources.find((source) => source.generatedProgram?.features.shadows.contact);
      expect(active?.generatedProgram?.features.shadows.cascades).toBe(0);
      expect(active?.fragment).toContain("uniform sampler2D u_contactShadowMask;");
      expect(active?.fragment).toContain("u_contactShadowMaskStrength <= 0.0");
      expect(active?.fragment).toContain("radiance *= a3dContactShadowMaskFactor(");
      expect((device.drawCommands[0]?.uniforms?.get("u_contactShadowMask") as TextureBinding).texture).toBe(mask);
      expect(device.drawCommands[0]?.uniforms?.get("u_contactShadowMaskStrength")).toBe(0.0001);
      expect(device.drawCommands[0]?.uniforms?.get("u_contactShadowMaskViewport")).toEqual([8, 8]);
      expect(device.drawCommands[0]?.uniforms?.get("u_contactShadowLightIndex")).toBe(0);
      new ForwardPass({ items: [{ geometry, material, receiveShadow: false }], lights: [light], frameContext: frame }).execute({ device, width: 8, height: 8 });
      const inactive = device.sources.find((source) => source.generatedProgram?.features.shadows.contact === false);
      expect(inactive?.fragment).not.toContain("u_contactShadowMask");
      const stale = { ...frame, frameIndex: frame.frameIndex + 1 };
      new ForwardPass({ items: [{ geometry, material }], lights: [light], frameContext: stale }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(3);
      const other = { ...light, source: new DirectionalLight("other") };
      new ForwardPass({ items: [{ geometry, material }], lights: [other, light], frameContext: frame })
        .execute({ device, width: 8, height: 8 });
      expect(device.drawCommands[3]?.uniforms?.get("u_contactShadowLightIndex")).toBe(1);
      expect(() => new ForwardPass({ items: [{ geometry, material }], lights: [light, light], frameContext: frame })
        .execute({ device, width: 8, height: 8 })).toThrow(/light identity is ambiguous/);
      expect(device.drawCommands).toHaveLength(4);
      setRendererQrFlags(createTrustedQrFlags({}), device);
      const library = createDefaultShaderLibrary();
      new ForwardPass({ items: [{ geometry, material }], lights: [other, light], frameContext: frame, shaderLibrary: library })
        .execute({ device, width: 8, height: 8 });
      const packed = device.drawCommands.at(-1)?.uniforms;
      expect(packed?.get("u_contactShadowLightIndex")).toBe(1);
      expect((packed?.get("u_lightData") as Float32Array)[24 + 14]).toBe(1);
      const additional = Array.from({ length: 16 }, (_, index) => ({ ...light, kind: "point" as const, castsShadow: false,
        position: [index, 0, 0] as const, source: new PointLight(`other-${index}`) }));
      new ForwardPass({ items: [{ geometry, material }], lights: [...additional, light], frameContext: frame, shaderLibrary: library })
        .execute({ device, width: 8, height: 8 });
      const clustered = device.drawCommands.at(-1)?.uniforms;
      expect(clustered?.get("u_contactShadowLightIndex")).toBe(16);
      expect(device.clusteredDraws).toHaveLength(1);
      const snapshot = device.clusteredDraws[0]!;
      expect(snapshot.texture).toBe((clustered?.get("u_clusterLightData") as TextureBinding).texture);
      expect(snapshot.disposedAtDraw).toBe(false);
      expect(snapshot.texture.disposed).toBe(true);
      const clusterData = snapshot.pixels;
      expect(clusterData[16 * 24 + 11]).toBe(0);
      expect(clusterData[16 * 24 + 14]).toBe(1);
      const overflow = Array.from({ length: 64 }, (_, index) => ({ ...additional[index % additional.length]!, source: new PointLight(`overflow-${index}`) }));
      const beforeOverflow = device.drawCommands.length;
      expect(() => new ForwardPass({ items: [{ geometry, material }], lights: [...overflow, light], frameContext: frame, shaderLibrary: library })
        .execute({ device, width: 8, height: 8 })).toThrow(/contact shadow light exceeds the clustered light capacity/);
      expect(device.drawCommands).toHaveLength(beforeOverflow);
      for (const renderState of [{ blendMode: "alpha" as const }, { depthWrite: false }, { depthTest: false },
        { depthCompare: "always" as const }, { alphaToCoverage: true }, { polygonOffset: { factor: 1, units: 1 } }]) {
        const unsafe = new PBRMaterial({ renderState });
        try {
          expect(() => new ForwardPass({ items: [{ geometry, material: unsafe }], lights: [light], frameContext: frame, shaderLibrary: library })
            .execute({ device, width: 8, height: 8 })).toThrow(/opaque receiver matching the camera depth prepass/);
          expect(device.drawCommands).toHaveLength(beforeOverflow);
        } finally { unsafe.dispose(); }
      }
      let callbacks = 0;
      expect(() => new ForwardPass({ items: [{ geometry, material, onBeforeRender: () => { callbacks += 1; } }], lights: [light], frameContext: frame, shaderLibrary: library })
        .execute({ device, width: 8, height: 8 })).toThrow(/stable forward providers and draw participants/);
      expect(callbacks).toBe(0);
      setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
      const removeFeature = registerShaderFeature({ id: "contact.unsafe-provider", owner: "prd04", flag: "A3D_QR_CORE", hooks: [], chunks: [],
        select: () => { callbacks += 1; return true; }, defines: () => ({}) });
      try {
        expect(() => new ForwardPass({ items: [{ geometry, material }], lights: [light], frameContext: frame, shaderLibrary: library })
          .execute({ device, width: 8, height: 8 })).toThrow(/stable forward providers and draw participants/);
        expect(callbacks).toBe(0);
      } finally { removeFeature(); }
      setRendererQrFlags(createTrustedQrFlags({}), device);
      const driftingFrame = { ...frame, camera: { ...frame.camera!, position: [0, 0, 2] } } as unknown as FrameContributorContext;
      expect(() => new ForwardPass({ items: [{ geometry, material, onBeforeRender: () => {
        Object.assign(driftingFrame.camera!, { position: [0, 0, 1] });
      } }], lights: [light], frameContext: driftingFrame, shaderLibrary: library }).execute({ device, width: 8, height: 8 }))
        .toThrow(/stable forward providers and draw participants/);
      expect(device.drawCommands).toHaveLength(beforeOverflow);
      for (const override of [{ cameraPosition: [0, 0, 2] as const }, { timeSeconds: 1 }]) {
        new ForwardPass({ items: [{ geometry, material }], lights: [light], frameContext: frame, shaderLibrary: library, ...override })
          .execute({ device, width: 8, height: 8 });
        expect(device.drawCommands.at(-1)?.uniforms?.get("u_contactShadowMaskStrength")).toBe(0);
      }
    } finally { setContactShadowMask(device, undefined); geometry.dispose(); material.dispose(); target.dispose(); device.dispose(); }
  });

  it("invalidates and draws the contact variant after an asynchronous compile", async () => {
    class DeferredDevice extends MockRenderDevice {
      pending: { source: ShaderSources; resolve: (program: RenderShaderProgram) => void }[] = [];
      compileAsync(source: ShaderSources): Promise<RenderShaderProgram> {
        return new Promise((resolve) => { this.pending.push({ source, resolve }); });
      }
    }
    const device = new DeferredDevice();
    Object.defineProperty(device, "probe", { value: { parallelShaderCompile: true } });
    const geometry = Geometry.box(), material = new PBRMaterial(), target = createContactShadowMaskTarget(device, 1, 1);
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true });
    setRendererQrFlags(flags, device);
    const light = { kind: "directional" as const, color: [1, 1, 1] as const, intensity: 1, position: [0, 0, 0] as const,
      direction: [0, -1, 0] as const, range: 0, spotAngle: 0, penumbra: 0, castsShadow: true, layerMask: 0xffffffff, source: new DirectionalLight("deferred-contact") };
    const frame = { device, width: 8, height: 8, postScopeId: {}, viewId: "main", frameIndex: 3, timeSeconds: 0, blackboard: new Map(), rasterViewportIsFull: true,
      camera: { position: [0, 0, 1], viewProjectionMatrix: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) } } as unknown as FrameContributorContext;
    const publication = { texture: target.colorTexture, width: 8, height: 8, strength: 0.5, cameraPosition: [0, 0, 1] as const, sourceLight: light.source };
    let invalidations = 0;
    const unsubscribe = subscribeProgramReadiness(device, () => { invalidations += 1; });
    try {
      device.beginFrame(8, 8);
      frame.blackboard.set("prd02.contactShadowMask", target.colorTexture);
      setContactShadowMask(device, publication, frame, target);
      new ForwardPass({ items: [{ geometry, material }], lights: [light], frameContext: frame }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(0);
      expect(device.pending).toHaveLength(1);
      const request = device.pending[0]!;
      request.resolve(device.createShaderProgram(request.source));
      await Promise.resolve(); await Promise.resolve();
      expect(invalidations).toBe(1);
      const nextFrame = { ...frame, frameIndex: frame.frameIndex + 1 };
      setContactShadowMask(device, publication, nextFrame, target);
      new ForwardPass({ items: [{ geometry, material }], lights: [light], frameContext: nextFrame }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      expect(device.drawCommands[0]?.uniforms?.get("u_contactShadowLightIndex")).toBe(0);
      expect((device.drawCommands[0]?.uniforms?.get("u_contactShadowMask") as TextureBinding).texture).toBe(target.colorTexture);
    } finally { unsubscribe(); setContactShadowMask(device, undefined); geometry.dispose(); material.dispose(); target.dispose(); device.dispose(); }
  });

  it("selects standalone native point and spot maps only for active receivers", () => {
    const device = new MockRenderDevice();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    setRendererQrFlags({ values: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true },
      on: (name) => name === "A3D_QR_CORE" || name === "A3D_QR_CORE_GENERATOR" }, device);
    const geometry = Geometry.box(), material = new PBRMaterial();
    const common = { color: [1, 1, 1] as const, intensity: 1, position: [0, 0, 0] as const, direction: [0, -1, 0] as const,
      range: 4, spotAngle: 0.5, penumbra: 0, castsShadow: true, layerMask: 0xffffffff };
    const point = { ...common, kind: "point" as const, source: new PointLight("point") };
    const spot = { ...common, kind: "spot" as const, source: new SpotLight("spot") };
    const texture = pixel();
    const shadowTexture = new TextureBinding({ name: "shadow", texture, required: true });
    const pointMap = { texture: shadowTexture, lightPosition: [0, 0, 0] as const, range: 4, faceMatrices: new Float32Array(96),
      faceRects: new Float32Array(Array.from({ length: 6 }, () => [0, 0, 1, 1]).flat()), strength: 1 };
    const spotMap = { texture: shadowTexture, lightPosition: [0, 0, 0] as const, lightDirection: [0, -1, 0] as const,
      range: 4, angle: 0.5, penumbra: 0, shadowMatrix: new Float32Array(16), strength: 1 };
    const shadow = { texture: new TextureBinding({ name: "unused-shadow", required: false }), lightMatrix: new Float32Array(16), strength: 0 };
    try {
      device.beginFrame(8, 8);
      for (const [light, option, map] of [[point, "pointLight", pointMap], [spot, "spotLight", spotMap]] as const) {
        const shadowMap = { ...shadow, [option]: map };
        new ForwardPass({ items: [{ geometry, material }], lights: [light], shadowMap })
          .execute({ device, width: 8, height: 8 });
        expect(device.drawCommands.at(-1)?.uniforms?.get(option === "pointLight" ? "u_pointShadowMapTexture" : "u_spotShadowMapTexture")).toBe(shadowTexture);
        new ForwardPass({ items: [{ geometry, material, receiveShadow: false }], lights: [light], shadowMap })
          .execute({ device, width: 8, height: 8 });
      }
      expect(device.drawCommands).toHaveLength(4);
    } finally { geometry.dispose(); material.dispose(); texture.dispose(); device.dispose(); }
  });

  it("binds standalone point and spot shadows only to their matching lights", () => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        this.sources.push(source);
        return super.createShaderProgram(source);
      }
    }
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new PBRMaterial(), texture = pixel();
    setRendererQrFlags({ values: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true },
      on: (name) => name === "A3D_QR_CORE" || name === "A3D_QR_CORE_GENERATOR" }, device);
    const common = { color: [1, 1, 1] as const, intensity: 1, direction: [0, -1, 0] as const, range: 4,
      spotAngle: 0.5, penumbra: 0, castsShadow: true, layerMask: 0xffffffff };
    const point = { ...common, kind: "point" as const, position: [1, 0, 0] as const, source: new PointLight("standalone-point") };
    const spot = { ...common, kind: "spot" as const, position: [2, 0, 0] as const, source: new SpotLight("standalone-spot") };
    const shadowTexture = new TextureBinding({ name: "shadow", texture, required: true });
    const pointMap = { texture: shadowTexture, lightPosition: point.position, range: 4, faceMatrices: new Float32Array(96),
      faceRects: new Float32Array(Array.from({ length: 6 }, () => [0, 0, 1, 1]).flat()), strength: 1 };
    const spotMap = { texture: shadowTexture, lightPosition: spot.position, lightDirection: spot.direction, range: 4,
      angle: 0.5, penumbra: 0, shadowMatrix: new Float32Array(16), strength: 1 };
    const shadowMap = { texture: new TextureBinding({ name: "unused-shadow", required: false }), lightMatrix: new Float32Array(16), strength: 0,
      pointLight: pointMap, spotLight: spotMap };
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry, material }], lights: [point, spot], shadowMap }).execute({ device, width: 8, height: 8 });
      const source = device.sources.find((entry) => entry.generatedProgram?.features.features["a3d.legacyPointShadow"] === true);
      expect(source?.generatedProgram?.features.features["a3d.legacySpotShadow"]).toBe(true);
      expect(source?.generatedProgram?.defines).toMatchObject({ A3D_LEGACY_POINT_SHADOW: true, A3D_LEGACY_SPOT_SHADOW: true });
      expect(source?.fragment).toContain("distance(lightPosition, u_pointShadowLightPosition) > 0.0001");
      expect(source?.fragment).toContain("dot(axis, lightAxis) < 0.9999");
      expect(device.drawCommands[0]?.uniforms?.get("u_pointShadowMapTexture")).toBe(shadowTexture);
      expect(device.drawCommands[0]?.uniforms?.get("u_spotShadowMapTexture")).toBe(shadowTexture);
      expect(device.drawCommands[0]?.uniforms?.get("u_pointShadowFaceMatrices")).toHaveLength(96);
      const second = { ...point, source: new PointLight("duplicate") };
      expect(() => new ForwardPass({ items: [{ geometry, material }], lights: [point, second, spot], shadowMap })
        .execute({ device, width: 8, height: 8 })).toThrow(/cannot distinguish multiple matching/);
      new ForwardPass({ items: [{ geometry, material, receiveShadow: false }], lights: [point, spot], shadowMap })
        .execute({ device, width: 8, height: 8 });
      const disabled = device.sources.find((entry) => entry.generatedProgram && !entry.generatedProgram.features.features["a3d.legacyPointShadow"]);
      expect(disabled?.fragment).not.toContain("uniform sampler2D u_pointShadowMapTexture;");
      expect(disabled?.fragment).not.toContain("uniform sampler2D u_spotShadowMapTexture;");
    } finally { geometry.dispose(); material.dispose(); texture.dispose(); device.dispose(); }
  });

  it("preserves iridescence IOR and ordered thickness endpoints", () => {
    const options = { iridescenceFactor: 0.8, iridescenceIor: 4, iridescenceThicknessMinimum: 700, iridescenceThicknessMaximum: 100 };
    for (const material of [new PBRMaterial(options), new TexturedPBRMaterial(options), new SkinnedLitMaterial(options)]) {
      expect(material.getParameter("u_iridescenceIor")).toBe(4);
      expect(material.getParameter("u_iridescenceThicknessMinimum")).toBe(700);
      expect(material.getParameter("u_iridescenceThicknessMaximum")).toBe(100);
      material.dispose();
    }
    expect(() => new PBRMaterial({ iridescenceIor: 0.9 })).toThrow(/iridescenceIor/);
    expect(() => new TexturedPBRMaterial({ iridescenceIor: Infinity })).toThrow(/iridescenceIor/);
    expect(() => new SkinnedLitMaterial({ iridescenceIor: 0.9 })).toThrow(/iridescenceIor/);
  });

  it("shades diffuse transmission from the opposite hemisphere with independent texture UVs", () => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram { this.sources.push(source); return super.createShaderProgram(source); }
    }
    const on = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true, A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true });
    const factor = pixel(), color = new Texture({ width: 1, height: 1, colorSpace: "srgb", data: new Uint8Array([128, 64, 255, 255]) });
    const material = new TexturedPBRMaterial({ diffuseTransmissionFactor: 0.6, diffuseTransmissionColorFactor: [0.2, 0.8, 0.3],
      diffuseTransmissionTexture: factor, diffuseTransmissionColorTexture: color,
      diffuseTransmissionTextureTransform: { offset: [0.1, 0.2] },
      diffuseTransmissionColorTextureTransform: { scale: [2, 3], rotation: 0.4 },
      textureTexCoords: { diffuseTransmission: 0, diffuseTransmissionColor: 1 } });
    const geometry = new Geometry(new VertexBuffer(VertexFormat.P3N3T4T2T2, 3));
    const record = material.programFeatures({ flags: on, tier: QUALITY_TIERS.high });
    const device = new CaptureDevice();
    setRendererQrFlags(on, device);
    try {
      const ext = record.extensions.find((entry) => entry.lobe === "diffuse-transmission");
      expect(ext?.mapUvSets).toMatchObject({ diffuseTransmission: 0, diffuseTransmissionColor: 1 });
      const program = generateProgramImpl(normalizeProgramFeatures(record), { flags: on });
      expect(program.defines).toMatchObject({ A3D_LOBE_DIFFUSE_TRANSMISSION: true,
        A3D_LOBE_DIFFUSE_TRANSMISSION_MAP: true, A3D_LOBE_DIFFUSE_TRANSMISSION_COLOR_MAP: true });
      expect(program.fragment).toContain("texture(u_diffuseTransmissionTexture, A3D_LOBE_UV_DIFFUSE_TRANSMISSION).a");
      expect(program.fragment).toContain("texture(u_diffuseTransmissionColorTexture, A3D_LOBE_UV_DIFFUSE_TRANSMISSION_COLOR).rgb");
      expect(program.fragment).toContain("float backNl = max(-dot(N, L), 0.0)");
      expect(program.fragment).toContain("directDiffuse * (1.0 - a3dDiffuseTransmissionFactor) + a3dDiffuseTransmissionDirect");
      expect(program.fragment).toContain("a3dSampleEnvironment(-N, 8.0)");
      expect(program.fragment).toContain("u_diffuseTransmissionColorTextureUvTransform * vec3(v_uv1, 1.0)");
      const combined = generateProgramImpl(normalizeProgramFeatures({ ...record, features: { "prd04.transmissionTarget": true },
        extensions: [...record.extensions, { lobe: "transmission", maps: [], bits: {} }] }), { flags: on });
      expect(combined.fragment.indexOf("directDiffuse = directDiffuse * (1.0 - a3dDiffuseTransmissionFactor)"))
        .toBeLessThan(combined.fragment.indexOf("vec3 a3dTotalDiffuse = directDiffuse + indirectDiffuse"));
      if (hasGlslang) {
        const dir = mkdtempSync(join(tmpdir(), "aura3d-diffuse-transmission-"));
        try {
          const vertex = join(dir, "generated.vert"), fragment = join(dir, "generated.frag");
          for (const shader of [program, combined]) {
            writeFileSync(vertex, shader.vertex); writeFileSync(fragment, shader.fragment);
            expect(() => execFileSync("glslangValidator", ["-l", vertex, fragment], { stdio: "pipe" })).not.toThrow();
          }
        } finally { rmSync(dir, { recursive: true, force: true }); }
      }
      expect(forwardItemBucket({ geometry, material })).toBe("opaque");
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry, material }] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands).toHaveLength(1);
      expect(device.sources[0]?.generatedProgram?.features.features["prd04.transmissionTarget"]).toBeUndefined();
      expect((device.drawCommands[0]?.uniforms?.get("u_diffuseTransmissionTexture") as TextureBinding).texture).toBe(factor);
      expect((device.drawCommands[0]?.uniforms?.get("u_diffuseTransmissionColorTexture") as TextureBinding).texture).toBe(color);
      expect(device.drawCommands[0]?.uniforms?.get("u_diffuseTransmissionColorTextureUvTransform")).toBeInstanceOf(Float32Array);
      const missingUv1 = Geometry.texturedCube(1);
      try {
        expect(() => new ForwardPass({ items: [{ geometry: missingUv1, material }] }).execute({ device, width: 8, height: 8 }))
          .toThrow(/selected texture coordinate attributes/);
      } finally { missingUv1.dispose(); }
      expect(() => generateProgramImpl(normalizeProgramFeatures({ ...record, extensions: [...record.extensions,
        { lobe: "volume", maps: [], bits: {} }] }), { flags: on })).toThrow(/GENERATED_DIFFUSE_TRANSMISSION_SOURCE_UNSUPPORTED/);
      expect(() => generateProgramImpl(normalizeProgramFeatures({ ...record,
        features: { "a3d.nativeBakedLightmap": "add-indirect", "a3d.nativeLightmapUv": 0 } }), { flags: on }))
        .toThrow(/GENERATED_DIFFUSE_TRANSMISSION_SOURCE_UNSUPPORTED/);
    } finally { geometry.dispose(); material.dispose(); factor.dispose(); color.dispose(); device.dispose(); }
  });

  it("selects the transmission capture for tiny live factors and enabled maps", () => {
    const transmissionFlags = { values: { A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true },
      on: (name: string) => name === "A3D_QR_MATERIALS" || name === "A3D_QR_MATERIALS_TRANSMISSION" };
    const geometry = Geometry.texturedCube(1), material = new PBRMaterial(), instance = new MaterialInstance(material);
    const texture = pixel(), mapped = new TexturedPBRMaterial({ transmissionTexture: texture });
    const blended = new PBRMaterial({ transmissionFactor: 0.0001, renderState: { blend: true, depthWrite: false } });
    const unlit = new UnlitMaterial();
    unlit.setParameter("u_transmissionFactor", 0.5);
    const selected = (value: typeof instance | typeof mapped | typeof unlit) => selectShaderFeatureBits({ item: { geometry, material: value }, pass: "forward", tier: QUALITY_TIERS.high, flags: transmissionFlags })["prd04.transmissionTarget"];
    try {
      expect(selected(instance)).toBeUndefined();
      expect(forwardItemBucket({ geometry, material: instance })).toBe("opaque");
      instance.setOverride("u_transmissionFactor", 0.0001);
      expect(selected(instance)).toBe(true);
      expect(forwardItemBucket({ geometry, material: instance })).toBe("transmission");
      instance.setOverride("u_transmissionFactor", 0);
      expect(selected(instance)).toBeUndefined();
      expect(forwardItemBucket({ geometry, material: instance })).toBe("opaque");
      expect(selected(mapped)).toBe(true);
      expect(forwardItemBucket({ geometry, material: mapped })).toBe("transmission");
      mapped.setParameter("u_transmissionTextureEnabled", 0);
      expect(selected(mapped)).toBeUndefined();
      expect(forwardItemBucket({ geometry, material: mapped })).toBe("opaque");
      mapped.setParameter("u_transmissionTextureEnabled", 1);
      texture.dispose();
      expect(selected(mapped)).toBeUndefined();
      expect(forwardItemBucket({ geometry, material: mapped })).toBe("opaque");
      expect(forwardItemBucket({ geometry, material: blended })).toBe("transparent");
      expect(selected(unlit)).toBeUndefined();
      expect(forwardItemBucket({ geometry, material: unlit })).toBe("opaque");
    } finally { geometry.dispose(); material.dispose(); mapped.dispose(); blended.dispose(); unlit.dispose(); texture.dispose(); }
  });

  it("binds only a live frame-scoped transmission capture or a complete pinned texture", () => {
    const transmissionFlags = { values: { A3D_QR_MATERIALS_TRANSMISSION: true }, on: (name: string) => name === "A3D_QR_MATERIALS_TRANSMISSION" };
    const device = new MockRenderDevice(), geometry = Geometry.box(), material = new PBRMaterial({ transmissionFactor: 0.0001 });
    const target = device.createRenderTarget({ width: 1, height: 1 });
    const pinned = pixel();
    const item = { geometry, material };
    const frame = { device, postScopeId: {}, viewId: "main", frameIndex: 4, blackboard: new Map() } as unknown as FrameContributorContext;
    const bind = (context?: FrameContributorContext) => {
      const result = new Map<string, UniformValue>();
      bindShaderFeatureUniforms({ "prd04.transmissionTarget": true }, transmissionFlags, item, (name, value) => result.set(name, value), context);
      return result;
    };
    try {
      expect(() => bind()).toThrow(/transmission capture is unavailable/i);
      publishCapturedTransmissionTarget(frame, target, 1);
      const uniforms = bind(frame), sampled = uniforms.get("a3d_prd04_transmissionSampler") as TextureBinding;
      expect(sampled.texture).toBe(target.colorTexture);
      expect(sampled.sampler.minFilter).toBe("linear-mipmap-linear");
      expect(Array.from(uniforms.get("a3d_prd04_transmissionSamplerSize") as Float32Array)).toEqual([1, 1]);
      expect(() => bind({ ...frame, frameIndex: 5 })).toThrow(/transmission capture is unavailable/i);
      clearCapturedTransmissionTarget(frame);
      expect(() => bind(frame)).toThrow(/transmission capture is unavailable/i);
      material.setParameter("u_prd04TransmissionTarget", new TextureBinding({ name: "pinned", texture: pinned }));
      expect((bind().get("a3d_prd04_transmissionSampler") as TextureBinding).texture).toBe(pinned);
      material.setParameter("u_prd04TransmissionTargetSize", [2, 1]);
      expect(() => bind()).toThrow(/complete, correctly sized mip chain/);
    } finally { target.dispose(); pinned.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("rejects active generated transmission when its capture contributor is disabled", () => {
    const device = new MockRenderDevice(), geometry = Geometry.box(), material = new PBRMaterial({ transmissionFactor: 0.0001 });
    setRendererQrFlags({ values: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true },
      on: (name) => name === "A3D_QR_CORE" || name === "A3D_QR_CORE_GENERATOR" }, device);
    try {
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [{ geometry, material }] }).execute({ device, width: 8, height: 8 })).toThrow(/transmission requires its physical lobe and frame capture/i);
      expect(device.drawCommands).toHaveLength(0);
    } finally { geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("routes materials-only sRGB draws with live instance transmission through the generated shader", () => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        this.sources.push(source);
        return super.createShaderProgram(source);
      }
    }
    const device = new CaptureDevice(), geometry = Geometry.box(), material = new PBRMaterial(), instance = new MaterialInstance(material), target = pixel();
    instance.setOverride("u_transmissionFactor", 0.25);
    instance.setOverride("u_prd04TransmissionTarget", new TextureBinding({ name: "pinned-transmission", texture: target }));
    setRendererQrFlags({ values: { A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true },
      on: (name) => name === "A3D_QR_MATERIALS" || name === "A3D_QR_MATERIALS_TRANSMISSION" }, device);
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry, material: instance }], outputColorSpace: "srgb" }).execute({ device, width: 8, height: 8 });
      const program = device.sources.find((source) => source.generatedProgram);
      expect(device.drawCommands).toHaveLength(1);
      expect(program?.generatedProgram?.features.features).toMatchObject({ "prd04.transmissionTarget": true, "a3d.output.srgb": true });
      expect(program?.generatedProgram?.features.extensions.some((extension) => extension.lobe === "transmission")).toBe(true);
      expect(program?.fragment).toContain("a3dColor = a3dEncodeForCanvas(a3dColor)");
      expect((device.drawCommands[0]?.uniforms?.get("a3d_prd04_transmissionSampler") as TextureBinding).texture).toBe(target);
    } finally { geometry.dispose(); material.dispose(); target.dispose(); device.dispose(); }
  });

  it("carries the complete per-instance linear transform into volume refraction", () => {
    const materials = { values: { A3D_QR_MATERIALS: true, A3D_QR_MATERIALS_TRANSMISSION: true },
      on: (name: string) => name === "A3D_QR_MATERIALS" || name === "A3D_QR_MATERIALS_TRANSMISSION" };
    const extensions = [{ lobe: "transmission", bits: {}, maps: [] }, { lobe: "volume", bits: {}, maps: [] }];
    const make = (instancing: boolean) => generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", extensions,
      features: { "prd04.transmissionTarget": true }, ...(instancing ? { instancing: { color: false } } : {}) }), { flags: materials });
    const instanced = make(true), single = make(false);
    expect(instanced.defines.A3D_INSTANCE_VOLUME_TRANSFORM).toBe(true);
    expect(single.defines.A3D_INSTANCE_VOLUME_TRANSFORM).toBeUndefined();
    expect(instanced.vertex).toContain("mat3(u_modelMatrix * instanceMatrix * u_geometryMatrix)");
    expect(instanced.vertex).toContain("flat out vec3 v_a3dVolumeColumn0");
    expect(instanced.fragment).toContain("flat in vec3 v_a3dVolumeColumn2");
    expect(instanced.fragment).toContain("mat4 a3dTransmissionModel = mat4( vec4( v_a3dVolumeColumn0, 0.0 )");
    expect(single.fragment).toContain("mat4 a3dTransmissionModel = u_modelMatrix * u_geometryMatrix");
    expect(instanced.fragment).toContain("length(inverse(model) * direction)");
    if (hasGlslang) {
      const directory = mkdtempSync(join(tmpdir(), "aura3d-volume-instances-"));
      try {
        const vertex = join(directory, "source.vert"), fragment = join(directory, "source.frag");
        for (const program of [instanced, single]) {
          writeFileSync(vertex, program.vertex); writeFileSync(fragment, program.fragment);
          execFileSync("glslangValidator", ["-l", vertex, fragment], { stdio: "pipe" });
        }
      } finally { rmSync(directory, { recursive: true, force: true }); }
    }
  });

  it("selects physical vertex colors per geometry while sharing one material", () => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram { this.sources.push(source); return super.createShaderProgram(source); }
    }
    const device = new CaptureDevice(), material = new PBRMaterial();
    setRendererQrFlags(createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }), device);
    const format = new VertexFormat([{ semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 12 }, { semantic: "color", components: 4, offset: 24, shaderLocation: 4 }], 40);
    const colored = new Geometry(new VertexBuffer(format, 3)), plain = Geometry.box();
    const badFormat = new VertexFormat([{ semantic: "position", components: 3, offset: 0 },
      { semantic: "normal", components: 3, offset: 12 }, { semantic: "color", components: 3, offset: 24, shaderLocation: 4 }], 36);
    const incompatible = new Geometry(new VertexBuffer(badFormat, 3));
    try {
      device.beginFrame(8, 8);
      new ForwardPass({ items: [{ geometry: colored, material }, { geometry: plain, material }] }).execute({ device, width: 8, height: 8 });
      const colorSource = device.sources.find((source) => source.generatedProgram?.features.vertexColors);
      const plainSource = device.sources.find((source) => source.generatedProgram && !source.generatedProgram.features.vertexColors);
      expect(colorSource?.generatedProgram?.defines.VERTEX_COLORS).toBe(true);
      expect(colorSource?.vertex).toContain("layout(location = 4) in vec4 a_color;");
      expect(colorSource?.fragment).toContain("a3dBaseColor *= v_color;");
      expect(plainSource?.generatedProgram?.defines.VERTEX_COLORS).toBeUndefined();
      expect(device.drawCommands).toHaveLength(2);
      expect(() => new ForwardPass({ items: [{ geometry: incompatible, material }] }).execute({ device, width: 8, height: 8 }))
        .toThrow(/four-component inputs at location 4/);
      expect(device.drawCommands).toHaveLength(2);
    } finally { colored.dispose(); plain.dispose(); incompatible.dispose(); material.dispose(); device.dispose(); }
  });

  it.each(["sync", "async"] as const)("warms the geometry-specific physical vertex-color variants on the %s path", async (mode) => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram { this.sources.push(source); return super.createShaderProgram(source); }
    }
    const device = new CaptureDevice(), material = new PBRMaterial();
    // Exercise the WebGPU format preflight while keeping compilation a source-only mock.
    Object.defineProperty(device, "kind", { value: "webgpu" });
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true });
    const renderer = new Renderer(device, { backend: "mock", width: 8, height: 8, qrFlags: flags, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const format = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
      { semantic: "color", components: 4, offset: 0, type: "uint8", normalized: true, bufferSlot: 1, shaderLocation: 4 }
    ], 24, [{ slot: 1, stride: 4 }]);
    const colored = new Geometry(new VertexBuffer(format, 3), null, "triangles", undefined, [new VertexBuffer(format, 3, 1)]);
    const plain = Geometry.box();
    const badFormat = new VertexFormat([
      { semantic: "position", components: 3, offset: 0 }, { semantic: "normal", components: 3, offset: 12 },
      { semantic: "color", components: 4, offset: 24, type: "uint8", shaderLocation: 4 }
    ], 28);
    const incompatible = new Geometry(new VertexBuffer(badFormat, 3));
    const methods = renderer as unknown as {
      warmGeneratedProgramsSync(...args: readonly unknown[]): void;
      warmGeneratedPrograms(...args: readonly unknown[]): Promise<void>;
    };
    const warm = async (items: readonly { geometry: Geometry; material: PBRMaterial }[]) => {
      if (mode === "sync") methods.warmGeneratedProgramsSync(items, [], undefined, undefined, undefined, undefined);
      else await methods.warmGeneratedPrograms(items, [], undefined, undefined, undefined, undefined);
    };
    try {
      await warm([{ geometry: colored, material }, { geometry: plain, material }]);
      const variants = device.sources.map((source) => source.generatedProgram?.features.vertexColors).filter((value) => value !== undefined);
      expect(variants).toContain(true);
      expect(variants).toContain(false);
      const beforeInvalid = device.sources.length;
      await expect(warm([{ geometry: incompatible, material }])).rejects.toThrow(/four-component inputs at location 4/);
      expect(device.sources).toHaveLength(beforeInvalid);
    } finally { renderer.dispose(); colored.dispose(); plain.dispose(); incompatible.dispose(); material.dispose(); device.dispose(); }
  });

  it.each(["sync", "async"] as const)("warms native unlit topology variants on the %s path", async (mode) => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram { this.sources.push(source); return super.createShaderProgram(source); }
    }
    const device = new CaptureDevice(), material = new UnlitMaterial();
    Object.defineProperty(device, "kind", { value: "webgpu" });
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true });
    const renderer = new Renderer(device, { backend: "mock", width: 8, height: 8, qrFlags: flags, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const triangles = Geometry.triangle();
    const lines = new Geometry(new VertexBuffer(VertexFormat.P3, 2), null, "lines");
    const points = new Geometry(new VertexBuffer(VertexFormat.P3, 1), null, "points");
    const methods = renderer as unknown as {
      warmGeneratedProgramsSync(...args: readonly unknown[]): void;
      warmGeneratedPrograms(...args: readonly unknown[]): Promise<void>;
    };
    const items = [{ geometry: triangles, material }, { geometry: lines, material }];
    try {
      if (mode === "sync") methods.warmGeneratedProgramsSync(items, [], undefined, undefined, undefined, undefined);
      else await methods.warmGeneratedPrograms(items, [], undefined, undefined, undefined, undefined);
      const variants = device.sources.map((source) => source.generatedProgram?.features.features["a3d.nativePrimitive"]);
      expect(variants).toContain("triangles");
      expect(variants).toContain("lines");
      device.beginFrame(8, 8);
      expect(() => new ForwardPass({ items: [{ geometry: points, material }] }).execute({ device, width: 8, height: 8 }))
        .toThrow(/points require the point-quad path/);
      expect(device.drawCommands).toHaveLength(0);
    } finally { renderer.dispose(); triangles.dispose(); lines.dispose(); points.dispose(); material.dispose(); device.dispose(); }
  });

  it.each(["sync", "async"] as const)("warms live per-instance alpha-mask variants on the %s Renderer path", async (mode) => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram { this.sources.push(source); return super.createShaderProgram(source); }
    }
    const device = new CaptureDevice(), material = new PBRMaterial(), geometry = Geometry.box();
    const opaque = new MaterialInstance(material), masked = new MaterialInstance(material);
    masked.setOverride("u_alphaCutoff", 0.2);
    const flags = createTrustedQrFlags({ A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true });
    const renderer = new Renderer(device, { backend: "mock", width: 8, height: 8, qrFlags: flags, shaderLibrary: createDefaultShaderLibrary() }, new TemporalHistory());
    const source = { cameraPolicy: "identity" as const, frustumCulling: false, renderItems: [
      { geometry, material: opaque, label: "opaque" }, { geometry, material: masked, label: "masked" }
    ] };
    const render = async (frameId: number) => {
      if (mode === "sync") renderer.render({ source, frameId });
      else await renderer.renderAsync({ source, frameId });
    };
    try {
      await render(1);
      const variants = device.sources.map((entry) => entry.generatedProgram?.features.alphaMode).filter((value) => value !== undefined);
      expect(variants).toContain("opaque");
      expect(variants).toContain("mask");
      const firstOpaque = device.drawCommands.find((draw) => draw.label === "opaque")!;
      const firstMask = device.drawCommands.find((draw) => draw.label === "masked")!;
      expect(firstMask.uniforms?.get("u_alphaCutoff")).toBe(0.2);
      expect(firstMask.shader).not.toBe(firstOpaque.shader);
      masked.setOverride("u_alphaCutoff", 0.7);
      await render(2);
      const secondMask = device.drawCommands.filter((draw) => draw.label === "masked").at(-1)!;
      expect(secondMask.shader).toBe(firstMask.shader);
      expect(secondMask.uniforms?.get("u_alphaCutoff")).toBe(0.7);
      masked.setOverride("u_alphaCutoff", 0);
      await render(3);
      expect(device.drawCommands.filter((draw) => draw.label === "masked").at(-1)!.shader).toBe(firstOpaque.shader);
    } finally { renderer.dispose(); geometry.dispose(); material.dispose(); device.dispose(); }
  });

  it("selects authored tangent data only when the geometry supplies it", () => {
    const on = { values: { A3D_QR_MATERIALS: true }, on: (name: string) => name === "A3D_QR_MATERIALS" };
    const material = new PBRMaterial({ anisotropyStrength: 0.5 });
    const record = { ...material.programFeatures({ flags: on, tier: QUALITY_TIERS.high }), features: { "prd04.tangentFrame": true } };
    const tangent = featuresForGeometry(record, (attribute) => attribute === "a_tangent");
    const fallback = featuresForGeometry(record, () => false);
    const withTangent = generateProgramImpl(normalizeProgramFeatures(tangent), { flags: on });
    const withoutTangent = generateProgramImpl(normalizeProgramFeatures(fallback), { flags: on });
    expect(withTangent.descriptor?.features.features["prd04.geometryTangent"]).toBe(true);
    expect(withTangent.defines.A3D_HAS_TANGENT).toBe(true);
    expect(withTangent.vertex).toContain("layout(location = 3) in vec4 a_tangent;");
    expect(withTangent.vertex).toContain("objectTangent = a_tangent;");
    expect(withTangent.vertex).toContain("mat3( u_modelMatrix ) * mat3( instanceMatrix ) * mat3( u_geometryMatrix )");
    expect(withoutTangent.defines.A3D_HAS_TANGENT).toBeUndefined();
    expect(withoutTangent.key).not.toBe(withTangent.key);
    material.dispose();
  });
  it("samples selected physical lobe maps with independent UVs, transforms, and channels", () => {
    const texture = pixel();
    const material = new TexturedPBRMaterial({
      clearcoatFactor: 0.8, clearcoatTexture: texture, clearcoatRoughnessTexture: texture,
      clearcoatNormalTexture: texture, clearcoatNormalScale: 0.5,
      clearcoatTextureTransform: { offset: [0.2, 0.3], scale: [2, 3], rotation: 0.4 },
      transmissionFactor: 0.6, transmissionTexture: texture,
      volumeThicknessFactor: 0.5, volumeThicknessTexture: texture,
      textureTexCoords: { clearcoat: 1, clearcoatRoughness: 0, clearcoatNormal: 1,
        transmission: 1, volumeThickness: 0 }
    });
    const other = new TexturedPBRMaterial({ specularFactor: 0.7, specularTexture: texture, specularColorTexture: texture,
      sheenColorFactor: [0.4, 0.3, 0.2], sheenColorTexture: texture, sheenRoughnessTexture: texture,
      iridescenceFactor: 0.5, iridescenceTexture: texture, iridescenceThicknessTexture: texture,
      anisotropyStrength: 0.5, anisotropyTexture: texture,
      textureTexCoords: { specular: 0, specularColor: 1, sheenColor: 1, sheenRoughness: 0,
        iridescence: 1, iridescenceThickness: 0, anisotropy: 1 } });
    const on = { values: { A3D_QR_MATERIALS: true }, on: (name: string) => name === "A3D_QR_MATERIALS" };
    const record = material.programFeatures({ flags: on, tier: QUALITY_TIERS.high });
    const coat = record.extensions.find((ext) => ext.lobe === "clearcoat")!;
    expect(coat.mapUvSets).toMatchObject({ clearcoat: 1, clearcoatRoughness: 0, clearcoatNormal: 1 });
    const program = generateProgramImpl(normalizeProgramFeatures(record), { flags: on });
    const otherProgram = generateProgramImpl(normalizeProgramFeatures(other.programFeatures({ flags: on, tier: QUALITY_TIERS.high })), { flags: on });
    expect(program.defines).toMatchObject({ A3D_NEED_UV0: true, A3D_NEED_UV1: true,
      A3D_LOBE_CLEARCOAT_NORMAL_MAP: true,
      A3D_LOBE_TRANSMISSION_MAP: true, A3D_LOBE_VOLUME_THICKNESS_MAP: true });
    expect(otherProgram.defines.A3D_LOBE_SPECULAR_SPECULAR_MAP).toBe(true);
    expect(program.fragment).toContain("u_clearcoatTextureUvTransform * vec3(v_uv1, 1.0)");
    expect(program.fragment).toContain("u_clearcoatRoughnessTextureUvTransform * vec3(v_uv, 1.0)");
    expect(program.fragment).toContain("a3dPrd04CoatNormal( v_worldPosition, geometryNormal, A3D_LOBE_UV_CLEARCOAT_NORMAL )");
    expect(otherProgram.fragment).toContain("texture( u_specularTexture, A3D_LOBE_UV_SPECULAR ).a");
    expect(otherProgram.fragment).toContain("texture( u_specularColorTexture, A3D_LOBE_UV_SPECULAR_COLOR ).rgb");
    expect(program.fragment).toContain("texture( u_transmissionTexture, A3D_LOBE_UV_TRANSMISSION ).r");
    expect(program.fragment).toContain("texture( u_volumeThicknessTexture, A3D_LOBE_UV_VOLUME_THICKNESS ).g");
    const filtered = featuresForGeometry(record, (attribute) => attribute === "a_uv1");
    const filteredCoat = filtered.extensions.find((ext) => ext.lobe === "clearcoat")!;
    expect(filteredCoat.maps).toEqual(["clearcoat", "clearcoatNormal"]);
    expect(filteredCoat.bits).toMatchObject({ map: true, roughnessMap: false, normalMap: true });
    const filteredProgram = generateProgramImpl(normalizeProgramFeatures(filtered), { flags: on });
    expect(filteredProgram.defines.A3D_LOBE_CLEARCOAT_ROUGHNESS_MAP).toBeUndefined();
    expect(filteredProgram.defines.A3D_LOBE_CLEARCOAT_NORMAL_MAP).toBe(true);
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram({ label: "lobe-uv", marker: "lobe-uv", vertex: `// lobe-uv\n${program.vertex}`, fragment: `// lobe-uv\n${program.fragment}` });
    const instance = new MaterialInstance(material);
    instance.setOverride("u_clearcoatTextureRotation", -0.25);
    const uniforms = new MaterialBinding().bindGenerated(instance, shader, normalizeProgramFeatures(record)).uniforms;
    const matrix = uniforms.get("u_clearcoatTextureUvTransform") as Float32Array;
    expect(matrix).toEqual(uvTransformMatrix([0.2, 0.3], -0.25, [2, 3]));
    const uv: readonly [number, number] = [0.35, 0.8];
    const expectedUv = new TextureBinding({ name: "uv-reference", transform: { offset: [0.2, 0.3], scale: [2, 3], rotation: -0.25 } }).transformUV(uv);
    expect(matrix[0]! * uv[0] + matrix[3]! * uv[1] + matrix[6]!).toBeCloseTo(expectedUv[0]);
    expect(matrix[1]! * uv[0] + matrix[4]! * uv[1] + matrix[7]!).toBeCloseTo(expectedUv[1]);
    expect((uniforms.get("u_clearcoatTexture") as TextureBinding).texture).toBe(texture);
    instance.setOverride("u_clearcoatTextureTexCoord", 0);
    const live = material.programFeatures({ flags: on, tier: QUALITY_TIERS.high });
    expect(withLivePhysicalMapFeatures(live, instance).extensions.find((ext) => ext.lobe === "clearcoat")?.mapUvSets?.clearcoat).toBe(0);
    const plain = new PBRMaterial();
    const dynamic = new MaterialInstance(plain);
    dynamic.setOverride("u_clearcoatFactor", 0.8);
    dynamic.setOverride("u_clearcoatTexture", binding("clearcoat", texture));
    dynamic.setOverride("u_clearcoatTextureEnabled", 1);
    dynamic.setOverride("u_clearcoatTextureTexCoord", 1);
    const dynamicRecord = withLivePhysicalMapFeatures(plain.programFeatures({ flags: on, tier: QUALITY_TIERS.high }), dynamic, { flags: on, tier: QUALITY_TIERS.high });
    expect(dynamicRecord.extensions.find((ext) => ext.lobe === "clearcoat")).toMatchObject({ maps: ["clearcoat"], mapUvSets: { clearcoat: 1 }, bits: { map: true } });
    plain.dispose();
    material.dispose(); other.dispose(); texture.dispose(); device.dispose();
  });
  it("selects independently transformed UV sets on every physical material family and prunes missing geometry", () => {
    const rough = pixel(), bump = pixel();
    const options = { diffuseRoughnessTexture: binding("rough", rough), diffuseRoughnessTextureTexCoord: 1,
      bumpTexture: binding("bump", bump), bumpTextureTexCoord: 0 };
    const materials = [new PBRMaterial(options), new InstancedPBRMaterial(options), new SkinnedLitMaterial(options),
      new TexturedPBRMaterial({ diffuseRoughnessTexture: rough, bumpTexture: bump,
        diffuseRoughnessTextureTransform: { offset: [0.2, 0.3] }, textureTexCoords: { diffuseRoughness: 1, bump: 0 } })];
    for (const material of materials) {
      const record = material.programFeatures(ctx);
      expect(record.maps.diffuseRoughness).toMatchObject({ uvSet: 1 });
      expect(record.maps.bump).toMatchObject({ uvSet: 0 });
      const pruned = featuresForGeometry(record, (attribute) => attribute === "a_uv");
      expect(pruned.maps.diffuseRoughness).toBeUndefined();
      expect(pruned.maps.bump).toEqual(record.maps.bump);
      const program = generateProgramImpl(normalizeProgramFeatures(record));
      expect(program.defines).toMatchObject({ A3D_NEED_UV0: true, A3D_NEED_UV1: true,
        USE_DIFFUSE_ROUGHNESS_MAP: true, USE_BUMP_MAP: true });
      expect(program.fragment).toContain("a3dSurfaceDetailUv(v_uv1, u_diffuseRoughnessTextureOffset");
      expect(program.fragment).toContain("a3dSurfaceDetailUv(v_uv, u_bumpTextureOffset");
      expect(program.fragment).toContain("texture(u_diffuseRoughnessTexture, a3dDiffuseRoughnessUv).r");
      expect(program.fragment).toContain("material.diffuseRoughness *= mix(1.0, a3dDiffuseRoughnessSample");
      expect(program.fragment).toContain("N = a3dSurfaceBumpNormal(v_worldPosition, geometryNormal, N, a3dBumpUv)");
      expect(program.fragment.indexOf("N = a3dSurfaceBumpNormal")).toBeLessThan(program.fragment.indexOf("a3dDirectLight(L, radiance"));
      material.dispose();
    }
    rough.dispose(); bump.dispose();
  });

  it("preserves default variants and changes program identity only for structural map choices", () => {
    const material = new PBRMaterial();
    const plain = normalizeProgramFeatures(material.programFeatures(ctx));
    const uv0 = normalizeProgramFeatures({ ...plain, maps: { bump: { uvSet: 0, transform: false } } });
    const uv1 = normalizeProgramFeatures({ ...plain, maps: { bump: { uvSet: 1, transform: false } } });
    const p = generateProgramImpl(plain), a = generateProgramImpl(uv0), b = generateProgramImpl(uv1);
    expect(p.defines.USE_BUMP_MAP).toBeUndefined();
    expect(new Set([p.key, a.key, b.key]).size).toBe(3);
    expect(a.fragment).toContain("a3dSurfaceDetailUv(v_uv, u_bumpTextureOffset");
    expect(b.fragment).toContain("a3dSurfaceDetailUv(v_uv1, u_bumpTextureOffset");
    material.setParameter("u_diffuseRoughness", 0.7);
    expect(generateProgramImpl(normalizeProgramFeatures(material.programFeatures(ctx))).key).toBe(p.key);
    material.dispose();
  });

  it("records actual resolved contributors separately from declared features for native backends", () => {
    const remove = registerShaderFeature({ id: "test.pbrDescriptor", owner: "prd01", flag: "A3D_QR_CORE",
      hooks: [], chunks: [], select: () => undefined, defines: (value) => ({ TEST_PBR_DESCRIPTOR: value as number }) });
    try {
      const features = normalizeProgramFeatures({ lighting: "lit", features: { "test.pbrDescriptor": 3, "test.unregistered": true },
        extensions: [{ lobe: "test.unregisteredLobe", maps: [], bits: {} }] });
      const active = generateProgramImpl(features, { flags: { values: { A3D_QR_CORE: true, A3D_QR_COMPILER: true, A3D_QR_LIGHTING: true },
        on: (name) => name === "A3D_QR_CORE" || name === "A3D_QR_COMPILER" || name === "A3D_QR_LIGHTING" } });
      expect(active.descriptor?.features.features["test.unregistered"]).toBe(true);
      expect(active.descriptor?.activeFeatures).toEqual([{ id: "test.pbrDescriptor", value: 3 }]);
      expect(active.descriptor?.activeExtensions).toEqual([]);
      expect(active.descriptor?.defines.TEST_PBR_DESCRIPTOR).toBe(3);
      expect(active.descriptor?.lighting).toEqual({ compilerLightingConjunction: true, iblReplacesIndirect: false });
      const inactive = generateProgramImpl(features, { flags });
      expect(inactive.descriptor?.activeFeatures).toEqual([]);
      expect(inactive.descriptor?.lighting.compilerLightingConjunction).toBe(false);
    } finally { remove(); }
  });

  it("binds independent live transforms for mixed-UV core maps", () => {
    const texture = pixel();
    const material = new TexturedPBRMaterial({
      baseColorTexture: texture, normalTexture: texture, metallicRoughnessTexture: texture,
      occlusionTexture: texture, emissiveTexture: texture,
      baseColorTextureTransform: { offset: [0.2, 0.4], scale: [2, 3], rotation: 0.25 },
      normalTextureTransform: { offset: [0.7, 0.1], scale: [4, 5], rotation: -0.5 },
      textureTexCoords: { baseColor: 1, normal: 0, metallicRoughness: 1, occlusion: 0, emissive: 1 }
    });
    const features = normalizeProgramFeatures(material.programFeatures(ctx));
    const program = generateProgramImpl(features);
    const fragment = program.fragment;
    for (const [slot, uv] of [["baseColor", "v_uv1"], ["normal", "v_uv"], ["metallicRoughness", "v_uv1"], ["occlusion", "v_uv"], ["emissive", "v_uv1"]] as const) {
      expect(fragment).toContain(`a3dCoreMapUv(${uv}, u_${slot}TextureOffset, u_${slot}TextureScale, u_${slot}TextureRotation)`);
    }
    expect(fragment).toContain("mix(1.0, texture(u_occlusionMap, a3dCoreMapUv(v_uv, u_occlusionTextureOffset, u_occlusionTextureScale, u_occlusionTextureRotation)).r, clamp(u_occlusionStrength, 0.0, 1.0))");
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram({ label: "mixed-uv", marker: "mixed-uv", vertex: `// mixed-uv\n${program.vertex}`, fragment: `// mixed-uv\n${program.fragment}` });
    const instance = new MaterialInstance(material);
    instance.setOverride("u_normalTextureRotation", 0.75);
    instance.setOverride("u_occlusionStrength", 0.35);
    const uniforms = new MaterialBinding().bindGenerated(instance, shader, features).uniforms;
    expect(uniforms.get("u_baseColorTextureOffset")).toEqual([0.2, 0.4]);
    expect(uniforms.get("u_baseColorTextureScale")).toEqual([2, 3]);
    expect(uniforms.get("u_normalTextureRotation")).toBe(0.75);
    expect(uniforms.get("u_occlusionStrength")).toBe(0.35);
    expect(isTextureBinding(uniforms.get("u_baseColorMap"))).toBe(true);
    expect(isTextureBinding(uniforms.get("u_normalMap"))).toBe(true);
    material.dispose(); texture.dispose(); device.dispose();
  });

  it("derives missing core transform uniforms from an actual texture binding", () => {
    const texture = pixel();
    const source = binding("normal", texture);
    const material = new SkinnedLitMaterial({ normalTexture: source });
    const features = normalizeProgramFeatures(material.programFeatures(ctx));
    const generated = generateProgramImpl(features);
    const device = new MockRenderDevice();
    const shader = device.createShaderProgram({ label: "binding-transform", marker: "binding-transform", vertex: `// binding-transform\n${generated.vertex}`, fragment: `// binding-transform\n${generated.fragment}` });
    const uniforms = new MaterialBinding().bindGenerated(material, shader, features).uniforms;
    expect(uniforms.get("u_normalTextureOffset")).toEqual([0.2, 0.3]);
    expect(uniforms.get("u_normalTextureScale")).toEqual([2, 3]);
    expect(uniforms.get("u_normalTextureRotation")).toBe(0.4);
    material.dispose(); texture.dispose(); device.dispose();
  });

  it("makes legacy variants consume detail and supplies sampler fallbacks for absent maps", () => {
    const library = createDefaultShaderLibrary();
    const device = new MockRenderDevice();
    const materials = [new PBRMaterial(), new InstancedPBRMaterial(), new SkinnedLitMaterial(),
      new SkinnedLitMaterial({ extraInfluences: true }), new TexturedPBRMaterial()];
    for (const material of materials) {
      const plain = library.compileSource(material.shaderKey);
      expect(plain.fragment).not.toContain("uniform sampler2D u_diffuseRoughnessTexture;");
      expect(plain.fragment).not.toContain("uniform sampler2D u_bumpTexture;");
      const source = library.compileSource(material.shaderKey, { defines: { A3D_PBR_DIFFUSE_ROUGHNESS_MAP: true, A3D_PBR_BUMP_MAP: true } });
      expect(source.vertex).toContain("v_a3dDetailUv0 = a_uv;");
      expect(source.vertex).toContain("v_a3dDetailUv1 = a_uv1;");
      expect(source.fragment).toContain("a3dLegacySetDiffuseDetail();");
      expect(source.fragment).toContain("a3dLegacyBumpNormal(v_worldPosition");
      expect(source.fragment).toContain("a3dPbrDiffuseDetail(N, V, L)");
      const shader = device.createShaderProgram(source);
      const uniforms = new MaterialBinding().bind(material, shader).uniforms;
      for (const name of ["u_diffuseRoughnessTexture", "u_bumpTexture"]) {
        const value = uniforms.get(name);
        expect(isTextureBinding(value) && value.texture).toBeNull();
        expect(isTextureBinding(value) && value.expectedDimension).toBe("2d");
      }
      material.dispose();
    }
    device.dispose();
  });

  it("reselects live material and instance maps while reusing variants for uniform-only edits", () => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        this.sources.push(source);
        return super.createShaderProgram(source);
      }
    }
    const device = new CaptureDevice();
    const geometry = Geometry.box();
    const material = new PBRMaterial();
    const texture = pixel();
    const textureBinding = binding("bump", texture);
    const instance = new MaterialInstance(material);
    const item = { geometry, material: instance };
    const pass = new ForwardPass({ items: [item], shaderLibrary: createDefaultShaderLibrary() });
    const draw = () => { device.beginFrame(8, 8); pass.execute({ device, width: 8, height: 8 }); device.endFrame(); };
    try {
      draw();
      expect(device.sources).toHaveLength(1);
      expect(device.sources[0]!.fragment).not.toContain("uniform sampler2D u_bumpTexture;");
      instance.setOverride("u_bumpTexture", textureBinding);
      instance.setOverride("u_bumpTextureEnabled", 1);
      instance.setOverride("u_bumpFactor", 1);
      draw();
      expect(device.sources).toHaveLength(2);
      expect(device.sources[1]!.fragment).toContain("uniform sampler2D u_bumpTexture;");
      expect(device.sources[1]!.fragment).not.toContain("uniform sampler2D u_diffuseRoughnessTexture;");
      instance.setOverride("u_bumpTextureRotation", 0.8);
      draw();
      expect(device.sources).toHaveLength(2);
      // This box has only UV0. Its UV1 request is removed from the variant,
      // following the same geometry filtering used by generated programs.
      instance.setOverride("u_bumpTextureTexCoord", 1);
      draw();
      expect(device.sources).toHaveLength(2);
      material.setParameter("u_bumpTexture", textureBinding);
      material.setParameter("u_bumpTextureEnabled", 1);
      material.setParameter("u_bumpTextureTexCoord", 1);
      expect(material.programFeatures(ctx).maps.bump).toMatchObject({ uvSet: 1 });
      material.setParameter("u_bumpTextureTexCoord", 0);
      expect(material.programFeatures(ctx).maps.bump).toMatchObject({ uvSet: 0 });
    } finally { geometry.dispose(); material.dispose(); texture.dispose(); device.dispose(); }
  });

  it("selects a live instance map in actual generated forward submissions", () => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        this.sources.push(source);
        return super.createShaderProgram(source);
      }
    }
    const device = new CaptureDevice();
    setRendererQrFlags({ values: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }, on: (name) => name === "A3D_QR_CORE" || name === "A3D_QR_CORE_GENERATOR" }, device);
    const geometry = Geometry.box();
    const material = new PBRMaterial();
    const texture = pixel();
    const instance = new MaterialInstance(material);
    const pass = new ForwardPass({ items: [{ geometry, material: instance }], shaderLibrary: createDefaultShaderLibrary() });
    const draw = () => { device.beginFrame(8, 8); pass.execute({ device, width: 8, height: 8 }); device.endFrame(); };
    try {
      draw();
      expect(device.sources.some((source) => source.fragment.includes("#define USE_BUMP_MAP 1"))).toBe(false);
      instance.setOverride("u_bumpTexture", binding("bump", texture));
      instance.setOverride("u_bumpTextureEnabled", 1);
      instance.setOverride("u_bumpFactor", 2);
      draw();
      expect(device.sources.some((source) => source.fragment.includes("#define USE_BUMP_MAP 1") && source.fragment.includes("N = a3dSurfaceBumpNormal"))).toBe(true);
      const generated = device.sources.find((source) => source.generatedProgram?.features.maps.bump);
      expect(generated?.generatedProgram?.features.maps.bump).toMatchObject({ uvSet: 0 });
      expect(generated?.generatedProgram?.defines.USE_BUMP_MAP).toBe(true);
    } finally { geometry.dispose(); material.dispose(); texture.dispose(); device.dispose(); }
  });

  it("binds scoped local probe data without treating the local cube as the global environment", () => {
    class CaptureDevice extends MockRenderDevice {
      readonly sources: ShaderSources[] = [];
      readonly packets: Map<string, UniformValue>[] = [];
      override createShaderProgram(source: ShaderSources): RenderShaderProgram {
        this.sources.push(source); return super.createShaderProgram(source);
      }
      override draw(command: DrawCommand): void {
        this.packets.push(new Map(command.uniforms)); super.draw(command);
      }
    }
    const device = new CaptureDevice();
    setRendererQrFlags({ values: { A3D_QR_CORE: true, A3D_QR_CORE_GENERATOR: true }, on: (name) => name === "A3D_QR_CORE" || name === "A3D_QR_CORE_GENERATOR" }, device);
    const geometry = Geometry.box();
    const material = new PBRMaterial({ envMapIntensity: 0.4 });
    const cube = new Texture({ width: 1, height: 1, dimension: "cube", renderAttachment: true });
    const localCube = new TextureBinding({ name: "u_prd02ProbeCubeA", texture: cube, expectedDimension: "cube" });
    const origins = new Float32Array([3, 4, 5, 1]);
    const item = { geometry, material, environmentCube: localCube, environmentCubeMip: 1,
      [PRD02_ITEM_PROBE_BINDINGS]: { device, owner: {}, assignment: {} as never, uniforms: {
        u_prd02ProbeCubeA: localCube,
        u_prd02ProbeCubeB: new TextureBinding({ name: "u_prd02ProbeCubeB", expectedDimension: "cube" }),
        u_prd02ProbeOriginA: origins,
        u_prd02ProbeCenterA: new Float32Array([0, 0, 0, 1]),
        u_prd02ProbeHalfA: new Float32Array([1, 1, 1, 0]),
        u_prd02ProbeOriginB: new Float32Array(4), u_prd02ProbeCenterB: new Float32Array(4),
        u_prd02ProbeHalfB: new Float32Array(4), u_prd02ProbeWeights: new Float32Array([0.75, 0, 0.25, 1])
      } } };
    const pass = new ForwardPass({ items: [item], shaderLibrary: createDefaultShaderLibrary() });
    try {
      device.beginFrame(8, 8); pass.execute({ device, width: 8, height: 8 }); device.endFrame();
      const source = device.sources.find((entry) => entry.generatedProgram?.features.features[PRD02_LOCAL_PROBE_FEATURE] === true);
      expect(source?.generatedProgram?.features.environment).toBe("none");
      expect(source?.fragment).toContain("#define A3D_LOCAL_PROBE 1");
      expect(source?.fragment).toContain("a3d_probeSpecular(v_worldPosition, reflect(-V, N), material.roughness)");
      expect(device.packets.at(-1)?.get("u_prd02ProbeOriginA")).toBe(origins);
      expect(device.packets.at(-1)?.get("u_a3dLocalProbeIntensity")).toBe(0.4);
    } finally { geometry.dispose(); material.dispose(); cube.dispose(); device.dispose(); }
  });

  it("forwards root scalar values and validates detail texture options", () => {
    const material = createProductionPrimitiveMaterial(primitives.box({ material: {
      diffuseRoughness: 0.7, retroreflection: 0.3, bumpFactor: 2
    } }).toJSON());
    expect(material.getParameter("u_diffuseRoughness")).toBe(0.7);
    expect(material.getParameter("u_retroreflection")).toBe(0.3);
    expect(material.getParameter("u_bumpFactor")).toBe(2);
    const handle = new TextureHandle(pixel());
    const intent = createProductionPrimitiveTextureIntent({ bumpMap: handle,
      texCoords: { bump: 1 }, texTransforms: { bump: { rotation: 0.25 } } });
    expect(intent.extensionRefs?.bump).toBe(handle);
    expect(() => createProductionPrimitiveTextureIntent({ bumpMap: handle,
      texCoords: { bump: 2 as 0 } })).toThrow(/texCoord/);
    expect(() => createProductionPrimitiveTextureIntent({ bumpMap: handle,
      texTransforms: { bump: { rotation: NaN } } })).toThrow(/finite/);
    handle.dispose(); material.dispose();
  });

  it("composes handle and authored transforms in the same order as texture sampling", () => {
    const authored = { offset: [0.3, -0.2] as const, scale: [2, 2] as const, rotation: 0.5 };
    const handle = { offset: [-0.4, 0.7] as const, scale: [0.5, 0.5] as const, rotation: -0.25 };
    const result = mergedTransform(() => { throw new Error("unexpected shear"); }, "bump", authored, handle)!;
    const apply = (t: AuraTextureTransform, uv: readonly [number, number]) => new TextureBinding({ name: "uv", transform: t }).transformUV(uv);
    const expected = apply(authored, apply(handle, [0.1, 0.9]));
    const actual = apply(result, [0.1, 0.9]);
    expect(actual[0]).toBeCloseTo(expected[0], 10);
    expect(actual[1]).toBeCloseTo(expected[1], 10);
  });

  it("upgrades root asset and live maps with distinct transforms, selectors and samplers", async () => {
    const previousFlags = typedGLBActorQrFlags();
    setTypedGLBActorQrFlags({ values: { A3D_QR_MATERIALS: true }, on: (name) => name === "A3D_QR_MATERIALS" });
    const bitmap = { width: 1, height: 1, close: vi.fn() };
    const fetchBitmap = vi.fn(async () => new Response(new Uint8Array([0]), { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchBitmap);
    vi.stubGlobal("createImageBitmap", async () => bitmap);
    const handle = new TextureHandle(pixel());
    handle.wrapS = "repeat";
    handle.wrapT = "mirror";
    handle.offset = [0.1, 0.2];
    const assets = defineAuraAssets({ rough: { type: "texture", format: "png", url: "/rough.png" } });
    const spec = { diffuseRoughness: 0.8, retroreflection: 0.2,
      diffuseRoughnessMap: assets.rough,
      bumpMap: handle, texCoords: { diffuseRoughness: 1 as const, bump: 0 as const },
      texTransforms: { diffuseRoughness: { offset: [0.3, 0.4] as const, rotation: 0.25 }, bump: { offset: [0.2, 0.3] as const } },
      slotSampling: { diffuseRoughness: { wrap: "mirror" as const, anisotropy: 4 } } };
    const node = primitives.box({ material: spec }).toJSON();
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const resource = entry.resources[0]!;
    try {
      await upgradeProductionPrimitiveTextures([entry], (warning) => { throw new Error(warning); });
      expect(resource.textureStatus).toBe("textured");
      const material = resource.texturedMaterial!;
      expect(material.getParameter("u_diffuseRoughness")).toBe(0.8);
      expect(material.getParameter("u_retroreflection")).toBe(0.2);
      expect(material.getParameter("u_bumpFactor")).toBe(1);
      expect(material.getParameter("u_diffuseRoughnessTextureTexCoord")).toBe(1);
      expect(material.getParameter("u_bumpTextureTexCoord")).toBe(0);
      expect(material.getParameter("u_diffuseRoughnessTextureOffset")).toEqual([0.3, 0.4]);
      expect(material.getParameter("u_diffuseRoughnessTextureRotation")).toBe(0.25);
      expect(material.getParameter("u_bumpTextureOffset")).toEqual([0.30000000000000004, 0.5]);
      const rough = material.getParameter("u_diffuseRoughnessTexture");
      const bump = material.getParameter("u_bumpTexture");
      expect(isTextureBinding(rough) && rough.sampler.addressU).toBe("mirror-repeat");
      expect(isTextureBinding(rough) && rough.sampler.maxAnisotropy).toBe(4);
      expect(isTextureBinding(bump) && bump.texture).toBe(handle.texture);
      expect(isTextureBinding(bump) && bump.sampler.addressU).toBe("repeat");
      expect(isTextureBinding(bump) && bump.sampler.addressV).toBe("mirror-repeat");
      expect(material.programFeatures(ctx).maps).toMatchObject({ diffuseRoughness: { uvSet: 1 }, bump: { uvSet: 0 } });
    } finally {
      resource.textureDisposer?.(); resource.texturedMaterial?.dispose(); resource.geometry.dispose(); resource.material.dispose();
      handle.dispose(); setTypedGLBActorQrFlags(previousFlags); vi.unstubAllGlobals();
    }
    expect(fetchBitmap).toHaveBeenCalledOnce();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });
});

describe("generated material graph integration", () => {
  it("connects lit material outputs and vertex displacement with required varyings", () => {
    const graph: ShaderGraphDocument = { version: 1, stage: "material", nodes: [
      { id: "uv", op: "input", type: "vec2", name: "uv1" },
      { id: "position", op: "input", type: "vec3", name: "positionLocal" },
      { id: "normal", op: "input", type: "vec3", name: "normalWorld" },
      { id: "color", op: "constant", type: "vec4", value: [0.4, 0.2, 0.1, 0.6] },
      { id: "value", op: "constant", type: "f32", value: 0.4 },
      { id: "emission", op: "constant", type: "vec3", value: [0.1, 0.2, 0.3] },
      { id: "displaced", op: "construct", type: "vec3", inputs: ["uv", "value"] }
    ], outputs: { position: "displaced", normal: "normal", color: "color", roughness: "value", metalness: "value", opacity: "value", emissive: "emission" } };
    const compiled = compileShaderGraph(graph, "glsl");
    const program = generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", alphaMode: "blend", graph: compiled }));
    expect(program.defines).toMatchObject({ A3D_NEED_NORMAL: true, A3D_NEED_UV1: true });
    expect(program.vertex).toContain("transpose(inverse(localTransform)) * normal");
    expect(program.vertex).toContain("mat3(u_normalMatrix) * localNormal");
    expect(program.vertex).toContain("transformed = vec3(auraGraph_uv1, 0.4)");
    expect(program.fragment).toContain("N = normalize(auraGraph_normalWorld)");
    expect(program.fragment).toContain("a3dRoughness = 0.4");
    expect(program.fragment).toContain("a3dMetallic = 0.4");
    expect(program.fragment).toContain("a3dAlpha *= 0.4");
    expect(program.fragment.indexOf("a3dRoughness = 0.4")).toBeLessThan(program.fragment.indexOf("PhysicalMaterial material = a3dMakeMaterial"));
    expect(() => generateProgramImpl(normalizeProgramFeatures({ lighting: "lit", pass: "depth", alphaMode: "mask", graph: compiled }))).toThrow(/GRAPH_MASK_DEPTH_UNSUPPORTED/);
  });

  it("uses the authored second UV set for masked depth and distance passes", () => {
    for (const pass of ["depth", "distance"] as const) {
      const source = generateProgramImpl(normalizeProgramFeatures({ pass, alphaMode: "mask", maps: { baseColor: { uvSet: 1, transform: false } } }));
      expect(source.defines.A3D_NEED_UV1).toBe(true);
      expect(source.fragment).toContain("in vec2 v_uv1;");
      expect(source.fragment).toContain("texture(u_baseColorMap, a3dCoreMapUv(v_uv1, u_baseColorTextureOffset");
    }
  });
});
