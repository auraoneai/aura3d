import { createHash, webcrypto } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createCustomShaderMaterial } from "../../../packages/engine/src/agent-api/compiler/customMaterial.js";
import { upgradeCustomMaterialTextures, type ModelCustomMaterialTextureWork } from "../../../packages/engine/src/agent-api/compiler/customTextures.js";
import { applyModelTintBridge, type ModelCustomMaterialFactoryContext } from "../../../packages/engine/src/agent-api/compiler/modelMaterials.js";
import { DepthPass, ForwardPass, MockRenderDevice, globalShaderSource, isTextureBinding, PortableShaderMaterial, VertexFormat, type TextureBinding } from "../../../packages/rendering/src";
import type { ShaderGraphDocument } from "../../../packages/rendering/src/program/ShaderGraphCompiler";
import type { AuraCustomMaterialSpec, ProductionRuntimePrimitiveEntry } from "../../../packages/engine/src/agent-api/nodes/types.js";
import { defineAuraAssets, material as publicMaterial, model, scene } from "../../../packages/engine/src/public/index.js";
import { texture as textureFactory } from "../../../packages/engine/src/agent-api/nodes/texture.js";
import { realCompilerImpl, type MountSceneCompileContext } from "../../../packages/engine/src/agent-api/compiler/compileScene.js";
import { bindActorAnimationContext, createActorAnimationContext, disposeActorAnimationContext } from "../../../packages/engine/src/agent-api/app/actorAnimationHandle.js";
import { awaitTypedGLBActorDisposals, createTypedGLBActor, liveTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor.js";
import { registerTypedGLBActorExtension } from "../../../packages/engine/src/production-runtime/actor/extensions.js";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags.js";

// R-26: texture asset refs (`assets.x`) on material.custom / material.node uniforms
// load after mount and bind with the real image; failures stay named, never silent.

const loader = vi.fn<(url: string) => Promise<ImageBitmap>>();
const bitmap = () => ({ width: 2, height: 2, close: vi.fn() }) as unknown as ImageBitmap & { close: ReturnType<typeof vi.fn> };

const triangle = new Uint8Array(new Float32Array([
  -1, -1, 0, 1, -1, 0, 0, 1, 0,
  0, 0, 1, 0, 0, 1, 0, 0, 1
]).buffer);
const positionBytes = 9 * Float32Array.BYTES_PER_ELEMENT;
const modelDocument = JSON.stringify({
  asset: { version: "2.0" },
  buffers: [{ uri: `data:application/octet-stream;base64,${Buffer.from(triangle).toString("base64")}`, byteLength: triangle.length }],
  bufferViews: [{ buffer: 0, byteLength: positionBytes }, { buffer: 0, byteOffset: positionBytes, byteLength: positionBytes }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-1, -1, 0], max: [1, 1, 0] },
    { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" }
  ],
  meshes: [{ primitives: [{ attributes: { POSITION: 0, NORMAL: 1 } }] }],
  nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
});
const imageBytes = Uint8Array.of(7, 11, 13, 17);
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

