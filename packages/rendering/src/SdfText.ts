import { GlyphAtlas } from "./text/GlyphAtlas.js";
import { shapeText, type TextDirection, type TextMeasureContext } from "./text/TextShaper.js";
import type { LoadedFont } from "./text/FontLoader.js";

/**
 * SDF world text for the rendering package (muse3jsparity-PRD G1).
 *
 * ## What this is
 *
 * CPU-side signed-distance-field text: a built-in bitmap atlas and a dynamic
 * platform-shaped font path, plus layout into textured quads, analytic coverage
 * sampling, LOD fade, and occlusion policy helpers. GPU submission belongs to the
 * production-runtime bridge; this module produces the data it consumes and the
 * diagnostics that prove the swap happened (`textPixelBacked`).
 *
 * ## What this is not
 *
 * - The built-in fallback supports exactly `A-Z 0-9 space - .` (see
 *   `SDF_SUPPORTED_GLYPHS`), reporting other characters. Loaded fonts use the
 *   platform's native text shaper and are rasterized as complete runs.
 * - Not troika-three-text parity and not TextGeometry parity. The claim label
 *   is `production-runtime` SDF text, proven by `textPixelBacked` diagnostics.
 * - Not DOM text. DOM labels (`labels.*` / `ui.*`) stay the accessible
 *   surface; SDF text is the lit/occluded in-world surface. Diagnostics keep
 *   the two counts separate (`summarizeTextSurfaces`).
 *
 * The built-in path is pure; loaded fonts require Canvas2D. No WebGL is used here.
 */

/** Exact glyph scope. Uppercase alphanumeric catalog shared with root `text3D`. */
export const SDF_SUPPORTED_GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789- ." as const;

/**
 * Scope note for the built-in fallback and the platform-shaped font path.
 */
export const SDF_FONT_SCOPE_NOTE =
  "The built-in fallback covers A-Z 0-9 space hyphen period and reports unsupported characters; " +
  "loaded fonts use platform shaping, fallback and rasterization for Unicode text.";

const GLYPH_COLUMNS = 5;
const GLYPH_ROWS = 7;

export interface SdfFontAtlasOptions {
  /** Pixels per bitmap cell edge. Must be a positive integer. Default 8. */
  readonly cellResolution?: number;
  /** Padding pixels around each glyph cell in the atlas. Default 8. */
  readonly padding?: number;
}

export interface SdfGlyphMetrics {
  readonly glyph: string;
  /** Normalized UV rect [u0, v0, u1, v1] into the atlas. */
  readonly uv: readonly [number, number, number, number];
  /** Advance width in em units (glyph cell + spacing handled by layout). */
  readonly advanceEm: number;
}

export interface SdfFontAtlas {
  readonly kind: "aura-sdf-font-atlas";
  /** Grayscale distance field, width*height floats, 0 = far outside, 1 = far inside. */
  readonly distances: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly glyphs: Readonly<Record<string, SdfGlyphMetrics>>;
  readonly glyphCount: number;
  readonly cellResolution: number;
  readonly padding: number;
  /** Max interior distance in pixels, for normalizing shader smoothing. */
  readonly spreadPixels: number;
}

export interface SdfTextStyle {
  /** Outline half-width in em. 0 disables. Default 0. */
  readonly outlineWidthEm?: number;
  /** Glow radius in em. 0 disables. Default 0. */
  readonly glowRadiusEm?: number;
  /** Drop-shadow offset in em [x, y]. Omitted disables. */
  readonly shadowOffsetEm?: readonly [number, number];
  /** Shadow opacity 0..1. Default 0.45. */
  readonly shadowOpacity?: number;
  /** Edge smoothing in em. Must be positive. Default 0.02. */
  readonly smoothingEm?: number;
  /** Fade start distance in world units. Omitted disables LOD fade. */
  readonly lodFadeNear?: number;
  /** Fade end distance in world units (fully transparent past this). */
  readonly lodFadeFar?: number;
}

export interface SdfTextLayoutOptions {
  /** Glyph height in world units. Must be positive. Default 1. */
  readonly size?: number;
  /** Extra gap between glyphs in world units. Non-negative. Default size * 0.14. */
  readonly letterSpacing?: number;
  readonly style?: SdfTextStyle;
}

export interface SdfTextQuad {
  /** Four corner world-space offsets [x, y] from the text origin (baseline-left). */
  readonly corners: readonly [number, number, number, number, number, number, number, number];
  /** UV rect matching the glyph's atlas cell. */
  readonly uv: readonly [number, number, number, number];
  readonly glyph: string;
}

export interface SdfTextResolvedStyle {
  readonly outlineWidthEm: number;
  readonly glowRadiusEm: number;
  readonly shadowOffsetEm?: readonly [number, number];
  readonly shadowOpacity: number;
  readonly smoothingEm: number;
  readonly lodFadeNear?: number;
  readonly lodFadeFar?: number;
}

export interface SdfTextLayout {
  readonly kind: "aura-sdf-text-layout";
  readonly text: string;
  readonly quads: readonly SdfTextQuad[];
  /** Drawable atlas entries: individual glyphs in the built-in atlas, full runs for loaded fonts. */
  readonly glyphCount: number;
  readonly unsupportedCharacters: readonly string[];
  /** Canvas does not expose the glyph IDs or missing-glyph list selected by its shaper. */
  readonly glyphCoverage?: "built-in-known" | "platform-unverified";
  readonly widthWorld: number;
  readonly heightWorld: number;
  readonly method: "sdf-atlas-quad";
  readonly style: SdfTextResolvedStyle;
}

