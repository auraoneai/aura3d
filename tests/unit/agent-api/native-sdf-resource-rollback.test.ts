import { afterEach, describe, expect, it, vi } from "vitest";
import { createSdfTextPrimitiveResource, replaceSdfTextPrimitiveResource } from "../../../packages/engine/src/agent-api/compiler/textures";
import { createProductionRuntimePrimitiveEntries, observePrimitiveMaterial, resolveProductionPrimitiveRuntimeState, selectProductionPrimitiveResource } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { text3D } from "../../../packages/engine/src/agent-api/nodes/text3d";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { IndexBuffer } from "../../../packages/rendering/src/IndexBuffer";
import { Material } from "../../../packages/rendering/src/Material";
import { Texture } from "../../../packages/rendering/src/Texture";
import type { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";

/** A small, independently authored SDF snapshot; no font or browser is required. */
function dynamicNode(): AuraPrimitiveNode {
  return {
    kind: "primitive",
    primitive: "custom",
    name: "label",
    material: { color: "#ffffff" },
    text3D: {
      text: "A",
      glyphCount: 1,
      unsupportedCharacters: [],
      method: "sdf-atlas-quad",
      backend: "sdf",
      sdfDynamic: {
        layout: {
          kind: "aura-sdf-text-layout",
          text: "A",
          quads: [{ glyph: "A", corners: [0, 0, 1, 0, 1, 1, 0, 1], uv: [0, 0, 1, 1] }],
          glyphCount: 1,
          unsupportedCharacters: [],
          widthWorld: 1,
          heightWorld: 1,
          method: "sdf-atlas-quad",
          style: { outlineWidthEm: 0, glowRadiusEm: 0, shadowOpacity: 0.45, smoothingEm: 0.02 }
        },
        image: { kind: "aura-sdf-text-image", width: 1, height: 1, data: new Uint8Array([8, 16, 24, 255]), coveredTexels: 1 }
      }
    }
  };
}

/** The marker is read after the geometry, texture and both materials exist. */
function failAtMarker(node: AuraPrimitiveNode, error: Error): AuraPrimitiveNode {
  return Object.defineProperty({ ...node }, "geometry", {
    configurable: true,
    get() { throw error; }
  });
}

function watchDisposals() {
  return {
    vertices: vi.spyOn(VertexBuffer.prototype, "dispose"),
    indices: vi.spyOn(IndexBuffer.prototype, "dispose"),
    geometry: vi.spyOn(Geometry.prototype, "dispose"),
    materials: vi.spyOn(Material.prototype, "dispose"),
    textures: vi.spyOn(Texture.prototype, "dispose")
  };
}

function materialContext(value: unknown): Material {
  if (!(value instanceof Material)) throw new TypeError("Expected a material disposal context");
  return value;
}

function textureContext(value: unknown): Texture {
  if (!(value instanceof Texture)) throw new TypeError("Expected a texture disposal context");
  return value;
}

afterEach(() => vi.restoreAllMocks());

describe("SDF primitive construction rollback", () => {
  it("releases a vertex buffer when an attribute write fails before geometry exists", () => {
    const node = dynamicNode();
    const pixels = node.text3D!.sdfDynamic!.image.data;
    const error = new Error("vertex write failed");
    const cleanup = watchDisposals();
    vi.spyOn(VertexBuffer.prototype, "setAttribute").mockImplementationOnce(() => { throw error; });
    const warn = vi.fn();

    expect(() => createSdfTextPrimitiveResource(node, warn)).toThrow(error);
    expect(warn).not.toHaveBeenCalled();
    expect(cleanup.vertices).toHaveBeenCalledTimes(1);
    expect(cleanup.indices).not.toHaveBeenCalled();
    expect(cleanup.geometry).not.toHaveBeenCalled();
    expect(cleanup.materials).not.toHaveBeenCalled();
    expect(cleanup.textures).not.toHaveBeenCalled();
    expect([...pixels]).toEqual([8, 16, 24, 255]);
  });

  it("releases both unattached buffers when geometry validation fails", () => {
    const error = new Error("index validation failed");
    const cleanup = watchDisposals();
    vi.spyOn(IndexBuffer.prototype, "assertReadable").mockImplementationOnce(() => { throw error; });

    expect(() => createSdfTextPrimitiveResource(dynamicNode(), () => {})).toThrow(error);
    expect(cleanup.vertices).toHaveBeenCalledTimes(1);
    expect(cleanup.indices).toHaveBeenCalledTimes(1);
    expect(cleanup.geometry).not.toHaveBeenCalled();
    expect(cleanup.materials).not.toHaveBeenCalled();
    expect(cleanup.textures).not.toHaveBeenCalled();
  });

  it("retires both materials, the label texture and geometry after a late construction failure", () => {
    const node = dynamicNode();
    const pixels = node.text3D!.sdfDynamic!.image.data;
    const error = new Error("late marker read failed");
    const cleanup = watchDisposals();

    expect(() => createSdfTextPrimitiveResource(failAtMarker(node, error), () => {})).toThrow(error);
    expect(cleanup.geometry).toHaveBeenCalledTimes(1);
    expect(cleanup.vertices).toHaveBeenCalledTimes(1);
    expect(cleanup.indices).toHaveBeenCalledTimes(1);
    expect(cleanup.materials).toHaveBeenCalledTimes(2);
    expect(cleanup.materials.mock.contexts.map((item) => materialContext(item).name).sort()).toEqual([
      "a3d-production-primitive-custom-label",
      "a3d-production-sdf-text-label"
    ]);
    expect(cleanup.textures).toHaveBeenCalledTimes(1);
    expect(textureContext(cleanup.textures.mock.contexts[0]).disposed).toBe(true);
    expect([...pixels]).toEqual([8, 16, 24, 255]);
  });

  it("continues cleanup and reports the original error when a material disposer throws", () => {
    const constructionError = new Error("late marker read failed");
    const disposalError = new Error("text material disposal failed");
    const disposeMaterial = Material.prototype.dispose;
    const cleanup = watchDisposals();
    cleanup.materials.mockImplementation(function (this: Material) {
      disposeMaterial.call(this);
      if (this.name === "a3d-production-sdf-text-label") throw disposalError;
    });

    let thrown: unknown;
    try { createSdfTextPrimitiveResource(failAtMarker(dynamicNode(), constructionError), () => {}); }
    catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).cause).toBe(constructionError);
    expect((thrown as AggregateError).errors).toEqual(expect.arrayContaining([constructionError, disposalError]));
    expect(cleanup.geometry).toHaveBeenCalledTimes(1);
    expect(cleanup.vertices).toHaveBeenCalledTimes(1);
    expect(cleanup.indices).toHaveBeenCalledTimes(1);
    expect(cleanup.materials).toHaveBeenCalledTimes(2);
    // The owned material retires its texture even if superclass disposal throws.
    expect(cleanup.textures).toHaveBeenCalledTimes(1);
    expect(textureContext(cleanup.textures.mock.contexts[0]).disposed).toBe(true);
  });

  it("preserves the caller's existing live resource if replacement construction fails", () => {
    const previous = createSdfTextPrimitiveResource(dynamicNode(), () => { throw new Error("unexpected fallback"); })!;
    const oldGeometry = previous.geometry;
    const oldBase = previous.material;
    const oldTextMaterial = previous.texturedMaterial!;
    const oldTexture = (oldTextMaterial.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    const cleanup = watchDisposals();
    const error = new Error("replacement marker read failed");

    try {
      expect(() => replaceSdfTextPrimitiveResource(previous, failAtMarker(dynamicNode(), error))).toThrow(error);
      expect(() => oldGeometry.vertexBuffer.readBytes(0, 0)).not.toThrow();
      expect(oldBase.disposed).toBe(false);
      expect(oldTextMaterial.disposed).toBe(false);
      expect(oldTexture.disposed).toBe(false);
      expect(cleanup.geometry.mock.contexts).not.toContain(oldGeometry);
      expect(cleanup.materials.mock.contexts).not.toContain(oldBase);
      expect(cleanup.materials.mock.contexts).not.toContain(oldTextMaterial);
      expect(cleanup.textures.mock.contexts).not.toContain(oldTexture);
      expect(cleanup.geometry).toHaveBeenCalledTimes(1);
      expect(cleanup.materials).toHaveBeenCalledTimes(2);
      expect(cleanup.textures).toHaveBeenCalledTimes(1);
    } finally {
      vi.restoreAllMocks();
      oldGeometry.dispose();
      oldBase.dispose();
      oldTextMaterial.dispose();
    }
  });

  it("retires both old and unreturned new resources when standalone replacement cleanup fails", () => {
    const node = dynamicNode();
    const previous = createSdfTextPrimitiveResource(node, () => {})!;
    const oldGeometry = previous.geometry;
    const oldMaterial = previous.material;
    const oldTextured = previous.texturedMaterial!;
    const oldTexture = (oldTextured.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    const originalDispose = Geometry.prototype.dispose;
    const cleanup = watchDisposals();
    const failure = new Error("old geometry disposal failed");
    cleanup.geometry.mockImplementation(function (this: Geometry) {
      originalDispose.call(this);
      if (this === oldGeometry) throw failure;
    });

    let thrown: unknown;
    try { replaceSdfTextPrimitiveResource(previous, dynamicNode()); } catch (error) { thrown = error; }
    expect(thrown).toBeInstanceOf(AggregateError);
    expect((thrown as AggregateError).errors).toContain(failure);
    expect(() => oldGeometry.vertexBuffer.readBytes(0, 0)).toThrow();
    expect(oldMaterial.disposed).toBe(true);
    expect(oldTextured.disposed).toBe(true);
    expect(oldTexture.disposed).toBe(true);
    expect(cleanup.geometry).toHaveBeenCalledTimes(2);
    const stagedGeometry = cleanup.geometry.mock.contexts.find((value) => value !== oldGeometry) as Geometry;
    expect(() => stagedGeometry.vertexBuffer.readBytes(0, 0)).toThrow();
    const textures = cleanup.textures.mock.contexts.map(textureContext);
    expect(textures).toHaveLength(2);
    expect(textures).toContain(oldTexture);
    expect(textures.every((texture) => texture.disposed)).toBe(true);
  });

  it("publishes the replacement and tracks it even when old geometry retirement fails", () => {
    const node = dynamicNode();
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const old = entry.resources[0]!;
    const oldTexture = (old.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    const failure = new Error("device buffer retirement failed");
    const originalDispose = old.geometry.dispose.bind(old.geometry);
    vi.spyOn(old.geometry, "dispose").mockImplementation(() => { originalDispose(); throw failure; });
    const beforeReplace = vi.fn();
    const afterApply = vi.fn();
    const unobserve = observePrimitiveMaterial(entry, { beforeReplace, afterApply });
    const changed: AuraPrimitiveNode = { ...node, text3D: { ...node.text3D!, text: "B" } };

    expect(() => selectProductionPrimitiveResource(entry, changed, [0, 0, 1])).toThrow(/replacement cleanup failed/);
    const replacement = entry.resources[0]!;
    expect(replacement).not.toBe(old);
    expect(() => old.geometry.vertexBuffer.readBytes(0, 0)).toThrow();
    expect(old.material.disposed).toBe(true);
    expect(oldTexture.disposed).toBe(true);
    expect(() => replacement.geometry.vertexBuffer.readBytes(0, 0)).not.toThrow();
    expect(replacement.material.disposed).toBe(false);
    expect((replacement.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!.disposed).toBe(false);
    expect(beforeReplace).toHaveBeenCalledOnce();
    expect(afterApply).toHaveBeenCalledOnce();
    expect(afterApply.mock.calls[0]![1]).toBe(replacement);
    expect(selectProductionPrimitiveResource(entry, changed, [0, 0, 1])).toBe(replacement);
    unobserve();
    replacement.geometry.dispose(); replacement.material.dispose(); replacement.texturedMaterial?.dispose();
  });

  it("rolls back staged text and restores observer tracking if beforeReplace supersedes the material", () => {
    const node: AuraPrimitiveNode = { ...dynamicNode(), runtime: { id: "text", mutable: true } };
    const handle = createRuntimeNodeHandle(node as never, node.runtime!);
    const registry = { get: () => handle } as never;
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const old = entry.resources[0]!;
    const oldTexture = (old.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    const disposedTextures = vi.spyOn(Texture.prototype, "dispose");
    handle.setMaterial({ color: "#00ff00" });
    const beforeReplace = vi.fn(() => { handle.setMaterial({ color: "#0000ff" }); });
    const afterApply = vi.fn();
    const unobserve = observePrimitiveMaterial(entry, { beforeReplace, afterApply });

    expect(() => resolveProductionPrimitiveRuntimeState(entry, registry)).toThrow(/PRIMITIVE_MATERIAL_SUPERSEDED/);
    expect(entry.resources[0]).toBe(old);
    expect(() => old.geometry.vertexBuffer.readBytes(0, 0)).not.toThrow();
    expect(old.material.disposed).toBe(false);
    expect(oldTexture.disposed).toBe(false);
    expect(disposedTextures).toHaveBeenCalledOnce();
    expect(textureContext(disposedTextures.mock.contexts[0]).disposed).toBe(true);
    expect(afterApply).toHaveBeenCalledOnce();
    expect(afterApply.mock.calls[0]![1]).toBe(old);

    unobserve();
    const current = resolveProductionPrimitiveRuntimeState(entry, registry);
    const replacement = selectProductionPrimitiveResource(entry, current.node, [0, 0, 1]);
    expect(replacement.texturedMaterial!.getParameter("u_baseColor")).toEqual([0, 0, 1, 1]);
    expect(oldTexture.disposed).toBe(true);
    replacement.geometry.dispose(); replacement.material.dispose(); replacement.texturedMaterial?.dispose();
  });

  it("publishes before disposal callbacks remove the entry and never republishes a dead resource", () => {
    const node = dynamicNode();
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const old = entry.resources[0]!;
    const oldTexture = (old.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    const afterApply = vi.fn();
    const unobserve = observePrimitiveMaterial(entry, { beforeReplace() {}, afterApply });
    const removal: { resource?: typeof old } = {};
    oldTexture.onDispose(() => {
      removal.resource = entry.resources[0];
      (entry.resources as Array<typeof old>).splice(0, 1);
      removal.resource?.geometry.dispose(); removal.resource?.material.dispose(); removal.resource?.texturedMaterial?.dispose();
    });
    const changed: AuraPrimitiveNode = { ...node, text3D: { ...node.text3D!, text: "B" } };

    expect(() => selectProductionPrimitiveResource(entry, changed, [0, 0, 1])).toThrow(/PRIMITIVE_MATERIAL_SUPERSEDED/);
    expect(removal.resource).toBeDefined();
    expect(removal.resource).not.toBe(old);
    expect(() => removal.resource!.geometry.vertexBuffer.readBytes(0, 0)).toThrow();
    expect(removal.resource!.material.disposed).toBe(true);
    expect(oldTexture.disposed).toBe(true);
    expect(entry.resources).toHaveLength(0);
    expect(afterApply).not.toHaveBeenCalled();
    unobserve();
  });

  it("stops recursive replacement of the same old resource before notifying observers again", () => {
    const node = dynamicNode();
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const changed: AuraPrimitiveNode = { ...node, text3D: { ...node.text3D!, text: "B" } };
    let nestedError: unknown;
    const beforeReplace = vi.fn(() => {
      try { selectProductionPrimitiveResource(entry, changed, [0, 0, 1]); } catch (error) { nestedError = error; }
    });
    const unobserve = observePrimitiveMaterial(entry, { beforeReplace, afterApply() {} });
    const replacement = selectProductionPrimitiveResource(entry, changed, [0, 0, 1]);
    expect(nestedError).toBeInstanceOf(Error);
    expect((nestedError as Error).message).toMatch(/replacement is already in progress/);
    expect(beforeReplace).toHaveBeenCalledOnce();
    expect(entry.resources[0]).toBe(replacement);
    unobserve();
    replacement.geometry.dispose(); replacement.material.dispose(); replacement.texturedMaterial?.dispose();
  });

  it("disposes the owned label texture when superclass material disposal throws", () => {
    const resource = createSdfTextPrimitiveResource(dynamicNode(), () => {})!;
    const material = resource.texturedMaterial!;
    const texture = (material.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    const dispose = Material.prototype.dispose;
    const failure = new Error("injected material disposal failure");
    vi.spyOn(Material.prototype, "dispose").mockImplementation(function (this: Material) {
      dispose.call(this);
      if (this === material) throw failure;
    });
    expect(() => material.dispose()).toThrow(failure);
    expect(texture.disposed).toBe(true);
    expect(() => material.dispose()).not.toThrow();
    resource.geometry.dispose(); resource.material.dispose();
  });

  it("cleans an early failure and warns when a static label retains its fallback", () => {
    const node = text3D("A", { backend: "sdf" }).toJSON();
    const error = new Error("static vertex write failed");
    const cleanup = watchDisposals();
    vi.spyOn(VertexBuffer.prototype, "setAttribute").mockImplementationOnce(() => { throw error; });
    const warn = vi.fn();

    expect(createSdfTextPrimitiveResource(node, warn)).toBeNull();
    expect(cleanup.vertices).toHaveBeenCalledTimes(1);
    expect(cleanup.indices).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    expect(warn.mock.calls[0]![0]).toContain("static vertex write failed");
    expect(warn.mock.calls[0]![0]).toContain("fallback retained");
  });
});
