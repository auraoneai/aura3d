import { afterEach, describe, expect, it, vi } from "vitest";
import { createHash, webcrypto } from "node:crypto";
import { GLTFLoader } from "../../packages/assets/src/GLTFLoader";
import { createGLTFRenderResources, GLTFTextureLoadError, imageColorSpaceIntent, type GLTFImageDecoder } from "../../packages/assets/src/GLTFRenderResources";
import { GLTFSharedTextureCache } from "../../packages/assets/src/GLTFSharedTextureCache";
import { LoadContext } from "../../packages/assets/src/LoadContext";
import { AssetIntegrityError } from "../../packages/assets/src/LoaderFetch";
import { TextureBinding } from "../../packages/rendering/src/TextureBinding";
import { resetTextureBudgetLedger, textureBudgetReport } from "../../packages/rendering/src/textures/TextureBudget";

const sha = (input: string) => createHash("sha256").update(input).digest("hex");
const pixel = () => ({ width: 1, height: 1, data: new Uint8Array([64, 128, 192, 255]) });

function documentFor(materials: unknown[], images = [{ uri: "data:image/png;base64,AA==" }, { uri: "data:image/png;base64,AA==" }]) {
  return { asset: { version: "2.0" }, extensionsUsed: ["KHR_materials_diffuse_roughness", "EXT_materials_bump", "KHR_texture_transform"],
    images, textures: images.map((_, source) => ({ source })), materials, scenes: [{ nodes: [] }], scene: 0 };
}
async function loadInline(materials: unknown[]) {
  const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(documentFor(materials)))}`;
  return new GLTFLoader().load({ url, type: "gltf" }, new LoadContext());
}
async function loadIridescence(extension: unknown, extraExtensions: Record<string, unknown> = {}) {
  const doc = { asset: { version: "2.0" }, extensionsUsed: ["KHR_materials_iridescence"],
    images: [{ uri: "data:image/png;base64,AA==" }], textures: [{ source: 0 }],
    materials: [{ extensions: { ...extraExtensions, KHR_materials_iridescence: extension } }], scenes: [{ nodes: [] }], scene: 0 };
  return new GLTFLoader().load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(doc))}` }, new LoadContext());
}

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); resetTextureBudgetLedger(); });