/** Opacity multiplier for an occluded SDF label under the `"dim"` policy. Mirrors the DOM label layer. */
export const SDF_OCCLUDED_OPACITY = 0.35;

export type SdfTextOcclusionPolicy = "dim" | "hide" | "show";

/**
 * Build the SDF font atlas from the built-in bitmap catalog.
 *
 * Distance is computed per atlas pixel by brute-force nearest-edge search over
 * the upscaled 5x7 cell. The atlas is small (39 glyphs), so this stays fast
 * (~39 cells x a few thousand pixels x 35 bitmap cells) and dependency-free.
 */
export function createSdfFontAtlas(options: SdfFontAtlasOptions = {}): SdfFontAtlas {
  const cellResolution = options.cellResolution ?? 8;
  const padding = options.padding ?? 8;
  if (!Number.isInteger(cellResolution) || cellResolution <= 0) {
    throw new Error("Aura3D SDF atlas cellResolution must be a positive integer.");
  }
  if (!Number.isInteger(padding) || padding < 0) {
    throw new Error("Aura3D SDF atlas padding must be a non-negative integer.");
  }
  const cellWidth = GLYPH_COLUMNS * cellResolution;
  const cellHeight = GLYPH_ROWS * cellResolution;
  const tileWidth = cellWidth + padding * 2;
  const tileHeight = cellHeight + padding * 2;
  const supported = [...SDF_SUPPORTED_GLYPHS];
  const columns = Math.ceil(Math.sqrt(supported.length));
  const rows = Math.ceil(supported.length / columns);
  const width = columns * tileWidth;
  const height = rows * tileHeight;
  const distances = new Float32Array(width * height);
  const glyphs: Record<string, SdfGlyphMetrics> = {};
  supported.forEach((glyph, index) => {
    const tileX = (index % columns) * tileWidth;
    const tileY = Math.floor(index / columns) * tileHeight;
    bakeGlyphDistance(distances, width, height, glyph, tileX + padding, tileY + padding, cellResolution);
    glyphs[glyph] = {
      glyph,
      uv: [
        (tileX + padding) / width,
        (tileY + padding) / height,
        (tileX + padding + cellWidth) / width,
        (tileY + padding + cellHeight) / height
      ],
      advanceEm: GLYPH_COLUMNS / GLYPH_ROWS
    };
  });
  return {
    kind: "aura-sdf-font-atlas",
    distances,
    width,
    height,
    glyphs,
    glyphCount: supported.length,
    cellResolution,
    padding,
    spreadPixels: Math.hypot(cellWidth, cellHeight) / 2
  };
}

/** Lay out a string into atlas-backed quads. Uppercase alphanumeric scope enforced. */
export function layoutSdfText(text: string, atlas: SdfFontAtlas, options: SdfTextLayoutOptions = {}): SdfTextLayout {
  if (!text.length) throw new Error("Aura3D SDF text requires at least one character.");
  const size = options.size ?? 1;
  if (!Number.isFinite(size) || size <= 0) throw new Error("Aura3D SDF text size must be positive.");
  const spacing = options.letterSpacing ?? size * 0.14;
  if (!Number.isFinite(spacing) || spacing < 0) throw new Error("Aura3D SDF text letterSpacing must be non-negative.");
  const style = normalizeStyle(options.style ?? {});
  const cellWorld = size / GLYPH_ROWS;
  const unsupported = new Set<string>();
  const quads: SdfTextQuad[] = [];
  let cursor = 0;
  let glyphCount = 0;
  for (const raw of text.toUpperCase()) {
    if (raw === " ") {
      cursor += size * 0.5 + spacing;
      continue;
    }
    const metrics = atlas.glyphs[raw];
    if (!metrics) {
      unsupported.add(raw);
      cursor += size * 0.5 + spacing;
      continue;
    }
    glyphCount += 1;
    const w = cellWorld * GLYPH_COLUMNS;
    quads.push({
      corners: [cursor, 0, cursor + w, 0, cursor + w, size, cursor, size],
      uv: metrics.uv,
      glyph: raw
    });
    cursor += w + spacing;
  }
  if (glyphCount === 0) throw new Error("Aura3D SDF text contains no supported glyphs.");
  return {
    kind: "aura-sdf-text-layout",
    text,
    quads,
    glyphCount,
    unsupportedCharacters: [...unsupported],
    glyphCoverage: "built-in-known",
    widthWorld: cursor - spacing,
    heightWorld: size,
    method: "sdf-atlas-quad",
    style
  };
}

/**
 * Analytic SDF coverage: 1 fully inside, 0 fully outside, smooth edge.
 * `distance` is signed distance in em (positive inside), `smoothingEm` the edge width.
 */
export function sampleSdfCoverage(distanceEm: number, smoothingEm: number): number {
  if (!Number.isFinite(distanceEm) || !Number.isFinite(smoothingEm) || smoothingEm <= 0) {
    throw new Error("Aura3D SDF coverage requires a finite distance and positive smoothing.");
  }
  const t = distanceEm / smoothingEm;
  if (t <= -1) return 0;
  if (t >= 1) return 1;
  return 0.5 + 0.25 * (3 * t - t * t * t);
}

