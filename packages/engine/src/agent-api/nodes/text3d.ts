// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraPrimitiveOptions, AuraPrimitiveNode } from "./types.js";
import type { AuraCustomGeometrySpec, AuraText3DOptions } from "../RootGeometry.js";
import type { DynamicSdfTextOptions, LoadedFont, SdfFontAtlas, SdfTextLayoutOptions, SdfTextOcclusionPolicy, SdfTextStyle, TextDirection } from "@aura3d/rendering";
import { AuraNodeBuilder } from "./builder.js";
import { createAuraText3DGeometry } from "../RootGeometry.js";
import { createDynamicSdfText, createSdfFontAtlas, layoutSdfText } from "@aura3d/rendering";
import { primitive } from "./primitives.js";

let cachedSdfFontAtlas: SdfFontAtlas | undefined;
type TextDescriptor = NonNullable<AuraPrimitiveNode["text3D"]>;
type LiveTextOptions =
  | { readonly kind: "font"; readonly options: DynamicSdfTextOptions; readonly accessibleLabel?: string | false }
  | { readonly kind: "builtin"; readonly options: SdfTextLayoutOptions; readonly extrusion: AuraText3DOptions; readonly accessibleLabel?: string | false };
const liveTextOptions = new WeakMap<TextDescriptor, LiveTextOptions>();
// `practical` is the time-of-day classification tag that `material.emissive()`
// and `material.neon()` set by default; it carries no shader feature, so text
// built from those presets must not be rejected for it.
const SDF_MATERIAL_OPTIONS = new Set(["name", "color", "roughness", "metallic", "metalness", "emissive", "emissiveIntensity", "opacity", "textureAnisotropy", "practical"]);

// A glyph can produce up to 35 extruded boxes. Bound opted-in built-in text to
// 64 uppercased UTF-16 code units (at most 2,240 boxes / 53,760 vertices).
// This fits the existing default-size, default-spacing SDF raster work budget.
const MAX_BUILTIN_TEXT_UNITS = 64;

function assertLiveBuiltinTextWorkLimit(text: string): void {
  if (text.length > MAX_BUILTIN_TEXT_UNITS || text.toUpperCase().length > MAX_BUILTIN_TEXT_UNITS) {
    throw new RangeError(`Aura3D shared-atlas built-in text exceeds its ${MAX_BUILTIN_TEXT_UNITS}-unit geometry work limit.`);
  }
}

/** Reject shader and material features that the text texture compiler cannot apply. */
export function assertSdfTextMaterialSupported(spec: AuraPrimitiveNode["material"]): void {
  if (!spec) return;
  const unsupported = Object.entries(spec).filter(([key, value]) => value !== undefined && !SDF_MATERIAL_OPTIONS.has(key)).map(([key]) => key);
  if (unsupported.length) throw new Error(`AURA_TEXT_MATERIAL_UNSUPPORTED: SDF world text does not support material fields ${unsupported.join(", ")}.`);
}

/** Reshape a retained font-backed or explicitly opted-in built-in descriptor. */
export function reshapeWorldTextDescriptor(previous: TextDescriptor, text: string): TextDescriptor {
  const retained = liveTextOptions.get(previous);
  if (!retained) throw new Error("Aura3D live text updates require a node created with an undisposed loaded font or an original shared-atlas built-in descriptor; recreate serialized nodes first.");
  let next: TextDescriptor;
  if (retained.kind === "font") {
    const dynamic = createDynamicSdfText(text, retained.options);
    next = {
      ...previous, text, glyphCount: dynamic.layout.glyphCount, unsupportedCharacters: [],
      sdfQuadCount: dynamic.layout.quads.length, sdfWidthWorld: dynamic.layout.widthWorld,
      sdfHeightWorld: dynamic.layout.heightWorld, sdfDynamic: dynamic,
      sdfAccessibleLabel: retained.accessibleLabel ?? text
    };
  } else {
    // The compiler may need extrusion for any update; reject oversized input
    // before the handle publishes its descriptor and accessible label.
    assertLiveBuiltinTextWorkLimit(text);
    const layout = layoutSdfText(text, rootSdfFontAtlas(), retained.options);
    next = {
      ...previous, text, glyphCount: layout.glyphCount, unsupportedCharacters: [...layout.unsupportedCharacters],
      sdfQuadCount: layout.quads.length, sdfWidthWorld: layout.widthWorld,
      sdfHeightWorld: layout.heightWorld, sdfAccessibleLabel: retained.accessibleLabel ?? text
    };
  }
  liveTextOptions.set(next, retained);
  return next;
}

