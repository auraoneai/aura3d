import { describe, expect, it } from "vitest";
import {
  SDF_FONT_SCOPE_NOTE,
  SDF_SUPPORTED_GLYPHS,
  applySdfTextOcclusion,
  createSdfFontAtlas,
  createSdfTextQuadMesh,
  describeSdfTextPixelBacking,
  layoutSdfText,
  rasterizeSdfTextLabelImage,
  resolveSdfTextFrameOpacity,
  sampleSdfCoverage,
  sdfTextLodFade,
  summarizeTextSurfaces
  // Direct module import: the rendering barrel is currently unresolvable
  // (sibling worktree file shadows/SpotShadowMaps.ts imports "./ShadowMap",
  // which does not exist there). See the phase report blocker.
} from "../../../packages/rendering/src/SdfText";

describe("G1 SDF text", () => {
  it("bakes an atlas covering exactly the documented catalog", () => {
    const atlas = createSdfFontAtlas({ cellResolution: 4, padding: 4 });
    expect(atlas.glyphCount).toBe(SDF_SUPPORTED_GLYPHS.length);
    expect(atlas.glyphCount).toBe(39);
    expect(Object.keys(atlas.glyphs).sort().join("")).toBe([...SDF_SUPPORTED_GLYPHS].sort().join(""));
    expect(atlas.distances.length).toBe(atlas.width * atlas.height);
    // Distance field is normalized and actually varies (not a flat fill).
    let min = Infinity;
    let max = -Infinity;
    for (const value of atlas.distances) {
      if (value < min) min = value;
      if (value > max) max = value;
    }
    expect(min).toBeLessThan(0.5);
    expect(max).toBeGreaterThan(0.5);
  });

  it("bakes at default resolution (the bridge contract) with the same catalog", () => {
    const atlas = createSdfFontAtlas();
    expect(atlas.glyphCount).toBe(39);
    const layout = layoutSdfText("AURA3D", atlas);
    expect(layout.glyphCount).toBe(6);
    expect(layout.quads).toHaveLength(6);
  }, 60000);

  it("rejects bad atlas options fail-closed", () => {
    expect(() => createSdfFontAtlas({ cellResolution: 0 })).toThrow();
    expect(() => createSdfFontAtlas({ padding: -1 })).toThrow();
  });

  it("lays out glyph quads with catalog scope enforcement", () => {
    const atlas = createSdfFontAtlas({ cellResolution: 4, padding: 4 });
    const layout = layoutSdfText("AURA3D-2.0", atlas, { size: 0.72 });
    expect(layout.method).toBe("sdf-atlas-quad");
    expect(layout.glyphCount).toBe(10);
    expect(layout.quads).toHaveLength(10);
    expect(layout.unsupportedCharacters).toEqual([]);
    expect(layout.widthWorld).toBeGreaterThan(0);
    // Lowercase maps through uppercasing; emoji is reported, never substituted.
    const mixed = layoutSdfText("Aura!", atlas);
    expect(mixed.glyphCount).toBe(4);
    expect(mixed.unsupportedCharacters).toEqual(["!"]);
  });

  it("throws on empty or fully-unsupported strings", () => {
    const atlas = createSdfFontAtlas({ cellResolution: 4, padding: 4 });
    expect(() => layoutSdfText("", atlas)).toThrow();
    expect(() => layoutSdfText("!!!", atlas)).toThrow();
    expect(() => layoutSdfText("AURA", atlas, { size: 0 })).toThrow();
  });

  it("samples analytic coverage at the edge", () => {
    expect(sampleSdfCoverage(1, 0.1)).toBe(1);
    expect(sampleSdfCoverage(-1, 0.1)).toBe(0);
    expect(sampleSdfCoverage(0, 0.1)).toBeCloseTo(0.5, 6);
    expect(() => sampleSdfCoverage(0, 0)).toThrow();
  });

  it("fades LOD opacity smoothly with distance", () => {
    expect(sdfTextLodFade(5, 10, 20)).toBe(1);
    expect(sdfTextLodFade(25, 10, 20)).toBe(0);
    const mid = sdfTextLodFade(15, 10, 20);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
    expect(() => sdfTextLodFade(-1, 10, 20)).toThrow();
    expect(() => sdfTextLodFade(15, 20, 10)).toThrow();
  });

  it("mirrors the DOM layer occlusion semantics", () => {
    expect(applySdfTextOcclusion(false)).toEqual({ visible: true, opacity: 1 });
    expect(applySdfTextOcclusion(true, "dim")).toEqual({ visible: true, opacity: 0.35 });
    expect(applySdfTextOcclusion(true, "hide")).toEqual({ visible: false, opacity: 0 });
    expect(applySdfTextOcclusion(true, "show")).toEqual({ visible: true, opacity: 1 });
  });

  it("reports textPixelBacked fail-closed", () => {
    expect(describeSdfTextPixelBacking({ atlasUploaded: false, quadsSubmitted: true, quadCount: 9 }).textPixelBacked).toBe(false);
    expect(describeSdfTextPixelBacking({ atlasUploaded: true, quadsSubmitted: false, quadCount: 0 }).textPixelBacked).toBe(false);
    const backed = describeSdfTextPixelBacking({ atlasUploaded: true, quadsSubmitted: true, quadCount: 9 });
    expect(backed.textPixelBacked).toBe(true);
    expect(backed.quadCount).toBe(9);
  });

  it("keeps DOM vs SDF vs mesh counts separate", () => {
    const summary = summarizeTextSurfaces({ domLabels: 5, sdfTexts: 2, meshTexts: 1 });
    expect(summary.domLabels).toBe(5);
    expect(summary.sdfTexts).toBe(2);
    expect(summary.meshTexts).toBe(1);
    expect(() => summarizeTextSurfaces({ domLabels: -1, sdfTexts: 0, meshTexts: 0 })).toThrow();
  });

  it("documents the font scope without an arbitrary-shaping claim", () => {
    expect(SDF_FONT_SCOPE_NOTE).toMatch(/A-Z/);
    expect(SDF_FONT_SCOPE_NOTE).not.toMatch(/troika/i);
  });

  it("rasterizes laid-out text through the atlas sampler", () => {
    const atlas = createSdfFontAtlas();
    const layout = layoutSdfText("AURA", atlas, { size: 1 });
    const image = rasterizeSdfTextLabelImage(layout, atlas, { texelsPerWorldUnit: 32 });
    expect(image.kind).toBe("aura-sdf-text-image");
    expect(image.width).toBe(Math.ceil(layout.widthWorld * 32));
    expect(image.height).toBe(Math.ceil(layout.heightWorld * 32));
    expect(image.data.length).toBe(image.width * image.height * 4);
    expect(image.coveredTexels).toBeGreaterThan(0);
    expect(image.coveredTexels).toBeLessThan(image.width * image.height);
    // Fill is white by default: covered texels carry bright RGB.
    let bright = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      if (image.data[i + 3]! > 128 && image.data[i]! > 200) bright += 1;
    }
    expect(bright).toBeGreaterThan(0);
  }, 60000);

  it("adds outline/glow/shadow texels beyond the fill silhouette", () => {
    const atlas = createSdfFontAtlas();
    const plain = layoutSdfText("O", atlas, { size: 1 });
    const styled = layoutSdfText("O", atlas, {
      size: 1,
      style: { outlineWidthEm: 0.08, glowRadiusEm: 0.15, shadowOffsetEm: [0.06, -0.06] }
    });
    const fillOnly = rasterizeSdfTextLabelImage(plain, atlas, { texelsPerWorldUnit: 32 });
    const dressed = rasterizeSdfTextLabelImage(styled, atlas, {
      texelsPerWorldUnit: 32,
      outline: [1, 0.5, 0, 1],
      glow: [0, 0.8, 1, 1],
      shadow: [0, 0, 0, 1]
    });
    expect(dressed.coveredTexels).toBeGreaterThan(fillOnly.coveredTexels);
    expect(() => rasterizeSdfTextLabelImage(plain, atlas, { texelsPerWorldUnit: 0 })).toThrow();
    expect(() => rasterizeSdfTextLabelImage(plain, atlas, { fill: [2, 0, 0, 1] })).toThrow();
  }, 60000);

  it("builds a quad-strip mesh sharing one label image", () => {
    const atlas = createSdfFontAtlas();
    const layout = layoutSdfText("AB", atlas, { size: 1 });
    const image = rasterizeSdfTextLabelImage(layout, atlas, { texelsPerWorldUnit: 16 });
    const mesh = createSdfTextQuadMesh(layout, image);
    expect(mesh.kind).toBe("aura-sdf-text-quad-mesh");
    expect(mesh.quadCount).toBe(2);
    expect(mesh.vertexCount).toBe(8);
    expect(mesh.positions.length).toBe(8 * 3);
    expect(mesh.uvs.length).toBe(8 * 2);
    expect(mesh.tangents.length).toBe(8 * 4);
    expect(mesh.indices).toHaveLength(2 * 6);
    for (const uv of mesh.uvs) expect(uv).toBeGreaterThanOrEqual(0);
    for (const uv of mesh.uvs) expect(uv).toBeLessThanOrEqual(1);
    expect(mesh.max[0]).toBeCloseTo(layout.widthWorld, 6);
    expect(() => createSdfTextQuadMesh({ ...layout, quads: [] }, image)).toThrow();
  }, 60000);

  it("resolves per-frame opacity from LOD fade times occlusion", () => {
    // No fade range: occlusion alone.
    expect(resolveSdfTextFrameOpacity({ distance: 5, occluded: false }).opacity).toBe(1);
    expect(resolveSdfTextFrameOpacity({ distance: 5, occluded: true }).opacity).toBeCloseTo(0.35, 6);
    expect(resolveSdfTextFrameOpacity({ distance: 5, occluded: true, occlusionPolicy: "hide" })).toEqual(
      expect.objectContaining({ visible: false, opacity: 0 })
    );
    // LOD fade multiplies: past the far plane the text is fully faded.
    const faded = resolveSdfTextFrameOpacity({ distance: 30, lodFadeNear: 10, lodFadeFar: 20, occluded: false });
    expect(faded.lodFade).toBe(0);
    expect(faded.opacity).toBe(0);
    const near = resolveSdfTextFrameOpacity({ distance: 5, lodFadeNear: 10, lodFadeFar: 20, occluded: true });
    expect(near.lodFade).toBe(1);
    expect(near.opacity).toBeCloseTo(0.35, 6);
    // Half-specified ranges fail closed instead of silently fading nothing.
    expect(() => resolveSdfTextFrameOpacity({ distance: 5, lodFadeNear: 10, occluded: false })).toThrow();
    expect(() => resolveSdfTextFrameOpacity({ distance: -1, occluded: false })).toThrow();
  });
});
