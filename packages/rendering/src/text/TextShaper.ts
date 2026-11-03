import type { LoadedFont } from "./FontLoader.js";
import { strongBidiDirection } from "./UnicodeBidiData.js";

export type TextDirection = "ltr" | "rtl" | "auto";

export interface TextShapingOptions {
  readonly font: LoadedFont;
  readonly fallbackFonts?: readonly LoadedFont[];
  readonly sizePx?: number;
  readonly lineHeight?: number;
  readonly maxWidth?: number;
  readonly maxLines?: number;
  readonly direction?: TextDirection;
  readonly letterSpacing?: number;
}

/** A deliberately small part of Canvas2D, injectable for source tests. */
export interface TextMeasureContext {
  font: string;
  direction: CanvasDirection;
  fontKerning?: string;
  letterSpacing?: string;
  measureText(text: string): { readonly width: number };
}

export interface ShapedTextLine {
  /** The logical text is kept intact for the platform bidi/shaping algorithm. */
  readonly text: string;
  readonly width: number;
  readonly direction: "ltr" | "rtl";
}

export interface ShapedText {
  readonly lines: readonly ShapedTextLine[];
  readonly width: number;
  readonly height: number;
  readonly lineHeight: number;
  readonly font: string;
  readonly letterSpacing: number;
}

const MAX_TEXT_UNITS = 16384;
const MAX_LINES = 1024;
const MAX_MEASURED_UNITS = 1_048_576;

/**
 * Lay out full runs using the platform text engine. `measureText` receives the
 * entire line (not individual code points), preserving kerning, ligatures,
 * contextual substitution and the browser's Unicode bidi/fallback behavior.
 * Painting must likewise call fillText once per returned line. Separate Canvas
 * runs cannot carry bidi formatting state across wraps, so wraps through open
 * embeddings, overrides or isolates are rejected. Even other wrapped text is
 * resolved per line by the platform, not by a paragraph-wide bidi layout.
 */
export function shapeText(text: string, options: TextShapingOptions, context: TextMeasureContext): ShapedText {
  if (typeof text !== "string" || text.length === 0 || text.length > MAX_TEXT_UNITS) {
    throw new RangeError(`Aura3D text must contain 1..${MAX_TEXT_UNITS} UTF-16 units.`);
  }
  const size = options.sizePx ?? 64;
  const lineHeight = options.lineHeight ?? size * 1.2;
  const maxWidth = options.maxWidth ?? Infinity;
  const maxLines = options.maxLines ?? MAX_LINES;
  const spacing = options.letterSpacing ?? 0;
  if (!Number.isFinite(size) || size <= 0 || size > 1024 || !Number.isFinite(lineHeight) || lineHeight <= 0 || lineHeight > 4096 ||
      !(maxWidth === Infinity || (Number.isFinite(maxWidth) && maxWidth > 0)) ||
      !Number.isInteger(maxLines) || maxLines <= 0 || maxLines > MAX_LINES || !Number.isFinite(spacing) || Math.abs(spacing) > size * 2) {
    throw new RangeError("Aura3D text layout options are outside their permitted ranges.");
  }
  if (!["ltr", "rtl", "auto"].includes(options.direction ?? "auto")) throw new Error("Aura3D text direction must be ltr, rtl or auto.");
  if (options.fallbackFonts !== undefined && (!Array.isArray(options.fallbackFonts) || options.fallbackFonts.length > 32)) {
    throw new RangeError("Aura3D text supports at most 32 fallback font handles.");
  }
  const fonts = [options.font, ...(options.fallbackFonts ?? [])];
  if (fonts.some((font) => !font || font.disposed || !/^AuraFont\d+$/.test(font.family))) {
    throw new Error("Aura3D text requires loaded, undisposed admitted font handles.");
  }
  const families = fonts.map((item) => item.family);
  const assertFonts = (): void => {
    if (fonts.some((item, index) => item.disposed || item.family !== families[index])) {
      throw new Error("Aura3D text requires loaded, undisposed admitted font handles.");
    }
  };
  const font = `${size}px ${families.map((family) => `"${family}"`).join(", ")}`;
  context.font = font;
  if ("fontKerning" in context) context.fontKerning = "normal";
  if (spacing !== 0 && !("letterSpacing" in context)) throw new Error("Aura3D text letterSpacing is unsupported by this canvas implementation.");
  if ("letterSpacing" in context) {
    context.letterSpacing = `${spacing}px`;
    if (spacing !== 0) {
      const reported = typeof context.letterSpacing === "string" ? /^(-?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)px$/i.exec(context.letterSpacing.trim()) : null;
      const resolved = reported ? Number(reported[1]) : NaN;
      if (!Number.isFinite(resolved) || Math.abs(resolved - spacing) > Math.max(1, Math.abs(spacing)) * 1e-9) {
        throw new Error("Aura3D text letterSpacing is unsupported by this canvas implementation.");
      }
    }
  }
  const lines: ShapedTextLine[] = [];
  let measuredUnits = 0;
  const measure = (value: string): number => {
    measuredUnits += value.length;
    if (measuredUnits > MAX_MEASURED_UNITS) throw new RangeError("Aura3D text layout exceeds its shaping work budget.");
    const width = context.measureText(value).width;
    assertFonts();
    if (!Number.isFinite(width) || width < 0) throw new Error("Aura3D platform returned invalid text metrics.");
    return width;
  };
  const emit = (line: string, direction: "ltr" | "rtl"): void => {
    if (lines.length >= maxLines) throw new RangeError("Aura3D text exceeds maxLines.");
    context.direction = direction;
    const width = measure(line);
    lines.push({ text: line, width, direction });
  };

  // Unicode Bidi_Class=B boundaries define paragraphs. CRLF is one boundary;
  // just as for LF, the separator is not included in the platform text run.
  for (const paragraph of text.split(/\r\n|[\n\r\u001c-\u001e\u0085\u2029]/)) {
    const firstLine = lines.length;
    const direction = options.direction === "rtl" || options.direction === "ltr" ? options.direction : detectDirection(paragraph);
    context.direction = direction;
    if (maxWidth === Infinity || paragraph === "") { emit(paragraph, direction); continue; }
    // Track formatting scopes over the actual emitted logical lines. A stack
    // of enclosing embedding counts makes PDF local to its isolate, while PDI
    // discards all embeddings within the isolate it closes. Formatting controls
    // are not whitespace and survive the existing trimming unchanged. The input
    // limit bounds both this scan and the stack of nested isolates.
    let embeddingDepth = 0;
    const parentEmbeddingDepths: number[] = [];
    const emitWrapped = (line: string): void => {
      if (lines.length > firstLine && (embeddingDepth > 0 || parentEmbeddingDepths.length > 0)) {
        throw new Error("AURA_TEXT_BIDI_WRAP_UNSUPPORTED: a bidi embedding, override or isolate crosses a wrapped line.");
      }
      emit(line, direction);
      for (const char of line) {
        const cp = char.charCodeAt(0);
        if (cp === 0x202a || cp === 0x202b || cp === 0x202d || cp === 0x202e) embeddingDepth += 1;
        else if (cp === 0x202c) { if (embeddingDepth > 0) embeddingDepth -= 1; }
        else if (cp >= 0x2066 && cp <= 0x2068) { parentEmbeddingDepths.push(embeddingDepth); embeddingDepth = 0; }
        else if (cp === 0x2069 && parentEmbeddingDepths.length > 0) embeddingDepth = parentEmbeddingDepths.pop()!;
      }
    };
    // Word segmentation respects Unicode boundaries; an overlong word falls
    // back to grapheme segmentation so combining marks and emoji stay intact.
    let current = "";
    for (const word of joinedSegments(paragraph, "word")) {
      if (measure(current + word) <= maxWidth) { current += word; continue; }
      const line = current.replace(/[ \t\u1680\u2000-\u2006\u2008-\u200a\u205f\u3000]+$/u, "");
      if (line) emitWrapped(line);
      current = "";
      const remaining = word.replace(/^[ \t\u1680\u2000-\u2006\u2008-\u200a\u205f\u3000]+/u, "");
      if (!remaining) continue;
      if (measure(remaining) <= maxWidth) { current = remaining; continue; }
      for (const cluster of joinedSegments(remaining, "grapheme")) {
        if (current && measure(current + cluster) > maxWidth) { emitWrapped(current); current = ""; }
        current += cluster;
      }
    }
    if (current || lines.length === firstLine) emitWrapped(current);
  }
  return { lines, width: Math.max(0, ...lines.map((line) => line.width)), height: lines.length * lineHeight, lineHeight, font, letterSpacing: spacing };
}