/** Lazily rebuild the opted-in built-in fallback with its original extrusion intent. */
export function createLiveBuiltinTextFallbackGeometry(descriptor: TextDescriptor): AuraCustomGeometrySpec {
  const retained = liveTextOptions.get(descriptor);
  if (!retained || retained.kind !== "builtin") throw new Error("Aura3D live text fallback requires the original shared-atlas built-in descriptor.");
  assertLiveBuiltinTextWorkLimit(descriptor.text);
  return createAuraText3DGeometry(descriptor.text, retained.extrusion).geometry;
}

export function rootSdfFontAtlas(): SdfFontAtlas {
  // Baked once per session (~500ms default res); the caller never bakes per frame.
  cachedSdfFontAtlas ??= createSdfFontAtlas();
  return cachedSdfFontAtlas;
}

/** Options `text3D` consumes itself (geometry, layout, backend); `primitive()` does not read them and rejects them. */
const TEXT_ONLY_OPTION_KEYS = ["size", "depth", "letterSpacing", "backend", "sdfStyle", "sdfOcclusion", "sdfGlyphAtlas", "font", "fallbackFonts", "direction", "maxWidth", "lineHeight", "maxLines", "rasterSize", "accessibleLabel"] as const;

function withoutTextOnlyKeys<T extends object>(options: T): Omit<T, typeof TEXT_ONLY_OPTION_KEYS[number]> {
  const rest: Record<string, unknown> = { ...(options as Record<string, unknown>) };
  for (const key of TEXT_ONLY_OPTION_KEYS) delete rest[key];
  return rest as Omit<T, typeof TEXT_ONLY_OPTION_KEYS[number]>;
}

export type AuraWorldTextOptions = AuraText3DOptions & Omit<AuraPrimitiveOptions, "geometry" | "text3D"> & {
  readonly backend?: "extruded-mesh" | "sdf";
  readonly sdfStyle?: SdfTextStyle;
  readonly sdfOcclusion?: SdfTextOcclusionPolicy;
  /** Request shared storage for built-in glyphs or eligible loaded-font label snapshots. */
  readonly sdfGlyphAtlas?: "shared";
  /** A loaded, admitted font selects the native shaped SDF path. */
  readonly font?: LoadedFont;
  readonly fallbackFonts?: readonly LoadedFont[];
  readonly direction?: TextDirection;
  /** Maximum line width in world units; longer words wrap at grapheme boundaries. */
  readonly maxWidth?: number;
  readonly lineHeight?: number;
  readonly maxLines?: number;
  readonly rasterSize?: number;
  /** Defaults to the text; false suppresses the accessible counterpart. */
  readonly accessibleLabel?: string | false;
};

