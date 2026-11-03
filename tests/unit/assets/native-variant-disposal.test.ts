import { afterEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { GLTFLoader, type GLTFMaterialAsset } from "../../../packages/assets/src/GLTFLoader";
import { createGLTFRenderResources, type DecodedGLTFImage, type GLTFImageDecoder } from "../../../packages/assets/src/GLTFRenderResources";
import { GLTFSharedTextureCache } from "../../../packages/assets/src/GLTFSharedTextureCache";
import { LoadContext } from "../../../packages/assets/src/LoadContext";
import { createTypedGLBActor } from "../../../packages/engine/src/production-runtime/TypedGLBActor";
import { setTypedGLBActorQrFlags } from "../../../packages/engine/src/production-runtime/actor/extensions";
import { resolveQrFlags } from "../../../packages/engine/src/contracts/flags";
import { InstancedUnlitMaterial } from "../../../packages/rendering/src/InstancedUnlitMaterial";
import { Material } from "../../../packages/rendering/src/Material";
import { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function variantDocument() {
  const vertices = new Float32Array([-1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1]);
  const bytes = Buffer.from(vertices.buffer);
  return {
    asset: { version: "2.0" },
    extensionsUsed: ["KHR_materials_variants", "EXT_materials_bump"],
    extensions: { KHR_materials_variants: { variants: [{ name: "detail" }] } },
    buffers: [{ uri: `data:application/octet-stream;base64,${bytes.toString("base64")}`, byteLength: bytes.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3" }, { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" }],
    images: [{ uri: "data:image/png;base64,AA==" }], textures: [{ source: 0 }],
    materials: [{ name: "base" }, { name: "detail", extensions: {
      EXT_materials_bump: { bumpFactor: 1, bumpTexture: { index: 0 } }
    } }],
    meshes: [{ name: "triangle", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0,
      extensions: { KHR_materials_variants: { mappings: [{ material: 1, variants: [0] }] } } }] }],
    nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0
  };
}