function joinedSegments(text: string, granularity: "word" | "grapheme"): string[] {
  const result: string[] = [];
  let lastCode = -1;
  for (const part of segments(text, granularity)) {
    const last = result.length - 1;
    if (last >= 0 && (isNoBreakJoiner(lastCode) || isNoBreakJoiner(part.charCodeAt(0)))) {
      result[last] += part;
    } else result.push(part);
    lastCode = part.charCodeAt(part.length - 1);
  }
  return result;
}

function isNoBreakJoiner(code: number): boolean {
  return code === 0x00a0 || code === 0x2007 || code === 0x202f || code === 0x2060 || code === 0xfeff;
}

function segments(text: string, granularity: "word" | "grapheme"): string[] {
  const Segmenter = typeof Intl === "undefined" ? undefined :
    (Intl as unknown as { Segmenter?: new (locale?: string, options?: { granularity: "word" | "grapheme" }) => { segment(input: string): Iterable<{ segment: string }> } }).Segmenter;
  if (!Segmenter) {
    if (!/^[\t\x20-\x7e]*$/.test(text)) {
      if (granularity === "word") return [text];
      throw new Error("AURA_TEXT_SEGMENTER_REQUIRED: complex text wrapping requires Intl.Segmenter grapheme support.");
    }
    return granularity === "grapheme" ? [...text] : text.match(/[A-Za-z0-9_]+|[ \t]+|[^A-Za-z0-9_ \t]/g) ?? [];
  }
  return Array.from(new Segmenter(undefined, { granularity }).segment(text), (item) => item.segment);
}

function detectDirection(text: string): "ltr" | "rtl" {
  // UAX #9 P2/P3: only L, R and AL count as strong; skip each entire
  // isolate, including nested isolates, before considering the next character.
  // Unmatched initiators consume the remainder; an unmatched PDI is ignored.
  // Input is already capped at MAX_TEXT_UNITS, so nesting and work are bounded.
  let isolateDepth = 0;
  for (const char of text) {
    const codePoint = char.codePointAt(0)!;
    if (codePoint >= 0x2066 && codePoint <= 0x2068) { isolateDepth += 1; continue; }
    if (codePoint === 0x2069) { if (isolateDepth > 0) isolateDepth -= 1; continue; }
    if (isolateDepth !== 0) continue;
    const direction = strongBidiDirection(codePoint);
    if (direction) return direction;
  }
  return "ltr";
}
