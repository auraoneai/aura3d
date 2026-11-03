import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { rootSdfFontAtlas, text3D, type AuraWorldTextOptions } from "../../../packages/engine/src/agent-api/nodes/text3d";
import type { AuraPrimitiveNode, ProductionRuntimePrimitiveResource } from "../../../packages/engine/src/agent-api/nodes/types";
import { createProductionPrimitiveGeometry, createProductionRuntimePrimitiveEntries, observePrimitiveMaterial, primitiveGeometryBounds, resolveProductionPrimitiveRuntimeState, selectProductionPrimitiveResource } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { worldLabelsFromSnapshot } from "../../../packages/engine/src/agent-api/compiler/labels";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createAuraText3DGeometry } from "../../../packages/engine/src/agent-api/RootGeometry";
import { VertexBuffer } from "../../../packages/rendering/src/VertexBuffer";
import { createSdfTextPrimitiveResource, retireSdfTextPrimitiveResource } from "../../../packages/engine/src/agent-api/compiler/textures";
import { createBuiltinGlyphAtlasScope, isBuiltinGlyphResource, retainBuiltinGlyphResource, retireBuiltinGlyphResource } from "../../../packages/engine/src/agent-api/compiler/BuiltinGlyphAtlas";
import { layoutSdfText, rasterizeSdfTextLabelImage, type SdfFontAtlas } from "../../../packages/rendering/src/SdfText";
import type { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

let font: SdfFontAtlas;
beforeAll(() => { font = rootSdfFontAtlas(); }, 60_000);
afterEach(() => vi.restoreAllMocks());

function node(text: string, options: Partial<AuraWorldTextOptions> = {}): AuraPrimitiveNode {
  return text3D(text, { backend: "sdf", sdfGlyphAtlas: "shared", ...options }).toJSON();
}

function boundTexture(resource: ProductionRuntimePrimitiveResource) {
  return (resource.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
}

function imageAt(resource: ProductionRuntimePrimitiveResource, quad: number, width: number, height: number): Uint8Array {
  const texture = boundTexture(resource);
  const data = texture.getMipLevel(0)?.data;
  if (!(data instanceof Uint8Array)) throw new Error("Expected RGBA8 atlas pixels");
  const [u, v] = resource.geometry.vertexBuffer.getAttribute(quad * 4, "uv");
  const x = Math.round(u! * texture.width);
  const y = Math.round(v! * texture.height);
  const result = new Uint8Array(width * height * 4);
  for (let row = 0; row < height; row += 1) {
    const start = ((y + row) * texture.width + x) * 4;
    result.set(data.subarray(start, start + width * 4), row * width * 4);
  }
  return result;
}

describe("built-in text atlas resource integration", () => {
  it("shares glyph coordinates and a staged texture across separate opted-in labels", async () => {
    const scope = createBuiltinGlyphAtlasScope(font);
    const [first, second] = createProductionRuntimePrimitiveEntries([
      node("ABA", { material: { color: "#ff0000", opacity: 0.5 } }), node("BA")
    ], undefined, scope);
    const a = first!.resources[0]!;
    const b = second!.resources[0]!;
    expect(isBuiltinGlyphResource(a)).toBe(true);
    expect(isBuiltinGlyphResource(b)).toBe(true);
    expect(boundTexture(a)).toBe(scope.texture);
    expect(boundTexture(b)).toBe(scope.texture);
    expect(scope.texture.revision).toBe(1);
    expect(scope.flush()).toBe(false);
    expect(a.texturedMaterial!.getParameter("u_baseColor")).toEqual([1, 0, 0, 0.5]);
    expect(a.sdfText?.quadCount).toBe(3);

    const uv = (resource: ProductionRuntimePrimitiveResource, vertex: number) => resource.geometry.vertexBuffer.getAttribute(vertex, "uv");
    expect(uv(a, 0)).toEqual(uv(a, 8));
    expect(uv(a, 0)).toEqual(uv(b, 4));
    expect(uv(a, 4)).toEqual(uv(b, 0));
    expect(uv(a, 0)).not.toEqual(uv(a, 4));
    const u0v0 = uv(a, 0); const u1v1 = uv(a, 2);
    expect(u1v1[0]).toBeGreaterThan(u0v0[0]!);
    expect(u1v1[1]).toBeGreaterThan(u0v0[1]!);
    const expected = rasterizeSdfTextLabelImage(layoutSdfText("A", font), font, { texelsPerWorldUnit: 64 });
    expect(imageAt(a, 0, expected.width, expected.height)).toEqual(expected.data);

    scope.dispose();
    expect(scope.texture.disposed).toBe(false);
    expect(retireBuiltinGlyphResource(a)).toBe(true);
    expect(scope.texture.disposed).toBe(false);
    expect(retireBuiltinGlyphResource(b)).toBe(true);
    await scope.whenDisposed();
    expect(scope.texture.disposed).toBe(true);
  });

  it("keeps independent mount scopes and disposes each texture only for its own resources", async () => {
    const first = createBuiltinGlyphAtlasScope(font);
    const second = createBuiltinGlyphAtlasScope(font);
    const a = createSdfTextPrimitiveResource(node("A"), () => {}, first)!;
    const b = createSdfTextPrimitiveResource(node("A"), () => {}, second)!;
    expect(boundTexture(a)).toBe(first.texture);
    expect(boundTexture(b)).toBe(second.texture);
    expect(first.texture === second.texture).toBe(false);
    first.dispose(); retireSdfTextPrimitiveResource(a);
    await first.whenDisposed();
    expect(first.texture.disposed).toBe(true);
    expect(second.texture.disposed).toBe(false);
    expect(() => b.geometry.vertexBuffer.readBytes(0, 0)).not.toThrow();
    second.dispose(); retireSdfTextPrimitiveResource(b);
    await second.whenDisposed();
    expect(second.texture.disposed).toBe(true);
  });

  it("defers geometry, material and glyph retirement through multiple frame references", async () => {
    const scope = createBuiltinGlyphAtlasScope(font);
    const resource = createSdfTextPrimitiveResource(node("AB"), () => {}, scope)!;
    const material = resource.texturedMaterial!;
    const first = retainBuiltinGlyphResource(resource)!;
    const second = retainBuiltinGlyphResource(resource)!;
    expect(first).toBeTypeOf("function");
    expect(second).toBeTypeOf("function");
    expect(retireBuiltinGlyphResource(resource)).toBe(true);
    expect(retireBuiltinGlyphResource(resource)).toBe(true);
    expect(retainBuiltinGlyphResource(resource)).toBeUndefined();
    scope.dispose();
    let closed = false;
    const completion = scope.whenDisposed().then(() => { closed = true; });
    await Promise.resolve();
    expect(closed).toBe(false);
    expect(material.disposed).toBe(false);
    expect(() => resource.geometry.vertexBuffer.readBytes(0, 0)).not.toThrow();
    first(); first();
    expect(scope.texture.disposed).toBe(false);
    second(); second();
    await completion;
    expect(closed).toBe(true);
    expect(material.disposed).toBe(true);
    expect(() => resource.geometry.vertexBuffer.readBytes(0, 0)).toThrow();
    expect(scope.texture.disposed).toBe(true);
  });

  it("preserves atlas ownership through LOD copies and replacement while an old frame is retained", async () => {
    const scope = createBuiltinGlyphAtlasScope(font);
    const original = node("AB", { lod: { levels: [
      { name: "near", maxDistance: 5, primitive: "box" }, { name: "far", primitive: "sphere" }
    ] } });
    const entry = createProductionRuntimePrimitiveEntries([original], undefined, scope)[0]!;
    const [oldNear, oldFar] = entry.resources;
    expect(isBuiltinGlyphResource(oldNear!)).toBe(true);
    expect(isBuiltinGlyphResource(oldFar!)).toBe(true);
    const releaseOldFrame = retainBuiltinGlyphResource(oldNear!)!;
    const changed: AuraPrimitiveNode = { ...original, text3D: { ...original.text3D!, text: "AZ" } };
    const near = selectProductionPrimitiveResource(entry, changed, [0, 0, 1]);
    const far = selectProductionPrimitiveResource(entry, changed, [0, 0, 10]);
    expect(near.name).toBe("near");
    expect(far.name).toBe("far");
    expect(isBuiltinGlyphResource(near)).toBe(true);
    expect(isBuiltinGlyphResource(far)).toBe(true);
    expect(boundTexture(near)).toBe(scope.texture);
    expect(() => oldNear!.geometry.vertexBuffer.readBytes(0, 0)).not.toThrow();
    expect(() => oldFar!.geometry.vertexBuffer.readBytes(0, 0)).toThrow();
    scope.dispose();
    expect(retireBuiltinGlyphResource(near)).toBe(true);
    expect(retireBuiltinGlyphResource(far)).toBe(true);
    expect(scope.texture.disposed).toBe(false);
    releaseOldFrame();
    await scope.whenDisposed();
    expect(scope.texture.disposed).toBe(true);
    expect(() => oldNear!.geometry.vertexBuffer.readBytes(0, 0)).toThrow();
  });

  it("keeps the old resource on a failed staged update and retries the dirty glyph", async () => {
    const scope = createBuiltinGlyphAtlasScope(font);
    const original = node("A");
    const entry = createProductionRuntimePrimitiveEntries([original], undefined, scope)[0]!;
    const old = entry.resources[0]!;
    const failure = new Error("injected atlas update failure");
    vi.spyOn(scope.texture, "update").mockImplementationOnce(() => { throw failure; });
    const changed: AuraPrimitiveNode = { ...original, text3D: { ...original.text3D!, text: "AB" } };
    expect(() => selectProductionPrimitiveResource(entry, changed, [0, 0, 1])).toThrow(/injected atlas update failure/);
    expect(entry.resources[0]).toBe(old);
    expect(old.material.disposed).toBe(false);
    expect(() => old.geometry.vertexBuffer.readBytes(0, 0)).not.toThrow();
    expect(scope.texture.disposed).toBe(false);
    expect(scope.flush()).toBe(true);
    const next = selectProductionPrimitiveResource(entry, changed, [0, 0, 1]);
    expect(next).not.toBe(old);
    expect(boundTexture(next)).toBe(scope.texture);
    expect(() => old.geometry.vertexBuffer.readBytes(0, 0)).toThrow();
    scope.dispose(); retireSdfTextPrimitiveResource(next);
    await scope.whenDisposed();
  });

  it("updates an extruded fallback with original depth and spacing, then recovers SDF", async () => {
    const scope = createBuiltinGlyphAtlasScope(font);
    const unavailable = vi.spyOn(scope, "acquire").mockImplementation(() => { throw new Error("persistent SDF failure"); });
    const original = text3D("A", { backend: "sdf", sdfGlyphAtlas: "shared", depth: 0.62, letterSpacing: 0.33 })
      .runtime({ id: "fallback", mutable: true }).toJSON();
    const handle = createRuntimeNodeHandle(original as never, original.runtime!);
    const registry = { get: () => handle } as never;
    const snapshot = scene().add(original).toJSON();
    const entry = createProductionRuntimePrimitiveEntries([original], undefined, scope)[0]!;
    const old = entry.resources[0]!;
    expect(old.sdfText).toBeNull();
    expect(old.textureWarnings.join(" ")).toMatch(/persistent SDF failure/);

    handle.setText("BBB");
    const current = resolveProductionPrimitiveRuntimeState(entry, registry);
    const fallback = selectProductionPrimitiveResource(entry, current.node, [0, 0, 1]);
    expect(fallback).not.toBe(old);
    expect(fallback.sdfText).toBeNull();
    expect(fallback.sourceNode.text3D?.text).toBe("BBB");
    expect(worldLabelsFromSnapshot(snapshot, registry).map((label) => label.text)).toEqual(["BBB"]);
    const expectedNode = { ...original, geometry: createAuraText3DGeometry("BBB", { size: 1, depth: 0.62, letterSpacing: 0.33 }).geometry };
    const expectedGeometry = createProductionPrimitiveGeometry(expectedNode);
    expect(fallback.bounds).toEqual(primitiveGeometryBounds(expectedNode));
    expect(fallback.geometry.vertexBuffer.vertexCount).toBe(expectedGeometry.vertexBuffer.vertexCount);
    expect(fallback.geometry.vertexBuffer.readBytes()).toEqual(expectedGeometry.vertexBuffer.readBytes());
    expect(() => old.geometry.vertexBuffer.readBytes(0, 0)).toThrow();
    expect(selectProductionPrimitiveResource(entry, current.node, [0, 0, 1])).toBe(fallback);
    expectedGeometry.dispose();

    const textBeforeLimit = (handle as typeof handle & { __auraText3D?: unknown }).__auraText3D;
    expect(() => handle.setText("A".repeat(65))).toThrow(/64-unit/);
    expect((handle as typeof handle & { __auraText3D?: unknown }).__auraText3D).toBe(textBeforeLimit);
    expect(entry.resources[0]).toBe(fallback);
    expect(worldLabelsFromSnapshot(snapshot, registry).map((label) => label.text)).toEqual(["BBB"]);
    expect(() => text3D("A".repeat(65), { backend: "sdf", sdfGlyphAtlas: "shared" })).toThrow(/64-unit/);
    expect(() => text3D("ß".repeat(33), { backend: "sdf", sdfGlyphAtlas: "shared" })).toThrow(/64-unit/);

    unavailable.mockRestore();
    handle.setText("C");
    const recoveredState = resolveProductionPrimitiveRuntimeState(entry, registry);
    const recovered = selectProductionPrimitiveResource(entry, recoveredState.node, [0, 0, 1]);
    expect(isBuiltinGlyphResource(recovered)).toBe(true);
    expect(recovered.sourceNode.text3D?.text).toBe("C");
    expect(worldLabelsFromSnapshot(snapshot, registry).map((label) => label.text)).toEqual(["C"]);
    expect(() => fallback.geometry.vertexBuffer.readBytes(0, 0)).toThrow();
    scope.dispose(); retireSdfTextPrimitiveResource(recovered);
    await scope.whenDisposed();
  });

  it("keeps the previous fallback intact when staging fails or an observer supersedes the text", async () => {
    const scope = createBuiltinGlyphAtlasScope(font);
    vi.spyOn(scope, "acquire").mockImplementation(() => { throw new Error("persistent SDF failure"); });
    const original = text3D("A", { backend: "sdf", sdfGlyphAtlas: "shared", accessibleLabel: "Fixed" })
      .runtime({ id: "fallback-rollback", mutable: true }).toJSON();
    const handle = createRuntimeNodeHandle(original as never, original.runtime!);
    const registry = { get: () => handle } as never;
    const snapshot = scene().add(original).toJSON();
    const entry = createProductionRuntimePrimitiveEntries([original], undefined, scope)[0]!;
    const old = entry.resources[0]!;
    handle.setText("B");
    const failure = new Error("fallback vertex staging failed");
    vi.spyOn(VertexBuffer.prototype, "setAttribute").mockImplementationOnce(() => { throw failure; });
    expect(() => resolveProductionPrimitiveRuntimeState(entry, registry)).toThrow(failure);
    expect(entry.resources[0]).toBe(old);
    expect(() => old.geometry.vertexBuffer.readBytes(0, 0)).not.toThrow();
    expect(worldLabelsFromSnapshot(snapshot, registry).map((label) => label.text)).toEqual(["Fixed"]);

    const afterApply = vi.fn();
    const unobserve = observePrimitiveMaterial(entry, { beforeReplace() { handle.setText("C"); }, afterApply });
    expect(() => resolveProductionPrimitiveRuntimeState(entry, registry)).toThrow(/PRIMITIVE_MATERIAL_SUPERSEDED/);
    expect(entry.resources[0]).toBe(old);
    expect(() => old.geometry.vertexBuffer.readBytes(0, 0)).not.toThrow();
    expect(afterApply).toHaveBeenCalledOnce();
    expect(afterApply.mock.calls[0]![1]).toBe(old);
    unobserve();
    const current = resolveProductionPrimitiveRuntimeState(entry, registry);
    const fallback = selectProductionPrimitiveResource(entry, current.node, [0, 0, 1]);
    expect(fallback.sourceNode.text3D?.text).toBe("C");
    expect(worldLabelsFromSnapshot(snapshot, registry).map((label) => label.text)).toEqual(["Fixed"]);
    scope.dispose(); retireSdfTextPrimitiveResource(fallback);
    await scope.whenDisposed();
  });

  it("preserves authored LOD primitives during persistent SDF failure and retries on a later edit", async () => {
    const scope = createBuiltinGlyphAtlasScope(font);
    const unavailable = vi.spyOn(scope, "acquire").mockImplementation(() => { throw new Error("persistent SDF failure"); });
    const original = text3D("A", { backend: "sdf", sdfGlyphAtlas: "shared", lod: { levels: [
      { name: "near", maxDistance: 5, primitive: "box", material: { color: "#ff0000" } },
      { name: "far", primitive: "sphere" }
    ] } }).runtime({ id: "fallback-lod", mutable: true }).toJSON();
    const handle = createRuntimeNodeHandle(original as never, original.runtime!);
    const registry = { get: () => handle } as never;
    const entry = createProductionRuntimePrimitiveEntries([original], undefined, scope)[0]!;
    const [oldNear, oldFar] = entry.resources;
    const oldNearBytes = oldNear!.geometry.vertexBuffer.readBytes();
    const oldFarBytes = oldFar!.geometry.vertexBuffer.readBytes();
    handle.setText("BBB");
    const current = resolveProductionPrimitiveRuntimeState(entry, registry);
    const near = selectProductionPrimitiveResource(entry, current.node, [0, 0, 1]);
    const far = selectProductionPrimitiveResource(entry, current.node, [0, 0, 10]);
    expect(near.name).toBe("near");
    expect(far.name).toBe("far");
    expect(near.sdfText).toBeNull();
    expect(far.sdfText).toBeNull();
    expect(near.geometry.vertexBuffer.readBytes()).toEqual(oldNearBytes);
    expect(far.geometry.vertexBuffer.readBytes()).toEqual(oldFarBytes);
    expect(near.materialSpec?.color).toBe("#ff0000");
    expect(near.sourceNode.text3D?.text).toBe("BBB");
    expect(far.sourceNode.text3D?.text).toBe("BBB");
    expect(() => oldNear!.geometry.vertexBuffer.readBytes(0, 0)).toThrow();
    expect(() => oldFar!.geometry.vertexBuffer.readBytes(0, 0)).toThrow();

    unavailable.mockRestore();
    handle.setText("D");
    const recovered = resolveProductionPrimitiveRuntimeState(entry, registry);
    const nextNear = selectProductionPrimitiveResource(entry, recovered.node, [0, 0, 1]);
    const nextFar = selectProductionPrimitiveResource(entry, recovered.node, [0, 0, 10]);
    expect(nextNear.name).toBe("near");
    expect(nextFar.name).toBe("far");
    expect(isBuiltinGlyphResource(nextNear)).toBe(true);
    expect(isBuiltinGlyphResource(nextFar)).toBe(true);
    expect(nextNear.materialSpec?.color).toBe("#ff0000");
    scope.dispose(); retireSdfTextPrimitiveResource(nextNear); retireSdfTextPrimitiveResource(nextFar);
    await scope.whenDisposed();
  });

  it("falls back for missing scope and incompatible size, style or sampler requests", async () => {
    const scope = createBuiltinGlyphAtlasScope(font);
    const examples = [
      node("AB", { size: 2 }),
      node("AB", { sdfStyle: { outlineWidthEm: 0.1 } }),
      node("AB", { sdfStyle: { smoothingEm: 0.04 } }),
      node("AB", { material: { textureAnisotropy: 4 } })
    ];
    const fallback = [createSdfTextPrimitiveResource(node("AB"), () => {})!,
      ...examples.map((value) => createSdfTextPrimitiveResource(value, () => {}, scope)!)];
    for (const [index, resource] of fallback.entries()) {
      // Fallbacks with an admitted scope are now retained by frames even
      // though their actual image remains an independent whole-label texture.
      expect(isBuiltinGlyphResource(resource)).toBe(index > 0);
      expect(boundTexture(resource)).not.toBe(scope.texture);
      expect(resource.textureWarnings.join(" ")).toMatch(/SDF_GLYPH_ATLAS_FALLBACK/);
      const texture = boundTexture(resource);
      const releaseFrame = retainBuiltinGlyphResource(resource);
      retireSdfTextPrimitiveResource(resource);
      if (index > 0) {
        expect(releaseFrame).toBeTypeOf("function");
        expect(texture.disposed).toBe(false);
        releaseFrame!();
      } else {
        expect(releaseFrame).toBeUndefined();
      }
      expect(texture.disposed).toBe(true);
    }
    scope.dispose();
    await scope.whenDisposed();
  });

  it("keeps an already-shaped font snapshot on its independent whole-label texture", async () => {
    const scope = createBuiltinGlyphAtlasScope(font);
    const original = node("A");
    const shaped: AuraPrimitiveNode = { ...original, text3D: { ...original.text3D!, sdfDynamic: {
      layout: {
        kind: "aura-sdf-text-layout", text: "fi", quads: [{ glyph: "fi", corners: [0, 0, 1, 0, 1, 1, 0, 1], uv: [0, 0, 1, 1] }],
        glyphCount: 1, unsupportedCharacters: [], widthWorld: 1, heightWorld: 1, method: "sdf-atlas-quad",
        style: { outlineWidthEm: 0, glowRadiusEm: 0, shadowOpacity: 0.45, smoothingEm: 0.02 }
      },
      image: { kind: "aura-sdf-text-image", width: 1, height: 1, data: new Uint8Array([8, 16, 24, 255]), coveredTexels: 1 }
    } } };
    const resource = createSdfTextPrimitiveResource(shaped, () => {}, scope)!;
    const texture = boundTexture(resource);
    expect(isBuiltinGlyphResource(resource)).toBe(true);
    expect(texture).not.toBe(scope.texture);
    expect(texture.getMipLevel(0)?.data).toEqual(new Uint8Array([8, 16, 24, 255]));
    expect(resource.textureWarnings.join(" ")).toMatch(/SDF_GLYPH_ATLAS_FALLBACK/);
    const releaseFrame = retainBuiltinGlyphResource(resource)!;
    retireSdfTextPrimitiveResource(resource);
    expect(texture.disposed).toBe(false);
    expect(scope.texture.disposed).toBe(false);
    scope.dispose();
    expect(scope.texture.disposed).toBe(false);
    releaseFrame();
    await scope.whenDisposed();
    expect(texture.disposed).toBe(true);
    expect(scope.texture.disposed).toBe(true);
  });

  it("rejects invalid raw descriptor options before allocating resources", async () => {
    const scope = createBuiltinGlyphAtlasScope(font);
    const original = node("A");
    const badOption = { ...original, text3D: { ...original.text3D!, sdfGlyphAtlas: "invalid" } } as unknown as AuraPrimitiveNode;
    const badBackend = { ...original, text3D: { ...original.text3D!, backend: "extruded-mesh" } } as unknown as AuraPrimitiveNode;
    expect(() => createSdfTextPrimitiveResource(badOption, () => {}, scope)).toThrow(/sdfGlyphAtlas/);
    expect(() => createSdfTextPrimitiveResource(badBackend, () => {}, scope)).toThrow(/sdfGlyphAtlas/);
    expect(scope.texture.revision).toBe(0);
    scope.dispose();
    await scope.whenDisposed();
  });

  it("discards a staged resource when the scope closes inside its texture update", async () => {
    const scope = createBuiltinGlyphAtlasScope(font);
    const update = scope.texture.update.bind(scope.texture);
    vi.spyOn(scope.texture, "update").mockImplementationOnce((data, region) => {
      scope.dispose();
      update(data, region);
    });
    expect(() => createSdfTextPrimitiveResource(node("A"), (message) => { throw new Error(message); }, scope)).toThrow(/closed during text construction/);
    await scope.whenDisposed();
    expect(scope.texture.disposed).toBe(true);
  });
});