describe("glTF material resource integration", () => {
  it("preserves valid iridescence IORs and reversed thin-film endpoints", async () => {
    const asset = await loadIridescence({ iridescenceFactor: 0.8, iridescenceIor: 4,
      iridescenceThicknessMinimum: 500, iridescenceThicknessMaximum: 200 });
    expect(asset.materials[0]!.iridescence).toMatchObject({ factor: 0.8, ior: 4, thicknessMinimum: 500, thicknessMaximum: 200 });
    expect(asset.toJSON().materials[0]!.iridescence).toEqual(asset.materials[0]!.iridescence);
    const highIor = await loadIridescence({ iridescenceIor: 1000 });
    expect(highIor.materials[0]!.iridescence?.ior).toBe(1000);
    const atMinimum = await loadIridescence({ iridescenceIor: 1, iridescenceThicknessMinimum: 0, iridescenceThicknessMaximum: 0 });
    expect(atMinimum.materials[0]!.iridescence).toMatchObject({ ior: 1, thicknessMinimum: 0, thicknessMaximum: 0 });
    const defaulted = await loadIridescence({ iridescenceThicknessMinimum: 500 });
    expect(defaulted.materials[0]!.iridescence).toMatchObject({ factor: 0, ior: 1.3, thicknessMinimum: 500, thicknessMaximum: 400 });
  });

  it.each([false, true])("passes unbounded IOR and reversed endpoints through material resources with texture=%s", async (textured) => {
    const asset = await loadIridescence({ iridescenceFactor: 0.8, iridescenceIor: 4,
      iridescenceThicknessMinimum: 500, iridescenceThicknessMaximum: 200,
      ...(textured ? { iridescenceTexture: { index: 0 } } : {}) });
    const resources = await createGLTFRenderResources(asset, { imageDecoder: pixel });
    const material = resources.materialLibrary.get("material-0")!;
    expect(material.getParameter("u_iridescenceIor")).toBe(4);
    expect(material.getParameter("u_iridescenceThicknessMinimum")).toBe(500);
    expect(material.getParameter("u_iridescenceThicknessMaximum")).toBe(200);
    if (textured) expect(material.getParameter("u_iridescenceTexture")).toBeInstanceOf(TextureBinding);
    resources.dispose();
  });

  it.each([
    ["iridescenceIor", 0.99], ["iridescenceIor", null], ["iridescenceIor", "1.5"],
    ["iridescenceFactor", null], ["iridescenceFactor", 1.01], ["iridescenceThicknessMinimum", null],
    ["iridescenceThicknessMaximum", null], ["iridescenceThicknessMinimum", -1],
    ["iridescenceThicknessMaximum", -1], ["iridescenceTexture", null], ["iridescenceThicknessTexture", []]
  ])("rejects invalid iridescence property %s = %j", async (property, value) => {
    await expect(loadIridescence({ [property]: value })).rejects.toThrow(`KHR_materials_iridescence.${property}`);
  });

  it.each([null, [], 0, "invalid"])("rejects non-object iridescence payload %j", async (payload) => {
    await expect(loadIridescence(payload)).rejects.toThrow("KHR_materials_iridescence must be an object");
  });

  it.each(["iridescenceFactor", "iridescenceIor", "iridescenceThicknessMinimum", "iridescenceThicknessMaximum"])(
    "rejects non-finite %s decoded from JSON", async (property) => {
      const json = `{"asset":{"version":"2.0"},"materials":[{"extensions":{"KHR_materials_iridescence":{"${property}":1e400}}}]}`;
      const url = `data:model/gltf+json,${encodeURIComponent(json)}`;
      await expect(new GLTFLoader().load({ url }, new LoadContext())).rejects.toThrow(`KHR_materials_iridescence.${property}`);
    }
  );

  it.each(["KHR_materials_unlit", "KHR_materials_pbrSpecularGlossiness"])(
    "rejects iridescence on the incompatible %s material model", async (name) => {
      await expect(loadIridescence({}, { [name]: {} })).rejects.toThrow("KHR_materials_iridescence cannot be combined");
    }
  );

  it("builds scalar and linear map bindings with the authored sampler, transform and UV selection", async () => {
    const asset = await loadInline([
      { name: "surface", extensions: {
        KHR_materials_diffuse_roughness: { diffuseRoughnessFactor: 0.4, diffuseRoughnessTexture: { index: 0, texCoord: 0, extensions: { KHR_texture_transform: { texCoord: 1, offset: [0.2, 0.3], scale: [2, 3], rotation: 0.5 } } } },
        EXT_materials_bump: { bumpFactor: 2.5, bumpTexture: { index: 1, texCoord: 1 } }
      } },
      { name: "scalar", extensions: { KHR_materials_diffuse_roughness: { diffuseRoughnessFactor: 0.7 } } }
    ]);
    const resources = await createGLTFRenderResources(asset, { imageDecoder: pixel });
    const surface = resources.materialLibrary.get("surface")!;
    const scalar = resources.materialLibrary.get("scalar")!;
    const rough = surface.getParameter("u_diffuseRoughnessTexture") as TextureBinding;
    const bump = surface.getParameter("u_bumpTexture") as TextureBinding;
    expect(rough).toBeInstanceOf(TextureBinding);
    expect(bump).toBeInstanceOf(TextureBinding);
    expect([rough.texture?.colorSpace, bump.texture?.colorSpace]).toEqual(["linear", "linear"]);
    expect(surface.getParameter("u_diffuseRoughness")).toBe(0.4);
    expect(surface.getParameter("u_diffuseRoughnessTextureEnabled")).toBe(1);
    expect(surface.getParameter("u_diffuseRoughnessTextureTexCoord")).toBe(1);
    expect(surface.getParameter("u_diffuseRoughnessTextureOffset")).toEqual([0.2, 0.3]);
    expect(surface.getParameter("u_diffuseRoughnessTextureScale")).toEqual([2, 3]);
    expect(surface.getParameter("u_diffuseRoughnessTextureRotation")).toBe(0.5);
    expect(surface.getParameter("u_bumpFactor")).toBe(2.5);
    expect(surface.getParameter("u_bumpTextureEnabled")).toBe(1);
    expect(surface.getParameter("u_bumpTextureTexCoord")).toBe(1);
    expect(scalar.getParameter("u_diffuseRoughness")).toBe(0.7);
    expect(scalar.getParameter("u_diffuseRoughnessTextureEnabled")).toBe(0);
    expect(scalar.getParameter("u_bumpTextureEnabled")).toBe(0);
    expect(imageColorSpaceIntent(asset).intent.get(0)).toBe("linear");
    expect(imageColorSpaceIntent(asset).intent.get(1)).toBe("linear");
    resources.dispose();
    expect(rough.texture?.disposed).toBe(true);
    expect(bump.texture?.disposed).toBe(true);
  });

  it("retains variant UV attributes when a new detail map is selected at runtime", async () => {
    const floats = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0.2, 0.3, 0.4, 0.6, 0.8, 0.9]);
    const bytes = Buffer.from(floats.buffer);
    const doc = {
      asset: { version: "2.0" }, extensionsUsed: ["KHR_materials_variants", "EXT_materials_bump"],
      extensions: { KHR_materials_variants: { variants: [{ name: "detail" }] } },
      buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }, { buffer: 0, byteOffset: 60, byteLength: 24 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" }, { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }],
      images: [{ uri: "data:image/png;base64,AA==" }], textures: [{ source: 0 }],
      materials: [{ name: "base" }, { name: "detail", extensions: { EXT_materials_bump: { bumpFactor: 3, bumpTexture: { index: 0, texCoord: 1 } } } }],
      meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2 }, material: 0,
        extensions: { KHR_materials_variants: { mappings: [{ material: 1, variants: [0] }] } } }] }],
      nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
    };
    const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(doc))}`;
    const asset = await new GLTFLoader().load({ url }, new LoadContext());
    const resources = await createGLTFRenderResources(asset, { imageDecoder: pixel });
    const geometry = resources.geometryLibrary.get("triangle")!;
    expect(geometry.vertexBuffer.getAttribute(2, "uv1").map((value) => Number(value.toFixed(2)))).toEqual([0.8, 0.9]);
    expect(await resources.setMaterialVariant("detail")).toBe("applied");
    const key = resources.scene.collectRenderables()[0]!.renderable.material;
    const detail = resources.materialLibrary.get(key)!;
    expect(detail.getParameter("u_bumpFactor")).toBe(3);
    expect(detail.getParameter("u_bumpTextureTexCoord")).toBe(1);
    expect(detail.requiredAttributes).toContain("a_uv1");
    resources.dispose();

    // A new runtime contract can require asynchronous material construction.
    const raced = await createGLTFRenderResources(asset, { imageDecoder: pixel });
    const renderable = raced.scene.collectRenderables()[0]!.renderable;
    (renderable as { instanceTransforms?: Float32Array }).instanceTransforms = new Float32Array([
      1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1
    ]);
    const authoredKey = renderable.material;
    const pending = raced.setMaterialVariant("detail");
    raced.dispose();
    const materialsAtDisposal = [...raced.materialLibrary.keys()];
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect([...raced.materialLibrary.keys()]).toEqual(materialsAtDisposal);
    expect(renderable.material).toBe(authoredKey);
    expect([...raced.materialLibrary.values()].every((material) => material.disposed)).toBe(true);
    raced.dispose();

    const missing = structuredClone(doc);
    delete (missing.meshes[0]!.primitives[0]!.attributes as { TEXCOORD_1?: number }).TEXCOORD_1;
    await expect(new GLTFLoader().load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(missing))}` }, new LoadContext()))
      .rejects.toThrow(/material detail references missing TEXCOORD_1/);
  });

  it("selects an instanced material with the extension maps and their UV attributes", async () => {
    const floats = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0.2, 0.3, 0.4, 0.6, 0.8, 0.9, 0, 0, 0]);
    const bytes = Buffer.from(floats.buffer);
    const doc = {
      asset: { version: "2.0" }, extensionsUsed: ["EXT_mesh_gpu_instancing", "EXT_materials_bump"],
      buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
      bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }, { buffer: 0, byteOffset: 60, byteLength: 24 }, { buffer: 0, byteOffset: 84, byteLength: 12 }],
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" }, { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }, { bufferView: 3, componentType: 5126, count: 1, type: "VEC3" }],
      images: [{ uri: "data:image/png;base64,AA==" }], textures: [{ source: 0 }],
      materials: [{ name: "instanced", extensions: { EXT_materials_bump: { bumpFactor: 2, bumpTexture: { index: 0, texCoord: 1 } } } }],
      meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2 }, material: 0 }] }],
      nodes: [{ mesh: 0, extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 3 } } } }], scenes: [{ nodes: [0] }], scene: 0
    };
    const asset = await new GLTFLoader().load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(doc))}` }, new LoadContext());
    const resources = await createGLTFRenderResources(asset, { imageDecoder: pixel });
    const renderable = resources.scene.collectRenderables()[0]!.renderable;
    const material = resources.materialLibrary.get(renderable.material)!;
    expect(renderable.instanceTransforms).toBeInstanceOf(Float32Array);
    expect(material.shaderKey).toMatch(/instanced/i);
    expect(material.requiredAttributes).toContain("a_uv1");
    expect(material.getParameter("u_bumpFactor")).toBe(2);
    expect(material.getParameter("u_bumpTexture")).toBeInstanceOf(TextureBinding);
    resources.dispose();
  });

  it("passes detail maps and secondary UVs into a skinned material's constructor", async () => {
    const f32 = (values: number[]) => Buffer.from(new Float32Array(values).buffer);
    const blocks = [f32([-1, 0, 0, 1, 0, 0, 0, 1, 0]), f32([0, 0, 1, 0, 0, 1]),
      f32([0.2, 0.3, 0.4, 0.6, 0.8, 0.9]), Buffer.alloc(12), f32([1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0])];
    const bytes = Buffer.concat(blocks);
    let offset = 0;
    const bufferViews = blocks.map((block) => { const view = { buffer: 0, byteOffset: offset, byteLength: block.length }; offset += block.length; return view; });
    const doc = {
      asset: { version: "2.0" }, extensionsUsed: ["KHR_materials_diffuse_roughness"],
      buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }], bufferViews,
      accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" },
        { bufferView: 2, componentType: 5126, count: 3, type: "VEC2" }, { bufferView: 3, componentType: 5121, count: 3, type: "VEC4" },
        { bufferView: 4, componentType: 5126, count: 3, type: "VEC4" }],
      images: [{ uri: "data:image/png;base64,AA==" }], textures: [{ source: 0 }],
      materials: [{ name: "skin", extensions: { KHR_materials_diffuse_roughness: { diffuseRoughnessFactor: 0.65, diffuseRoughnessTexture: { index: 0, texCoord: 1 } } } }],
      meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 2, JOINTS_0: 3, WEIGHTS_0: 4 }, material: 0 }] }],
      skins: [{ joints: [1] }], nodes: [{ mesh: 0, skin: 0 }, { name: "joint" }], scenes: [{ nodes: [0, 1] }], scene: 0
    };
    const asset = await new GLTFLoader().load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(doc))}` }, new LoadContext());
    const resources = await createGLTFRenderResources(asset, { imageDecoder: pixel });
    const renderable = resources.scene.collectRenderables()[0]!.renderable;
    const material = resources.materialLibrary.get(renderable.material)!;
    expect(renderable.skinning?.jointCount).toBe(1);
    expect(material.shaderKey).toMatch(/skinned/i);
    expect(material.requiredAttributes).toContain("a_uv1");
    expect(material.getParameter("u_diffuseRoughness")).toBe(0.65);
    expect(material.getParameter("u_diffuseRoughnessTexture")).toBeInstanceOf(TextureBinding);
    resources.dispose();
  });

  it("reports one fallback for concurrent users and rejects structured errors in strict mode", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const materials = ["a", "b"].map((name) => ({ name, pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }));
    const asset = await loadInline(materials);
    const decode = vi.fn(async () => { throw new Error("decode failed"); });
    const resources = await createGLTFRenderResources(asset, { imageDecoder: decode });
    expect(decode).toHaveBeenCalledTimes(1);
    expect(resources.loadIssues).toEqual([expect.objectContaining({ code: "texture-load-failed", textureIndex: 0, imageIndex: 0, reason: "decode failed", fallback: true })]);
    resources.dispose();
    const failure = await createGLTFRenderResources(asset, { imageDecoder: decode, failOnMissingTexture: true }).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(GLTFTextureLoadError);
    expect((failure as GLTFTextureLoadError).issue).toMatchObject({ code: "texture-load-failed", fallback: false, imageIndex: 0 });
    await expect(createGLTFRenderResources(asset, { imageDecoder: () => { throw new AssetIntegrityError("bad digest"); } })).rejects.toBeInstanceOf(AssetIntegrityError);
  });

  it("isolates shared texture caches by asset and decoder and releases private budget entries", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const first = await loadInline([{ name: "a", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }]);
    const second = await loadInline([{ name: "b", pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }]);
    const shared = new GLTFSharedTextureCache();
    const decode = vi.fn(pixel);
    const a = await createGLTFRenderResources(first, { sharedTextures: shared, imageDecoder: decode, textureBudget: 64, request: { credentials: "omit" } });
    const b = await createGLTFRenderResources(second, { sharedTextures: shared, imageDecoder: decode, textureBudget: 64, request: { credentials: "omit" } });
    expect(decode).toHaveBeenCalledTimes(2);
    expect(textureBudgetReport().textureBytes).toBe(8);
    a.dispose();
    expect(textureBudgetReport().textureBytes).toBe(8);
    b.dispose();
    // Cache disposal follows settled promise callbacks.
    await Promise.resolve();
    expect(textureBudgetReport().textureBytes).toBe(0);
  });

  it("does not share decoded textures across distinct request overrides", async () => {
    const asset = await loadInline([{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }]);
    const sharedTextures = new GLTFSharedTextureCache();
    const contexts: string[] = [];
    const imageDecoder: GLTFImageDecoder = (_image, _index, _asset, context) => {
      contexts.push(new Headers(context?.request?.headers).get("x-tenant") ?? "missing");
      return pixel();
    };
    const first = await createGLTFRenderResources(asset, { sharedTextures, imageDecoder, request: { headers: { "X-Tenant": "first" } } });
    const second = await createGLTFRenderResources(asset, { sharedTextures, imageDecoder, request: { headers: { "X-Tenant": "second" } } });
    const firstMap = first.materialLibrary.get("material-0")!.getParameter("u_baseColorTexture") as TextureBinding;
    const secondMap = second.materialLibrary.get("material-0")!.getParameter("u_baseColorTexture") as TextureBinding;
    expect(contexts).toEqual(["first", "second"]);
    expect(firstMap.texture).not.toBe(secondMap.texture);
    first.dispose();
    expect(firstMap.texture?.disposed).toBe(true);
    expect(secondMap.texture?.disposed).toBe(false);
    second.dispose();
  });

  it("fails promptly on cancellation and closes a late decoder result", async () => {
    const asset = await loadInline([{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }]);
    const controller = new AbortController();
    let resolve!: (value: ReturnType<typeof pixel> & { source: TexImageSource }) => void;
    const decoder = vi.fn(() => new Promise<ReturnType<typeof pixel> & { source: TexImageSource }>((done) => { resolve = done; }));
    const pending = createGLTFRenderResources(asset, { imageDecoder: decoder, signal: controller.signal });
    await vi.waitFor(() => expect(decoder).toHaveBeenCalledTimes(1));
    controller.abort(new Error("stop decode"));
    await expect(pending).rejects.toThrow("stop decode");
    const close = vi.fn();
    resolve({ ...pixel(), source: { close } as unknown as TexImageSource });
    await vi.waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  it("checks render-time dependency integrity before invoking a custom decoder", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const url = "https://example.test/models/scene.gltf";
    const doc = documentFor([{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }], [{ uri: "../images/pixel.png?token=secret" }]);
    const fetchMock = vi.fn(async (input: string) => new Response(input === url ? JSON.stringify(doc) : "tampered"));
    vi.stubGlobal("fetch", fetchMock);
    const asset = await new GLTFLoader().load({ url, headers: { Authorization: "token" } }, new LoadContext());
    const decode = vi.fn(pixel);
    await expect(createGLTFRenderResources(asset, { imageDecoder: decode, request: {
      integrity: { version: 1, digest: sha(JSON.stringify(doc)), dependencies: { "../images/pixel.png?token=secret": sha("expected") }, requireDependencies: true }
    } })).rejects.toBeInstanceOf(AssetIntegrityError);
    expect(decode).not.toHaveBeenCalled();
  });

  it("propagates document credentials, headers and progress to a deferred image", async () => {
    const url = "https://example.test/models/scene.gltf";
    const doc = documentFor([{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }], [{ uri: "../images/pixel.png" }]);
    const fetchMock = vi.fn(async (input: string, _init?: RequestInit) => new Response(input === url ? JSON.stringify(doc) : "pixels"));
    const close = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close })));
    const progress = vi.fn();
    const asset = await new GLTFLoader().load({ url, credentials: "include", headers: { Authorization: "Bearer private" }, cache: "no-store", priority: "high", onProgress: progress }, new LoadContext());
    const resources = await createGLTFRenderResources(asset);
    const [imageUrl, imageInit] = fetchMock.mock.calls[1]!;
    expect(imageUrl).toBe("https://example.test/images/pixel.png");
    expect(imageInit).toMatchObject({ credentials: "include", cache: "no-store", priority: "high", redirect: "error" });
    expect(new Headers(imageInit?.headers).get("authorization")).toBe("Bearer private");
    expect(progress).toHaveBeenCalledWith(expect.objectContaining({ url: imageUrl, phase: "complete", loadedBytes: 6 }));
    resources.dispose();
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps coalesced image requests alive when one resource caller cancels", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const url = "https://example.test/models/scene.gltf";
    const doc = documentFor([{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }], [{ uri: "../images/pixel.png" }]);
    let finishImage!: (response: Response) => void;
    const fetchMock = vi.fn((input: string) => input === url
      ? Promise.resolve(new Response(JSON.stringify(doc)))
      : new Promise<Response>((resolve) => { finishImage = resolve; }));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width: 1, height: 1, close: vi.fn() })));
    const asset = await new GLTFLoader().load({ url, credentials: "omit" }, new LoadContext());
    const first = new AbortController();
    const second = new AbortController();
    const sharedTextures = new GLTFSharedTextureCache();
    const cancelled = createGLTFRenderResources(asset, { signal: first.signal, sharedTextures });
    const remaining = createGLTFRenderResources(asset, { signal: second.signal, sharedTextures });
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    first.abort(new Error("cancel one"));
    await expect(cancelled).rejects.toThrow("cancel one");
    finishImage(new Response("pixels"));
    const resources = await remaining;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(resources.materialLibrary.get("material-0")?.getParameter("u_baseColorTextureEnabled")).toBe(1);
    resources.dispose();
  });
});
