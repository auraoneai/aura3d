import { afterEach, describe, expect, it, vi } from "vitest";
import type { LoadedFont } from "../../../packages/rendering/src/text/FontLoader";
import type { TextureBinding } from "../../../packages/rendering/src/TextureBinding";
import { createRuntimeNodeHandle } from "../../../packages/engine/src/agent-api/app/runtimeNodes";
import { createSdfTextPrimitiveResource } from "../../../packages/engine/src/agent-api/compiler/textures";
import { reshapeWorldTextDescriptor, text3D, type AuraWorldTextOptions } from "../../../packages/engine/src/agent-api/nodes/text3d";
import type { AuraPrimitiveNode } from "../../../packages/engine/src/agent-api/nodes/types";

class TextCanvas {
  width = 1;
  height = 1;
  readonly context = {
    font: "", direction: "ltr", fontKerning: "auto", letterSpacing: "0px", textBaseline: "middle", textAlign: "left", fillStyle: "",
    measureText: (text: string) => ({ width: [...text].length * 8 }),
    fillText() {},
    getImageData: () => {
      const data = new Uint8ClampedArray(this.width * this.height * 4);
      for (let y = 2; y < this.height - 2; y += 1) {
        for (let x = 2; x < this.width - 2; x += 1) data[(y * this.width + x) * 4 + 3] = 255;
      }
      return { data };
    }
  };
  getContext() { return this.context; }
}

const font: LoadedFont = {
  family: "AuraFont1", metadata: { family: "test", license: "test", licenseUrl: "https://example.org/license" },
  disposed: false, dispose() {}
};

afterEach(() => vi.unstubAllGlobals());