/** LOD fade: 1 at or before `fadeNear`, 0 at or past `fadeFar`, smooth between. */
export function sdfTextLodFade(distance: number, fadeNear: number, fadeFar: number): number {
  if (!Number.isFinite(distance) || distance < 0) throw new Error("Aura3D SDF LOD distance must be finite and non-negative.");
  if (!Number.isFinite(fadeNear) || !Number.isFinite(fadeFar) || fadeNear < 0 || fadeFar <= fadeNear) {
    throw new Error("Aura3D SDF LOD fade range requires 0 <= fadeNear < fadeFar.");
  }
  if (distance <= fadeNear) return 1;
  if (distance >= fadeFar) return 0;
  const t = (distance - fadeNear) / (fadeFar - fadeNear);
  return 1 - t * t * (3 - 2 * t);
}

/** Occlusion handling for SDF text, mirroring the DOM label layer's dim/hide semantics. */
export function applySdfTextOcclusion(
  occluded: boolean,
  policy: SdfTextOcclusionPolicy = "dim"
): { readonly visible: boolean; readonly opacity: number } {
  if (!occluded) return { visible: true, opacity: 1 };
  if (policy === "hide") return { visible: false, opacity: 0 };
  if (policy === "show") return { visible: true, opacity: 1 };
  return { visible: true, opacity: SDF_OCCLUDED_OPACITY };
}

export interface SdfPixelBackingInput {
  /** True when the atlas texture has been uploaded to the GPU. */
  readonly atlasUploaded: boolean;
  /** True when at least one SDF quad was submitted this frame. */
  readonly quadsSubmitted: boolean;
  /** Glyph quads submitted, for evidence. */
  readonly quadCount?: number;
}

export interface SdfPixelBacking {
  /** True only when pixels on screen come from the SDF path. Never inferred — both signals required. */
  readonly textPixelBacked: boolean;
  readonly reason: string;
  readonly quadCount: number;
}

/** `textPixelBacked` diagnostics: fail-closed, never inferred from layout alone. */
export function describeSdfTextPixelBacking(input: SdfPixelBackingInput): SdfPixelBacking {
  const quadCount = input.quadCount ?? 0;
  if (!input.atlasUploaded) {
    return { textPixelBacked: false, reason: "sdf atlas not uploaded; no SDF pixels submitted", quadCount };
  }
  if (!input.quadsSubmitted || quadCount === 0) {
    return { textPixelBacked: false, reason: "no SDF quads submitted this frame", quadCount };
  }
  return { textPixelBacked: true, reason: `${quadCount} SDF quads sampled from the uploaded atlas`, quadCount };
}

export interface TextSurfaceSummary {
  /** Accessible DOM surface (`ui.*` + world-anchored `labels.*`). */
  readonly domLabels: number;
  /** Lit/occluded in-world surface (G1 SDF quads). */
  readonly sdfTexts: number;
  /** Extruded mesh catalog (`text3D`) — a third surface, counted separately, never merged. */
  readonly meshTexts: number;
  readonly note: string;
}

/**
 * DOM-vs-3D inventory rule: the three text surfaces are reported as three
 * numbers. Merging them is what let DOM counts masquerade as 3D proof.
 */
export function summarizeTextSurfaces(input: { domLabels: number; sdfTexts: number; meshTexts: number }): TextSurfaceSummary {
  for (const [key, value] of Object.entries(input)) {
    if (!Number.isInteger(value) || value < 0) throw new Error(`Aura3D text surface count "${key}" must be a non-negative integer.`);
  }
  return {
    ...input,
    note: "DOM labels are accessible UI; SDF quads are lit/occluded world text; extruded mesh text is the fixed catalog. Counts are not interchangeable."
  };
}

function normalizeStyle(style: SdfTextStyle): SdfTextResolvedStyle {
  const outlineWidthEm = style.outlineWidthEm ?? 0;
  const glowRadiusEm = style.glowRadiusEm ?? 0;
  const smoothingEm = style.smoothingEm ?? 0.02;
  const shadowOpacity = style.shadowOpacity ?? 0.45;
  if (!Number.isFinite(outlineWidthEm) || outlineWidthEm < 0) throw new Error("Aura3D SDF outlineWidthEm must be non-negative.");
  if (!Number.isFinite(glowRadiusEm) || glowRadiusEm < 0) throw new Error("Aura3D SDF glowRadiusEm must be non-negative.");
  if (!Number.isFinite(smoothingEm) || smoothingEm <= 0) throw new Error("Aura3D SDF smoothingEm must be positive.");
  if (!Number.isFinite(shadowOpacity) || shadowOpacity < 0 || shadowOpacity > 1) {
    throw new Error("Aura3D SDF shadowOpacity must be within 0..1.");
  }
  const shadowOffsetEm = style.shadowOffsetEm;
  if (shadowOffsetEm && (shadowOffsetEm.length !== 2 || shadowOffsetEm.some((v) => !Number.isFinite(v)))) {
    throw new Error("Aura3D SDF shadowOffsetEm must be a finite [x, y] pair.");
  }
  return {
    outlineWidthEm,
    glowRadiusEm,
    shadowOffsetEm,
    shadowOpacity,
    smoothingEm,
    ...(style.lodFadeNear !== undefined ? { lodFadeNear: style.lodFadeNear } : {}),
    ...(style.lodFadeFar !== undefined ? { lodFadeFar: style.lodFadeFar } : {})
  };
}

const BITMAP_GLYPHS: Readonly<Record<string, readonly string[]>> = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "10010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "11011", "10001"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"]
};

export type SdfTextRgba = readonly [number, number, number, number];