function variantUrl() {
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(variantDocument()))}`;
}

async function assetWithDeferredVariantTexture() {
  const asset = await new GLTFLoader().load({ url: variantUrl() }, new LoadContext());
  const detail = asset.materials[1] as unknown as { bump?: GLTFMaterialAsset["bump"]; unlit: boolean };
  const bump = detail.bump;
  expect(bump?.texture).toBeDefined();
  // All authored materials normally load eagerly. Inject this combination
  // after parsing to exercise a material allocated before a late decode.
  delete detail.bump;
  detail.unlit = true;
  return { asset, enableTexture: () => { detail.bump = bump; } };
}

function makeInstanced(resources: Awaited<ReturnType<typeof createGLTFRenderResources>>) {
  const renderable = resources.scene.collectRenderables()[0]!.renderable;
  (renderable as { instanceTransforms?: Float32Array }).instanceTransforms = new Float32Array([
    1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1
  ]);
  return renderable;
}

const image = (close = () => {}): DecodedGLTFImage => ({
  width: 1, height: 1, data: new Uint8Array([10, 20, 30, 255]),
  source: { close } as unknown as TexImageSource
});

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("material variant lifecycle", () => {
  it("aborts a private decode and disposes both late image and partially built material", async () => {
    const { asset, enableTexture } = await assetWithDeferredVariantTexture();
    const started = deferred<void>();
    const decoded = deferred<DecodedGLTFImage>();
    let decoderSignal: AbortSignal | undefined;
    const decoder: GLTFImageDecoder = (_image, _index, _asset, context) => {
      decoderSignal = context?.signal;
      started.resolve();
      return decoded.promise;
    };
    const dispose = vi.spyOn(Material.prototype, "dispose");
    const resources = await createGLTFRenderResources(asset, { imageDecoder: decoder });
    enableTexture();
    const renderable = makeInstanced(resources);
    const original = renderable.material;
    const pending = resources.setMaterialVariant("detail");
    await started.promise;
    resources.dispose();
    const keys = [...resources.materialLibrary.keys()];
    const textures = [...resources.textureLibrary.keys()];
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(decoderSignal?.aborted).toBe(true);
    const close = vi.fn();
    decoded.resolve(image(close));
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(dispose.mock.contexts.some((material) => material instanceof InstancedUnlitMaterial && material.name === "detail")).toBe(true));
    expect([...resources.materialLibrary.keys()]).toEqual(keys);
    expect([...resources.textureLibrary.keys()]).toEqual(textures);
    expect(renderable.material).toBe(original);
    await expect(resources.setMaterialVariant(null)).rejects.toMatchObject({ name: "AbortError" });
    expect(() => resources.dispose()).not.toThrow();
  });

  it("does not cancel a shared decode or dispose its texture while another consumer needs it", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const { asset, enableTexture } = await assetWithDeferredVariantTexture();
    const cache = new GLTFSharedTextureCache();
    const started = deferred<void>();
    const decoded = deferred<DecodedGLTFImage>();
    const decoder = vi.fn<GLTFImageDecoder>(() => { started.resolve(); return decoded.promise; });
    const first = await createGLTFRenderResources(asset, { imageDecoder: decoder, sharedTextures: cache, request: { credentials: "omit" } });
    const second = await createGLTFRenderResources(asset, { imageDecoder: decoder, sharedTextures: cache, request: { credentials: "omit" } });
    enableTexture();
    const firstRenderable = makeInstanced(first);
    const secondRenderable = makeInstanced(second);
    const original = firstRenderable.material;
    const firstPending = first.setMaterialVariant("detail");
    const secondPending = second.setMaterialVariant("detail");
    await started.promise;
    expect(decoder).toHaveBeenCalledOnce();
    first.dispose();
    first.dispose();
    await expect(firstPending).rejects.toMatchObject({ name: "AbortError" });
    expect(cache.refCount).toBe(1);
    const firstKeys = [...first.materialLibrary.keys()];
    const close = vi.fn();
    decoded.resolve(image(close));
    await expect(secondPending).resolves.toBe("applied");
    expect([...first.materialLibrary.keys()]).toEqual(firstKeys);
    expect(firstRenderable.material).toBe(original);
    const material = second.materialLibrary.get(secondRenderable.material)!;
    const binding = material.getParameter("u_bumpTexture") as TextureBinding;
    expect(binding.texture?.disposed).toBe(false);
    expect(close).not.toHaveBeenCalled();
    second.dispose();
    await vi.waitFor(() => expect(binding.texture?.disposed).toBe(true));
    expect(close).toHaveBeenCalledOnce();
    expect(cache.refCount).toBe(0);
  });

  it("releases a shared texture that completes after its final consumer is disposed", async () => {
    vi.stubGlobal("crypto", webcrypto);
    const { asset, enableTexture } = await assetWithDeferredVariantTexture();
    const cache = new GLTFSharedTextureCache();
    const started = deferred<void>();
    const decoded = deferred<DecodedGLTFImage>();
    const decoder = vi.fn<GLTFImageDecoder>(() => { started.resolve(); return decoded.promise; });
    const first = await createGLTFRenderResources(asset, { imageDecoder: decoder, sharedTextures: cache, request: { credentials: "omit" } });
    const second = await createGLTFRenderResources(asset, { imageDecoder: decoder, sharedTextures: cache, request: { credentials: "omit" } });
    enableTexture();
    makeInstanced(first);
    makeInstanced(second);
    const firstPending = first.setMaterialVariant("detail");
    const secondPending = second.setMaterialVariant("detail");
    await started.promise;
    first.dispose();
    second.dispose();
    await expect(firstPending).rejects.toMatchObject({ name: "AbortError" });
    await expect(secondPending).rejects.toMatchObject({ name: "AbortError" });
    expect(cache.refCount).toBe(0);
    expect(cache.size).toBe(0);
    const close = vi.fn();
    decoded.resolve(image(close));
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(first.textureLibrary.size).toBe(0);
    expect(second.textureLibrary.size).toBe(0);
    expect(decoder).toHaveBeenCalledOnce();
  });

  it("uses the latest valid selection and never commits a superseded build", async () => {
    const { asset, enableTexture } = await assetWithDeferredVariantTexture();
    const started = deferred<void>();
    const decoded = deferred<DecodedGLTFImage>();
    const resources = await createGLTFRenderResources(asset, { imageDecoder: () => { started.resolve(); return decoded.promise; } });
    enableTexture();
    const renderable = makeInstanced(resources);
    const original = renderable.material;
    const first = resources.setMaterialVariant("detail");
    await started.promise;
    await expect(resources.setMaterialVariant("missing")).resolves.toBe("variant-unknown");
    const restore = resources.setMaterialVariant(null);
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    await expect(restore).resolves.toBe("applied");
    const restored = renderable.material;
    expect(restored).not.toBe(original); // The authored material now also uses the instanced contract.
    decoded.resolve(image());
    await vi.waitFor(() => expect(resources.textureLibrary.size).toBe(1));
    expect(renderable.material).toBe(restored);
    expect([...resources.materialLibrary.keys()].some((key) => key.startsWith("detail#aura3d-runtime"))).toBe(false);
    resources.dispose();
  });

  it("reuses an in-flight material when the same selection is repeated", async () => {
    const { asset, enableTexture } = await assetWithDeferredVariantTexture();
    const started = deferred<void>();
    const decoded = deferred<DecodedGLTFImage>();
    const decoder = vi.fn<GLTFImageDecoder>(() => { started.resolve(); return decoded.promise; });
    const dispose = vi.spyOn(Material.prototype, "dispose");
    const resources = await createGLTFRenderResources(asset, { imageDecoder: decoder });
    enableTexture();
    const renderable = makeInstanced(resources);
    const first = resources.setMaterialVariant("detail");
    await started.promise;
    const second = resources.setMaterialVariant("detail");
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    decoded.resolve(image());
    await expect(second).resolves.toBe("applied");
    expect(decoder).toHaveBeenCalledOnce();
    expect(resources.materialLibrary.has(renderable.material)).toBe(true);
    resources.dispose();
    expect(dispose.mock.contexts.filter((material) => material instanceof InstancedUnlitMaterial && material.name === "detail")).toHaveLength(1);
  });

  it("honors caller cancellation and closes an image produced after cancellation", async () => {
    const { asset, enableTexture } = await assetWithDeferredVariantTexture();
    const controller = new AbortController();
    const started = deferred<void>();
    const decoded = deferred<DecodedGLTFImage>();
    const resources = await createGLTFRenderResources(asset, {
      signal: controller.signal, imageDecoder: () => { started.resolve(); return decoded.promise; }
    });
    enableTexture();
    const renderable = makeInstanced(resources);
    const original = renderable.material;
    const pending = resources.setMaterialVariant("detail");
    await started.promise;
    const reason = new DOMException("caller cancelled", "AbortError");
    controller.abort(reason);
    await expect(pending).rejects.toBe(reason);
    const close = vi.fn();
    decoded.resolve(image(close));
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
    expect(renderable.material).toBe(original);
    expect(resources.textureLibrary.size).toBe(0);
    resources.dispose();
  });

  it("rejects a failed build atomically and permits retry", async () => {
    const { asset, enableTexture } = await assetWithDeferredVariantTexture();
    const decoder = vi.fn<GLTFImageDecoder>()
      .mockRejectedValueOnce(new Error("bad image"))
      .mockResolvedValueOnce(image());
    const dispose = vi.spyOn(Material.prototype, "dispose");
    const resources = await createGLTFRenderResources(asset, { imageDecoder: decoder, failOnMissingTexture: true, deduplicateIdenticalMaterials: true });
    enableTexture();
    const renderable = makeInstanced(resources);
    const original = renderable.material;
    const keys = [...resources.materialLibrary.keys()];
    await expect(resources.setMaterialVariant("detail")).rejects.toThrow("bad image");
    expect(renderable.material).toBe(original);
    expect([...resources.materialLibrary.keys()]).toEqual(keys);
    expect(dispose.mock.contexts.some((material) => material instanceof InstancedUnlitMaterial && material.name === "detail")).toBe(true);
    await expect(resources.setMaterialVariant("detail")).resolves.toBe("applied");
    expect(decoder).toHaveBeenCalledTimes(2);
    expect(resources.materialLibrary.has(renderable.material)).toBe(true);
    resources.dispose();
  });

  it("continues teardown after a cleanup error and reports it once", async () => {
    const { asset } = await assetWithDeferredVariantTexture();
    const cache = new GLTFSharedTextureCache();
    const resources = await createGLTFRenderResources(asset, { sharedTextures: cache });
    const geometry = resources.geometryLibrary.get("triangle")!;
    const originalDispose = geometry.dispose.bind(geometry);
    const geometryDispose = vi.spyOn(geometry, "dispose").mockImplementation(() => { throw new Error("geometry failure"); });
    expect(() => resources.dispose()).toThrow(/glTF resource disposal failed/);
    expect([...resources.materialLibrary.values()].every((material) => material.disposed)).toBe(true);
    expect(cache.refCount).toBe(0);
    expect(() => resources.dispose()).not.toThrow();
    expect(geometryDispose).toHaveBeenCalledOnce();
    geometryDispose.mockRestore();
    originalDispose();
  });

  it("reports a cleanup failure in material work that finishes after disposal", async () => {
    const { asset, enableTexture } = await assetWithDeferredVariantTexture();
    const started = deferred<void>();
    const decoded = deferred<DecodedGLTFImage>();
    const resources = await createGLTFRenderResources(asset, { imageDecoder: () => { started.resolve(); return decoded.promise; } });
    enableTexture();
    makeInstanced(resources);
    const originalDispose = Material.prototype.dispose;
    let unfinished: Material | undefined;
    vi.spyOn(Material.prototype, "dispose").mockImplementation(function (this: Material) {
      if (this instanceof InstancedUnlitMaterial && this.name === "detail") {
        unfinished = this;
        throw new Error("late material cleanup failed");
      }
      originalDispose.call(this);
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = resources.setMaterialVariant("detail");
    await started.promise;
    resources.dispose();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith("Late glTF resource cleanup failed", expect.any(AggregateError)));
    expect((log.mock.calls[0]![1] as AggregateError).errors.some((error: unknown) => error instanceof Error && error.message === "late material cleanup failed")).toBe(true);
    originalDispose.call(unfinished!);
    const close = vi.fn();
    decoded.resolve(image(close));
    await vi.waitFor(() => expect(close).toHaveBeenCalledOnce());
  });
});

describe("typed actor variant lifecycle", () => {
  it("keeps authored snapshots stable across selections and override removal", async () => {
    const actor = await createTypedGLBActor({ id: "variant-overrides", asset: { url: variantUrl() }, width: 64, height: 64,
      imageDecoder: () => image(), shareTextures: false });
    const base = actor.pipeline.resources.materialLibrary.get("base")!;
    const authored = base.getParameter("u_baseColor") as number[];
    actor.setMaterialOverrides([{ baseColorMultiply: [0.5, 0.5, 0.5, 1] }]);
    makeInstanced(actor.pipeline.resources);
    await expect(actor.setMaterialVariant("detail")).resolves.toBe("applied");
    await expect(actor.setMaterialVariant(null)).resolves.toBe("applied");
    expect(base.getParameter("u_baseColor")).toEqual([authored[0]! * 0.5, authored[1]! * 0.5, authored[2]! * 0.5, authored[3]]);
    actor.setMaterialOverrides([]);
    expect(base.getParameter("u_baseColor")).toEqual(authored);
    actor.dispose();
  });

  it("preserves authored values when deduplicated material keys share one instance", async () => {
    const doc = variantDocument();
    doc.materials[1] = { name: "detail" };
    const url = `data:model/gltf+json,${encodeURIComponent(JSON.stringify(doc))}`;
    const actor = await createTypedGLBActor({ id: "variant-deduplicated", asset: { url }, width: 64, height: 64,
      deduplicateIdenticalMaterials: true, shareTextures: false });
    actor.setMaterialOverrides([{ baseColorMultiply: [0.5, 0.5, 0.5, 1] }]);
    const renderable = makeInstanced(actor.pipeline.resources);
    await expect(actor.setMaterialVariant("detail")).resolves.toBe("applied");
    const instanced = actor.pipeline.resources.materialLibrary.get(renderable.material)!;
    expect(instanced.getParameter("u_baseColor")).toEqual([0.5, 0.5, 0.5, 1]);
    await expect(actor.setMaterialVariant(null)).resolves.toBe("applied");
    expect(actor.pipeline.resources.materialLibrary.get(renderable.material)).toBe(instanced);
    expect(instanced.getParameter("u_baseColor")).toEqual([0.5, 0.5, 0.5, 1]);
    actor.setMaterialOverrides([]);
    expect(instanced.getParameter("u_baseColor")).toEqual([1, 1, 1, 1]);
    actor.dispose();
  });

  it("retains an existing legacy tint when selecting a variant", async () => {
    setTypedGLBActorQrFlags(resolveQrFlags({ options: { A3D_QR_MATERIALS: false } }));
    try {
      const actor = await createTypedGLBActor({ id: "variant-legacy-tint", asset: { url: variantUrl() }, width: 64, height: 64,
        imageDecoder: () => image(), shareTextures: false });
      const base = actor.pipeline.resources.materialLibrary.get("base")!;
      actor.setTint({ baseColor: [0.25, 0.5, 0.75, 1] });
      makeInstanced(actor.pipeline.resources);
      await expect(actor.setMaterialVariant("detail")).resolves.toBe("applied");
      expect(base.getParameter("u_baseColor")).toEqual([0.25, 0.5, 0.75, 1]);
      actor.dispose();
    } finally {
      setTypedGLBActorQrFlags(resolveQrFlags({ options: {} }));
    }
  });

  it("reports failures to synchronous handle consumers while actor callers can await rejection", async () => {
    const actor = await createTypedGLBActor({ id: "variant-error", asset: { url: variantUrl() }, width: 64, height: 64,
      imageDecoder: () => image(), shareTextures: false });
    const failure = new Error("variant build failed");
    const stub = vi.spyOn(actor.pipeline.resources, "setMaterialVariant").mockRejectedValueOnce(failure);
    await expect(actor.setMaterialVariant("detail")).rejects.toBe(failure);
    expect(actor.inspectMaterials().flatMap((entry) => entry.warnings)).toContain("variant-error:variant build failed");
    stub.mockRestore();
    const renderable = makeInstanced(actor.pipeline.resources);
    const original = renderable.material;
    const pending = actor.setMaterialVariant("detail");
    actor.dispose();
    actor.dispose();
    const keys = [...actor.pipeline.resources.materialLibrary.keys()];
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect([...actor.pipeline.resources.materialLibrary.keys()]).toEqual(keys);
    expect(renderable.material).toBe(original);
  });

  it("reports a genuine failure that arrives after actor teardown", async () => {
    const actor = await createTypedGLBActor({ id: "late-variant-error", asset: { url: variantUrl() }, width: 64, height: 64,
      imageDecoder: () => image(), shareTextures: false });
    const deferredVariant = deferred<"applied" | "variant-unknown">();
    vi.spyOn(actor.pipeline.resources, "setMaterialVariant").mockReturnValueOnce(deferredVariant.promise);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const pending = actor.setMaterialVariant("detail");
    actor.dispose();
    const failure = new Error("late variant failure");
    deferredVariant.reject(failure);
    await expect(pending).rejects.toBe(failure);
    expect(log).toHaveBeenCalledWith("Material variant selection failed after actor disposal", failure);
  });
});