describe("built-in SDF glyph atlas option", () => {
  it("records the explicit opt-in in the serialized descriptor and preserves layout and accessibility", () => {
    const options = { backend: "sdf" as const, size: 1.2, letterSpacing: 0.1, sdfOcclusion: "hide" as const };
    const existing = text3D("A?B", options).toJSON();
    const selected = text3D("A?B", { ...options, sdfGlyphAtlas: "shared", accessibleLabel: "Letters" }).toJSON();
    expect(existing.text3D).not.toHaveProperty("sdfGlyphAtlas");
    expect(selected.text3D).toMatchObject({
      backend: "sdf", method: "sdf-atlas-quad", sdfGlyphAtlas: "shared", sdfSize: 1.2,
      sdfLetterSpacing: 0.1, sdfOcclusion: "hide", sdfAccessibleLabel: "Letters"
    });
    expect(selected.text3D?.sdfQuadCount).toBe(existing.text3D?.sdfQuadCount);
    expect(selected.text3D?.sdfWidthWorld).toBe(existing.text3D?.sdfWidthWorld);
    expect(selected.text3D?.unsupportedCharacters).toEqual(existing.text3D?.unsupportedCharacters);
    expect(selected.ignoredOptions ?? []).toEqual([]);
    expect(JSON.parse(JSON.stringify(selected)).text3D.sdfGlyphAtlas).toBe("shared");
    expect(text3D("A", { backend: "sdf", sdfGlyphAtlas: "shared" }).toJSON().text3D?.sdfAccessibleLabel).toBe("A");
    expect(text3D("A", { backend: "sdf", sdfGlyphAtlas: "shared", accessibleLabel: false }).toJSON().text3D?.sdfAccessibleLabel).toBe(false);
  });

  it("keeps the existing extruded default and permits the style data needed by fallback", () => {
    const defaultText = text3D("A").toJSON();
    expect(defaultText.text3D?.method).toBe("extruded-bitmap-glyph-mesh");
    expect(defaultText.text3D).not.toHaveProperty("sdfGlyphAtlas");
    const styled = text3D("A", { backend: "sdf", sdfGlyphAtlas: "shared", size: 2, sdfStyle: { outlineWidthEm: 0.08 } }).toJSON();
    expect(styled.text3D).toMatchObject({ sdfGlyphAtlas: "shared", sdfSize: 2, sdfStyle: { outlineWidthEm: 0.08 } });
  });

  it("uses the existing per-label SDF resource when no mount scope is supplied", () => {
    const node = text3D("AB", { backend: "sdf", sdfGlyphAtlas: "shared" }).toJSON();
    const resource = createSdfTextPrimitiveResource(node, () => {});
    expect(resource?.sdfText?.quadCount).toBe(2);
    const material = resource?.texturedMaterial;
    expect(material).toBeDefined();
    const binding = material!.getParameter("u_baseColorTexture") as TextureBinding;
    expect(binding.texture).not.toBeNull();
    resource!.geometry.dispose();
    resource!.material.dispose();
    material!.dispose();
    expect(binding.texture?.disposed).toBe(true);
  });

  it("rejects unrecognized values and requests on the extruded backend", () => {
    for (const value of [null, false, "", "private", 0]) {
      expect(() => text3D("A", { backend: "sdf", sdfGlyphAtlas: value } as unknown as AuraWorldTextOptions)).toThrow(/sdfGlyphAtlas must be shared/);
    }
    expect(() => text3D("A", { sdfGlyphAtlas: "shared" })).toThrow(/requires the sdf text backend/);
    expect(() => text3D("A", { backend: "extruded-mesh", sdfGlyphAtlas: "shared" })).toThrow(/requires the sdf text backend/);
  });

  it("retains loaded-font shaped snapshots, live reshaping and accessibility overrides", () => {
    vi.stubGlobal("OffscreenCanvas", TextCanvas);
    const node = text3D("AV", { font, rasterSize: 16, sdfGlyphAtlas: "shared", accessibleLabel: false }).toJSON();
    expect(node.text3D).toMatchObject({ backend: "sdf", sdfGlyphAtlas: "shared", sdfAccessibleLabel: false });
    expect(node.text3D?.sdfDynamic?.layout.text).toBe("AV");
    const updated = reshapeWorldTextDescriptor(node.text3D!, "VA");
    expect(updated.sdfDynamic?.layout.text).toBe("VA");
    expect(updated.sdfAccessibleLabel).toBe(false);
    expect(updated.sdfGlyphAtlas).toBe("shared");
    expect(node.text3D?.sdfDynamic?.layout.text).toBe("AV");
  });

  it("reshapes opted-in built-in text repeatedly through the runtime handle without mutating its original descriptor", () => {
    const style = { outlineWidthEm: 0.08, shadowOffsetEm: [0.1, 0.2] as [number, number] };
    const node = text3D("A", { backend: "sdf", sdfGlyphAtlas: "shared", size: 1.4, letterSpacing: 0.2, sdfStyle: style })
      .runtime({ id: "label", mutable: true }).toJSON();
    const handle = createRuntimeNodeHandle(node as never, node.runtime!);
    const current = () => (handle as unknown as { __auraText3D: NonNullable<AuraPrimitiveNode["text3D"]> }).__auraText3D;
    style.outlineWidthEm = 0.2;
    style.shadowOffsetEm[0] = 0.9;

    handle.setText("B?A");
    const updated = current();
    expect(updated).toMatchObject({
      text: "B?A", glyphCount: 2, unsupportedCharacters: ["?"], sdfQuadCount: 2,
      sdfHeightWorld: 1.4, sdfSize: 1.4, sdfLetterSpacing: 0.2, sdfGlyphAtlas: "shared",
      sdfStyle: { outlineWidthEm: 0.08, shadowOffsetEm: [0.1, 0.2] }, sdfAccessibleLabel: "B?A"
    });
    expect(updated.sdfWidthWorld).toBeCloseTo(3.1);
    expect(updated.sdfDynamic).toBeUndefined();
    expect(node.text3D?.text).toBe("A");
    expect(() => handle.setText("")).toThrow(/requires at least one character/);
    expect(() => handle.setText("???")).toThrow(/no supported glyphs/);
    expect(current()).toBe(updated);

    handle.setText("BA");
    expect(current()).toMatchObject({ text: "BA", glyphCount: 2, unsupportedCharacters: [], sdfAccessibleLabel: "BA" });
    expect(updated.text).toBe("B?A");
  });

  it("retains explicit accessible labels and leaves non-opted or serialized descriptors unretained", () => {
    const named = text3D("A", { backend: "sdf", sdfGlyphAtlas: "shared", accessibleLabel: "fixed label" }).toJSON();
    const hidden = text3D("A", { backend: "sdf", sdfGlyphAtlas: "shared", accessibleLabel: false }).toJSON();
    expect(reshapeWorldTextDescriptor(named.text3D!, "B").sdfAccessibleLabel).toBe("fixed label");
    expect(reshapeWorldTextDescriptor(hidden.text3D!, "B").sdfAccessibleLabel).toBe(false);
    const ordinary = text3D("A", { backend: "sdf" }).toJSON();
    expect(() => reshapeWorldTextDescriptor(ordinary.text3D!, "B")).toThrow(/loaded font/);
    const restored = JSON.parse(JSON.stringify(named.text3D));
    expect(() => reshapeWorldTextDescriptor(restored, "B")).toThrow(/recreate serialized nodes/);
  });
});
