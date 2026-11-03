import { afterEach, describe, expect, it, vi } from "vitest";
import { loadFont, type FontLoaderPlatform, type LoadedFont } from "../../../packages/rendering/src/text/FontLoader";
import { loadFont as rootLoadFont } from "../../../packages/engine/src/public/index";
import { shapeText, type TextMeasureContext } from "../../../packages/rendering/src/text/TextShaper";
import { GlyphAtlas } from "../../../packages/rendering/src/text/GlyphAtlas";
import { createDynamicSdfText, createSdfTextQuadMesh } from "../../../packages/rendering/src/SdfText";
import { reshapeWorldTextDescriptor, text3D } from "../../../packages/engine/src/agent-api/nodes/text3d";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createSdfTextPrimitiveResource, replaceSdfTextPrimitiveResource } from "../../../packages/engine/src/agent-api/compiler/textures";
import { createProductionRuntimePrimitiveEntries, observePrimitiveMaterial, resolveProductionPrimitiveRuntimeState, selectProductionPrimitiveResource } from "../../../packages/engine/src/agent-api/compiler/primitives";
import { createSceneLabelLayer, worldLabelsFromSnapshot } from "../../../packages/engine/src/agent-api/compiler/labels";
import { applySdfTextFrameAppearance } from "../../../packages/engine/src/agent-api/compiler/renderInput";
import { createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import type { TextureBinding } from "../../../packages/rendering/src/TextureBinding";

const metadata = { family: "Test font", license: "OFL-1.1", licenseUrl: "https://example.org/license" };
function fontBytes(): Uint8Array {
  const bytes = new Uint8Array(32);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, 0x00010000);
  view.setUint16(4, 1);
  view.setUint32(20, 28);
  view.setUint32(24, 4);
  return bytes;
}
function font(family = "AuraFont1"): LoadedFont { return { family, metadata, disposed: false, dispose() {} }; }
function context(): TextMeasureContext & { seen: string[] } {
  return {
    font: "", direction: "ltr", fontKerning: "auto", letterSpacing: "0px", seen: [],
    measureText(text) {
      this.seen.push(text);
      // Whole-run measurement models kerning and ligature effects.
      return { width: [...text].length * 10 - (text.includes("AV") ? 3 : 0) - (text.includes("fi") ? 2 : 0) };
    }
  };
}
class MockCanvas {
  width = 1; height = 1;
  readonly ctx = {
    font: "", direction: "ltr", fontKerning: "auto", letterSpacing: "0px", textBaseline: "middle", textAlign: "left", fillStyle: "",
    measureText: (text: string) => ({ width: [...text].length * 8 }), fillText() {},
    getImageData: () => {
      const data = new Uint8ClampedArray(this.width * this.height * 4);
      for (let y = 4; y < this.height - 4; y += 1) for (let x = 5; x < this.width - 5; x += 1) {
        if (y % 20 < 12) data[(y * this.width + x) * 4 + 3] = 255;
      }
      return { data };
    }
  };
  getContext() { return this.ctx; }
}

afterEach(() => vi.unstubAllGlobals());

