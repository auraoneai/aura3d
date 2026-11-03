// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraPrimitiveNode, AuraRendererRuntimeObservation, ProductionRuntimePrimitiveEntry } from "../nodes/types.js";
import { describeSdfTextPixelBacking, layoutSdfText, rasterizeSdfTextLabelImage, type DynamicSdfText } from "@aura3d/rendering";
import { rootSdfFontAtlas } from "../nodes/text3d.js";

/** Resolve either a shaped font snapshot or the backward-compatible catalog. */
export function compileSdfTextSnapshot(text: NonNullable<AuraPrimitiveNode["text3D"]>): DynamicSdfText {
  if (text.sdfDynamic) {
    const snapshot = text.sdfDynamic;
    const layout = snapshot.layout;
    if (!layout || layout.kind !== "aura-sdf-text-layout" || layout.method !== "sdf-atlas-quad" ||
        typeof layout.text !== "string" || layout.text.length > 16_384 || !Array.isArray(layout.quads) ||
        layout.quads.length < 1 || layout.quads.length > 1024 || layout.glyphCount !== layout.quads.length ||
        !Number.isFinite(layout.widthWorld) || layout.widthWorld <= 0 ||
        !Number.isFinite(layout.heightWorld) || layout.heightWorld <= 0 ||
        !Array.isArray(layout.unsupportedCharacters) || layout.unsupportedCharacters.some((value) => typeof value !== "string") || !layout.style ||
        !Number.isFinite(layout.style.outlineWidthEm) || layout.style.outlineWidthEm < 0 ||
        !Number.isFinite(layout.style.glowRadiusEm) || layout.style.glowRadiusEm < 0 ||
        !Number.isFinite(layout.style.shadowOpacity) || layout.style.shadowOpacity < 0 || layout.style.shadowOpacity > 1 ||
        !Number.isFinite(layout.style.smoothingEm) || layout.style.smoothingEm <= 0 ||
        (layout.style.shadowOffsetEm !== undefined && (!Array.isArray(layout.style.shadowOffsetEm) ||
          layout.style.shadowOffsetEm.length !== 2 || layout.style.shadowOffsetEm.some((value) => !Number.isFinite(value)))) ||
        (layout.style.lodFadeNear !== undefined && !Number.isFinite(layout.style.lodFadeNear)) ||
        (layout.style.lodFadeFar !== undefined && !Number.isFinite(layout.style.lodFadeFar)) ||
        layout.quads.some((quad) => !quad || typeof quad.glyph !== "string" ||
          !Array.isArray(quad.corners) || quad.corners.length !== 8 || quad.corners.some((value: unknown) => typeof value !== "number" || !Number.isFinite(value) || !Number.isFinite(Math.fround(value))) ||
          !Array.isArray(quad.uv) || quad.uv.length !== 4 || quad.uv.some((value: unknown) => typeof value !== "number" || !Number.isFinite(value)))) {
      throw new Error("Aura3D text snapshot has invalid layout data.");
    }
    const copyLayout: DynamicSdfText["layout"] = {
      ...layout,
      quads: layout.quads.map((quad) => ({ ...quad, corners: [...quad.corners], uv: [...quad.uv] })),
      unsupportedCharacters: [...layout.unsupportedCharacters],
      style: {
        ...layout.style,
        ...(layout.style.shadowOffsetEm === undefined ? {} : { shadowOffsetEm: [...layout.style.shadowOffsetEm] as [number, number] })
      }
    };
    if (!snapshot.image || typeof snapshot.image !== "object") throw new Error("Aura3D text snapshot has invalid image data.");
    const { width, height } = snapshot.image;
    if (snapshot.image.kind !== "aura-sdf-text-image" || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width > 4096 || height > 4096 || width * height > 4_194_304) {
      throw new RangeError("Aura3D text snapshot exceeds the bounded pixel budget.");
    }
    // JSON represents a Uint8Array as numeric object keys. Restore its typed
    // bytes at the compiler boundary, and reject malformed serialized data.
    const source: unknown = snapshot.image.data;
    if (ArrayBuffer.isView(source) && typeof SharedArrayBuffer !== "undefined" && source.buffer instanceof SharedArrayBuffer) {
      throw new Error("Aura3D text snapshots cannot use mutable shared memory.");
    }
    if (source instanceof Uint8Array) {
      if (source.length !== width * height * 4) throw new Error("Aura3D text snapshot pixel length does not match its dimensions.");
      return { ...snapshot, layout: copyLayout, image: { ...snapshot.image, data: new Uint8Array(source) } };
    }
    if (!source || typeof source !== "object") throw new Error("Aura3D text snapshot has invalid pixel data.");
    const values = source as Record<number, unknown>;
    const length = width * height * 4;
    if (Object.keys(source).length !== length) throw new Error("Aura3D text snapshot pixel length does not match its dimensions.");
    const data = new Uint8Array(length);
    for (let i = 0; i < length; i += 1) {
      const value = values[i];
      if (!Object.prototype.hasOwnProperty.call(values, i) || typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255) throw new Error("Aura3D text snapshot has invalid pixel data.");
      data[i] = value;
    }
    return { ...snapshot, layout: copyLayout, image: { ...snapshot.image, data } };
  }
  const atlas = rootSdfFontAtlas();
  const layout = layoutSdfText(text.text, atlas, {
    size: text.sdfSize ?? 1,
    ...(text.sdfLetterSpacing === undefined ? {} : { letterSpacing: text.sdfLetterSpacing }),
    ...(text.sdfStyle === undefined ? {} : { style: text.sdfStyle })
  });
  const style = layout.style;
  const styled = text.sdfStyle !== undefined && (style.outlineWidthEm > 0 || style.glowRadiusEm > 0 || style.shadowOffsetEm !== undefined);
  return {
    layout,
    image: rasterizeSdfTextLabelImage(layout, atlas, {
      texelsPerWorldUnit: 64,
      ...(styled ? { outline: [1, 0.85, 0.6, 1] as const, glow: [0.5, 0.8, 1, 1] as const, shadow: [0, 0, 0, 1] as const } : {})
    })
  };
}