export interface SdfTextRasterOptions {
  /** Output texels per world unit. Positive. Default 64. */
  readonly texelsPerWorldUnit?: number;
  /** Glyph fill color, straight-alpha 0..1 channels. Default opaque white. */
  readonly fill?: SdfTextRgba;
  /** Outline color. Omitted (or zero outlineWidthEm) disables. */
  readonly outline?: SdfTextRgba;
  /** Glow color. Omitted (or zero glowRadiusEm) disables. */
  readonly glow?: SdfTextRgba;
  /** Drop-shadow color. Omitted (or no shadowOffsetEm) disables. */
  readonly shadow?: SdfTextRgba;
}

export interface SdfTextRasterImage {
  readonly kind: "aura-sdf-text-image";
  readonly width: number;
  readonly height: number;
  /** Straight-alpha RGBA8 bytes, row 0 = glyph top. */
  readonly data: Uint8Array;
  /** Count of texels with alpha > 8 (evidence the sampler drew). */
  readonly coveredTexels: number;
}

export interface DynamicSdfTextOptions {
  readonly font: LoadedFont;
  readonly fallbackFonts?: readonly LoadedFont[];
  /** World-space em height. */
  readonly size?: number;
  /** World-space maximum line width. */
  readonly maxWidth?: number;
  /** World-space line height. */
  readonly lineHeight?: number;
  readonly letterSpacing?: number;
  readonly direction?: TextDirection;
  readonly maxLines?: number;
  readonly style?: SdfTextStyle;
  /** Raster resolution per em, bounded to 16..256. Default 64. */
  readonly rasterSize?: number;
}

/** A snapshot suitable for the existing texture and quad compiler. */
export interface DynamicSdfText {
  readonly layout: SdfTextLayout;
  readonly image: SdfTextRasterImage;
}

/**
 * Shape complete Unicode runs using the browser text engine, place their
 * coverage in a bounded temporary atlas, and copy the result into a retained
 * label texture snapshot. Keeping each run intact preserves contextual glyph
 * substitution, bidi, kerning, ligatures and platform font fallback.
 */
export function createDynamicSdfText(text: string, options: DynamicSdfTextOptions): DynamicSdfText {
  const size = options.size ?? 1;
  const rasterSize = options.rasterSize ?? 64;
  if (!Number.isFinite(size) || size <= 0 || !Number.isInteger(rasterSize) || rasterSize < 16 || rasterSize > 256) {
    throw new RangeError("Aura3D dynamic text size must be positive and rasterSize must be an integer within 16..256.");
  }
  const style = normalizeStyle(options.style ?? {});
  const scale = rasterSize / size;
  if (!Number.isFinite(scale) || scale <= 0) throw new RangeError("Aura3D dynamic text size is outside the representable raster range.");
  const canvas = createTextCanvas();
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
  if (!ctx) throw new Error("Aura3D loaded-font text requires a Canvas2D context.");
  ctx.textBaseline = "middle";
  const shaped = shapeText(text, {
    font: options.font,
    ...(options.fallbackFonts ? { fallbackFonts: options.fallbackFonts } : {}),
    sizePx: rasterSize,
    ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth * scale }),
    ...(options.lineHeight === undefined ? {} : { lineHeight: options.lineHeight * scale }),
    ...(options.letterSpacing === undefined ? {} : { letterSpacing: options.letterSpacing * scale }),
    ...(options.direction === undefined ? {} : { direction: options.direction }),
    ...(options.maxLines === undefined ? {} : { maxLines: options.maxLines })
  }, ctx as unknown as TextMeasureContext);
  const pad = Math.ceil(rasterSize * 0.3);
  const inkMargin = Math.max(2, Math.ceil(rasterSize / 8));
  let left = 0;
  let right = shaped.width;
  let top = 0;
  let bottom = shaped.height;
  shaped.lines.forEach((line, index) => {
    if (!line.text.trim()) return;
    ctx.direction = line.direction;
    ctx.textAlign = line.direction === "rtl" ? "right" : "left";
    const metrics = ctx.measureText(line.text);
    const anchor = line.direction === "rtl" ? shaped.width : 0;
    const baseline = (index + 0.5) * shaped.lineHeight;
    if (Number.isFinite(metrics.actualBoundingBoxLeft) && Number.isFinite(metrics.actualBoundingBoxRight)) {
      left = Math.min(left, anchor - metrics.actualBoundingBoxLeft);
      right = Math.max(right, anchor + metrics.actualBoundingBoxRight);
    }
    if (Number.isFinite(metrics.actualBoundingBoxAscent) && Number.isFinite(metrics.actualBoundingBoxDescent)) {
      top = Math.min(top, baseline - metrics.actualBoundingBoxAscent - inkMargin);
      bottom = Math.max(bottom, baseline + metrics.actualBoundingBoxDescent + inkMargin);
    }
  });
  const width = Math.max(1, Math.ceil(right - left) + 2 * pad);
  const height = Math.max(1, Math.ceil(bottom - top));
  const originX = pad - left;
  const originY = -top;
  const boundaries = Array.from({ length: shaped.lines.length + 1 }, (_, index) =>
    index === 0 ? 0 : index === shaped.lines.length ? height : Math.max(0, Math.min(height, Math.floor(originY + index * shaped.lineHeight))));
  const rowHeight = Math.max(...shaped.lines.map((_line, index) => boundaries[index + 1]! - boundaries[index]!));
  const atlasWidth = Math.ceil((width + 2) / 8) * 8;
  const atlasRowHeight = Math.ceil((rowHeight + 2) / 8) * 8;
  const atlasHeight = atlasRowHeight * shaped.lines.length;
  if (width > 2048 || height > 2048 || atlasWidth > 4096 || atlasHeight > 4096 || atlasWidth * atlasHeight > 4_194_304 ||
      width * height * shaped.lines.length > 16_777_216) {
    throw new RangeError("Aura3D loaded-font label exceeds its bounded raster/atlas size.");
  }
  canvas.width = width;
  canvas.height = height;
  // Resizing resets context state.
  ctx.font = shaped.font;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "white";
  if ("fontKerning" in ctx) ctx.fontKerning = "normal";
  if ("letterSpacing" in ctx) ctx.letterSpacing = `${shaped.letterSpacing}px`;
  shaped.lines.forEach((line, index) => {
    ctx.direction = line.direction;
    ctx.textAlign = line.direction === "rtl" ? "right" : "left";
    ctx.fillText(line.text, originX + (line.direction === "rtl" ? shaped.width : 0), originY + (index + 0.5) * shaped.lineHeight);
  });
  const source = ctx.getImageData(0, 0, width, height).data;
  const atlas = new GlyphAtlas({ width: atlasWidth, height: atlasHeight, maxEntries: shaped.lines.length });
  const quads: SdfTextQuad[] = [];
  try {
    shaped.lines.forEach((line, index) => {
      const top = boundaries[index]!;
      const bottom = boundaries[index + 1]!;
      if (bottom <= top) return;
      const pixels = new Uint8Array(width * (bottom - top));
      for (let y = top; y < bottom; y += 1) for (let x = 0; x < width; x += 1) pixels[(y - top) * width + x] = source[(y * width + x) * 4 + 3] ?? 0;
      if (!line.text.trim() && !pixels.some((value) => value !== 0)) return;
      const entry = atlas.acquire(`run-${index}`, { width, height: bottom - top, data: textDistanceField(pixels, width, bottom - top, Math.max(2, rasterSize / 8)) });
      const y0 = (height - bottom) / scale;
      const y1 = (height - top) / scale;
      quads.push({ glyph: line.text, corners: [0, y0, width / scale, y0, width / scale, y1, 0, y1],
        uv: [entry.uv[0], entry.uv[3], entry.uv[2], entry.uv[1]] });
      atlas.release(entry.key);
    });
    if (!quads.length) throw new Error("Aura3D loaded-font text produced no visible glyphs.");
    const layout: SdfTextLayout = {
      kind: "aura-sdf-text-layout", text, quads, glyphCount: quads.length,
      unsupportedCharacters: [], glyphCoverage: "platform-unverified", widthWorld: width / scale, heightWorld: height / scale,
      method: "sdf-atlas-quad", style
    };
    const snapshot: SdfFontAtlas = {
      kind: "aura-sdf-font-atlas", width: atlas.width, height: atlas.height,
      distances: Float32Array.from(atlas.data, (value) => value / 255), glyphs: {}, glyphCount: quads.length,
      cellResolution: rasterSize / GLYPH_ROWS, padding: pad, spreadPixels: Math.max(2, rasterSize / 8)
    };
    const image = rasterizeSdfTextLabelImage(layout, snapshot, {
      texelsPerWorldUnit: scale,
      ...(style.outlineWidthEm ? { outline: [1, 0.85, 0.6, 1] as const } : {}),
      ...(style.glowRadiusEm ? { glow: [0.5, 0.8, 1, 1] as const } : {}),
      ...(style.shadowOffsetEm ? { shadow: [0, 0, 0, 1] as const } : {})
    });
    return { layout, image };
  } finally { atlas.dispose(); }
}