export function text3D(text: string, options: AuraWorldTextOptions = {}): AuraNodeBuilder<AuraPrimitiveNode> {
  const primitiveOptions = withoutTextOnlyKeys(options);
  const backend = options.backend ?? (options.font ? "sdf" : "extruded-mesh");
  if (backend !== "sdf" && backend !== "extruded-mesh") throw new Error("Aura3D text backend must be sdf or extruded-mesh.");
  if (options.sdfGlyphAtlas !== undefined && options.sdfGlyphAtlas !== "shared") throw new Error("Aura3D sdfGlyphAtlas must be shared when specified.");
  if (backend !== "sdf" && options.sdfGlyphAtlas !== undefined) throw new Error("Aura3D sdfGlyphAtlas requires the sdf text backend.");
  if (options.accessibleLabel !== undefined && options.accessibleLabel !== false &&
      (typeof options.accessibleLabel !== "string" || !options.accessibleLabel.trim())) throw new Error("Aura3D accessibleLabel must be non-empty text or false.");
  const fontOnlyOptions = [options.fallbackFonts, options.direction, options.maxWidth, options.lineHeight, options.maxLines, options.rasterSize];
  if (!options.font && fontOnlyOptions.some((value) => value !== undefined)) throw new Error("Aura3D text shaping options require a loaded font.");
  if (options.font && backend !== "sdf") throw new Error("Aura3D loaded fonts require the sdf text backend.");
  if (backend === "extruded-mesh" && (options.sdfStyle !== undefined || options.sdfOcclusion !== undefined)) throw new Error("Aura3D SDF styling and occlusion require the sdf text backend.");
  if (backend === "sdf") assertSdfTextMaterialSupported(options.material);
  if (options.font && options.depth !== undefined) throw new Error("Aura3D loaded-font SDF text does not support extrusion depth.");
  if (options.sdfGlyphAtlas === "shared" && !options.font) assertLiveBuiltinTextWorkLimit(text);
  if (options.font) {
    const style = options.sdfStyle
      ? { ...options.sdfStyle, ...(options.sdfStyle.shadowOffsetEm ? { shadowOffsetEm: [...options.sdfStyle.shadowOffsetEm] as const } : {}) }
      : undefined;
    const shapingOptions: DynamicSdfTextOptions = {
      font: options.font,
      ...(options.fallbackFonts === undefined ? {} : { fallbackFonts: [...options.fallbackFonts] }),
      size: options.size ?? 1,
      ...(options.letterSpacing === undefined ? {} : { letterSpacing: options.letterSpacing }),
      ...(options.direction === undefined ? {} : { direction: options.direction }),
      ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      ...(options.lineHeight === undefined ? {} : { lineHeight: options.lineHeight }),
      ...(options.maxLines === undefined ? {} : { maxLines: options.maxLines }),
      ...(options.rasterSize === undefined ? {} : { rasterSize: options.rasterSize }),
      ...(style === undefined ? {} : { style })
    };
    const dynamic = createDynamicSdfText(text, shapingOptions);
    // This placeholder is never displayed: compiler/textures consumes the
    // shaped snapshot and propagates failures instead of using the fallback.
    const placeholder = createAuraText3DGeometry("A", { size: options.size ?? 1 });
    const descriptor: TextDescriptor = {
      text, glyphCount: dynamic.layout.glyphCount, unsupportedCharacters: [], method: "sdf-atlas-quad", backend: "sdf",
      sdfQuadCount: dynamic.layout.quads.length, sdfWidthWorld: dynamic.layout.widthWorld, sdfHeightWorld: dynamic.layout.heightWorld,
      sdfSize: options.size ?? 1,
      ...(style === undefined ? {} : { sdfStyle: style }),
      ...(options.sdfGlyphAtlas === undefined ? {} : { sdfGlyphAtlas: options.sdfGlyphAtlas }),
      sdfOcclusion: options.sdfOcclusion ?? "dim", sdfDynamic: dynamic,
      sdfAccessibleLabel: options.accessibleLabel ?? text
    };
    liveTextOptions.set(descriptor, { kind: "font", options: shapingOptions, ...(options.accessibleLabel === undefined ? {} : { accessibleLabel: options.accessibleLabel }) });
    return primitive("custom", {
      ...primitiveOptions,
      geometry: placeholder.geometry,
      text3D: descriptor
    });
  }
  const built = createAuraText3DGeometry(text, options);
  if (backend === "extruded-mesh") {
    return primitive("custom", { ...primitiveOptions, geometry: built.geometry, text3D: { text: built.text, glyphCount: built.glyphCount, unsupportedCharacters: built.unsupportedCharacters, method: built.method, sdfAccessibleLabel: options.accessibleLabel ?? text } });
  }
  // G1 SDF backend (muse3jsparity-PRD): the layout validates fail-loud and is
  // recorded on the descriptor with the full author intent (size, spacing,
  // style, occlusion policy) so the production bridge can replay the sampler
  // at mount. The extruded mesh stays as the diagnosed fallback geometry.
  // Preserve the opt-in's original authoring intent for later live reshaping.
  // Serialized copies have no retained entry and remain intentionally uneditable.
  const style = options.sdfGlyphAtlas === "shared" && options.sdfStyle
    ? { ...options.sdfStyle, ...(options.sdfStyle.shadowOffsetEm ? { shadowOffsetEm: [...options.sdfStyle.shadowOffsetEm] as const } : {}) }
    : options.sdfStyle;
  const layoutOptions = { size: options.size ?? 1, letterSpacing: options.letterSpacing, style };
  const layout = layoutSdfText(text, rootSdfFontAtlas(), layoutOptions);
  const descriptor: TextDescriptor = {
    text: built.text,
    glyphCount: built.glyphCount,
    unsupportedCharacters: [...new Set([...built.unsupportedCharacters, ...layout.unsupportedCharacters])],
    method: "sdf-atlas-quad",
    backend: "sdf",
    sdfQuadCount: layout.quads.length,
    sdfWidthWorld: layout.widthWorld,
    sdfHeightWorld: layout.heightWorld,
    sdfAccessibleLabel: options.accessibleLabel ?? text,
    sdfSize: options.size ?? 1,
    ...(options.letterSpacing === undefined ? {} : { sdfLetterSpacing: options.letterSpacing }),
    ...(style === undefined ? {} : { sdfStyle: style }),
    ...(options.sdfGlyphAtlas === undefined ? {} : { sdfGlyphAtlas: options.sdfGlyphAtlas }),
    sdfOcclusion: options.sdfOcclusion ?? "dim"
  };
  if (options.sdfGlyphAtlas === "shared") {
    liveTextOptions.set(descriptor, {
      kind: "builtin",
      options: layoutOptions,
      extrusion: {
        size: options.size ?? 1,
        ...(options.depth === undefined ? {} : { depth: options.depth }),
        ...(options.letterSpacing === undefined ? {} : { letterSpacing: options.letterSpacing })
      },
      ...(options.accessibleLabel === undefined ? {} : { accessibleLabel: options.accessibleLabel })
    });
  }
  return primitive("custom", {
    ...primitiveOptions,
    geometry: built.geometry,
    text3D: descriptor
  });
}
