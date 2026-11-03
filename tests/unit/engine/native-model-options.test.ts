import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { Material } from "../../../packages/rendering/src/Material";
import { model } from "../../../packages/engine/src/agent-api/nodes/model";
import { group } from "../../../packages/engine/src/agent-api/nodes/groups";
import { material } from "../../../packages/engine/src/agent-api/nodes/material";
import { applyModelTintBridge } from "../../../packages/engine/src/agent-api/compiler/modelMaterials";
import { applyMaterialOverrides, snapshotMaterials, type TypedGLBActorMaterialOverride } from "../../../packages/engine/src/production-runtime/ModelMaterialOverrides";
import type { AuraAssetRef } from "../../../packages/engine/src/agent-api/nodes/types";
import { awaitTypedGLBActorDisposals, createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { defineModelAssets } from "../../../packages/engine/src/agent-api/assets/productionModels";
import { createDefaultFormatRegistry, createGLTFFormatAdapter } from "../../../packages/assets/src/FormatRegistry";
import { PLYLoader, STLLoader } from "../../../packages/assets/src/loaders/MeshFormatLoaders";
import { Model3MFLoader } from "../../../packages/assets/src/loaders/Model3MFLoader";
import { getTypedGLBActorLod } from "../../../packages/engine/src/production-runtime/actor/TypedGLBActorLod";
import { createProductionRuntimeRendererInput } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { asRuntimeImpl, realCompilerImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene";
import { createActorAnimationContext, bindActorAnimationContext, disposeActorAnimationContext } from "../../../packages/engine/src/agent-api/app/actorAnimationHandle";
import { liveTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";

const asset = {
  kind: "aura-asset-ref", id: "model", type: "model", format: "glb", url: "/model.glb", bounds: [4, 2, 1]
} as unknown as AuraAssetRef<"model">;

const positions = new Uint8Array(new Float32Array([-1, -1, 0, 1, -1, 0, 0, 1, 0]).buffer);
const gltf = JSON.stringify({
  asset: { version: "2.0" },
  buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.from(positions).toString("base64")}`, byteLength: positions.length }],
  bufferViews: [{ buffer: 0, byteLength: positions.length }],
  accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] }],
  materials: [{ name: "authored", pbrMetallicRoughness: { baseColorFactor: [0.8, 0.5, 0.2, 1] } }],
  meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] }],
  nodes: [{ name: "triangle", mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
});
afterEach(() => vi.unstubAllGlobals());

describe("native model option bridge", () => {
  it.each([
    ["triangle-ply-ascii", "ply", "ply"],
    ["triangle-stl-binary", "stl", "stl"],
    ["triangle-3mf-stored", "3mf", "model3mf"]
  ])("compiles typed %s bytes through the selected model adapter", async (fixtureId, format, adapterId) => {
    vi.stubGlobal("crypto", webcrypto);
    const fixtureManifest = JSON.parse(readFileSync(new URL("../../fixtures/native-capabilities/manifest.json", import.meta.url), "utf8")) as {
      fixtures: Array<{ id: string; sha256: string; dataBase64: string }>;
    };
    const fixture = fixtureManifest.fixtures.find((candidate) => candidate.id === fixtureId)!;
    const bytes = Buffer.from(fixture.dataBase64, "base64");
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(Uint8Array.from(bytes)));
    vi.stubGlobal("fetch", fetchMock);
    const registry = createDefaultFormatRegistry();
    if (format === "ply") registry.register(createGLTFFormatAdapter(adapterId, [format], new PLYLoader()));
    else if (format === "stl") registry.register(createGLTFFormatAdapter(adapterId, [format], new STLLoader()));
    else registry.register(createGLTFFormatAdapter(adapterId, [format], new Model3MFLoader()));
    const assets = defineModelAssets({ mesh: {
      url: `/native/${fixtureId}.${format}?revision=1`, sha256: fixture.sha256,
      formatMetadata: { adapter: adapterId }, request: { headers: { "x-model-test": fixtureId } }
    } }, { queryParam: null });
    const node = model(assets.refs.mesh).runtime({ id: "native-mesh" });
    const snapshot = scene().add(format === "3mf" ? group("outer", [group("inner", [node])]) : node).toJSON();
    const owner = {};
    const flags = resolveQrFlags({ options: "A3D_QR_COMPILER" });
    const animationContext = createActorAnimationContext(flags);
    bindActorAnimationContext(owner, animationContext);
    const mount = {
      canvas: { width: 64, height: 64 }, flags, runtimeOwner: owner, formatRegistry: registry,
      renderer: null, assets: null, strict: false, quality: { tier: "high" }, degrade: () => undefined,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set()
    } as unknown as MountSceneCompileContext;
    const compiled = await realCompilerImpl.compile(snapshot, mount);
    try {
      const actor = liveTypedGLBActor("native-mesh", owner);
      expect(actor?.pipeline.asset.url).toBe(assets.refs.mesh.url);
      expect(actor?.collectRenderItems().length).toBeGreaterThan(0);
      expect(actor?.pipeline.metadata.vertexCount).toBe(3);
      expect(fetchMock.mock.calls[0]?.[0]).toBe(assets.refs.mesh.url);
      expect(new Headers(fetchMock.mock.calls[0]?.[1]?.headers).get("x-model-test")).toBe(fixtureId);
    } finally {
      compiled.dispose();
      await awaitTypedGLBActorDisposals(owner);
      disposeActorAnimationContext(animationContext);
    }
  });

  it("preserves point-only PLY topology in typed model render items", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const source = ["ply", "format ascii 1.0", "element vertex 2", "property float x", "property float y", "property float z", "end_header", "0 0 0", "1 2 3", ""].join("\n");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(source)));
    const registry = createDefaultFormatRegistry();
    registry.register(createGLTFFormatAdapter("ply", ["ply"], new PLYLoader()));
    const assets = defineModelAssets({ cloud: { url: "/native/points.ply", sha256: createHash("sha256").update(source).digest("hex") } }, { queryParam: null });
    const node = model(assets.refs.cloud).toJSON();
    const owner = {};
    const actor = await createTypedGLBActor({ asset: node.asset, id: "point-cloud", width: 64, height: 64, formatRegistry: registry, runtimeOwner: owner });
    try {
      const items = actor.collectRenderItems();
      expect(items).toHaveLength(1);
      expect(items[0]!.geometry.topology).toBe("points");
      expect(actor.pipeline.asset.meshes[0]?.positions).toEqual([[0, 0, 0], [1, 2, 3]]);
    } finally {
      actor.dispose();
      await awaitTypedGLBActorDisposals(owner);
    }
  });

  it("retains LOD, bounds collider and authored physics on the model node", () => {
    const node = model(asset, {
      lod: { bias: 1.5, crossFadeSeconds: 0.2 }, collider: "bounds",
      physics: { type: "dynamic", mass: 3 }, variant: "blue"
    }).toJSON();
    expect(node).toMatchObject({ lod: { bias: 1.5, crossFadeSeconds: 0.2 }, collider: "bounds", physics: { type: "dynamic", mass: 3 }, variant: "blue" });
    expect(node.ignoredOptions).toBeUndefined();
    expect(applyModelTintBridge(node)).toMatchObject({ lod: { bias: 1.5, crossFadeSeconds: 0.2 }, materialVariant: "blue" });
    expect(model(asset, { collider: "auto" }).toJSON().physics).toEqual({ type: "static" });
    expect(model(asset, { collider: false, lod: false }).toJSON()).toMatchObject({ collider: false, lod: false });
  });

  it("rejects malformed policies, contradictory shapes and unresolved collider sidecars", () => {
    expect(() => model(asset, { lod: { bias: 0 } })).toThrow(/MODEL_OPTION_UNSUPPORTED.*bias/);
    expect(() => model(asset, { lod: { crossFadeSeconds: -1 } })).toThrow(/MODEL_OPTION_UNSUPPORTED.*crossFadeSeconds/);
    expect(() => model(asset, { lod: { levels: [{ name: "near", primitive: "box" }] } })).toThrow(/MODEL_OPTION_UNSUPPORTED.*distanceLod/);
    expect(() => model(asset, { collider: "bounds", physics: { shape: "sphere" } })).toThrow(/MODEL_OPTION_UNSUPPORTED.*explicit physics shape/);
    expect(() => model({ ...asset, colliderUrl: "/collider.glb" }, { collider: "auto" })).toThrow(/MODEL_OPTION_UNSUPPORTED.*sidecar/);
  });

  it("lowers targeted overrides without dropping authored textures and restores them idempotently", () => {
    const node = model(asset, {
      variant: "red", materialOverrides: [{ target: "body", color: "#ff0000", colorMode: "replace", roughness: 0.25 }]
    }).toJSON();
    const bridge = applyModelTintBridge(node);
    expect(bridge.materialVariant).toBe("red");
    const body = new Material({ name: "body", shaderKey: "pbr", parameters: { u_baseColorFactor: [1, 1, 1, 1], u_baseColorTextureEnabled: 1, u_roughness: 0.8 } });
    const trim = new Material({ name: "trim", shaderKey: "pbr", parameters: { u_baseColorFactor: [0.4, 0.4, 0.4, 1], u_baseColorTextureEnabled: 1 } });
    const materials = [body, trim];
    const snapshot = snapshotMaterials(materials);
    applyMaterialOverrides(snapshot, materials, bridge.materialOverrides as TypedGLBActorMaterialOverride[]);
    expect(body.getParameter("u_baseColorFactor")).toEqual([1, 0, 0, 1]);
    expect(body.getParameter("u_baseColorTextureEnabled")).toBe(1);
    expect(body.getParameter("u_roughness")).toBe(0.25);
    expect(trim.getParameter("u_baseColorFactor")).toEqual([0.4, 0.4, 0.4, 1]);
    applyMaterialOverrides(snapshot, materials, []);
    expect(body.getParameter("u_baseColorFactor")).toEqual([1, 1, 1, 1]);
    expect(body.getParameter("u_roughness")).toBe(0.8);
    body.dispose(); trim.dispose();
  });

  it("creates a real custom material lazily and rejects incompatible PBR overrides", () => {
    const custom = material.custom({ glsl: { fragment: "out vec4 outColor; void main(){outColor=vec4(1.0);}" } });
    const bridge = applyModelTintBridge(model(asset, { material: custom, variant: "matte" }).toJSON());
    expect(bridge.materialVariant).toBe("matte");
    expect(bridge.materialOverrides).toBeUndefined();
    const compiled = (bridge.customMaterialFactory as () => Material)();
    expect(compiled.shaderKey).toContain("custom-");
    expect(compiled.disposed).toBe(false);
    compiled.dispose();
    expect(compiled.disposed).toBe(true);
    expect(() => applyModelTintBridge(model(asset, { material: custom, materialOverrides: [{ target: "body", roughness: 0.2 }] }).toJSON())).toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED/);
  });

  it("applies the portable material to imported draw items and releases it with the actor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(gltf, { status: 200 })));
    const source = material.custom({ glsl: { fragment: "out vec4 outColor; void main(){outColor=vec4(1.0,0.0,1.0,1.0);}" } });
    const bridge = applyModelTintBridge(model(asset, { material: source, lod: false }).toJSON());
    const actor = await createTypedGLBActor({ asset: { url: "https://asset.invalid/model.gltf", format: "gltf" }, id: "custom-model", width: 64, height: 64, ...bridge });
    const items = actor.collectRenderItems();
    expect(items).toHaveLength(1);
    const replacement = items[0]!.material as Material;
    expect(replacement.shaderKey).toContain("custom-");
    expect(replacement).not.toBe([...actor.pipeline.resources.materialLibrary.values()][0]);
    expect(items[0]!.geometry).toBeTruthy();
    expect(() => actor.setMaterialOverrides([{ roughness: 0.1 }])).toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED/);
    actor.dispose(); actor.dispose();
    expect(replacement.disposed).toBe(true);
  });

  it("keeps imported morph targets on draw items using a custom material", async () => {
    const fixture = JSON.parse(gltf) as Record<string, any>;
    const delta = new Uint8Array(new Float32Array([0, 0, 0, 0, 0, 0, 0, 1, 0]).buffer);
    fixture.buffers.push({ uri: `data:application/octet-stream;base64,${Buffer.from(delta).toString("base64")}`, byteLength: delta.length });
    fixture.bufferViews.push({ buffer: 1, byteLength: delta.length });
    fixture.accessors.push({ bufferView: 1, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [0, 1, 0] });
    fixture.meshes[0].primitives[0].targets = [{ POSITION: 1 }];
    fixture.meshes[0].weights = [0.5];
    fixture.meshes[0].extras = { targetNames: ["stretch"] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })));
    const source = material.custom({ glsl: { fragment: "out vec4 outColor; void main(){outColor=vec4(1.0);}" } });
    const actor = await createTypedGLBActor({ asset: { url: "https://asset.invalid/morph.gltf", format: "gltf" }, id: "morph-model", width: 64, height: 64,
      ...applyModelTintBridge(model(asset, { material: source }).toJSON()) });
    try {
      const item = actor.collectRenderItems()[0]!;
      expect((item.material as Material).shaderKey).toContain("custom-");
      expect(item.morphTargets).toHaveLength(1);
      expect(item.morphWeights).toEqual([0.5]);
    } finally { actor.dispose(); }
  });

  it("activates the actual imported LOD chain for an explicit model policy", async () => {
    const fixture = JSON.parse(gltf) as Record<string, any>;
    fixture.extensionsUsed = ["MSFT_lod"];
    fixture.meshes.push({ name: "triangle-low", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] });
    fixture.nodes = [
      { name: "high", mesh: 0, extensions: { MSFT_lod: { ids: [1] } }, extras: { MSFT_screencoverage: [1, 0.1] } },
      { name: "low", mesh: 1 }
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })));
    const options = { asset: { url: "https://asset.invalid/lod.gltf", format: "gltf" }, width: 64, height: 64 };
    const automatic = await createTypedGLBActor({ ...options, id: "lod-auto", lod: { bias: 0.001, crossFadeSeconds: 0 } });
    const fixed = await createTypedGLBActor({ ...options, id: "lod-fixed", lod: false });
    try {
      expect(getTypedGLBActorLod(automatic)?.levels).toBe(2);
      expect(getTypedGLBActorLod(fixed)?.levels).toBe(2);
      expect(automatic.collectRenderItems()[0]?.lodLevel).toBe(1);
      expect(fixed.collectRenderItems()[0]?.lodLevel).toBe(0);
      expect(automatic.collectRenderItems()[0]?.geometry).not.toBe(fixed.collectRenderItems()[0]?.geometry);
    } finally { automatic.dispose(); fixed.dispose(); }
  });

  it("selects imported levels using the active scene camera as it moves", async () => {
    const fixture = JSON.parse(gltf) as Record<string, any>;
    fixture.extensionsUsed = ["MSFT_lod"];
    fixture.meshes.push({ name: "triangle-low", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] });
    fixture.nodes = [
      { name: "high", mesh: 0, extensions: { MSFT_lod: { ids: [1] } }, extras: { MSFT_screencoverage: [1, 0.1] } },
      { name: "low", mesh: 1 }
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })));
    const actor = await createTypedGLBActor({ asset: { url: "https://asset.invalid/camera-lod.gltf", format: "gltf" }, id: "camera-lod", width: 64, height: 64, lod: "auto" });
    const projectionMatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0];
    const camera = (distance: number) => ({ projectionMatrix, viewMatrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, -distance, 1] });
    try {
      const far = actor.collectRenderItems({ lodCamera: camera(100) });
      expect(far[0]?.lodLevel).toBe(1);
      const instancePass = actor.collectRenderItems({ lodCamera: camera(1), reuseLodSelection: true });
      expect(instancePass[0]?.lodLevel).toBe(1);
      expect(instancePass[0]?.geometry).toBe(far[0]?.geometry);
      const near = actor.collectRenderItems({ lodCamera: camera(1) });
      expect(near[0]?.lodLevel).toBe(0);
      expect(near[0]?.geometry).not.toBe(far[0]?.geometry);
    } finally { actor.dispose(); }
  });

  it("forwards the rendered camera and reuses the selected LOD in the instancing pass", async () => {
    const fixture = JSON.parse(gltf) as Record<string, any>;
    fixture.extensionsUsed = ["MSFT_lod"];
    fixture.meshes.push({ name: "triangle-low", primitives: [{ attributes: { POSITION: 0 }, material: 0 }] });
    fixture.nodes = [
      { name: "high", mesh: 0, extensions: { MSFT_lod: { ids: [1] } }, extras: { MSFT_screencoverage: [1, 0.1] } },
      { name: "low", mesh: 1 }
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(fixture), { status: 200 })));
    const actor = await createTypedGLBActor({ asset: { url: "https://asset.invalid/input-lod.gltf", format: "gltf" }, id: "input-lod", width: 64, height: 64, lod: "auto" });
    const base = model(asset, { lod: "auto", scaleMode: "world" }).toJSON();
    const node = { ...base, instances: [{ position: [0, 0, 0] as const }] };
    const canvas = { width: 64, height: 64 } as HTMLCanvasElement;
    const frame = (distance: number) => [...createProductionRuntimeRendererInput(
      scene().camera(camera.perspective({ position: [0, 0, distance], target: [0, 0, 0] })).toJSON(),
      canvas, [{ node, actor }], [], 0, undefined, new Set(), {} as never, []
    ).source.collectRenderItems!()];
    try {
      const far = frame(100);
      expect(far[0]?.lodLevel).toBe(1);
      expect(far[0]?.instanceTransforms).toHaveLength(16);
      const near = frame(1);
      expect(near[0]?.lodLevel).toBe(0);
      expect(near[0]?.geometry).not.toBe(far[0]?.geometry);
    } finally { actor.dispose(); }
  });

  it("propagates the mount owner and request signal to compiled imported actors", async () => {
    const controller = new AbortController();
    const owner = {};
    const flags = resolveQrFlags({ options: "A3D_QR_COMPILER" });
    const context = createActorAnimationContext(flags);
    bindActorAnimationContext(owner, context);
    const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => {
      expect(init?.signal).toBeTruthy();
      return new Response(gltf, { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    const digest = createHash("sha256").update(gltf).digest("hex");
    const typedAsset = { ...asset, url: "/models/compile.gltf", format: "gltf", hash: `sha256-${digest}` } as AuraAssetRef<"model">;
    const snapshot = scene().add(model(typedAsset).runtime({ id: "compiled-model" })).toJSON();
    const mount = {
      canvas: { width: 64, height: 64 }, flags, runtimeOwner: owner, request: { signal: controller.signal },
      renderer: null, assets: null, strict: false, quality: { tier: "high" }, degrade: () => undefined,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set()
    } as unknown as MountSceneCompileContext;
    const compiled = await realCompilerImpl.compile(snapshot, mount);
    try {
      const actor = liveTypedGLBActor("compiled-model", owner);
      expect(actor).toBeDefined();
      expect(liveTypedGLBActor("compiled-model", {})).toBeUndefined();
      expect(fetchMock).toHaveBeenCalled();
      const dynamic = model({ ...typedAsset, url: "/models/added.gltf" }).runtime({ id: "added-model" }).toJSON();
      asRuntimeImpl(compiled)!.addSubtree(dynamic);
      await vi.waitFor(() => expect(liveTypedGLBActor("added-model", owner)).toBeDefined());
      expect(liveTypedGLBActor("added-model", {})).toBeUndefined();
    } finally {
      compiled.dispose();
      disposeActorAnimationContext(context);
    }
  });

  it("does not begin a compiled actor request after its mount is cancelled", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn(async () => new Response(gltf, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const typedAsset = { ...asset, url: "/models/cancelled.gltf", format: "gltf", hash: `sha256-${createHash("sha256").update(gltf).digest("hex")}` } as AuraAssetRef<"model">;
    const flags = resolveQrFlags({ options: "A3D_QR_COMPILER" });
    const mount = {
      canvas: { width: 64, height: 64 }, flags, request: { signal: controller.signal },
      renderer: null, assets: null, strict: false, quality: { tier: "high" }, degrade: () => undefined,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set()
    } as unknown as MountSceneCompileContext;
    await expect(realCompilerImpl.compile(scene().add(model(typedAsset)).toJSON(), mount)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("releases successfully loaded actors when a sibling model fails", async () => {
    const owner = {};
    const flags = resolveQrFlags({ options: "A3D_QR_COMPILER" });
    const context = createActorAnimationContext(flags);
    bindActorAnimationContext(owner, context);
    vi.stubGlobal("fetch", vi.fn(async (url: string) => url.includes("broken")
      ? new Response("unavailable", { status: 503 }) : new Response(gltf, { status: 200 })));
    const digest = createHash("sha256").update(gltf).digest("hex");
    const typedAsset = { ...asset, url: "/models/valid.gltf", format: "gltf", hash: `sha256-${digest}` } as AuraAssetRef<"model">;
    const snapshot = scene()
      .add(model(typedAsset).runtime({ id: "valid-model" }))
      .add(model({ ...typedAsset, url: "/models/broken.gltf" }).runtime({ id: "broken-model" })).toJSON();
    const mount = {
      canvas: { width: 64, height: 64 }, flags, runtimeOwner: owner,
      renderer: null, assets: null, strict: false, quality: { tier: "high" }, degrade: () => undefined,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set()
    } as unknown as MountSceneCompileContext;
    try {
      await expect(realCompilerImpl.compile(snapshot, mount)).rejects.toThrow();
      expect(liveTypedGLBActor("valid-model", owner)).toBeUndefined();
      expect(liveTypedGLBActor("broken-model", owner)).toBeUndefined();
    } finally { disposeActorAnimationContext(context); }
  });
});