function createTextCanvas(): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") return new OffscreenCanvas(1, 1);
  if (typeof document !== "undefined") return document.createElement("canvas");
  throw new Error("Aura3D loaded-font text requires OffscreenCanvas or a DOM canvas.");
}

/** Two-pass chamfer distance transform; each buffer is bounded by the atlas limit. */
function textDistanceField(alpha: Uint8Array, width: number, height: number, spread: number): Uint8Array {
  const count = width * height;
  const inside = new Float32Array(count);
  const outside = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const ink = (alpha[i] ?? 0) >= 128;
    inside[i] = ink ? 0 : spread + 1;
    outside[i] = ink ? spread + 1 : 0;
  }
  for (const field of [inside, outside]) {
    for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
      const i = y * width + x;
      let value = field[i]!;
      if (x) value = Math.min(value, field[i - 1]! + 1);
      if (y) value = Math.min(value, field[i - width]! + 1);
      if (x && y) value = Math.min(value, field[i - width - 1]! + Math.SQRT2);
      if (x + 1 < width && y) value = Math.min(value, field[i - width + 1]! + Math.SQRT2);
      field[i] = value;
    }
    for (let y = height - 1; y >= 0; y -= 1) for (let x = width - 1; x >= 0; x -= 1) {
      const i = y * width + x;
      let value = field[i]!;
      if (x + 1 < width) value = Math.min(value, field[i + 1]! + 1);
      if (y + 1 < height) value = Math.min(value, field[i + width]! + 1);
      if (x + 1 < width && y + 1 < height) value = Math.min(value, field[i + width + 1]! + Math.SQRT2);
      if (x && y + 1 < height) value = Math.min(value, field[i + width - 1]! + Math.SQRT2);
      field[i] = value;
    }
  }
  return Uint8Array.from(alpha, (_value, i) => Math.round(255 * Math.min(1, Math.max(0, 0.5 + (outside[i]! - inside[i]!) / (2 * spread)))));
}

