// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraPrimitiveOptions, AuraPrimitiveNode } from "./types.js";
import type { AuraText3DOptions } from "../RootGeometry.js";
import type { SdfFontAtlas, SdfTextOcclusionPolicy, SdfTextStyle } from "@aura3d/rendering";
import { AuraNodeBuilder } from "./builder.js";
import { createAuraText3DGeometry } from "../RootGeometry.js";
import { createSdfFontAtlas, layoutSdfText } from "@aura3d/rendering";
import { geometry } from "./geometry.js";
import { primitive } from "./primitives.js";

let cachedSdfFontAtlas: SdfFontAtlas | undefined;

export function rootSdfFontAtlas(): SdfFontAtlas {
  // Baked once per session (~500ms default res); the caller never bakes per frame.
  cachedSdfFontAtlas ??= createSdfFontAtlas();
  return cachedSdfFontAtlas;
}

export function text3D(text: string, options: AuraText3DOptions & Omit<AuraPrimitiveOptions, "geometry" | "text3D"> & { readonly backend?: "extruded-mesh" | "sdf"; readonly sdfStyle?: SdfTextStyle; readonly sdfOcclusion?: SdfTextOcclusionPolicy } = {}): AuraNodeBuilder<AuraPrimitiveNode> {
  const built = createAuraText3DGeometry(text, options);
  if ((options.backend ?? "extruded-mesh") === "extruded-mesh") {
    return primitive("custom", { ...options, geometry: built.geometry, text3D: { text: built.text, glyphCount: built.glyphCount, unsupportedCharacters: built.unsupportedCharacters, method: built.method } });
  }
  // G1 SDF backend (muse3jsparity-PRD): the layout validates fail-loud and is
  // recorded on the descriptor with the full author intent (size, spacing,
  // style, occlusion policy) so the production bridge can replay the sampler
  // at mount. The extruded mesh stays as the diagnosed fallback geometry.
  const layout = layoutSdfText(text, rootSdfFontAtlas(), { size: options.size ?? 1, letterSpacing: options.letterSpacing, style: options.sdfStyle });
  return primitive("custom", {
    ...options,
    geometry: built.geometry,
    text3D: {
      text: built.text,
      glyphCount: built.glyphCount,
      unsupportedCharacters: [...new Set([...built.unsupportedCharacters, ...layout.unsupportedCharacters])],
      method: "sdf-atlas-quad",
      backend: "sdf",
      sdfQuadCount: layout.quads.length,
      sdfWidthWorld: layout.widthWorld,
      sdfHeightWorld: layout.heightWorld,
      sdfSize: options.size ?? 1,
      ...(options.letterSpacing === undefined ? {} : { sdfLetterSpacing: options.letterSpacing }),
      ...(options.sdfStyle === undefined ? {} : { sdfStyle: options.sdfStyle }),
      sdfOcclusion: options.sdfOcclusion ?? "dim"
    }
  });
}