function animatedSkinDocument(options: {
  readonly eight?: boolean;
  readonly textured?: boolean;
  readonly alphaMask?: boolean;
  readonly alphaBlend?: boolean;
  readonly variants?: boolean;
  readonly duplicateMaterialNames?: boolean;
  readonly jointCount?: number;
  readonly initialTranslation?: number;
  readonly unskinned?: boolean;
} = {}): string {
  const chunks: Buffer[] = [];
  const views: { buffer: number; byteOffset: number; byteLength: number }[] = [];
  const add = (value: ArrayBufferView): number => {
    const offset = chunks.reduce((sum, part) => sum + part.length, 0);
    const padding = (4 - offset % 4) % 4;
    if (padding) chunks.push(Buffer.alloc(padding));
    const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    views.push({ buffer: 0, byteOffset: offset + padding, byteLength: bytes.length });
    chunks.push(bytes);
    return views.length - 1;
  };
  const position = add(new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]));
  const normal = add(new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]));
  const joints = add(new Uint16Array(12));
  const weights = add(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]));
  const jointCount = options.jointCount ?? 1;
  const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  const inverse = add(new Float32Array(Array.from({ length: jointCount }, () => identity).flat()));
  const times = add(new Float32Array([0, 1]));
  const translations = add(new Float32Array([0, 0, 0, 1, 0, 0]));
  const joints1 = options.eight ? add(new Uint16Array(12)) : undefined;
  const weights1 = options.eight ? add(new Float32Array(12)) : undefined;
  const uv = add(new Float32Array([0, 0, 1, 0, 0.5, 1]));
  const buffer = Buffer.concat(chunks);
  const accessors = [
    { bufferView: position, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
    { bufferView: normal, componentType: 5126, count: 3, type: "VEC3" },
    { bufferView: joints, componentType: 5123, count: 3, type: "VEC4" },
    { bufferView: weights, componentType: 5126, count: 3, type: "VEC4" },
    { bufferView: inverse, componentType: 5126, count: jointCount, type: "MAT4" },
    { bufferView: times, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
    { bufferView: translations, componentType: 5126, count: 2, type: "VEC3" },
    ...(options.eight ? [
      { bufferView: joints1, componentType: 5123, count: 3, type: "VEC4" },
      { bufferView: weights1, componentType: 5126, count: 3, type: "VEC4" }
    ] : []),
    { bufferView: uv, componentType: 5126, count: 3, type: "VEC2" }
  ];
  const primitive = {
    attributes: { POSITION: 0, NORMAL: 1, JOINTS_0: 2, WEIGHTS_0: 3, TEXCOORD_0: options.eight ? 9 : 7,
      ...(options.eight ? { JOINTS_1: 7, WEIGHTS_1: 8 } : {}) },
    material: 0,
    ...(options.variants ? { extensions: { KHR_materials_variants: { mappings: [{ material: 1, variants: [0] }] } } } : {})
  };
  const materials = [{
    name: "surface",
    ...(options.textured ? { pbrMetallicRoughness: { baseColorTexture: { index: 0 } } } : {}),
    ...(options.alphaMask ? { alphaMode: "MASK", alphaCutoff: 0.5 } : {}),
    ...(options.alphaBlend ? { alphaMode: "BLEND" } : {})
  }, ...(options.variants || options.duplicateMaterialNames ? [{ name: options.duplicateMaterialNames ? "surface" : "alternate" }] : [])];
  const primitives = options.duplicateMaterialNames ? [primitive, { ...primitive, material: 1 }] : [primitive];
  return JSON.stringify({
    asset: { version: "2.0" },
    ...(options.variants ? { extensionsUsed: ["KHR_materials_variants"], extensions: { KHR_materials_variants: { variants: [{ name: "alternate" }] } } } : {}),
    buffers: [{ uri: `data:application/octet-stream;base64,${buffer.toString("base64")}`, byteLength: buffer.length }],
    bufferViews: views, accessors, materials,
    ...(options.textured ? { images: [{ uri: "data:image/png;base64,AQIDBA==" }], textures: [{ source: 0 }] } : {}),
    meshes: [{ name: "Triangle", primitives }],
    nodes: [{ name: "Mesh", mesh: 0, ...(options.unskinned ? {} : { skin: 0 }) }, ...Array.from({ length: jointCount }, (_, index) => ({
      name: `Joint${index}`,
      ...(index === 0 && options.initialTranslation !== undefined ? { translation: [options.initialTranslation, 0, 0] } : {})
    }))],
    skins: [{ joints: Array.from({ length: jointCount }, (_, index) => index + 1), inverseBindMatrices: 4 }],
    scenes: [{ nodes: Array.from({ length: jointCount + 1 }, (_, index) => index) }], scene: 0,
    animations: [{ name: "Move", samplers: [{ input: 5, output: 6 }], channels: [{ sampler: 0, target: { node: 1, path: "translation" } }] }]
  });
}

const skinGraph: ShaderGraphDocument = {
  version: 1, stage: "material",
  nodes: [{ id: "color", op: "constant", type: "vec3", value: [0.8, 0.2, 0.1] }],
  outputs: { color: "color" }
};

const texturedSkinGraph: ShaderGraphDocument = {
  version: 1, stage: "material",
  resources: [{ name: "map", kind: "texture2d" }],
  nodes: [
    { id: "uv", op: "input", type: "vec2", name: "uv0" },
    { id: "sample", op: "textureSample", type: "vec4", resource: "map", inputs: ["uv"] }
  ],
  outputs: { color: "sample" }
};

function stubSkinModel(document: string) {
  vi.stubGlobal("crypto", webcrypto);
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    if (String(input).includes("skin.gltf")) return new Response(document);
    if (String(input).includes("matcap.png")) return new Response(imageBytes.slice().buffer as ArrayBuffer);
    throw new Error(`Unexpected request ${String(input)}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const skinAsset = (document: string) => ({ url: "/skin.gltf", format: "gltf", hash: hash(document) });

function modelFactory(url = "/matcap.png") {
  const assets = defineAuraAssets({
    object: { type: "model", format: "gltf", url: "/model.gltf", hash: hash(modelDocument) },
    cap: { type: "texture", format: "png", url, hash: hash(imageBytes) }
  });
  const bridge = applyModelTintBridge(model(assets.object, { material: publicMaterial.matcap({ map: assets.cap }) }).toJSON());
  return bridge.customMaterialFactory as (context?: ModelCustomMaterialFactoryContext) => ReturnType<typeof createCustomShaderMaterial>;
}

function stubModelAndTextureFetch(textureResponse: () => Response = () =>
  new Response(imageBytes.slice().buffer as ArrayBuffer, { headers: { "content-type": "image/png" } })) {
  vi.stubGlobal("crypto", webcrypto);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
    String(input).includes("model.gltf") ? new Response(modelDocument) : textureResponse());
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const actorAsset = () => ({ url: "/model.gltf", format: "gltf", hash: hash(modelDocument) });
const actorRequest = () => ({ credentials: "include" as const, cache: "no-store" as const });

const assetRef = (url: string | undefined) => ({ kind: "aura-asset-ref", type: "texture", id: "diffuse", ...(url ? { url } : {}) });
const spec = (value: unknown): AuraCustomMaterialSpec => ({
  glsl: { fragment: "out vec4 outColor;\nvoid main() { outColor = texture(map, vec2(0.5)); }" },
  uniforms: { map: { type: "texture2d", value } }
});

function fixture(value: unknown) {
  const custom = spec(value);
  const material = createCustomShaderMaterial(custom, "primitive-box");
  const resource = {
    name: "box",
    material,
    materialSpec: { kind: "custom", custom },
    textureWarnings: [] as string[],
    textureDisposer: undefined as (() => void) | undefined
  };
  const entries = [{ resources: [resource] }] as unknown as readonly ProductionRuntimePrimitiveEntry[];
  const warnings: string[] = [];
  return { material, resource, entries, warnings, warn: (message: string) => { warnings.push(message); } };
}

const bindingOf = (material: ReturnType<typeof createCustomShaderMaterial>): TextureBinding => {
  const value = material.getParameter("u_map");
  expect(isTextureBinding(value)).toBe(true);
  return value as TextureBinding;
};

describe("upgradeCustomMaterialTextures — asset refs on custom materials (R-26)", () => {
  beforeEach(() => { loader.mockReset(); });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("submits animated public graph-material model draws with paired skin programs and the live palette", async () => {
    const document = animatedSkinDocument({ initialTranslation: 0.25 });
    stubSkinModel(document);
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) }
    });
    const owner = {};
    const flags = resolveQrFlags({ options: "A3D_QR_COMPILER" });
    const context = createActorAnimationContext(flags);
    bindActorAnimationContext(owner, context);
    const snapshot = scene().add(model(assets.object, { material: publicMaterial.node({ graph: skinGraph }) })
      .runtime({ id: "graph-skin" })).toJSON();
    const mount = {
      canvas: { width: 64, height: 64 }, flags, runtimeOwner: owner,
      request: { cache: "no-store" },
      renderer: null, assets: null, strict: false, quality: { tier: "high" }, degrade: () => undefined,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set()
    } as unknown as MountSceneCompileContext;
    const device = new MockRenderDevice();
    let compiled: Awaited<ReturnType<typeof realCompilerImpl.compile>> | undefined;
    try {
      compiled = await realCompilerImpl.compile(snapshot, mount);
      const actor = liveTypedGLBActor("graph-skin", owner)!;
      expect(actor).toBeDefined();
      expect(actor.collectRenderItems()[0]!.skinning?.matrices[12]).toBeCloseTo(0.25);
      expect(actor.playClip("Move", 0.5).skinningPalettesUpdated).toBe(1);
      const item = actor.collectRenderItems()[0]!;
      const material = item.material as PortableShaderMaterial;
      expect(item.skinning?.jointCount).toBe(1);
      expect(item.skinning?.matrices[12]).toBeCloseTo(0.5);
      expect(PortableShaderMaterial.hasGraphClippingContract(material)).toBe(true);
      const forward = material.graphSkinningVariant(4, "float", "float", "forward")!;
      const depth = material.graphSkinningVariant(4, "float", "float", "depth")!;
      expect(forward).not.toBe(depth);
      for (const key of [forward, depth]) {
        const source = globalShaderSource(key)!;
        expect(source.vertex).toContain("a3dSkinMatrix4(a_joints, a_weights)");
        expect(source.webgpu?.vertex).toContain("auraGraphSkin4(joints, weights)");
      }
      device.beginFrame(8, 8);
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands.map((draw) => draw.shader?.label)).toEqual([forward, depth]);
      for (const draw of device.drawCommands) {
        expect(draw.uniforms?.get("u_jointCount")).toBe(1);
        expect(draw.uniforms?.get("u_jointMatrices")).toEqual(item.skinning?.matrices);
        expect(draw.uniforms?.get("u_jointPaletteMode")).toBe(0);
      }
      device.endFrame();
      actor.playClip("Move", 1);
      expect(actor.collectRenderItems()[0]!.skinning?.matrices[12]).toBeCloseTo(1);
    } finally {
      compiled?.dispose();
      disposeActorAnimationContext(context);
      await awaitTypedGLBActorDisposals(owner);
      device.dispose();
    }
  });

  it.each(["matcap", "custom"] as const)("rejects an uncertified %s shader on a skinned actor without publishing it", async (kind) => {
    const document = animatedSkinDocument();
    const fetchMock = stubSkinModel(document);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap()));
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) },
      cap: { type: "texture", format: "png", url: "/matcap.png", hash: hash(imageBytes) }
    });
    const source = kind === "matcap"
      ? publicMaterial.matcap({ map: assets.cap })
      : publicMaterial.custom({ glsl: { fragment: "out vec4 outColor; void main(){outColor=vec4(1.0);}" } });
    const bridge = applyModelTintBridge(model(assets.object, { material: source }).toJSON());
    const owner = {};
    const context = createActorAnimationContext();
    bindActorAnimationContext(owner, context);
    try {
      await expect(createTypedGLBActor({
        asset: skinAsset(document), id: `uncertified-${kind}`, width: 64, height: 64,
        runtimeOwner: owner, ...bridge
      })).rejects.toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*paired forward\/depth skinning/);
      expect(liveTypedGLBActor(`uncertified-${kind}`, owner)).toBeUndefined();
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("matcap.png"))).toBe(false);
    } finally {
      disposeActorAnimationContext(context);
      await awaitTypedGLBActorDisposals(owner);
    }
  });

  it("reports the unsupported skinned matcap through the public scene compiler before loading its map", async () => {
    const document = animatedSkinDocument();
    const fetchMock = stubSkinModel(document);
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) },
      cap: { type: "texture", format: "png", url: "/matcap.png", hash: hash(imageBytes) }
    });
    const owner = {};
    const flags = resolveQrFlags({ options: "A3D_QR_COMPILER" });
    const context = createActorAnimationContext(flags);
    bindActorAnimationContext(owner, context);
    const snapshot = scene().add(model(assets.object, { material: publicMaterial.matcap({ map: assets.cap }) })
      .runtime({ id: "public-matcap-skin" })).toJSON();
    const mount = {
      canvas: { width: 64, height: 64 }, flags, runtimeOwner: owner,
      request: { cache: "no-store" },
      renderer: null, assets: null, strict: false, quality: { tier: "high" }, degrade: () => undefined,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set()
    } as unknown as MountSceneCompileContext;
    try {
      await expect(realCompilerImpl.compile(snapshot, mount)).rejects.toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*paired forward\/depth skinning/);
      expect(liveTypedGLBActor("public-matcap-skin", owner)).toBeUndefined();
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes("matcap.png"))).toBe(false);
    } finally {
      disposeActorAnimationContext(context);
      await awaitTypedGLBActorDisposals(owner);
    }
  });

  it.each([
    [{ textured: true }, /authored texture maps/],
    [{ textured: true, unskinned: true }, /authored texture maps/],
    [{ alphaMask: true }, /alpha coverage/],
    [{ alphaBlend: true }, /alpha coverage/],
    [{ duplicateMaterialNames: true }, /single authored material slot/],
    [{ eight: true }, /JOINTS_1\/WEIGHTS_1/]
  ])("rejects an unsafe model replacement before calling the material factory (%o)", async (options, reason) => {
    const document = animatedSkinDocument(options);
    stubSkinModel(document);
    const factory = vi.fn(() => createCustomShaderMaterial(publicMaterial.node({ graph: skinGraph }).custom!));
    await expect(createTypedGLBActor({
      asset: skinAsset(document), id: "unsafe-skin", width: 64, height: 64,
      imageDecoder: async () => ({ width: 1, height: 1, data: new Uint8Array([255, 255, 255, 255]) }),
      customMaterialFactory: factory
    })).rejects.toThrow(reason);
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects an oversized authored skin even when the loader omits its palette", async () => {
    const document = animatedSkinDocument({ jointCount: 1025 });
    stubSkinModel(document);
    const factory = vi.fn(() => createCustomShaderMaterial(publicMaterial.node({ graph: skinGraph }).custom!));
    await expect(createTypedGLBActor({
      asset: skinAsset(document), id: "oversized-skin", width: 64, height: 64, customMaterialFactory: factory
    })).rejects.toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*authored skin has no live palette/);
    expect(factory).not.toHaveBeenCalled();
  });

  it("rejects a skinned custom replacement with imported LODs before acquiring its material", async () => {
    const fixture = JSON.parse(animatedSkinDocument()) as {
      extensionsUsed?: string[];
      meshes: Array<{ name: string; primitives: unknown[] }>;
      nodes: Array<Record<string, unknown>>;
    };
    fixture.extensionsUsed = ["MSFT_lod"];
    fixture.meshes.push({ ...fixture.meshes[0]!, name: "Low" });
    fixture.nodes[0]!.extensions = { MSFT_lod: { ids: [2] } };
    fixture.nodes.push({ name: "Low", mesh: 1, skin: 0 });
    const document = JSON.stringify(fixture);
    stubSkinModel(document);
    const factory = vi.fn(() => createCustomShaderMaterial(publicMaterial.node({ graph: skinGraph }).custom!));
    await expect(createTypedGLBActor({
      asset: skinAsset(document), id: "lod-skin", width: 64, height: 64, customMaterialFactory: factory
    })).rejects.toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*LOD material slots/);
    expect(factory).not.toHaveBeenCalled();
  });

  it("fails closed if an admitted authored skin loses its live palette", async () => {
    const document = animatedSkinDocument();
    stubSkinModel(document);
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) }
    });
    const bridge = applyModelTintBridge(model(assets.object, { material: publicMaterial.node({ graph: skinGraph }) }).toJSON());
    const actor = await createTypedGLBActor({ asset: skinAsset(document), id: "missing-palette", width: 64, height: 64, ...bridge });
    const renderable = actor.pipeline.resources.scene.collectRenderables()[0]!.renderable;
    const palette = renderable.skinning;
    try {
      renderable.skinning = undefined;
      expect(() => actor.collectRenderItems()).toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*authored skin has no live palette/);
      renderable.skinning = palette;
      expect(actor.collectRenderItems()[0]!.skinning).toBe(palette);
    } finally { renderable.skinning = palette; actor.dispose(); }
  });

  it("rejects a render extension that strips a skinned item's palette", async () => {
    const document = animatedSkinDocument();
    stubSkinModel(document);
    const source = publicMaterial.node({ graph: skinGraph });
    const unregister = registerTypedGLBActorExtension({
      id: "test.strip-skin", owner: "test",
      collectRenderItems: (actor, items) => actor.id === "stripped-skin"
        ? items.map((item) => ({ ...item, skinning: undefined }))
        : [...items]
    });
    let actor: Awaited<ReturnType<typeof createTypedGLBActor>> | undefined;
    try {
      actor = await createTypedGLBActor({
        asset: skinAsset(document), id: "stripped-skin", width: 64, height: 64,
        customMaterialFactory: () => createCustomShaderMaterial(source.custom!)
      });
      expect(() => actor!.collectRenderItems()).toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*extension removed.*palette/);
    } finally { unregister(); actor?.dispose(); }
  });

  it.each([
    ["missing-weights", /missing weights/],
    ["joint-location", /incompatible joints/],
    ["normalized-joints", /incompatible joints/],
    ["extra-influences", /influence sets do not match/]
  ] as const)("rejects the %s skin-stream contract before actor publication", async (kind, reason) => {
    const document = animatedSkinDocument();
    stubSkinModel(document);
    const source = publicMaterial.node({ graph: skinGraph });
    let shader: ReturnType<typeof createCustomShaderMaterial> | undefined;
    let restore: (() => void) | undefined;
    const unregister = registerTypedGLBActorExtension({
      id: `test.skin-stream-${kind}`, owner: "test",
      onLoad: (actor, pipeline) => {
        if (actor.id !== `bad-stream-${kind}`) return;
        const renderable = pipeline.resources.scene.collectRenderables()[0]!.renderable;
        const geometry = pipeline.resources.geometryLibrary.get(renderable.geometry)!;
        const buffer = geometry.vertexBuffer as unknown as { format: VertexFormat };
        const original = buffer.format;
        const palette = renderable.skinning! as typeof renderable.skinning & { extraInfluences?: boolean };
        if (kind === "extra-influences") {
          palette.extraInfluences = true;
          restore = () => { delete palette.extraInfluences; };
          return;
        }
        const attributes = original.attributes
          .filter((attribute) => kind !== "missing-weights" || attribute.semantic !== "weights")
          .map((attribute) => ({
            ...attribute,
            ...(kind === "joint-location" && attribute.semantic === "joints" ? { shaderLocation: 11 } : {}),
            ...(kind === "normalized-joints" && attribute.semantic === "joints" ? { normalized: true } : {})
          }));
        buffer.format = new VertexFormat(attributes, original.stride);
        restore = () => { buffer.format = original; };
      },
      dispose: () => restore?.()
    });
    try {
      await expect(createTypedGLBActor({
        asset: skinAsset(document), id: `bad-stream-${kind}`, width: 64, height: 64,
        customMaterialFactory: () => (shader = createCustomShaderMaterial(source.custom!))
      })).rejects.toThrow(reason);
      expect(shader?.disposed).toBe(true);
    } finally { unregister(); }
  });

  it("rejects an authored variant before load and leaves runtime material bindings untouched", async () => {
    const document = animatedSkinDocument({ variants: true });
    const fetchMock = stubSkinModel(document);
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) }
    });
    const source = publicMaterial.node({ graph: skinGraph });
    const bridge = applyModelTintBridge(model(assets.object, { material: source }).toJSON());
    const factory = vi.fn(bridge.customMaterialFactory as (context: ModelCustomMaterialFactoryContext) => ReturnType<typeof createCustomShaderMaterial>);
    await expect(createTypedGLBActor({
      asset: skinAsset(document), id: "variant-preload", width: 64, height: 64,
      customMaterialFactory: factory, materialVariant: "alternate"
    })).rejects.toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*variant/);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(factory).not.toHaveBeenCalled();

    const actor = await createTypedGLBActor({
      asset: skinAsset(document), id: "variant-live", width: 64, height: 64,
      customMaterialFactory: factory
    });
    try {
      expect(actor.materialVariants()).toEqual(["alternate"]);
      const renderable = actor.pipeline.resources.scene.collectRenderables()[0]!.renderable;
      const original = renderable.material;
      const custom = actor.collectRenderItems()[0]!.material;
      await expect(actor.setMaterialVariant("alternate")).rejects.toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*variant/);
      expect(renderable.material).toBe(original);
      expect(actor.collectRenderItems()[0]!.material).toBe(custom);
      await expect(actor.setMaterialVariant("missing")).resolves.toBe("variant-unknown");
      expect(renderable.material).toBe(original);
      await expect(actor.setMaterialVariant(null)).resolves.toBe("applied");
      expect(renderable.material).toBe(original);
    } finally { actor.dispose(); }
  });

  it("submits the large animated palette as a texture in both graph passes", async () => {
    const document = animatedSkinDocument({ jointCount: 97 });
    stubSkinModel(document);
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) }
    });
    const bridge = applyModelTintBridge(model(assets.object, { material: publicMaterial.node({ graph: skinGraph }) }).toJSON());
    const actor = await createTypedGLBActor({ asset: skinAsset(document), id: "large-skin", width: 64, height: 64, ...bridge });
    const device = new MockRenderDevice();
    const paletteData: Float32Array[] = [];
    const draw = device.draw.bind(device);
    vi.spyOn(device, "draw").mockImplementation((command) => {
      const binding = command.uniforms?.get("u_jointPaletteTexture") as TextureBinding;
      if (binding?.texture?.data instanceof Float32Array) paletteData.push(binding.texture.data.slice());
      draw(command);
    });
    try {
      expect(actor.playClip("Move", 0.5).skinningPalettesUpdated).toBe(1);
      const item = actor.collectRenderItems()[0]!;
      const material = item.material as PortableShaderMaterial;
      expect(item.skinning?.jointCount).toBe(97);
      expect(item.skinning?.matrices[12]).toBeCloseTo(0.5);
      device.beginFrame(8, 8);
      new ForwardPass({ items: [item] }).execute({ device, width: 8, height: 8 });
      new DepthPass({ casters: [item] }).execute({ device, width: 8, height: 8 });
      expect(device.drawCommands.map((draw) => draw.shader?.label)).toEqual([
        material.graphSkinningVariant(4, "float", "float", "forward"),
        material.graphSkinningVariant(4, "float", "float", "depth")
      ]);
      for (const draw of device.drawCommands) {
        expect(draw.uniforms?.get("u_jointCount")).toBe(97);
        expect(draw.uniforms?.get("u_jointPaletteMode")).toBe(1);
        const binding = draw.uniforms?.get("u_jointPaletteTexture") as TextureBinding;
        expect(binding.texture).not.toBeNull();
      }
      expect(paletteData).toHaveLength(2);
      for (const data of paletteData) {
        expect(Array.from(data.slice(0, item.skinning!.matrices.length))).toEqual(Array.from(item.skinning!.matrices));
        expect(data[12]).toBeCloseTo(0.5);
      }
      device.endFrame();
    } finally { actor.dispose(); device.dispose(); }
  });

  it("cancels a skinned graph texture acquisition and closes a late bitmap before rejecting", async () => {
    const document = animatedSkinDocument();
    stubSkinModel(document);
    let finish!: (image: ImageBitmap) => void;
    const decode = vi.fn(() => new Promise<ImageBitmap>((resolve) => { finish = resolve; }));
    vi.stubGlobal("createImageBitmap", decode);
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) },
      cap: { type: "texture", format: "png", url: "/matcap.png", hash: hash(imageBytes) }
    });
    const bridge = applyModelTintBridge(model(assets.object, {
      material: publicMaterial.node({ graph: texturedSkinGraph, uniforms: { map: assets.cap } })
    }).toJSON());
    const factory = bridge.customMaterialFactory as (context: ModelCustomMaterialFactoryContext) => ReturnType<typeof createCustomShaderMaterial>;
    const owner = {};
    const context = createActorAnimationContext();
    bindActorAnimationContext(owner, context);
    const controller = new AbortController();
    let material: ReturnType<typeof createCustomShaderMaterial> | undefined;
    const outcome = createTypedGLBActor({
      asset: skinAsset(document), id: "cancel-skinned-texture", width: 64, height: 64,
      runtimeOwner: owner, request: { signal: controller.signal, cache: "no-store" },
      customMaterialFactory: (arg) => (material = factory(arg))
    }).then((actor) => ({ actor, error: undefined }), (error: unknown) => ({ actor: undefined, error }));
    try {
      await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
      expect(liveTypedGLBActor("cancel-skinned-texture", owner)).toBeUndefined();
      controller.abort();
      const image = bitmap();
      finish(image);
      expect((await outcome).error).toBeDefined();
      expect(image.close).toHaveBeenCalledTimes(1);
      expect(material?.disposed).toBe(true);
      expect(liveTypedGLBActor("cancel-skinned-texture", owner)).toBeUndefined();
    } finally {
      if (finish) finish(bitmap());
      (await outcome).actor?.dispose();
      disposeActorAnimationContext(context);
      await awaitTypedGLBActorDisposals(owner);
    }
  });

  it("keeps skinned graph textures, programs and palettes owned by their individual actors", async () => {
    const document = animatedSkinDocument();
    stubSkinModel(document);
    const images = [bitmap(), bitmap()];
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValueOnce(images[0]).mockResolvedValueOnce(images[1]));
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) },
      cap: { type: "texture", format: "png", url: "/matcap.png", hash: hash(imageBytes) }
    });
    const bridge = applyModelTintBridge(model(assets.object, {
      material: publicMaterial.node({ graph: texturedSkinGraph, uniforms: { map: assets.cap } })
    }).toJSON());
    const first = await createTypedGLBActor({
      asset: skinAsset(document), id: "graph-owner-one", width: 64, height: 64,
      request: { cache: "no-store" }, ...bridge
    });
    const second = await createTypedGLBActor({
      asset: skinAsset(document), id: "graph-owner-two", width: 64, height: 64,
      request: { cache: "no-store" }, ...bridge
    });
    try {
      first.playClip("Move", 0.25);
      second.playClip("Move", 0.75);
      const firstItem = first.collectRenderItems()[0]!;
      const secondItem = second.collectRenderItems()[0]!;
      const firstMaterial = firstItem.material as PortableShaderMaterial;
      const secondMaterial = secondItem.material as PortableShaderMaterial;
      const firstTexture = (firstMaterial.getParameter("u_auraGraph_resource_map") as TextureBinding).texture!;
      const secondTexture = (secondMaterial.getParameter("u_auraGraph_resource_map") as TextureBinding).texture!;
      const forward = firstMaterial.graphSkinningVariant(4, "float", "float", "forward")!;
      expect(firstMaterial).not.toBe(secondMaterial);
      expect(firstTexture).not.toBe(secondTexture);
      expect(firstTexture.source).toBe(images[0]);
      expect(secondTexture.source).toBe(images[1]);
      expect(firstItem.skinning?.matrices[12]).toBeCloseTo(0.25);
      expect(secondItem.skinning?.matrices[12]).toBeCloseTo(0.75);
      first.dispose();
      expect(firstTexture.disposed).toBe(true);
      expect(images[0]!.close).toHaveBeenCalledTimes(1);
      expect(secondTexture.disposed).toBe(false);
      expect(images[1]!.close).not.toHaveBeenCalled();
      expect(globalShaderSource(forward)).toBeDefined();
      expect(second.collectRenderItems()[0]!.skinning?.matrices[12]).toBeCloseTo(0.75);
      second.dispose();
      expect(secondTexture.disposed).toBe(true);
      expect(images[1]!.close).toHaveBeenCalledTimes(1);
      expect(globalShaderSource(forward)).toBeUndefined();
    } finally { first.dispose(); second.dispose(); }
  });

  it("retains a borrowed graph texture when its skinned actor is disposed", async () => {
    const document = animatedSkinDocument();
    stubSkinModel(document);
    const borrowed = textureFactory.data({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) });
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) }
    });
    const bridge = applyModelTintBridge(model(assets.object, {
      material: publicMaterial.node({ graph: texturedSkinGraph, uniforms: { map: borrowed } })
    }).toJSON());
    let actor: Awaited<ReturnType<typeof createTypedGLBActor>> | undefined;
    try {
      actor = await createTypedGLBActor({ asset: skinAsset(document), id: "borrowed-skin", width: 64, height: 64, ...bridge });
      actor.playClip("Move", 0.5);
      const item = actor.collectRenderItems()[0]!;
      expect(item.skinning?.matrices[12]).toBeCloseTo(0.5);
      const shader = item.material as PortableShaderMaterial;
      expect((shader.getParameter("u_auraGraph_resource_map") as TextureBinding).texture).toBe(borrowed.texture);
      actor.dispose();
      expect(shader.disposed).toBe(true);
      expect(borrowed.texture.disposed).toBe(false);
    } finally { actor?.dispose(); borrowed.dispose(); }
  });

  it("stops exposing an admitted skinned graph after shader hot reload invalidates its certificate", async () => {
    const document = animatedSkinDocument();
    stubSkinModel(document);
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) }
    });
    const bridge = applyModelTintBridge(model(assets.object, { material: publicMaterial.node({ graph: skinGraph }) }).toJSON());
    const actor = await createTypedGLBActor({ asset: skinAsset(document), id: "reload-skin", width: 64, height: 64, ...bridge });
    try {
      const material = actor.collectRenderItems()[0]!.material as PortableShaderMaterial;
      material.hotReload(material.sources);
      expect(() => actor.collectRenderItems()).toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*paired forward\/depth skinning/);
    } finally { actor.dispose(); }
  });

  it("revalidates both skinned programs after asynchronous texture work and retains the previous actor on failure", async () => {
    const document = animatedSkinDocument();
    stubSkinModel(document);
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) }
    });
    const source = publicMaterial.node({ graph: skinGraph });
    const bridge = applyModelTintBridge(model(assets.object, { material: source }).toJSON());
    const owner = {};
    const context = createActorAnimationContext();
    bindActorAnimationContext(owner, context);
    const previous = await createTypedGLBActor({
      asset: skinAsset(document), id: "replace-skinned-actor", width: 64, height: 64, runtimeOwner: owner, ...bridge
    });
    let finish!: () => void;
    let material: ReturnType<typeof createCustomShaderMaterial> | undefined;
    const dispose = vi.fn();
    const ready = new Promise<void>((resolve) => { finish = resolve; });
    const outcome = createTypedGLBActor({
      asset: skinAsset(document), id: "replace-skinned-actor", width: 64, height: 64, runtimeOwner: owner,
      customMaterialFactory: ({ adoptTextureWork }) => {
        material = createCustomShaderMaterial(source.custom!);
        adoptTextureWork({ ready, warnings: [], dispose });
        return material;
      }
    }).then((actor) => ({ actor, error: undefined }), (error: unknown) => ({ actor: undefined, error }));
    try {
      await vi.waitFor(() => expect(material).toBeDefined());
      expect(liveTypedGLBActor("replace-skinned-actor", owner)).toBe(previous);
      material!.hotReload(material!.sources);
      finish();
      const result = await outcome;
      expect(result.error).toBeInstanceOf(Error);
      expect(String(result.error)).toMatch(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*paired forward\/depth skinning/);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(material!.disposed).toBe(true);
      expect(liveTypedGLBActor("replace-skinned-actor", owner)).toBe(previous);
      previous.playClip("Move", 0.5);
      expect(previous.collectRenderItems()[0]!.skinning?.matrices[12]).toBeCloseTo(0.5);
    } finally {
      finish();
      (await outcome).actor?.dispose();
      previous.dispose();
      disposeActorAnimationContext(context);
      await awaitTypedGLBActorDisposals(owner);
    }
  });

  it("does not publish a replacement whose extension invalidates the paired skin programs", async () => {
    const document = animatedSkinDocument();
    stubSkinModel(document);
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) }
    });
    const bridge = applyModelTintBridge(model(assets.object, { material: publicMaterial.node({ graph: skinGraph }) }).toJSON());
    const owner = {};
    const context = createActorAnimationContext();
    bindActorAnimationContext(owner, context);
    const previous = await createTypedGLBActor({
      asset: skinAsset(document), id: "extension-skin", width: 64, height: 64, runtimeOwner: owner, ...bridge
    });
    let attempted: PortableShaderMaterial | undefined;
    const dispose = vi.fn();
    const unregister = registerTypedGLBActorExtension({
      id: "test.invalidate-skin-programs", owner: "test",
      onLoad: (actor) => {
        if (actor.id !== "extension-skin") return;
        expect(liveTypedGLBActor("extension-skin", owner)).toBe(previous);
        attempted = actor.collectRenderItems()[0]!.material as PortableShaderMaterial;
        attempted.hotReload(attempted.sources);
      },
      dispose
    });
    try {
      await expect(createTypedGLBActor({
        asset: skinAsset(document), id: "extension-skin", width: 64, height: 64, runtimeOwner: owner, ...bridge
      })).rejects.toThrow(/MODEL_CUSTOM_MATERIAL_UNSUPPORTED.*paired forward\/depth skinning/);
      expect(attempted?.disposed).toBe(true);
      expect(dispose).toHaveBeenCalledTimes(1);
      expect(liveTypedGLBActor("extension-skin", owner)).toBe(previous);
      expect(previous.collectRenderItems()[0]!.skinning).toBeDefined();
    } finally {
      unregister();
      previous.dispose();
      disposeActorAnimationContext(context);
      await awaitTypedGLBActorDisposals(owner);
    }
  });

  it("stops extension initialization after reentrant skinned-actor disposal and releases its texture", async () => {
    const document = animatedSkinDocument();
    stubSkinModel(document);
    const image = bitmap();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => image));
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/skin.gltf", hash: hash(document) },
      cap: { type: "texture", format: "png", url: "/matcap.png", hash: hash(imageBytes) }
    });
    const bridge = applyModelTintBridge(model(assets.object, {
      material: publicMaterial.node({ graph: texturedSkinGraph, uniforms: { map: assets.cap } })
    }).toJSON());
    const owner = {};
    const context = createActorAnimationContext();
    bindActorAnimationContext(owner, context);
    const firstDispose = vi.fn();
    const laterLoad = vi.fn();
    const laterDispose = vi.fn();
    const first = registerTypedGLBActorExtension({
      id: "test.abort-extension-first", owner: "test", order: -1000,
      onLoad: (actor) => { if (actor.id === "reentrant-skin") actor.dispose(); },
      dispose: firstDispose
    });
    const later = registerTypedGLBActorExtension({
      id: "test.abort-extension-later", owner: "test", order: -999,
      onLoad: laterLoad, dispose: laterDispose
    });
    try {
      await expect(createTypedGLBActor({
        asset: skinAsset(document), id: "reentrant-skin", width: 64, height: 64,
        runtimeOwner: owner, request: { cache: "no-store" }, ...bridge
      })).rejects.toThrow(/cancel/i);
      expect(firstDispose).toHaveBeenCalledTimes(1);
      expect(laterLoad).not.toHaveBeenCalled();
      expect(laterDispose).not.toHaveBeenCalled();
      expect(image.close).toHaveBeenCalledTimes(1);
      expect(liveTypedGLBActor("reentrant-skin", owner)).toBeUndefined();
    } finally {
      first(); later();
      disposeActorAnimationContext(context);
      await awaitTypedGLBActorDisposals(owner);
    }
  });

  it("binds a typed matcap bitmap on the public model compiler path", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const image = bitmap();
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      if (String(input).includes("model.gltf")) return new Response(modelDocument);
      if (String(input).includes("matcap.png")) return new Response(imageBytes.slice().buffer as ArrayBuffer, { headers: { "content-type": "image/png" } });
      throw new Error("Unexpected asset request");
    });
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => image));
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/model.gltf", hash: hash(modelDocument) },
      cap: { type: "texture", format: "png", url: "/matcap.png", hash: hash(imageBytes) }
    });
    const owner = {};
    const flags = resolveQrFlags({ options: "A3D_QR_COMPILER" });
    const context = createActorAnimationContext(flags);
    bindActorAnimationContext(owner, context);
    const snapshot = scene().add(model(assets.object, { material: publicMaterial.matcap({ map: assets.cap }) }).runtime({ id: "matcap-model" })).toJSON();
    const mount = {
      canvas: { width: 64, height: 64 }, flags, runtimeOwner: owner,
      request: { credentials: "include", headers: { "x-model-policy": "private" }, cache: "no-store" },
      renderer: null, assets: null, strict: false, quality: { tier: "high" }, degrade: () => undefined,
      environmentLighting: () => ({ color: [0, 0, 0], intensity: 0 }), collectedLights: [], runtimeWarnings: new Set()
    } as unknown as MountSceneCompileContext;
    let compiled: Awaited<ReturnType<typeof realCompilerImpl.compile>> | undefined;
    try {
      compiled = await realCompilerImpl.compile(snapshot, mount);
      const actor = liveTypedGLBActor("matcap-model", owner)!;
      expect(actor).toBeDefined();
      const shader = actor.collectRenderItems()[0]!.material as ReturnType<typeof createCustomShaderMaterial>;
      await vi.waitFor(() => expect((shader.getParameter("u_matcapMap") as TextureBinding).texture).not.toBeNull());
      expect(fetchMock.mock.calls.some(([input]) => String(input).includes("matcap.png"))).toBe(true);
      const request = fetchMock.mock.calls.find(([input]) => String(input).includes("matcap.png"))![1]!;
      expect(request.credentials).toBe("include");
      expect(new Headers(request.headers).get("x-model-policy")).toBe("private");
      const texture = (shader.getParameter("u_matcapMap") as TextureBinding).texture!;
      expect(texture.source).toBe(image);
      compiled.dispose();
      expect(texture.disposed).toBe(true);
      expect(image.close).toHaveBeenCalledTimes(1);
    } finally {
      compiled?.dispose();
      disposeActorAnimationContext(context);
      await awaitTypedGLBActorDisposals(owner);
    }
  });

  it("snapshots the app request before the actor's first await and uses each asset's own integrity", async () => {
    const fetchMock = stubModelAndTextureFetch();
    const image = bitmap();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => image));
    const headers = new Headers({ "x-policy": "original" });
    const pending = createTypedGLBActor({
      asset: actorAsset(), id: "snapshot-model", width: 64, height: 64,
      request: { ...actorRequest(), headers },
      customMaterialFactory: modelFactory()
    });
    headers.set("x-policy", "changed-after-creation");
    const actor = await pending;
    try {
      const textureRequest = fetchMock.mock.calls.find(([url]) => String(url).includes("matcap.png"))?.[1];
      expect(textureRequest).toBeDefined();
      expect(new Headers(textureRequest!.headers).get("x-policy")).toBe("original");
      expect(textureRequest!.credentials).toBe("include");
      expect(textureRequest!.cache).toBe("no-store");
      const shader = actor.collectRenderItems()[0]!.material as ReturnType<typeof createCustomShaderMaterial>;
      // The independently hashed image would fail if the model document hash or URL were inherited.
      expect((shader.getParameter("u_matcapMap") as TextureBinding).texture?.source).toBe(image);
    } finally { actor.dispose(); }
    expect(image.close).toHaveBeenCalledTimes(1);
  });

  it("does not leak a model-document-only request into a custom texture asset", async () => {
    const fetchMock = stubModelAndTextureFetch();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => bitmap()));
    const actor = await createTypedGLBActor({
      asset: { ...actorAsset(), request: { headers: { "x-model-only": "document" } } },
      id: "separate-policy", width: 64, height: 64, request: actorRequest(), customMaterialFactory: modelFactory()
    });
    try {
      const modelRequest = fetchMock.mock.calls.find(([url]) => String(url).includes("model.gltf"))?.[1];
      const imageRequest = fetchMock.mock.calls.find(([url]) => String(url).includes("matcap.png"))?.[1];
      expect(new Headers(modelRequest?.headers).get("x-model-only")).toBe("document");
      expect(new Headers(imageRequest?.headers).has("x-model-only")).toBe(false);
      expect((actor.collectRenderItems()[0]!.material as ReturnType<typeof createCustomShaderMaterial>)
        .getParameter("u_matcapMap")).toMatchObject({ texture: expect.objectContaining({ disposed: false }) });
    } finally { actor.dispose(); }
  });

  it("surfaces redacted texture failure and fallback warnings through actor inspection", async () => {
    stubModelAndTextureFetch(() => new Response("", { status: 503 }));
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    const actor = await createTypedGLBActor({
      asset: actorAsset(), id: "failed-texture", width: 64, height: 64, request: actorRequest(),
      customMaterialFactory: modelFactory("https://asset.invalid/matcap.png?signature=private-token")
    });
    try {
      const warnings = actor.inspectMaterials().flatMap((info) => info.warnings);
      expect(warnings.some((line) => line.includes("CUSTOM_TEXTURE_ASSET_LOAD_FAILED"))).toBe(true);
      expect(warnings.some((line) => line.includes("CUSTOM_TEXTURE_UNBOUND"))).toBe(true);
      expect(warnings.join(" ")).not.toContain("private-token");
      expect(decode).not.toHaveBeenCalled();
      const shader = actor.collectRenderItems()[0]!.material as ReturnType<typeof createCustomShaderMaterial>;
      expect((shader.getParameter("u_matcapMap") as TextureBinding).texture).toBeNull();
    } finally { actor.dispose(); }
  });

  it("applies the actor texture dimension limit and closes an oversized decoded bitmap", async () => {
    stubModelAndTextureFetch();
    const image = bitmap();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => image));
    const actor = await createTypedGLBActor({
      asset: actorAsset(), id: "limited-texture", width: 64, height: 64, request: actorRequest(),
      maxTextureSize: 1, customMaterialFactory: modelFactory()
    });
    try {
      const shader = actor.collectRenderItems()[0]!.material as ReturnType<typeof createCustomShaderMaterial>;
      expect((shader.getParameter("u_matcapMap") as TextureBinding).texture).toBeNull();
      expect(actor.inspectMaterials().flatMap((info) => info.warnings)
        .some((warning) => warning.includes("CUSTOM_TEXTURE_ASSET_LOAD_FAILED"))).toBe(true);
      expect(image.close).toHaveBeenCalledTimes(1);
    } finally { actor.dispose(); }
    expect(image.close).toHaveBeenCalledTimes(1);
  });

  it.each(["signal", "owner"] as const)(
    "does not publish an actor while texture decoding is pending or after %s cancellation",
    async (cancelBy) => {
      stubModelAndTextureFetch();
      const image = bitmap();
      let finishDecode: ((image: ImageBitmap) => void) | undefined;
      let delivered = false;
      const decode = vi.fn(() => new Promise<ImageBitmap>((resolve) => { finishDecode = resolve; }));
      vi.stubGlobal("createImageBitmap", decode);
      const owner = {};
      const animation = createActorAnimationContext();
      bindActorAnimationContext(owner, animation);
      const controller = new AbortController();
      const factory = modelFactory();
      let shader: ReturnType<typeof createCustomShaderMaterial> | undefined;
      const outcome = createTypedGLBActor({
        asset: actorAsset(), id: `pending-${cancelBy}`, width: 64, height: 64, runtimeOwner: owner,
        request: { ...actorRequest(), signal: controller.signal },
        customMaterialFactory: (context) => (shader = factory(context))
      }).then((actor) => ({ actor, error: undefined }), (error: unknown) => ({ actor: undefined, error }));
      try {
        await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
        expect(liveTypedGLBActor(`pending-${cancelBy}`, owner)).toBeUndefined();
        expect(shader?.disposed).toBe(false);
        if (cancelBy === "signal") controller.abort(new DOMException("mount cancelled", "AbortError"));
        else disposeActorAnimationContext(animation);
        expect(liveTypedGLBActor(`pending-${cancelBy}`, owner)).toBeUndefined();
        finishDecode!(image);
        delivered = true;
        const result = await outcome;
        expect(result.actor).toBeUndefined();
        expect(result.error).toMatchObject({ name: "AbortError" });
        expect(shader?.disposed).toBe(true);
        expect(image.close).toHaveBeenCalledTimes(1);
        expect(liveTypedGLBActor(`pending-${cancelBy}`, owner)).toBeUndefined();
      } finally {
        if (!delivered) finishDecode?.(image);
        disposeActorAnimationContext(animation);
        (await outcome).actor?.dispose();
        await awaitTypedGLBActorDisposals(owner);
      }
    }
  );

  it("publishes only a ready replacement and never lets a cancelled older actor remove it", async () => {
    stubModelAndTextureFetch();
    const images = [bitmap(), bitmap()];
    const finish: Array<(image: ImageBitmap) => void> = [];
    const decode = vi.fn(() => new Promise<ImageBitmap>((resolve) => { finish.push(resolve); }));
    vi.stubGlobal("createImageBitmap", decode);
    const owner = {};
    const animation = createActorAnimationContext();
    bindActorAnimationContext(owner, animation);
    const olderController = new AbortController();
    const older = createTypedGLBActor({
      asset: actorAsset(), id: "replaced-model", width: 64, height: 64, runtimeOwner: owner,
      request: { ...actorRequest(), signal: olderController.signal }, customMaterialFactory: modelFactory()
    }).then((actor) => ({ actor, error: undefined }), (error: unknown) => ({ actor: undefined, error }));
    let newer: Promise<{ actor: Awaited<ReturnType<typeof createTypedGLBActor>> | undefined; error: unknown }> | undefined;
    let oldFinished = false;
    let newFinished = false;
    try {
      await vi.waitFor(() => expect(finish).toHaveLength(1));
      newer = createTypedGLBActor({
        asset: actorAsset(), id: "replaced-model", width: 64, height: 64, runtimeOwner: owner,
        request: actorRequest(), customMaterialFactory: modelFactory()
      }).then((actor) => ({ actor, error: undefined }), (error: unknown) => ({ actor: undefined, error }));
      await vi.waitFor(() => expect(finish).toHaveLength(2));
      expect(liveTypedGLBActor("replaced-model", owner)).toBeUndefined();
      finish[1]!(images[1]!);
      newFinished = true;
      const replacement = (await newer).actor!;
      expect(replacement).toBeDefined();
      const shader = replacement.collectRenderItems()[0]!.material as ReturnType<typeof createCustomShaderMaterial>;
      expect((shader.getParameter("u_matcapMap") as TextureBinding).texture?.source).toBe(images[1]);
      expect(liveTypedGLBActor("replaced-model", owner)).toBe(replacement);
      olderController.abort();
      finish[0]!(images[0]!);
      oldFinished = true;
      expect((await older).error).toMatchObject({ name: "AbortError" });
      expect(images[0]!.close).toHaveBeenCalledTimes(1);
      expect(images[1]!.close).not.toHaveBeenCalled();
      expect(liveTypedGLBActor("replaced-model", owner)).toBe(replacement);
      replacement.dispose();
      expect(images[1]!.close).toHaveBeenCalledTimes(1);
    } finally {
      olderController.abort();
      if (!oldFinished) finish[0]?.(images[0]!);
      if (!newFinished) finish[1]?.(images[1]!);
      (await older).actor?.dispose();
      (await newer)?.actor?.dispose();
      disposeActorAnimationContext(animation);
      await awaitTypedGLBActorDisposals(owner);
    }
  });

  it("releases each actor's work before its material without disposing a borrowed texture", async () => {
    stubModelAndTextureFetch();
    const images = [bitmap(), bitmap()];
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValueOnce(images[0]).mockResolvedValueOnce(images[1]));
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/model.gltf", hash: hash(modelDocument) },
      map: { type: "texture", format: "png", url: "/matcap.png", hash: hash(imageBytes) }
    });
    const borrowed = textureFactory.data({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) });
    const source = publicMaterial.custom({
      glsl: { fragment: "out vec4 outColor; void main() { outColor = texture(map, vec2(0.5)) + texture(borrowed, vec2(0.5)); }" },
      uniforms: { map: { type: "texture2d", value: assets.map }, borrowed: { type: "texture2d", value: borrowed } }
    });
    const factory = applyModelTintBridge(model(assets.object, { material: source }).toJSON()).customMaterialFactory as
      (context: ModelCustomMaterialFactoryContext) => ReturnType<typeof createCustomShaderMaterial>;
    const events: string[] = [];
    const trackedFactory = (id: string) => (context: ModelCustomMaterialFactoryContext) => {
      const shader = factory({
        ...context,
        adoptTextureWork: (work) => context.adoptTextureWork({
          ready: work.ready, warnings: work.warnings,
          dispose: () => { events.push(`${id}-work`); work.dispose(); }
        })
      });
      const dispose = shader.dispose.bind(shader);
      shader.dispose = () => { events.push(`${id}-material`); dispose(); };
      return shader;
    };
    const first = await createTypedGLBActor({
      asset: actorAsset(), id: "first-owned", width: 64, height: 64, request: actorRequest(), customMaterialFactory: trackedFactory("first")
    });
    let second: Awaited<ReturnType<typeof createTypedGLBActor>> | undefined;
    try {
      second = await createTypedGLBActor({
        asset: actorAsset(), id: "second-owned", width: 64, height: 64, request: actorRequest(), customMaterialFactory: trackedFactory("second")
      });
      const firstShader = first.collectRenderItems()[0]!.material as ReturnType<typeof createCustomShaderMaterial>;
      const secondShader = second.collectRenderItems()[0]!.material as ReturnType<typeof createCustomShaderMaterial>;
      const firstTexture = (firstShader.getParameter("u_map") as TextureBinding).texture!;
      const secondTexture = (secondShader.getParameter("u_map") as TextureBinding).texture!;
      expect(firstTexture).not.toBe(secondTexture);
      expect((firstShader.getParameter("u_borrowed") as TextureBinding).texture).toBe(borrowed.texture);
      expect((secondShader.getParameter("u_borrowed") as TextureBinding).texture).toBe(borrowed.texture);
      first.dispose();
      first.dispose();
      expect(events.slice(0, 2)).toEqual(["first-work", "first-material"]);
      expect(firstTexture.disposed).toBe(true);
      expect(images[0]!.close).toHaveBeenCalledTimes(1);
      expect(secondTexture.disposed).toBe(false);
      expect(images[1]!.close).not.toHaveBeenCalled();
      expect(borrowed.texture.disposed).toBe(false);
      second.dispose();
      expect(events.slice(2)).toEqual(["second-work", "second-material"]);
      expect(secondTexture.disposed).toBe(true);
      expect(images[1]!.close).toHaveBeenCalledTimes(1);
      expect(borrowed.texture.disposed).toBe(false);
    } finally {
      first.dispose();
      second?.dispose();
      borrowed.dispose();
    }
  });

  it("aborts peer work on a readiness error and waits for its cleanup before rejecting", async () => {
    stubModelAndTextureFetch();
    const owner = {};
    const animation = createActorAnimationContext();
    bindActorAnimationContext(owner, animation);
    let rejectFirst!: (error: Error) => void;
    let finishPeer!: () => void;
    let signal: AbortSignal | undefined;
    let shader: ReturnType<typeof createCustomShaderMaterial> | undefined;
    const events: string[] = [];
    const firstReady = new Promise<void>((_, reject) => { rejectFirst = reject; });
    const peerReady = new Promise<void>((resolve) => { finishPeer = resolve; });
    let settled = false;
    const outcome = createTypedGLBActor({
      asset: actorAsset(), id: "readiness-failure", width: 64, height: 64, runtimeOwner: owner, request: actorRequest(),
      customMaterialFactory: (context) => {
        signal = context.signal;
        context.adoptTextureWork({ ready: firstReady, warnings: [], dispose: () => { events.push("first-work"); } });
        context.adoptTextureWork({ ready: peerReady, warnings: [], dispose: () => { events.push("peer-work"); } });
        shader = createCustomShaderMaterial({ glsl: { fragment: "out vec4 outColor; void main(){outColor=vec4(1.0);}" } });
        const dispose = shader.dispose.bind(shader);
        shader.dispose = () => { events.push("material"); dispose(); };
        return shader;
      }
    }).then((actor) => ({ actor, error: undefined }), (error: unknown) => ({ actor: undefined, error }));
    void outcome.then(() => { settled = true; });
    try {
      await vi.waitFor(() => expect(signal).toBeDefined());
      rejectFirst(new Error("texture readiness failed"));
      await vi.waitFor(() => expect(signal?.aborted).toBe(true));
      expect(settled).toBe(false);
      expect(events).toEqual(["first-work", "peer-work"]);
      expect(liveTypedGLBActor("readiness-failure", owner)).toBeUndefined();
      finishPeer();
      const result = await outcome;
      expect(result.error).toMatchObject({ message: "texture readiness failed" });
      expect(events).toEqual(["first-work", "peer-work", "material"]);
      expect(shader?.disposed).toBe(true);
      expect(liveTypedGLBActor("readiness-failure", owner)).toBeUndefined();
    } finally {
      finishPeer();
      (await outcome).actor?.dispose();
      disposeActorAnimationContext(animation);
      await awaitTypedGLBActorDisposals(owner);
    }
  });

  it.each([false, true])(
    "actively disposes pending work on cancellation and retains cleanup failure=%s",
    async (failCleanup) => {
      stubModelAndTextureFetch();
      const controller = new AbortController();
      const reason = new DOMException("mount cancelled", "AbortError");
      let finish!: () => void;
      const ready = new Promise<void>((resolve) => { finish = resolve; });
      const events: string[] = [];
      let textureSignal: AbortSignal | undefined;
      let shader: ReturnType<typeof createCustomShaderMaterial> | undefined;
      const outcome = createTypedGLBActor({
        asset: actorAsset(), id: `cancel-cleanup-${failCleanup}`, width: 64, height: 64,
        request: { ...actorRequest(), signal: controller.signal },
        customMaterialFactory: (context) => {
          textureSignal = context.signal;
          context.adoptTextureWork({
            ready, warnings: [], dispose: () => {
              events.push("work");
              if (failCleanup) throw new Error("cancelled texture cleanup failed");
              finish();
            }
          });
          shader = createCustomShaderMaterial({ glsl: { fragment: "out vec4 outColor; void main(){outColor=vec4(1.0);}" } });
          const dispose = shader.dispose.bind(shader);
          shader.dispose = () => { events.push("material"); dispose(); };
          return shader;
        }
      }).then((actor) => ({ actor, error: undefined }), (error: unknown) => ({ actor: undefined, error }));
      try {
        await vi.waitFor(() => expect(textureSignal).toBeDefined());
        controller.abort(reason);
        const result = await outcome;
        expect(result.actor).toBeUndefined();
        expect(textureSignal?.aborted).toBe(true);
        expect(textureSignal?.reason).toBe(reason);
        expect(events).toEqual(["work", "material"]);
        expect(shader?.disposed).toBe(true);
        if (failCleanup) {
          expect(result.error).toBeInstanceOf(AggregateError);
          const error = result.error as AggregateError;
          expect(error.errors[0]).toBe(reason);
          expect((error.errors[1] as AggregateError).errors[0]).toMatchObject({ message: "cancelled texture cleanup failed" });
        } else expect(result.error).toBe(reason);
      } finally {
        finish();
        (await outcome).actor?.dispose();
      }
    }
  );

  it("disposes transferred work and waits for it to settle when the factory throws", async () => {
    stubModelAndTextureFetch();
    let finish!: () => void;
    const ready = new Promise<void>((resolve) => { finish = resolve; });
    const dispose = vi.fn();
    let settled = false;
    const outcome = createTypedGLBActor({
      asset: actorAsset(), id: "factory-failure", width: 64, height: 64, request: actorRequest(),
      customMaterialFactory: (context) => {
        context.adoptTextureWork({ ready, warnings: [], dispose });
        throw new Error("factory failed after adoption");
      }
    }).then((actor) => ({ actor, error: undefined }), (error: unknown) => ({ actor: undefined, error }));
    void outcome.then(() => { settled = true; });
    try {
      await vi.waitFor(() => expect(dispose).toHaveBeenCalledTimes(1));
      expect(settled).toBe(false);
      finish();
      expect((await outcome).error).toMatchObject({ message: "factory failed after adoption" });
    } finally {
      finish();
      (await outcome).actor?.dispose();
    }
  });

  it("releases loaded custom textures if actor extension initialization fails", async () => {
    stubModelAndTextureFetch();
    const image = bitmap();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => image));
    const owner = {};
    const animation = createActorAnimationContext();
    bindActorAnimationContext(owner, animation);
    const unregister = registerTypedGLBActorExtension({
      id: "test.custom-texture-onload-failure", owner: "test",
      onLoad: (actor) => { if (actor.id === "extension-failure") throw new Error("extension failed"); }
    });
    const factory = modelFactory();
    let shader: ReturnType<typeof createCustomShaderMaterial> | undefined;
    try {
      await expect(createTypedGLBActor({
        asset: actorAsset(), id: "extension-failure", width: 64, height: 64, runtimeOwner: owner, request: actorRequest(),
        customMaterialFactory: (context) => (shader = factory(context))
      })).rejects.toThrow("extension failed");
      expect(shader?.disposed).toBe(true);
      expect(image.close).toHaveBeenCalledTimes(1);
      expect(liveTypedGLBActor("extension-failure", owner)).toBeUndefined();
    } finally {
      unregister();
      disposeActorAnimationContext(animation);
      await awaitTypedGLBActorDisposals(owner);
    }
  });

  it("reports cleanup failure while still releasing peers and the custom material", async () => {
    stubModelAndTextureFetch();
    const events: string[] = [];
    let shader: ReturnType<typeof createCustomShaderMaterial> | undefined;
    const actor = await createTypedGLBActor({
      asset: actorAsset(), id: "texture-cleanup-failure", width: 64, height: 64, request: actorRequest(),
      customMaterialFactory: (context) => {
        context.adoptTextureWork({
          ready: Promise.resolve(), warnings: ["https://asset.invalid/image.png?signature=private-token"],
          dispose: () => { events.push("failed-work"); throw new Error("texture cleanup failed"); }
        });
        context.adoptTextureWork({
          ready: Promise.resolve(), warnings: [], dispose: () => { events.push("peer-work"); }
        });
        shader = createCustomShaderMaterial({ glsl: { fragment: "out vec4 outColor; void main(){outColor=vec4(1.0);}" } });
        const dispose = shader.dispose.bind(shader);
        shader.dispose = () => { events.push("material"); dispose(); };
        return shader;
      }
    });
    const warnings = actor.inspectMaterials().flatMap((info) => info.warnings);
    expect(warnings.join(" ")).not.toContain("private-token");
    expect(() => actor.dispose()).toThrow(/Model actor cleanup failed/);
    expect(events).toEqual(["failed-work", "peer-work", "material"]);
    expect(shader?.disposed).toBe(true);
    expect(() => actor.dispose()).not.toThrow();
  });

  it("rejects and releases work adopted after the synchronous factory boundary", async () => {
    stubModelAndTextureFetch();
    let adopt!: ModelCustomMaterialFactoryContext["adoptTextureWork"];
    const actor = await createTypedGLBActor({
      asset: actorAsset(), id: "late-adoption", width: 64, height: 64, request: actorRequest(),
      customMaterialFactory: (context) => {
        adopt = context.adoptTextureWork;
        return createCustomShaderMaterial({ glsl: { fragment: "out vec4 outColor; void main(){outColor=vec4(1.0);}" } });
      }
    });
    const dispose = vi.fn();
    try {
      expect(() => adopt({ ready: Promise.resolve(), warnings: [], dispose })).toThrow(/adopted during material creation/);
      expect(dispose).toHaveBeenCalledTimes(1);
    } finally { actor.dispose(); }
  });

  it("requires actor ownership rather than silently drawing an unbound typed asset", () => {
    const factory = modelFactory();
    expect(() => factory()).toThrow(/MODEL_CUSTOM_TEXTURE_CONTEXT_REQUIRED/);
  });

  it("uses the per-app request and independently owns each model bitmap", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response(imageBytes.slice().buffer as ArrayBuffer, { headers: { "content-type": "image/png" } }));
    vi.stubGlobal("fetch", fetchMock);
    const images = [bitmap(), bitmap()];
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValueOnce(images[0]).mockResolvedValueOnce(images[1]));
    const factory = modelFactory();
    const work: ModelCustomMaterialTextureWork[] = [];
    const headers = new Headers({ "x-test-policy": "first" });
    const first = factory({
      request: { credentials: "include", headers, securityContext: "owner-one", cache: "no-store" },
      adoptTextureWork: (lease) => work.push(lease)
    });
    headers.set("x-test-policy", "changed");
    const second = factory({
      request: { credentials: "omit", headers: { "x-test-policy": "second" }, cache: "no-store" },
      adoptTextureWork: (lease) => work.push(lease)
    });
    try {
      await Promise.all(work.map((lease) => lease.ready));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const firstRequest = fetchMock.mock.calls.find(([, init]) => init?.credentials === "include")![1]!;
      const secondRequest = fetchMock.mock.calls.find(([, init]) => init?.credentials === "omit")![1]!;
      expect(new Headers(firstRequest.headers).get("x-test-policy")).toBe("first");
      expect(new Headers(secondRequest.headers).get("x-test-policy")).toBe("second");
      const firstTexture = (first.getParameter("u_matcapMap") as TextureBinding).texture!;
      const secondTexture = (second.getParameter("u_matcapMap") as TextureBinding).texture!;
      expect(firstTexture).not.toBe(secondTexture);
      const firstImage = firstTexture.source as unknown as ReturnType<typeof bitmap>;
      const secondImage = secondTexture.source as unknown as ReturnType<typeof bitmap>;
      expect(images).toContain(firstImage);
      expect(images).toContain(secondImage);
      expect(firstImage).not.toBe(secondImage);
      expect(work.map((lease) => lease.warnings)).toEqual([[], []]);
      work[0]!.dispose();
      work[0]!.dispose();
      expect(firstTexture.disposed).toBe(true);
      expect(firstImage.close).toHaveBeenCalledTimes(1);
      expect(secondTexture.disposed).toBe(false);
      expect(secondImage.close).not.toHaveBeenCalled();
      work[1]!.dispose();
      expect(secondTexture.disposed).toBe(true);
      expect(secondImage.close).toHaveBeenCalledTimes(1);
    } finally {
      for (const lease of work) lease.dispose();
      first.dispose();
      second.dispose();
    }
  });

  it("aborts and closes a late-decoded model bitmap without publishing it", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(imageBytes.slice().buffer as ArrayBuffer, { headers: { "content-type": "image/png" } })));
    let finish!: (image: ImageBitmap) => void;
    const decode = vi.fn(() => new Promise<ImageBitmap>((resolve) => { finish = resolve; }));
    vi.stubGlobal("createImageBitmap", decode);
    const controller = new AbortController();
    let work!: ModelCustomMaterialTextureWork;
    const shader = modelFactory()({ signal: controller.signal, adoptTextureWork: (lease) => { work = lease; } });
    try {
      await vi.waitFor(() => expect(decode).toHaveBeenCalledTimes(1));
      let settled = false;
      void work.ready.then(() => { settled = true; });
      controller.abort();
      await Promise.resolve();
      expect(settled).toBe(false);
      const late = bitmap();
      finish(late);
      await work.ready;
      expect(late.close).toHaveBeenCalledTimes(1);
      expect((shader.getParameter("u_matcapMap") as TextureBinding).texture).toBeNull();
      expect(work.warnings).toEqual([]);
    } finally {
      work.dispose();
      shader.dispose();
    }
  });

  it("leaves a borrowed texture handle alive after a model custom-material lease is released", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(imageBytes.slice().buffer as ArrayBuffer, { headers: { "content-type": "image/png" } })));
    const image = bitmap();
    vi.stubGlobal("createImageBitmap", vi.fn(async () => image));
    const assets = defineAuraAssets({
      object: { type: "model", format: "gltf", url: "/model.gltf", hash: hash(modelDocument) },
      map: { type: "texture", format: "png", url: "/map.png", hash: hash(imageBytes) }
    });
    const borrowed = textureFactory.data({ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) });
    const source = publicMaterial.custom({
      glsl: { fragment: "out vec4 outColor; void main() { outColor = texture(map, vec2(0.5)) + texture(borrowed, vec2(0.5)); }" },
      uniforms: { map: { type: "texture2d", value: assets.map }, borrowed: { type: "texture2d", value: borrowed } }
    });
    const bridge = applyModelTintBridge(model(assets.object, { material: source }).toJSON());
    const factory = bridge.customMaterialFactory as (context: ModelCustomMaterialFactoryContext) => ReturnType<typeof createCustomShaderMaterial>;
    let work!: ModelCustomMaterialTextureWork;
    const shader = factory({ adoptTextureWork: (lease) => { work = lease; } });
    try {
      await work.ready;
      const texture = (shader.getParameter("u_map") as TextureBinding).texture!;
      expect((shader.getParameter("u_borrowed") as TextureBinding).texture).toBe(borrowed.texture);
      work.dispose();
      expect(texture.disposed).toBe(true);
      expect(image.close).toHaveBeenCalledTimes(1);
      expect(borrowed.texture.disposed).toBe(false);
    } finally {
      work.dispose();
      shader.dispose();
      borrowed.dispose();
    }
  });

  it("reports a missing URL without claiming an image was fetched", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let work!: ModelCustomMaterialTextureWork;
    const shader = modelFactory("")({ adoptTextureWork: (lease) => { work = lease; } });
    try {
      await work.ready;
      expect(fetchMock).not.toHaveBeenCalled();
      expect(work.warnings.some((line) => line.includes("CUSTOM_TEXTURE_ASSET_URL_MISSING"))).toBe(true);
      expect(work.warnings.some((line) => line.includes("CUSTOM_TEXTURE_UNBOUND"))).toBe(true);
    } finally {
      work.dispose();
      shader.dispose();
    }
  });

  it("retains a cleanup failure after cancellation instead of treating disposal as successful", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(imageBytes.slice().buffer as ArrayBuffer, { headers: { "content-type": "image/png" } })));
    const image = bitmap();
    image.close.mockImplementation(() => { throw new Error("bitmap cleanup failed"); });
    vi.stubGlobal("createImageBitmap", vi.fn(async () => image));
    const controller = new AbortController();
    let work!: ModelCustomMaterialTextureWork;
    const shader = modelFactory()({ signal: controller.signal, adoptTextureWork: (lease) => { work = lease; } });
    try {
      await work.ready;
      controller.abort();
      expect(work.warnings.some((line) => line.includes("CUSTOM_TEXTURE_CLEANUP_FAILED"))).toBe(true);
      expect(() => work.dispose()).toThrow("bitmap cleanup failed");
      expect(image.close).toHaveBeenCalledTimes(1);
    } finally {
      shader.dispose();
    }
  });

  it("retains redacted model texture failure and fallback diagnostics", async () => {
    vi.stubGlobal("crypto", webcrypto);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 503 })));
    const decode = vi.fn();
    vi.stubGlobal("createImageBitmap", decode);
    let work!: ModelCustomMaterialTextureWork;
    const shader = modelFactory("https://asset.invalid/matcap.png?signature=private")({
      adoptTextureWork: (lease) => { work = lease; }
    });
    try {
      await work.ready;
      expect(decode).not.toHaveBeenCalled();
      expect((shader.getParameter("u_matcapMap") as TextureBinding).texture).toBeNull();
      expect(work.warnings.some((line) => line.includes("CUSTOM_TEXTURE_ASSET_LOAD_FAILED"))).toBe(true);
      expect(work.warnings.some((line) => line.includes("CUSTOM_TEXTURE_UNBOUND"))).toBe(true);
      expect(work.warnings.join(" ")).not.toContain("private");
      expect(work.warnings.join(" ")).not.toMatch(/404|missing image/i);
    } finally {
      work.dispose();
      shader.dispose();
    }
  });

  it("loads the asset url and binds a real texture, then releases it on dispose", async () => {
    const image = bitmap();
    loader.mockResolvedValue(image);
    const { material, resource, entries, warnings, warn } = fixture(assetRef("/diffuse.png"));
    expect(bindingOf(material).texture).toBeNull();
    await upgradeCustomMaterialTextures(entries, warn, loader);
    expect(loader).toHaveBeenCalledWith("/diffuse.png");
    const binding = bindingOf(material);
    expect(binding.texture).not.toBeNull();
    expect(binding.texture!.width).toBe(2);
    expect(binding.texture!.colorSpace).toBe("linear");
    expect(warnings).toEqual([]);
    expect(material.customDiagnostics).toEqual([]);
    expect(resource.textureDisposer).toBeTypeOf("function");
    const texture = binding.texture!;
    resource.textureDisposer!();
    expect(texture.disposed).toBe(true);
    expect(image.close).toHaveBeenCalledTimes(1);
    material.dispose();
  });

  it("runs once per resource", async () => {
    loader.mockResolvedValue(bitmap());
    const { material, entries, warn } = fixture(assetRef("/diffuse.png"));
    await upgradeCustomMaterialTextures(entries, warn, loader);
    await upgradeCustomMaterialTextures(entries, warn, loader);
    expect(loader).toHaveBeenCalledTimes(1);
    material.dispose();
  });

  it("an asset without a url is named and keeps the white fallback", async () => {
    const { material, resource, entries, warnings, warn } = fixture(assetRef(undefined));
    await upgradeCustomMaterialTextures(entries, warn, loader);
    expect(loader).not.toHaveBeenCalled();
    expect(warnings.some((line) => line.includes("[CUSTOM_TEXTURE_ASSET_URL_MISSING]"))).toBe(true);
    expect(warnings.some((line) => line.includes("[CUSTOM_TEXTURE_UNBOUND]"))).toBe(true);
    expect(resource.textureWarnings.some((line) => line.includes("[CUSTOM_TEXTURE_UNBOUND]"))).toBe(true);
    expect(bindingOf(material).texture).toBeNull();
    material.dispose();
  });

  it("a failed load is named and keeps the white fallback", async () => {
    loader.mockRejectedValue(new Error("404"));
    const { material, entries, warnings, warn } = fixture(assetRef("/missing.png"));
    await upgradeCustomMaterialTextures(entries, warn, loader);
    expect(warnings.some((line) => line.includes("[CUSTOM_TEXTURE_ASSET_LOAD_FAILED]") && line.includes("404"))).toBe(true);
    expect(warnings.some((line) => line.includes("[CUSTOM_TEXTURE_UNBOUND]"))).toBe(true);
    expect(bindingOf(material).texture).toBeNull();
    material.dispose();
  });

  it("a material disposed while the image loads binds nothing and releases the bitmap", async () => {
    const image = bitmap();
    let finish: (value: ImageBitmap) => void = () => undefined;
    loader.mockReturnValue(new Promise<ImageBitmap>((resolve) => { finish = resolve; }));
    const { material, resource, entries, warn } = fixture(assetRef("/diffuse.png"));
    const pending = upgradeCustomMaterialTextures(entries, warn, loader);
    material.dispose();
    finish(image);
    await pending;
    expect(image.close).toHaveBeenCalledTimes(1);
    expect(resource.textureDisposer).toBeUndefined();
  });

  it("an entry removed in place while an earlier one loads does not make the pass skip the next entry", async () => {
    let finishFirst: (value: ImageBitmap) => void = () => undefined;
    loader.mockImplementation((url) => url === "/first.png"
      ? new Promise<ImageBitmap>((resolve) => { finishFirst = resolve; })
      : Promise.resolve(bitmap()));
    const first = fixture(assetRef("/first.png"));
    const second = fixture(assetRef("/second.png"));
    // The compiled scene's live array: `removeSubtree` compacts it in place while the pass awaits the first image.
    const live = [first.entries[0], second.entries[0]] as ProductionRuntimePrimitiveEntry[];
    const pending = upgradeCustomMaterialTextures(live, second.warn, loader);
    await vi.waitFor(() => expect(loader).toHaveBeenCalledWith("/first.png"));
    live.splice(0, 1);
    finishFirst(bitmap());
    await pending;
    expect(loader).toHaveBeenCalledWith("/second.png");
    expect(bindingOf(second.material).texture).not.toBeNull();
    first.material.dispose();
    second.material.dispose();
  });

  it("a handle-bound uniform needs no load and raises no warning", async () => {
    const { texture } = await import("../../../packages/engine/src/agent-api/nodes/texture.js");
    const handle = texture.data({ width: 2, height: 2, data: new Uint8Array(16).fill(255) });
    const { material, entries, warnings, warn } = fixture(handle);
    await upgradeCustomMaterialTextures(entries, warn, loader);
    expect(loader).not.toHaveBeenCalled();
    expect(warnings).toEqual([]);
    expect(bindingOf(material).texture).toBe(handle.texture);
    material.dispose();
  });
});