/**
 * Native SDF sampler (muse3jsparity-PRD G1).
 *
 * Bakes a laid-out text string into an RGBA8 image by sampling the baked
 * atlas distance field per texel through `sampleSdfCoverage` — the same
 * deterministic-bake pattern as the CPU postprocess kernels: the bake runs
 * once, the bytes upload to the GPU as a native texture, quads sample them.
 * This is NOT a per-pixel shader SDF loop; the claim label stays
 * `production-runtime` baked-SDF text, proven by `textPixelBacked`.
 *
 * Layout space: x in [0, widthWorld], y in [0, heightWorld] with y-up.
 * Image space: row 0 is the glyph top (y = heightWorld).
 */
export function rasterizeSdfTextLabelImage(
  layout: SdfTextLayout,
  atlas: SdfFontAtlas,
  options: SdfTextRasterOptions = {}
): SdfTextRasterImage {
  const scale = options.texelsPerWorldUnit ?? 64;
  if (!Number.isFinite(scale) || scale <= 0) {
    throw new Error("Aura3D SDF raster texelsPerWorldUnit must be positive.");
  }
  const fill = normalizeRasterColor(options.fill, "fill", [1, 1, 1, 1]);
  const outline = options.outline ? normalizeRasterColor(options.outline, "outline") : undefined;
  const glow = options.glow ? normalizeRasterColor(options.glow, "glow") : undefined;
  const shadow = options.shadow ? normalizeRasterColor(options.shadow, "shadow") : undefined;
  const width = Math.max(1, Math.ceil(layout.widthWorld * scale));
  const height = Math.max(1, Math.ceil(layout.heightWorld * scale));
  if (width > 4096 || height > 4096 || width * height > 4_194_304 || width * height * layout.quads.length > 16_777_216) {
    throw new RangeError("Aura3D SDF raster exceeds the bounded pixel or sampling budget.");
  }
  const style = layout.style;
  const outlineWidthEm = outline ? style.outlineWidthEm : 0;
  const glowRadiusEm = glow ? style.glowRadiusEm : 0;
  const shadowOffset = shadow ? style.shadowOffsetEm : undefined;
  const data = new Uint8Array(width * height * 4);
  let coveredTexels = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Texel center in layout space (y-up). Em conversion happens inside
      // the sampler (atlas cell height = 1em), independent of world size.
      const lx = (x + 0.5) / scale;
      const ly = layout.heightWorld - (y + 0.5) / scale;
      const [r, g, b, a] = shadeSdfTexel(
        lx, ly, layout, atlas, style, { fill, outline, glow, shadow, outlineWidthEm, glowRadiusEm, shadowOffset }
      );
      const offset = (y * width + x) * 4;
      const alphaByte = Math.round(a * 255);
      if (alphaByte > 0) {
        const unpremultiply = 255 / a;
        data[offset] = Math.min(255, Math.max(0, Math.round(r * unpremultiply)));
        data[offset + 1] = Math.min(255, Math.max(0, Math.round(g * unpremultiply)));
        data[offset + 2] = Math.min(255, Math.max(0, Math.round(b * unpremultiply)));
      }
      data[offset + 3] = alphaByte;
      if (a * 255 > 8) coveredTexels += 1;
    }
  }
  if (coveredTexels === 0) {
    throw new Error("Aura3D SDF raster produced no covered texels; the layout drew nothing.");
  }
  return { kind: "aura-sdf-text-image", width, height, data, coveredTexels };
}

interface SdfShadeColors {
  readonly fill: SdfTextRgba;
  readonly outline: SdfTextRgba | undefined;
  readonly glow: SdfTextRgba | undefined;
  readonly shadow: SdfTextRgba | undefined;
  readonly outlineWidthEm: number;
  readonly glowRadiusEm: number;
  readonly shadowOffset: readonly [number, number] | undefined;
}

function shadeSdfTexel(
  lx: number,
  ly: number,
  layout: SdfTextLayout,
  atlas: SdfFontAtlas,
  style: SdfTextResolvedStyle,
  colors: SdfShadeColors
): SdfTextRgba {
  // Back-to-front composite over transparent: shadow, glow, outline, fill.
  let out: [number, number, number, number] = [0, 0, 0, 0];
  if (colors.shadow && colors.shadowOffset) {
    const silhouette = sampleLayoutCoverage(lx + colors.shadowOffset[0], ly + colors.shadowOffset[1], layout, atlas, style);
    out = overPremultiplied(out, colors.shadow, silhouette * colors.shadow[3] * (style.shadowOpacity ?? 0.45));
  }
  if (colors.glow && colors.glowRadiusEm > 0) {
    const inside = sampleLayoutSignedEm(lx, ly, layout, atlas);
    if (inside !== undefined && inside < 0.02) {
      const reach = Math.max(0, 1 + (inside - 0.02) / colors.glowRadiusEm);
      const glowAlpha = Math.min(1, reach) * colors.glow[3];
      if (glowAlpha > 0) out = overPremultiplied(out, colors.glow, glowAlpha * 0.75);
    }
  }
  const signedEm = sampleLayoutSignedEm(lx, ly, layout, atlas);
  if (signedEm !== undefined) {
    if (colors.outline && colors.outlineWidthEm > 0) {
      const band = sampleSdfCoverage(signedEm + colors.outlineWidthEm, style.smoothingEm)
        - sampleSdfCoverage(signedEm, style.smoothingEm);
      if (band > 0) out = overPremultiplied(out, colors.outline, band * colors.outline[3]);
    }
    const fillAlpha = sampleSdfCoverage(signedEm, style.smoothingEm) * colors.fill[3];
    if (fillAlpha > 0) out = overPremultiplied(out, colors.fill, fillAlpha);
  }
  return out;
}