/**
 * G1 SDF text observation (muse3jsparity-PRD): per-resource fail-closed gate
 * (`describeSdfTextPixelBacking`) ANDed across mounted SDF resources. Layout
 * alone never backs pixels; lastOpacity is the live LOD x occlusion proof.
 */
export function createProductionTextObservation(
  entries: readonly ProductionRuntimePrimitiveEntry[]
): NonNullable<AuraRendererRuntimeObservation["text"]> {
  const sdf = entries.flatMap((entry) => entry.resources.filter((resource) => resource.sdfText !== null));
  if (sdf.length === 0) {
    return {
      sdfTexts: 0,
      textPixelBacked: false,
      quadCount: 0,
      lastOpacity: 1,
      reason: "no SDF text nodes mounted"
    };
  }
  const gates = sdf.map((resource) => describeSdfTextPixelBacking({
    atlasUploaded: resource.textureStatus === "textured" && resource.texturedMaterial !== null,
    quadsSubmitted: resource.sdfText!.lastSubmitted,
    quadCount: resource.sdfText!.quadCount
  }));
  const backed = gates.filter((gate) => gate.textPixelBacked).length;
  const quadCount = sdf.reduce((total, resource) => total + (resource.sdfText?.quadCount ?? 0), 0);
  const lastOpacity = Math.min(...sdf.map((resource) => resource.sdfText?.lastOpacity ?? 1));
  return {
    sdfTexts: sdf.length,
    textPixelBacked: backed === sdf.length,
    quadCount,
    lastOpacity,
    reason: backed === sdf.length
      ? `${backed}/${sdf.length} SDF quad sets sampled from uploaded label textures (${quadCount} quads)`
      : `${backed}/${sdf.length} SDF quad sets backed: ${gates.filter((gate) => !gate.textPixelBacked).map((gate) => gate.reason).join("; ")}`
  };
}