describe("admitted world fonts", () => {
  it("exposes font loading from the public engine entry", () => {
    expect(rootLoadFont).toBe(loadFont);
  });

  it("validates and bounds input before decoding, registers a face and releases it once", async () => {
    const face = { load: vi.fn(async function () { return face; }) };
    const platform: FontLoaderPlatform = { createFace: vi.fn(() => face), fonts: { add: vi.fn(), delete: vi.fn(() => true) } };
    const loaded = await loadFont({ data: fontBytes(), metadata }, { platform });
    expect(loaded.family).toMatch(/^AuraFont\d+$/);
    expect(platform.fonts.add).toHaveBeenCalledOnce();
    loaded.dispose(); loaded.dispose();
    expect(loaded.disposed).toBe(true);
    expect(platform.fonts.delete).toHaveBeenCalledOnce();
    await expect(loadFont({ data: fontBytes(), metadata: { ...metadata, license: "" } }, { platform })).rejects.toThrow(/license/);
    const invalid = fontBytes(); new DataView(invalid.buffer).setUint32(24, 9999);
    await expect(loadFont({ data: invalid, metadata }, { platform })).rejects.toThrow(/bounded/);
    expect(platform.createFace).toHaveBeenCalledOnce();
  });

  it("keeps shaped runs intact for kerning, ligatures, fallback and RTL", () => {
    const measure = context();
    const shaped = shapeText("AV fi\nمرحبا", { font: font(), fallbackFonts: [font("AuraFont2")] }, measure);
    expect(shaped.lines.map((line) => line.direction)).toEqual(["ltr", "rtl"]);
    expect(shaped.lines.map((line) => line.text)).toEqual(["AV fi", "مرحبا"]);
    expect(shaped.lines[0]?.width).toBe(45);
    expect(shaped.font).toContain('"AuraFont1", "AuraFont2"');
    expect(measure.seen).toContain("AV fi");
    expect(measure.fontKerning).toBe("normal");
  });

  it("wraps without splitting combining or emoji graphemes and honors explicit direction", () => {
    const shaped = shapeText("Á🙂B\nשלום עולם", { font: font(), maxWidth: 20, direction: "rtl", lineHeight: 20 }, context());
    expect(shaped.lines.every((line) => line.direction === "rtl")).toBe(true);
    expect(shaped.lines[0]?.text).toBe("Á");
    expect(shaped.lines.map((line) => line.text).join("")).toContain("🙂B");
    expect(shaped.height).toBe(shaped.lines.length * 20);
    expect(() => shapeText("one two three", { font: font(), maxWidth: 10, maxLines: 1 }, context())).toThrow(/maxLines/);
    expect(() => shapeText("A", { font: { ...font(), disposed: true } }, context())).toThrow(/undisposed/);
    const zeroWidth = context();
    zeroWidth.measureText = () => ({ width: 0 });
    expect(() => shapeText("x ".repeat(2000), { font: font(), maxWidth: 20 }, zeroWidth)).toThrow(/work budget/);
  });

  it("bounds atlas allocation, retains live entries, coalesces updates and disposes backing", () => {
    const texture = { dispose: vi.fn() };
    const atlas = new GlyphAtlas({ width: 16, height: 8, maxEntries: 2, texture });
    const bitmap = { width: 6, height: 6, data: new Uint8Array(36).fill(100) };
    const a = atlas.acquire("a", bitmap);
    atlas.acquire("b", bitmap);
    expect(() => atlas.acquire("c", bitmap)).toThrow(/full/);
    atlas.release("a");
    const c = atlas.acquire("c", bitmap);
    expect(c.x).toBe(a.x);
    atlas.update("c", { ...bitmap, data: new Uint8Array(36).fill(200) });
    const updates = atlas.takeUpdates();
    expect(updates).toHaveLength(1);
    expect(updates[0]?.data).toContain(200);
    expect(atlas.takeUpdates()).toEqual([]);
    atlas.release("b"); atlas.release("c");
    expect(() => atlas.release("c")).toThrow(/matching/);
    atlas.dispose(); atlas.dispose();
    expect(texture.dispose).toHaveBeenCalledOnce();
    expect(atlas.data.byteLength).toBe(0);
    expect(() => atlas.acquire("x", bitmap)).toThrow(/disposed/);
  });

  it("retries a failed GPU atlas upload and releases the backing once", () => {
    const texture = { update: vi.fn().mockImplementationOnce(() => { throw new Error("device busy"); }), dispose: vi.fn() };
    const atlas = new GlyphAtlas({ width: 8, height: 8, texture });
    atlas.acquire("a", { width: 2, height: 2, data: new Uint8Array([1, 2, 3, 4]) });
    expect(() => atlas.flush()).toThrow(/device busy/);
    expect(atlas.flush()).toBe(true);
    expect(texture.update).toHaveBeenCalledTimes(2);
    expect(texture.update.mock.calls[1]![0].data).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(atlas.flush()).toBe(false);
    atlas.dispose(); atlas.dispose();
    expect(texture.dispose).toHaveBeenCalledOnce();
  });

  it("produces distinct multiline SDF quads from native-shaped text", () => {
    vi.stubGlobal("OffscreenCanvas", MockCanvas);
    const result = createDynamicSdfText("مرحبا\n你好", { font: font(), size: 1, rasterSize: 32 });
    expect(result.layout.quads).toHaveLength(2);
    expect(result.layout.quads[0]!.corners[1]).toBeGreaterThan(result.layout.quads[1]!.corners[1]);
    expect(result.image.coveredTexels).toBeGreaterThan(0);
    const mesh = createSdfTextQuadMesh(result.layout, result.image);
    expect(mesh.positions[1]).toBeGreaterThan(mesh.positions[13]!);
  });

  it("carries shaped text into the real compiler resource and releases its texture", () => {
    vi.stubGlobal("OffscreenCanvas", MockCanvas);
    const node = text3D("مرحبا\n你好", { font: font(), rasterSize: 32, material: { color: "#ff0000", opacity: 0.5, roughness: 0.3 } }).toJSON();
    expect(node.text3D?.text).toBe("مرحبا\n你好");
    expect(node.text3D?.sdfAccessibleLabel).toBe("مرحبا\n你好");
    expect(node.size).toBeUndefined();
    const resource = createSdfTextPrimitiveResource(node, () => { throw new Error("unexpected fallback"); });
    expect(resource?.sdfText?.quadCount).toBe(2);
    const textGeometry = resource!.geometry;
    selectProductionPrimitiveResource({ node, resources: [resource!], currentLodIndex: 0 }, node, [0, 0, 1]);
    expect(resource!.geometry).toBe(textGeometry);
    const material = resource!.texturedMaterial!;
    expect(material.getParameter("u_baseColor")).toEqual([1, 0, 0, 0.5]);
    expect(material.getParameter("u_roughness")).toBe(0.3);
    const binding = material.getParameter("u_baseColorTexture") as TextureBinding;
    expect(binding.texture?.disposed).toBe(false);
    material.dispose(); material.dispose();
    expect(binding.texture?.disposed).toBe(true);
    resource!.geometry.dispose(); resource!.material.dispose();
    const restored = createSdfTextPrimitiveResource(JSON.parse(JSON.stringify(node)), () => { throw new Error("unexpected fallback"); })!;
    expect(restored.sdfText?.quadCount).toBe(2);
    restored.geometry.dispose(); restored.material.dispose(); restored.texturedMaterial?.dispose();
    const invalid = { ...node, text3D: { ...node.text3D!, sdfDynamic: { ...node.text3D!.sdfDynamic!, image: { ...node.text3D!.sdfDynamic!.image, width: 0 } } } };
    expect(() => createSdfTextPrimitiveResource(invalid, () => {})).toThrow();
  });

  it("applies text tint and alpha per frame without accumulating fade and rejects unsupported shaders", () => {
    vi.stubGlobal("OffscreenCanvas", MockCanvas);
    const node = text3D("AV", { font: font(), rasterSize: 32, material: { color: "#ff0000", opacity: 0.5 } }).toJSON();
    const resource = createSdfTextPrimitiveResource(node, () => {})!;
    applySdfTextFrameAppearance(resource, node, 0.4);
    expect(resource.texturedMaterial!.getParameter("u_baseColor")).toEqual([1, 0, 0, 0.2]);
    applySdfTextFrameAppearance(resource, node, 0.4);
    expect(resource.sdfText?.lastOpacity).toBe(0.2);
    applySdfTextFrameAppearance(resource, { ...node, material: { color: "#00ff00", opacity: 0.25 } }, 0.8);
    expect(resource.texturedMaterial!.getParameter("u_baseColor")).toEqual([0, 1, 0, 0.2]);
    expect(() => text3D("AV", { font: font(), material: { kind: "custom" } })).toThrow(/AURA_TEXT_MATERIAL_UNSUPPORTED/);
    expect(() => createSdfTextPrimitiveResource({ ...node, material: { kind: "custom" } }, () => {})).toThrow(/AURA_TEXT_MATERIAL_UNSUPPORTED/);
    expect(() => applySdfTextFrameAppearance(resource, { ...node, material: { kind: "custom" } }, 1)).toThrow(/AURA_TEXT_MATERIAL_UNSUPPORTED/);
    resource.geometry.dispose(); resource.material.dispose(); resource.texturedMaterial?.dispose();
  });

  it("reshapes and swaps a mounted text resource without losing the old resource on failure", () => {
    vi.stubGlobal("OffscreenCanvas", MockCanvas);
    const node = text3D("AV", { font: font(), rasterSize: 32 }).toJSON();
    const initial = createSdfTextPrimitiveResource(node, () => {})!;
    const oldTexture = (initial.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    const descriptor = reshapeWorldTextDescriptor(node.text3D!, "AV fi\nبسب");
    expect(descriptor.sdfAccessibleLabel).toBe("AV fi\nبسب");
    expect(() => replaceSdfTextPrimitiveResource(initial, { ...node, text3D: { ...descriptor, sdfDynamic: { ...descriptor.sdfDynamic!, image: { ...descriptor.sdfDynamic!.image, width: 0 } } } })).toThrow();
    expect(oldTexture.disposed).toBe(false);
    const next = replaceSdfTextPrimitiveResource(initial, { ...node, text3D: descriptor });
    expect(oldTexture.disposed).toBe(true);
    expect(next.sdfText?.quadCount).toBe(2);
    next.geometry.dispose(); next.material.dispose(); next.texturedMaterial?.dispose();
    expect(() => reshapeWorldTextDescriptor(JSON.parse(JSON.stringify(descriptor)), "V")).toThrow(/loaded font/);
  });

  it("updates a live handle through the primitive selector and accessible label without mutating another handle", () => {
    vi.stubGlobal("OffscreenCanvas", MockCanvas);
    const node = text3D("AV", { font: font(), rasterSize: 32 }).runtime({ id: "caption", mutable: true }).toJSON();
    const handle = createRuntimeNodeHandle(node as never, node.runtime!);
    const other = createRuntimeNodeHandle({ ...node } as never, node.runtime!);
    const registry = { get: () => handle } as never;
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const old = entry.resources[0]!;
    const oldTexture = (old.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    handle.setText("AV fi\nبسب");
    const current = resolveProductionPrimitiveRuntimeState(entry, registry);
    const replacement = selectProductionPrimitiveResource(entry, current.node, [0, 0, 1]);
    expect(replacement).not.toBe(old);
    expect(entry.resources[0]).toBe(replacement);
    expect(oldTexture.disposed).toBe(true);
    expect(replacement.sdfText?.quadCount).toBe(2);
    expect(selectProductionPrimitiveResource(entry, current.node, [0, 0, 1])).toBe(replacement);
    expect(worldLabelsFromSnapshot(scene().add(node).toJSON(), registry).map((label) => label.text)).toEqual(["AV fi\nبسب"]);
    expect(worldLabelsFromSnapshot(scene().add(node).toJSON(), { get: () => other } as never).map((label) => label.text)).toEqual(["AV"]);
    expect(() => handle.setText("")).toThrow();
    const stillCurrent = resolveProductionPrimitiveRuntimeState(entry, registry);
    expect(stillCurrent.node.text3D?.text).toBe("AV fi\nبسب");
    const priorTexture = (replacement.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    handle.setMaterial({ color: "#00ff00", roughness: 0.2 });
    const nextState = resolveProductionPrimitiveRuntimeState(entry, registry);
    const retinted = selectProductionPrimitiveResource(entry, nextState.node, [0, 0, 1]);
    expect(priorTexture.disposed).toBe(true);
    expect(retinted.texturedMaterial!.getParameter("u_baseColor")).toEqual([0, 1, 0, 1]);
    expect(retinted.texturedMaterial!.getParameter("u_roughness")).toBe(0.2);
    expect(() => handle.setMaterial({ kind: "custom" })).toThrow(/AURA_TEXT_MATERIAL_UNSUPPORTED/);
    expect(resolveProductionPrimitiveRuntimeState(entry, registry).node.material).toEqual({ color: "#00ff00", roughness: 0.2 });
    retinted.geometry.dispose(); retinted.material.dispose(); retinted.texturedMaterial?.dispose();
  });

  it("does not publish stale shaped text if an observer calls setText during replacement", () => {
    vi.stubGlobal("OffscreenCanvas", MockCanvas);
    const node = text3D("AV", { font: font(), rasterSize: 32 }).runtime({ id: "reentrant-text", mutable: true }).toJSON();
    const handle = createRuntimeNodeHandle(node as never, node.runtime!);
    const registry = { get: () => handle } as never;
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const old = entry.resources[0]!;
    const oldTexture = (old.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    handle.setText("AV fi");
    const afterApply = vi.fn();
    const unobserve = observePrimitiveMaterial(entry, {
      beforeReplace() { handle.setText("AV fi\nبسب"); },
      afterApply
    });

    expect(() => resolveProductionPrimitiveRuntimeState(entry, registry)).toThrow(/PRIMITIVE_MATERIAL_SUPERSEDED/);
    expect(entry.resources[0]).toBe(old);
    expect(() => old.geometry.vertexBuffer.readBytes(0, 0)).not.toThrow();
    expect(oldTexture.disposed).toBe(false);
    expect(afterApply).toHaveBeenCalledOnce();
    expect(afterApply.mock.calls[0]![1]).toBe(old);
    unobserve();

    const current = resolveProductionPrimitiveRuntimeState(entry, registry);
    const replacement = selectProductionPrimitiveResource(entry, current.node, [0, 0, 1]);
    expect(replacement.sourceNode.text3D?.text).toBe("AV fi\nبسب");
    expect(replacement.sdfText?.quadCount).toBe(2);
    expect(oldTexture.disposed).toBe(true);
    replacement.geometry.dispose(); replacement.material.dispose(); replacement.texturedMaterial?.dispose();
  });

  it("refreshes every text LOD before selection and releases superseded textures", () => {
    vi.stubGlobal("OffscreenCanvas", MockCanvas);
    const node = text3D("AV", { font: font(), rasterSize: 32, lod: { levels: [
      { name: "near", maxDistance: 5, primitive: "box", material: { color: "#ff0000", roughness: 0.4 } }, { name: "far", primitive: "sphere" }
    ] } }).runtime({ id: "lod-text", mutable: true }).toJSON();
    const handle = createRuntimeNodeHandle(node as never, node.runtime!);
    const registry = { get: () => handle } as never;
    const entry = createProductionRuntimePrimitiveEntries([node])[0]!;
    const [oldNear, oldFar] = entry.resources;
    const oldNearTexture = (oldNear!.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    const oldFarTexture = (oldFar!.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    handle.setText("AV fi\nبسب");
    const current = resolveProductionPrimitiveRuntimeState(entry, registry);
    const [refreshedNear, refreshedFar] = entry.resources;
    expect(oldNearTexture.disposed).toBe(true);
    expect(oldFarTexture.disposed).toBe(true);
    expect((refreshedNear!.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!.disposed).toBe(false);
    expect((refreshedFar!.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!.disposed).toBe(false);
    const near = selectProductionPrimitiveResource(entry, current.node, [0, 0, 1]);
    expect(near).toBe(refreshedNear);
    expect(near.sdfText?.quadCount).toBe(2);
    expect(near.name).toBe("near");
    const far = selectProductionPrimitiveResource(entry, current.node, [0, 0, 10]);
    expect(far).toBe(refreshedFar);
    expect(far.sdfText?.quadCount).toBe(2);
    expect(far.name).toBe("far");
    const priorNearTexture = (near.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    const priorFarTexture = (far.texturedMaterial!.getParameter("u_baseColorTexture") as TextureBinding).texture!;
    handle.setMaterial({ color: "#00ff00", roughness: 0.2 });
    const recolored = resolveProductionPrimitiveRuntimeState(entry, registry);
    expect(priorNearTexture.disposed).toBe(true);
    expect(priorFarTexture.disposed).toBe(true);
    const nearOverride = selectProductionPrimitiveResource(entry, recolored.node, [0, 0, 1]);
    expect(nearOverride).toBe(entry.resources[0]);
    applySdfTextFrameAppearance(nearOverride, recolored.node, 0.5);
    expect(nearOverride.texturedMaterial!.getParameter("u_baseColor")).toEqual([1, 0, 0, 0.5]);
    const farInherited = selectProductionPrimitiveResource(entry, recolored.node, [0, 0, 10]);
    expect(farInherited).toBe(entry.resources[1]);
    expect(farInherited.texturedMaterial!.getParameter("u_baseColor")).toEqual([0, 1, 0, 1]);
    expect(farInherited.texturedMaterial!.getParameter("u_roughness")).toBe(0.2);
    for (const resource of entry.resources) { resource.geometry.dispose(); resource.material.dispose(); resource.texturedMaterial?.dispose(); }
  });

  it("creates, updates and removes a screen-reader counterpart with the scene layer", () => {
    class Element {
      style = { cssText: "", position: "" }; textContent = ""; children: Element[] = []; parent?: Element;
      attributes: Record<string, string> = {};
      setAttribute(key: string, value: string) { this.attributes[key] = value; }
      append(element: Element) { element.parent = this; this.children.push(element); }
      remove() { if (this.parent) this.parent.children = this.parent.children.filter((child) => child !== this); }
    }
    const host = new Element();
    vi.stubGlobal("document", { body: host, createElement: () => new Element(), createElementNS: () => new Element() });
    vi.stubGlobal("getComputedStyle", () => ({ position: "relative" }));
    vi.stubGlobal("OffscreenCanvas", MockCanvas);
    const node = text3D("你好", { font: font(), accessibleLabel: "Greeting", rasterSize: 32 }).toJSON();
    const snapshot = scene().add(node).toJSON();
    const canvas = {
      parentElement: host, getBoundingClientRect: () => ({ left: 0, top: 0, width: 64, height: 64 })
    } as unknown as HTMLCanvasElement;
    const layer = createSceneLabelLayer(canvas, snapshot)!;
    layer.setLabels(worldLabelsFromSnapshot(snapshot));
    const accessible = host.children.find((child) => "data-aura-world-text-accessibility" in child.attributes)!;
    expect(accessible.children.map((child) => child.textContent)).toEqual(["Greeting"]);
    const liveNode = { ...node, runtime: { id: "text-runtime", mutable: true } };
    const liveSnapshot = scene().add(liveNode).toJSON();
    const updated = reshapeWorldTextDescriptor(node.text3D!, "AV fi");
    const liveRegistry = { get: () => ({ __auraText3D: updated, snapshot: () => ({ visible: true, position: [0, 0, 0] }) }) };
    layer.setLabels(worldLabelsFromSnapshot(liveSnapshot, liveRegistry as never));
    // A custom accessible label stays stable across text changes.
    expect(accessible.children.map((child) => child.textContent)).toEqual(["Greeting"]);
    const defaultNode = text3D("AV", { font: font(), rasterSize: 32 }).toJSON();
    const defaultUpdated = reshapeWorldTextDescriptor(defaultNode.text3D!, "VAV");
    const defaultSnapshot = scene().add({ ...defaultNode, runtime: { id: "text-runtime", mutable: true } }).toJSON();
    layer.setLabels(worldLabelsFromSnapshot(defaultSnapshot, { get: () => ({ __auraText3D: defaultUpdated, snapshot: () => ({ visible: true, position: [0, 0, 0] }) }) } as never));
    expect(accessible.children.map((child) => child.textContent)).toEqual(["VAV"]);
    layer.setLabels([]);
    expect(accessible.children).toHaveLength(0);
    layer.dispose(); layer.dispose();
    expect(host.children).not.toContain(accessible);
  });
});