function overPremultiplied(
  dst: readonly [number, number, number, number],
  src: SdfTextRgba,
  srcAlpha: number
): [number, number, number, number] {
  const a = Math.min(1, Math.max(0, srcAlpha));
  const inv = 1 - a;
  return [src[0] * a + dst[0] * inv, src[1] * a + dst[1] * inv, src[2] * a + dst[2] * inv, a + dst[3] * inv];
}

/** Signed distance in em at a layout-space point, or undefined outside every quad. */
function sampleLayoutSignedEm(
  lx: number,
  ly: number,
  layout: SdfTextLayout,
  atlas: SdfFontAtlas
): number | undefined {
  for (const quad of layout.quads) {
    const x0 = quad.corners[0]!;
    const x1 = quad.corners[2]!;
    const y0 = quad.corners[1]!;
    const y1 = quad.corners[5]!;
    if (lx < x0 || lx > x1 || ly < y0 || ly > y1) continue;
    // Atlas glyph cells are cellHeightPx tall for a 1em glyph: px -> em.
    const cellHeightPx = GLYPH_ROWS * atlas.cellResolution;
    const u01 = (lx - x0) / Math.max(1e-9, x1 - x0);
    const v01 = (ly - y0) / Math.max(1e-9, y1 - y0);
    const u = quad.uv[0]! + u01 * (quad.uv[2]! - quad.uv[0]!);
    const v = quad.uv[1]! + v01 * (quad.uv[3]! - quad.uv[1]!);
    const d01 = sampleAtlasBilinear(atlas, u, v);
    const signedPx = (d01 - 0.5) * 2 * atlas.spreadPixels;
    return signedPx / Math.max(1, cellHeightPx);
  }
  return undefined;
}

function sampleLayoutCoverage(
  lx: number,
  ly: number,
  layout: SdfTextLayout,
  atlas: SdfFontAtlas,
  style: SdfTextResolvedStyle
): number {
  const signedEm = sampleLayoutSignedEm(lx, ly, layout, atlas);
  if (signedEm === undefined) return 0;
  return sampleSdfCoverage(signedEm, style.smoothingEm);
}

function sampleAtlasBilinear(atlas: SdfFontAtlas, u: number, v: number): number {
  const x = Math.min(atlas.width - 1, Math.max(0, u * atlas.width - 0.5));
  const y = Math.min(atlas.height - 1, Math.max(0, v * atlas.height - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(atlas.width - 1, x0 + 1);
  const y1 = Math.min(atlas.height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;
  const row = (yy: number): number => {
    const a = atlas.distances[yy * atlas.width + x0] ?? 0;
    const b = atlas.distances[yy * atlas.width + x1] ?? 0;
    return a + (b - a) * fx;
  };
  return row(y0) + (row(y1) - row(y0)) * fy;
}

function normalizeRasterColor(value: SdfTextRgba | undefined, name: string, fallback?: SdfTextRgba): SdfTextRgba {
  const color = value ?? fallback;
  if (!color || color.length !== 4 || color.some((channel) => !Number.isFinite(channel) || channel < 0 || channel > 1)) {
    throw new Error(`Aura3D SDF raster ${name} color must be an RGBA tuple with channels in 0..1.`);
  }
  return [color[0]!, color[1]!, color[2]!, color[3]!];
}

export interface SdfTextQuadMesh {
  readonly kind: "aura-sdf-text-quad-mesh";
  /** World-space positions, 3 per vertex, y-up in text-local space. */
  readonly positions: Float32Array;
  /** +Z normals, 3 per vertex. */
  readonly normals: Float32Array;
  /** Label-image UVs, 2 per vertex (v = 1 at glyph top). */
  readonly uvs: Float32Array;
  /** Axis-aligned tangents (+X, w = 1), 4 per vertex. */
  readonly tangents: Float32Array;
  readonly indices: readonly number[];
  readonly vertexCount: number;
  readonly quadCount: number;
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/**
 * Quad-strip mesh for a rasterized label image (muse3jsparity-PRD G1 quad
 * submission). One quad per layout atlas entry sharing the label image: uv rects
 * are the quad's sub-rect of the image, so the bridge uploads a single
 * texture per text node.
 */
export function createSdfTextQuadMesh(layout: SdfTextLayout, image: SdfTextRasterImage): SdfTextQuadMesh {
  if (layout.quads.length === 0) throw new Error("Aura3D SDF quad mesh requires at least one laid-out quad.");
  if (image.width <= 0 || image.height <= 0) throw new Error("Aura3D SDF quad mesh requires a non-empty label image.");
  const quads = layout.quads;
  const positions = new Float32Array(quads.length * 4 * 3);
  const normals = new Float32Array(quads.length * 4 * 3);
  const uvs = new Float32Array(quads.length * 4 * 2);
  const tangents = new Float32Array(quads.length * 4 * 4);
  const indices: number[] = [];
  quads.forEach((quad,qi) => {
    const x0 = quad.corners[0]!;
    const x1 = quad.corners[2]!;
    const y0 = quad.corners[1]!;
    const y1 = quad.corners[5]!;
    const corners: ReadonlyArray<readonly [number, number]> = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
    corners.forEach(([cx, cy], corner) => {
      const vi = qi * 4 + corner;
      positions[vi * 3] = cx;
      positions[vi * 3 + 1] = cy;
      positions[vi * 3 + 2] = 0;
      normals[vi * 3] = 0;
      normals[vi * 3 + 1] = 0;
      normals[vi * 3 + 2] = 1;
      tangents[vi * 4] = 1;
      tangents[vi * 4 + 1] = 0;
      tangents[vi * 4 + 2] = 0;
      tangents[vi * 4 + 3] = 1;
      // u spans the label image width; v = 1 at glyph top (image row 0).
      uvs[vi * 2] = cx / Math.max(1e-9, layout.widthWorld);
      uvs[vi * 2 + 1] = 1 - (layout.heightWorld - cy) / Math.max(1e-9, layout.heightWorld);
    });
    const base = qi * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  });
  return {
    kind: "aura-sdf-text-quad-mesh",
    positions,
    normals,
    uvs,
    tangents,
    indices,
    vertexCount: quads.length * 4,
    quadCount: quads.length,
    min: [0, 0, 0],
    max: [layout.widthWorld, layout.heightWorld, 0]
  };
}

export interface SdfTextFrameOpacityInput {
  /** Camera-to-text distance in world units. Non-negative. */
  readonly distance: number;
  readonly lodFadeNear?: number;
  readonly lodFadeFar?: number;
  readonly occluded: boolean;
  readonly occlusionPolicy?: SdfTextOcclusionPolicy;
}

export interface SdfTextFrameOpacity {
  readonly visible: boolean;
  /** Per-frame opacity: LOD fade x occlusion policy. */
  readonly opacity: number;
  readonly lodFade: number;
  readonly occlusionOpacity: number;
}

/**
 * Per-frame SDF text opacity (muse3jsparity-PRD G1 occlusion + LOD-fade
 * proof). Pure: the bridge evaluates it every frame from the live camera
 * distance and the scene occlusion test, then writes it to the quad
 * material — occlusion dims/hides, distance fades, neither is baked.
 */
export function resolveSdfTextFrameOpacity(input: SdfTextFrameOpacityInput): SdfTextFrameOpacity {
  if (!Number.isFinite(input.distance) || input.distance < 0) {
    throw new Error("Aura3D SDF frame distance must be finite and non-negative.");
  }
  // LOD fade needs both bounds: a half-specified range would silently do
  // nothing (or throw on Infinity inside sdfTextLodFade), so fail closed.
  const nearDefined = input.lodFadeNear !== undefined;
  const farDefined = input.lodFadeFar !== undefined;
  if (nearDefined !== farDefined) {
    throw new Error("Aura3D SDF frame LOD fade requires both lodFadeNear and lodFadeFar, or neither.");
  }
  const lodFade = nearDefined && farDefined
    ? sdfTextLodFade(input.distance, input.lodFadeNear!, input.lodFadeFar!)
    : 1;
  const occlusion = applySdfTextOcclusion(input.occluded, input.occlusionPolicy ?? "dim");
  return {
    visible: occlusion.visible,
    opacity: Math.min(1, Math.max(0, lodFade * occlusion.opacity)),
    lodFade,
    occlusionOpacity: occlusion.opacity
  };
}

function bakeGlyphDistance(
  field: Float32Array,
  width: number,
  height: number,
  glyph: string,
  originX: number,
  originY: number,
  resolution: number
): void {
  const rows = BITMAP_GLYPHS[glyph] ?? BITMAP_GLYPHS[" "]!;
  const cellWidth = GLYPH_COLUMNS * resolution;
  const cellHeight = GLYPH_ROWS * resolution;
  const inside = (px: number, py: number): boolean => {
    const column = Math.floor(px / resolution);
    const row = Math.floor(py / resolution);
    if (column < 0 || column >= GLYPH_COLUMNS || row < 0 || row >= GLYPH_ROWS) return false;
    return rows[row]?.[column] === "1";
  };
  /*
   * Nearest-edge search over edge pixels only, not the whole cell. The
   * nearest pixel of the opposite class always has a same-class 4-neighbor
   * (anything strictly closer to the center is same-class), so it is in the
   * edge set and results are identical to a full-cell search at a fraction
   * of the cost. The atlas is still baked once and cached by the caller —
   * never per frame.
   */
  const edgeInside: [number, number][] = [];
  const edgeOutside: [number, number][] = [];
  for (let py = 0; py < cellHeight; py += 1) {
    for (let px = 0; px < cellWidth; px += 1) {
      const center = inside(px + 0.5, py + 0.5);
      const bordersOpposite = inside(px + 0.5, py - 0.5) !== center
        || inside(px + 0.5, py + 1.5) !== center
        || inside(px - 0.5, py + 0.5) !== center
        || inside(px + 1.5, py + 0.5) !== center;
      if (!bordersOpposite) continue;
      (center ? edgeInside : edgeOutside).push([px + 0.5, py + 0.5]);
    }
  }
  // A blank glyph (space) has no edges: every pixel is far-outside.
  const spread = Math.hypot(cellWidth, cellHeight);
  for (let py = 0; py < cellHeight; py += 1) {
    for (let px = 0; px < cellWidth; px += 1) {
      const cx = px + 0.5;
      const cy = py + 0.5;
      const centerInside = inside(cx, cy);
      const edges = centerInside ? edgeOutside : edgeInside;
      let nearest = spread;
      for (const [ex, ey] of edges) {
        const distance = Math.hypot(cx - ex, cy - ey);
        if (distance < nearest) nearest = distance;
      }
      const signed = centerInside ? nearest : -nearest;
      const ax = originX + px;
      const ay = originY + py;
      if (ax >= 0 && ax < width && ay >= 0 && ay < height) field[ay * width + ax] = 0.5 + signed / (2 * spread);
    }
  }
}
