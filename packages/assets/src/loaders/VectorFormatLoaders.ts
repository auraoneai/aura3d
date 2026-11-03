import { mergeAssetRequestOptions, type AssetLoadRequest, type AssetLoader } from "../AssetLoader";
import type { LoadContext } from "../LoadContext";
import { fetchBytes } from "../LoaderFetch";
import { GLTFLoader, type GLTFAsset } from "../GLTFLoader";
import { LoadContext as NativeLoadContext } from "../LoadContext";
import { createRenderableScene } from "../createRenderableScene";
import type { FormatAdapter } from "../FormatRegistry";

/** SVG document import. SVG coordinates are retained (x right, y down), with transforms applied on sampling. */
export type SVGPoint = readonly [number, number];
/** SVG affine matrix [a,b,c,d,e,f], with x'=a*x+c*y+e, y'=b*x+d*y+f. */
export type SVGMatrix = readonly [number, number, number, number, number, number];
export type SVGPathSegment =
  | { readonly type: "M"; readonly to: SVGPoint }
  | { readonly type: "L"; readonly to: SVGPoint }
  | { readonly type: "C"; readonly control1: SVGPoint; readonly control2: SVGPoint; readonly to: SVGPoint }
  | { readonly type: "Q"; readonly control: SVGPoint; readonly to: SVGPoint }
  | { readonly type: "A"; readonly radii: SVGPoint; readonly rotation: number; readonly largeArc: boolean; readonly sweep: boolean; readonly to: SVGPoint }
  | { readonly type: "Z" };
export interface SVGStyle {
  readonly fill: string;
  readonly stroke: string;
  readonly color: string;
  readonly fillRule: "nonzero" | "evenodd";
  readonly fillOpacity: number;
  readonly strokeOpacity: number;
  readonly opacity: number;
  readonly strokeWidth: number;
  readonly strokeLinecap: "butt" | "round" | "square";
  readonly strokeLinejoin: "miter" | "round" | "bevel";
  readonly strokeMiterlimit: number;
  readonly strokeDasharray: readonly number[];
  readonly strokeDashoffset: number;
  readonly visible: boolean;
}
export interface SVGShape {
  readonly id?: string;
  readonly sourceElement: string;
  readonly segments: readonly SVGPathSegment[];
  readonly transform: SVGMatrix;
  readonly style: SVGStyle;
}
export interface SVGDiagnostic { readonly code: string; readonly message: string }
export interface SVGAsset {
  readonly format: "svg";
  readonly width?: number;
  readonly height?: number;
  readonly viewBox?: readonly [number, number, number, number];
  readonly shapes: readonly SVGShape[];
  readonly diagnostics: readonly SVGDiagnostic[];
  readonly coordinateSystem: "svg-y-down";
}
export interface SVGImportOptions { readonly maxBytes?: number; readonly maxElements?: number; readonly maxDepth?: number; readonly maxPathCommands?: number }
export class SVGFormatError extends Error {
  constructor(readonly code: string, message: string) { super(`${code}: ${message}`); this.name = "SVGFormatError"; }
}
const IDENTITY: SVGMatrix = [1, 0, 0, 1, 0, 0];
const INITIAL_STYLE: SVGStyle = { fill: "black", stroke: "none", color: "black", fillRule: "nonzero", fillOpacity: 1, strokeOpacity: 1,
  opacity: 1, strokeWidth: 1, strokeLinecap: "butt", strokeLinejoin: "miter", strokeMiterlimit: 4, strokeDasharray: [], strokeDashoffset: 0, visible: true };
const NUMBER_RE = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
function positiveLimit(value: number | undefined, fallback: number, label: string): number {
  const v = value ?? fallback;
  if (!Number.isSafeInteger(v) || v <= 0) throw new SVGFormatError("INVALID_LIMIT", `${label} must be a positive safe integer`);
  return v;
}
function validNumber(text: string, label: string): number {
  if (!NUMBER_RE.test(text)) throw new SVGFormatError("INVALID_NUMBER", `${label} is not a number`);
  const n = Number(text); if (!Number.isFinite(n)) throw new SVGFormatError("INVALID_NUMBER", `${label} must be finite`); return n;
}
function numbers(text: string, label: string): number[] {
  const pattern = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g, out: number[] = [];
  let end = 0; for (const m of text.matchAll(pattern)) {
    if (!/^[\s,]*$/.test(text.slice(end, m.index))) throw new SVGFormatError("INVALID_NUMBER", `invalid ${label}`);
    out.push(validNumber(m[0], label)); end = m.index! + m[0].length;
  }
  if (!/^[\s,]*$/.test(text.slice(end))) throw new SVGFormatError("INVALID_NUMBER", `invalid ${label}`);
  return out;
}
function mul(a: SVGMatrix, b: SVGMatrix): SVGMatrix {
  return [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
    a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
}
function point(matrix: SVGMatrix, x: number, y: number): SVGPoint {
  const px = matrix[0] * x + matrix[2] * y + matrix[4], py = matrix[1] * x + matrix[3] * y + matrix[5];
  if (!Number.isFinite(px) || !Number.isFinite(py)) throw new SVGFormatError("INVALID_NUMBER", "transformed point is not finite");
  return [px, py];
}
function finiteFloat32(value: number): number {
  if (!Number.isFinite(value) || Math.abs(value) > 3.4028234663852886e38) throw new SVGFormatError("INVALID_NUMBER", "geometry coordinate cannot be represented as float32");
  return value;
}
export function parseSVGTransform(source: string): SVGMatrix {
  let result: SVGMatrix = IDENTITY, end = 0;
  const pattern = /([a-zA-Z]+)\s*\(([^()]*)\)/g;
  for (const match of source.matchAll(pattern)) {
    if (!/^[\s,]*$/.test(source.slice(end, match.index))) throw new SVGFormatError("INVALID_TRANSFORM", "malformed transform list");
    const args = numbers(match[2]!, "transform"), name = match[1]!, count = args.length;
    let m: SVGMatrix;
    if (name === "matrix" && count === 6) m = args as unknown as SVGMatrix;
    else if (name === "translate" && (count === 1 || count === 2)) m = [1, 0, 0, 1, args[0]!, args[1] ?? 0];
    else if (name === "scale" && (count === 1 || count === 2)) m = [args[0]!, 0, 0, args[1] ?? args[0]!, 0, 0];
    else if (name === "rotate" && (count === 1 || count === 3)) {
      const rad = args[0]! * Math.PI / 180, c = Math.cos(rad), s = Math.sin(rad);
      const r: SVGMatrix = [c, s, -s, c, 0, 0];
      m = count === 3 ? mul(mul([1, 0, 0, 1, args[1]!, args[2]!], r), [1, 0, 0, 1, -args[1]!, -args[2]!]) : r;
    } else if ((name === "skewX" || name === "skewY") && count === 1) {
      const t = Math.tan(args[0]! * Math.PI / 180); m = name === "skewX" ? [1, 0, t, 1, 0, 0] : [1, t, 0, 1, 0, 0];
    } else throw new SVGFormatError("UNSUPPORTED_TRANSFORM", `invalid or unsupported ${name} transform`);
    result = mul(result, m);
    if (result.some((v) => !Number.isFinite(v))) throw new SVGFormatError("INVALID_TRANSFORM", "transform is not finite");
    end = match.index! + match[0].length;
  }
  if (!/^[\s,]*$/.test(source.slice(end))) throw new SVGFormatError("INVALID_TRANSFORM", "malformed transform list");
  return result;
}
function pathTokens(source: string): string[] {
  const pattern = /[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g, result: string[] = [];
  let end = 0; for (const match of source.matchAll(pattern)) {
    if (!/^[\s,]*$/.test(source.slice(end, match.index))) throw new SVGFormatError("INVALID_PATH", "invalid path data");
    result.push(match[0]); end = match.index! + match[0].length;
  }
  if (!/^[\s,]*$/.test(source.slice(end))) throw new SVGFormatError("INVALID_PATH", "invalid path data");
  return result;
}
/** Normalize SVG path commands, preserving quadratic, cubic and elliptical arc segments. */
export function parseSVGPath(source: string, maxCommands = 1_000_000): readonly SVGPathSegment[] {
  positiveLimit(maxCommands, 1_000_000, "maxCommands");
  const tokens = pathTokens(source), out: SVGPathSegment[] = [];
  let index = 0, command = "", x = 0, y = 0, startX = 0, startY = 0, lastC: SVGPoint | undefined, lastQ: SVGPoint | undefined, started = false;
  const take = (): number => { const token = tokens[index++]; if (token === undefined || /^[a-zA-Z]$/.test(token)) throw new SVGFormatError("INVALID_PATH", "missing path coordinate"); return validNumber(token, "path coordinate"); };
  // Arc flags are single characters and may be adjacent to each other or the next number.
  const flag = (): number => {
    const token = tokens[index];
    if (!token || !/^[01]/.test(token)) throw new SVGFormatError("INVALID_PATH", "arc flag must be 0 or 1");
    if (token.length === 1) index += 1;
    else tokens[index] = token.slice(1);
    return Number(token[0]);
  };
  const add = (segment: SVGPathSegment): void => { if (out.length >= maxCommands) throw new SVGFormatError("PATH_LIMIT", "path exceeds maxPathCommands"); out.push(segment); };
  while (index < tokens.length) {
    if (/^[a-zA-Z]$/.test(tokens[index]!)) command = tokens[index++]!;
    else if (!command || /[zZ]/.test(command)) throw new SVGFormatError("INVALID_PATH", "path requires a command");
    const upper = command.toUpperCase(), relative = command !== upper;
    if (!"MLHVCSQTAZ".includes(upper)) throw new SVGFormatError("UNSUPPORTED_PATH", `unsupported path command ${command}`);
    if (!started && upper !== "M") throw new SVGFormatError("INVALID_PATH", "path must begin with move-to");
    const ox = x, oy = y, p = (a: number, b: number): SVGPoint => [relative ? a + ox : a, relative ? b + oy : b];
    if (upper === "Z") { add({ type: "Z" }); x = startX; y = startY; lastC = undefined; lastQ = undefined; command = ""; continue; }
    if (upper === "M" || upper === "L") {
      const to = p(take(), take()); [x, y] = to;
      if (upper === "M") { started = true; startX = x; startY = y; add({ type: "M", to }); command = relative ? "l" : "L"; }
      else add({ type: "L", to });
    } else if (upper === "H") { const n = take(); x = relative ? x + n : n; add({ type: "L", to: [x, y] }); }
    else if (upper === "V") { const n = take(); y = relative ? y + n : n; add({ type: "L", to: [x, y] }); }
    else if (upper === "C") {
      const control1 = p(take(), take()), control2 = p(take(), take()), to = p(take(), take());
      add({ type: "C", control1, control2, to }); [x, y] = to; lastC = control2;
    } else if (upper === "S") {
      const control1: SVGPoint = lastC ? [2 * ox - lastC[0], 2 * oy - lastC[1]] : [ox, oy];
      const control2 = p(take(), take()), to = p(take(), take());
      add({ type: "C", control1, control2, to }); [x, y] = to; lastC = control2;
    } else if (upper === "Q") {
      const control = p(take(), take()), to = p(take(), take()); add({ type: "Q", control, to }); [x, y] = to; lastQ = control;
    } else if (upper === "T") {
      const control: SVGPoint = lastQ ? [2 * ox - lastQ[0], 2 * oy - lastQ[1]] : [ox, oy];
      const to = p(take(), take()); add({ type: "Q", control, to }); [x, y] = to; lastQ = control;
    } else {
      const rx = take(), ry = take(), rotation = take(), largeArc = flag(), sweep = flag(), to = p(take(), take());
      if (rx < 0 || ry < 0 || (largeArc !== 0 && largeArc !== 1) || (sweep !== 0 && sweep !== 1)) throw new SVGFormatError("INVALID_PATH", "arc radii and flags are invalid");
      add({ type: "A", radii: [rx, ry], rotation, largeArc: largeArc === 1, sweep: sweep === 1, to }); [x, y] = to;
    }
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new SVGFormatError("INVALID_NUMBER", "path coordinate overflow");
    if (upper !== "C" && upper !== "S") lastC = undefined;
    if (upper !== "Q" && upper !== "T") lastQ = undefined;
  }
  return out;
}
function decodeEntities(value: string): string {
  if (/&(?![^&;\s]+;)/.test(value) || value.includes("<")) throw new SVGFormatError("INVALID_XML", "invalid attribute escape");
  return value.replace(/&([^;]+);/g, (_, entity: string) => {
    const predefined: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (predefined[entity]) return predefined[entity]!;
    const numeric = /^#x[0-9a-f]+$/i.test(entity) ? Number.parseInt(entity.slice(2), 16) : /^#\d+$/.test(entity) ? Number(entity.slice(1)) : NaN;
    if (!Number.isInteger(numeric) || numeric <= 0 || numeric > 0x10ffff || (numeric >= 0xd800 && numeric <= 0xdfff)) throw new SVGFormatError("INVALID_XML", `unsupported entity &${entity};`);
    return String.fromCodePoint(numeric);
  });
}
function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}; let i = 0;
  while (i < source.length) {
    while (/\s/.test(source[i] ?? "") && i < source.length) i += 1;
    if (i >= source.length) break;
    const match = /^[A-Za-z_:][\w:.-]*/.exec(source.slice(i)); if (!match) throw new SVGFormatError("INVALID_XML", "invalid attribute name");
    const name = match[0]; i += name.length; while (/\s/.test(source[i] ?? "") && i < source.length) i += 1;
    if (source[i++] !== "=") throw new SVGFormatError("INVALID_XML", `attribute ${name} requires a value`);
    while (/\s/.test(source[i] ?? "") && i < source.length) i += 1;
    const quote = source[i++]; if (quote !== '"' && quote !== "'") throw new SVGFormatError("INVALID_XML", "attributes must be quoted");
    const end = source.indexOf(quote, i); if (end < 0) throw new SVGFormatError("INVALID_XML", "unterminated attribute");
    if (Object.prototype.hasOwnProperty.call(attrs, name)) throw new SVGFormatError("INVALID_XML", `duplicate attribute ${name}`);
    attrs[name] = decodeEntities(source.slice(i, end)); i = end + 1;
  }
  return attrs;
}
function lengthValue(value: string | undefined, fallback: number, label: string): number {
  if (value === undefined) return fallback;
  const match = /^\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*(px|in|cm|mm|pt|pc)?\s*$/i.exec(value);
  if (!match) throw new SVGFormatError("UNSUPPORTED_UNIT", `${label} uses an unsupported or relative unit`);
  const scale: Record<string, number> = { "": 1, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, pt: 96 / 72, pc: 16 };
  const result = validNumber(match[1]!, label) * scale[(match[2] ?? "").toLowerCase()]!;
  if (!Number.isFinite(result)) throw new SVGFormatError("INVALID_NUMBER", `${label} overflows`); return result;
}
function styleFrom(parent: SVGStyle, attrs: Record<string, string>, diagnostics: SVGDiagnostic[], element: string): SVGStyle {
  const styles: Record<string, string> = { ...attrs };
  if (attrs.style) for (const declaration of attrs.style.split(";")) {
    if (!declaration.trim()) continue; const colon = declaration.indexOf(":");
    if (colon < 0) throw new SVGFormatError("INVALID_STYLE", "style declaration is missing colon");
    styles[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
  }
  const own = (name: string, fallback: string): string => {
    const value = styles[name]?.trim(); return !value || value === "inherit" ? fallback : value;
  };
  const opacity = (name: string, fallback: number): number => {
    const value = own(name, String(fallback)); const percent = value.endsWith("%");
    const n = validNumber(percent ? value.slice(0, -1) : value, name) / (percent ? 100 : 1);
    return Math.max(0, Math.min(1, n));
  };
  const choose = <T extends string>(name: string, fallback: T, allowed: readonly T[]): T => {
    const value = own(name, fallback); if (!allowed.includes(value as T)) throw new SVGFormatError("UNSUPPORTED_STYLE", `${name}: ${value}`); return value as T;
  };
  const localOpacity = opacity("opacity", 1);
  if ((element === "g" || element === "svg") && localOpacity < 1) diagnostics.push({ code: "SVG_GROUP_OPACITY", message: "Group opacity is multiplied into child opacity; isolated overlap compositing is not represented." });
  const color = own("color", parent.color);
  const fill = own("fill", parent.fill).replace(/^currentColor$/i, color), stroke = own("stroke", parent.stroke).replace(/^currentColor$/i, color);
  if (/url\(/i.test(fill) || /url\(/i.test(stroke)) diagnostics.push({ code: "SVG_PAINT_SERVER_UNSUPPORTED", message: "Paint-server references are retained as strings and are not resolved." });
  const dash = own("stroke-dasharray", parent.strokeDasharray.length ? parent.strokeDasharray.join(" ") : "none");
  const dasharray = dash === "none" ? [] : dash.split(/[\s,]+/).filter(Boolean).map((v) => lengthValue(v, 0, "stroke-dasharray"));
  if (dasharray.some((n) => n < 0)) throw new SVGFormatError("INVALID_STYLE", "negative stroke dash length");
  const width = lengthValue(own("stroke-width", String(parent.strokeWidth)), parent.strokeWidth, "stroke-width");
  const miter = validNumber(own("stroke-miterlimit", String(parent.strokeMiterlimit)), "stroke-miterlimit");
  if (width < 0 || miter < 1) throw new SVGFormatError("INVALID_STYLE", "stroke width or miter limit is invalid");
  const visible = own("visibility", parent.visible ? "visible" : "hidden");
  if (!["visible", "hidden", "collapse"].includes(visible)) throw new SVGFormatError("UNSUPPORTED_STYLE", `visibility: ${visible}`);
  return { fill, stroke, color, fillRule: choose("fill-rule", parent.fillRule, ["nonzero", "evenodd"]), fillOpacity: opacity("fill-opacity", parent.fillOpacity),
    strokeOpacity: opacity("stroke-opacity", parent.strokeOpacity), opacity: parent.opacity * localOpacity, strokeWidth: width,
    strokeLinecap: choose("stroke-linecap", parent.strokeLinecap, ["butt", "round", "square"]), strokeLinejoin: choose("stroke-linejoin", parent.strokeLinejoin, ["miter", "round", "bevel"]),
    strokeMiterlimit: miter, strokeDasharray: dasharray, strokeDashoffset: lengthValue(own("stroke-dashoffset", String(parent.strokeDashoffset)), parent.strokeDashoffset, "stroke-dashoffset"), visible: visible === "visible" };
}
function attrLength(attrs: Record<string, string>, key: string, fallback = 0): number { return lengthValue(attrs[key], fallback, key); }
function shapeSegments(tag: string, attrs: Record<string, string>, maxCommands: number): readonly SVGPathSegment[] {
  if (tag === "path") return parseSVGPath(attrs.d ?? "", maxCommands);
  if (tag === "polyline" || tag === "polygon") {
    const values = numbers(attrs.points ?? "", "points"); if (values.length % 2) throw new SVGFormatError("INVALID_SHAPE", "points must contain x,y pairs");
    const result: SVGPathSegment[] = [];
    for (let i = 0; i < values.length; i += 2) result.push({ type: i === 0 ? "M" : "L", to: [values[i]!, values[i + 1]!] });
    if (tag === "polygon" && result.length) result.push({ type: "Z" }); return result;
  }
  if (tag === "line") return [{ type: "M", to: [attrLength(attrs, "x1"), attrLength(attrs, "y1")] }, { type: "L", to: [attrLength(attrs, "x2"), attrLength(attrs, "y2")] }];
  if (tag === "rect") {
    const x = attrLength(attrs, "x"), y = attrLength(attrs, "y"), w = attrLength(attrs, "width"), h = attrLength(attrs, "height");
    if (w < 0 || h < 0) throw new SVGFormatError("INVALID_SHAPE", "negative rectangle dimensions"); if (w === 0 || h === 0) return [];
    let rx = attrLength(attrs, "rx", attrs.ry === undefined ? 0 : attrLength(attrs, "ry")), ry = attrLength(attrs, "ry", rx);
    if (rx < 0 || ry < 0) throw new SVGFormatError("INVALID_SHAPE", "negative rectangle corner radius"); rx = Math.min(rx, w / 2); ry = Math.min(ry, h / 2);
    if (!rx || !ry) return [{ type: "M", to: [x, y] }, { type: "L", to: [x + w, y] }, { type: "L", to: [x + w, y + h] }, { type: "L", to: [x, y + h] }, { type: "Z" }];
    const arc = (a: number, b: number): SVGPathSegment => ({ type: "A", radii: [rx, ry], rotation: 0, largeArc: false, sweep: true, to: [a, b] });
    return [{ type: "M", to: [x + rx, y] }, { type: "L", to: [x + w - rx, y] }, arc(x + w, y + ry), { type: "L", to: [x + w, y + h - ry] }, arc(x + w - rx, y + h), { type: "L", to: [x + rx, y + h] }, arc(x, y + h - ry), { type: "L", to: [x, y + ry] }, arc(x + rx, y), { type: "Z" }];
  }
  if (tag === "circle" || tag === "ellipse") {
    const cx = attrLength(attrs, "cx"), cy = attrLength(attrs, "cy"), rx = attrLength(attrs, tag === "circle" ? "r" : "rx"), ry = tag === "circle" ? rx : attrLength(attrs, "ry");
    if (rx < 0 || ry < 0) throw new SVGFormatError("INVALID_SHAPE", "negative ellipse radius"); if (!rx || !ry) return [];
    return [{ type: "M", to: [cx + rx, cy] }, { type: "A", radii: [rx, ry], rotation: 0, largeArc: false, sweep: true, to: [cx - rx, cy] },
      { type: "A", radii: [rx, ry], rotation: 0, largeArc: false, sweep: true, to: [cx + rx, cy] }, { type: "Z" }];
  }
  return [];
}
interface SVGState { readonly tag: string; readonly matrix: SVGMatrix; readonly style: SVGStyle; readonly skip: boolean }
/** Parse SVG 1.1/2 path and basic-shape documents without external entity or network access. */
export function parseSVG(source: string, options: SVGImportOptions = {}): SVGAsset {
  const maxBytes = positiveLimit(options.maxBytes, 16 * 1024 * 1024, "maxBytes");
  if (source.length > maxBytes || new TextEncoder().encode(source).byteLength > maxBytes) throw new SVGFormatError("INPUT_LIMIT", "SVG exceeds maxBytes");
  const maxElements = positiveLimit(options.maxElements, 100_000, "maxElements"), maxDepth = positiveLimit(options.maxDepth, 256, "maxDepth");
  const maxCommands = positiveLimit(options.maxPathCommands, 1_000_000, "maxPathCommands");
  if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new SVGFormatError("UNSUPPORTED_XML", "DTD and entity declarations are forbidden");
  const stack: SVGState[] = [], diagnostics: SVGDiagnostic[] = [], shapes: SVGShape[] = [];
  let width: number | undefined, height: number | undefined, viewBox: [number, number, number, number] | undefined;
  let position = 0, elementCount = 0, commandCount = 0, sawRoot = false, closedRoot = false;
  while (position < source.length) {
    const open = source.indexOf("<", position);
    if (open < 0) { if (source.slice(position).trim()) throw new SVGFormatError("INVALID_XML", "unexpected trailing text"); break; }
    const text = source.slice(position, open);
    if (text.trim() && !stack.length) throw new SVGFormatError("INVALID_XML", "text outside the SVG root");
    if (text.trim() && !stack[stack.length - 1]?.skip) diagnostics.push({ code: "SVG_TEXT_UNSUPPORTED", message: "Text content is not converted to outlines." });
    if (source.startsWith("<!--", open)) { const end = source.indexOf("-->", open + 4); if (end < 0) throw new SVGFormatError("INVALID_XML", "unterminated comment"); position = end + 3; continue; }
    if (source.startsWith("<?", open)) { const end = source.indexOf("?>", open + 2); if (end < 0) throw new SVGFormatError("INVALID_XML", "unterminated processing instruction"); position = end + 2; continue; }
    let close = open + 1, quote = "";
    for (; close < source.length; close += 1) { const c = source[close]!; if (quote) { if (c === quote) quote = ""; } else if (c === '"' || c === "'") quote = c; else if (c === ">") break; }
    if (close >= source.length) throw new SVGFormatError("INVALID_XML", "unterminated element");
    const raw = source.slice(open + 1, close).trim(); position = close + 1;
    if (raw.startsWith("!")) throw new SVGFormatError("UNSUPPORTED_XML", "declarations and CDATA are unsupported");
    if (raw.startsWith("/")) {
      const name = raw.slice(1).trim(); if (!/^[\w:.-]+$/.test(name) || !stack.length || stack[stack.length - 1]!.tag !== name) throw new SVGFormatError("INVALID_XML", `mismatched close tag ${name}`);
      stack.pop(); if (!stack.length) closedRoot = true; continue;
    }
    if (closedRoot) throw new SVGFormatError("INVALID_XML", "multiple root elements");
    const selfClosing = raw.endsWith("/"), body = selfClosing ? raw.slice(0, -1).trim() : raw;
    const match = /^([A-Za-z_:][\w:.-]*)([\s\S]*)$/.exec(body); if (!match) throw new SVGFormatError("INVALID_XML", "invalid element");
    const rawTag = match[1]!, tag = rawTag.includes(":") ? rawTag.slice(rawTag.indexOf(":") + 1) : rawTag;
    const attrs = parseAttributes(match[2]!);
    if (++elementCount > maxElements) throw new SVGFormatError("ELEMENT_LIMIT", "SVG exceeds maxElements");
    if (stack.length + 1 > maxDepth) throw new SVGFormatError("DEPTH_LIMIT", "SVG exceeds maxDepth");
    if (!sawRoot) { if (tag !== "svg") throw new SVGFormatError("INVALID_XML", "root element must be svg"); sawRoot = true; }
    const parent = stack[stack.length - 1];
    let matrix = parent?.matrix ?? IDENTITY;
    let skip = parent?.skip ?? false;
    if (attrs.transform) matrix = mul(matrix, parseSVGTransform(attrs.transform));
    if (matrix.some((n) => !Number.isFinite(n))) throw new SVGFormatError("INVALID_TRANSFORM", "nested transform is not finite");
    const style = styleFrom(parent?.style ?? INITIAL_STYLE, attrs, diagnostics, tag);
    for (const feature of ["class", "filter", "mask", "clip-path", "marker-start", "marker-mid", "marker-end", "vector-effect"]) {
      if (attrs[feature] !== undefined || new RegExp(`(?:^|;)\\s*${feature}\\s*:`).test(attrs.style ?? "")) {
        diagnostics.push({ code: "SVG_EFFECT_UNSUPPORTED", message: `${feature} is not applied to the imported geometry.` });
      }
    }
    const display = attrs.style?.split(";").map((s) => s.trim()).find((s) => /^display\s*:/.test(s))?.split(":").slice(1).join(":").trim() ?? attrs.display;
    if (display === "none") skip = true;
    if (tag === "svg" && !parent) {
      if (attrs.width !== undefined) width = lengthValue(attrs.width, 0, "width");
      if (attrs.height !== undefined) height = lengthValue(attrs.height, 0, "height");
      if ((width !== undefined && width < 0) || (height !== undefined && height < 0)) throw new SVGFormatError("INVALID_SHAPE", "negative viewport dimensions");
      if (attrs.viewBox !== undefined) {
        const box = numbers(attrs.viewBox, "viewBox");
        if (box.length !== 4 || box[2]! <= 0 || box[3]! <= 0) throw new SVGFormatError("INVALID_VIEWBOX", "viewBox must have positive width and height");
        viewBox = box as [number, number, number, number];
        const viewportWidth = width ?? viewBox[2], viewportHeight = height ?? viewBox[3];
        const preserve = (attrs.preserveAspectRatio ?? "xMidYMid meet").trim().split(/\s+/);
        let sx = viewportWidth / viewBox[2], sy = viewportHeight / viewBox[3], dx = 0, dy = 0;
        if (preserve[0] !== "none") {
          const align = /^(xMin|xMid|xMax)(YMin|YMid|YMax)$/.exec(preserve[0]!);
          if (!align || (preserve[1] && !["meet", "slice"].includes(preserve[1])) || preserve.length > 2) throw new SVGFormatError("UNSUPPORTED_VIEWBOX", "unsupported preserveAspectRatio");
          const scale = preserve[1] === "slice" ? Math.max(sx, sy) : Math.min(sx, sy); sx = sy = scale;
          if (preserve[1] === "slice") diagnostics.push({ code: "SVG_VIEWPORT_CLIP_UNSUPPORTED", message: "The slice viewport transform is applied but its clipping rectangle is not." });
          const remainingX = viewportWidth - viewBox[2] * sx, remainingY = viewportHeight - viewBox[3] * sy;
          dx = remainingX * (align[1] === "xMid" ? 0.5 : align[1] === "xMax" ? 1 : 0);
          dy = remainingY * (align[2] === "YMid" ? 0.5 : align[2] === "YMax" ? 1 : 0);
        } else if (preserve.length !== 1) throw new SVGFormatError("UNSUPPORTED_VIEWBOX", "none does not accept meet or slice");
        matrix = mul(matrix, [sx, 0, 0, sy, dx - viewBox[0] * sx, dy - viewBox[1] * sy]);
      }
    } else if (tag === "svg") { diagnostics.push({ code: "SVG_NESTED_VIEWPORT_UNSUPPORTED", message: "Nested svg viewports are not implemented; subtree omitted." }); skip = true; }
    const containers = new Set(["svg", "g", "a"]), shapeTags = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon"]);
    if (!skip && shapeTags.has(tag)) {
      const segments = shapeSegments(tag, attrs, maxCommands); commandCount += segments.length;
      if (commandCount > maxCommands) throw new SVGFormatError("PATH_LIMIT", "SVG exceeds maxPathCommands");
      if (segments.length && style.visible) shapes.push({ ...(attrs.id ? { id: attrs.id } : {}), sourceElement: tag, segments, transform: matrix, style });
    } else if (!skip && !containers.has(tag)) {
      diagnostics.push({ code: "SVG_ELEMENT_UNSUPPORTED", message: `SVG ${tag} is unsupported and its subtree is omitted.` }); skip = true;
    }
    if (!selfClosing) stack.push({ tag: rawTag, matrix, style, skip }); else if (!stack.length) closedRoot = true;
  }
  if (!sawRoot || stack.length) throw new SVGFormatError("INVALID_XML", "missing or unclosed SVG root");
  return { format: "svg", ...(width !== undefined ? { width } : {}), ...(height !== undefined ? { height } : {}), ...(viewBox ? { viewBox } : {}), shapes, diagnostics, coordinateSystem: "svg-y-down" };
}

export interface SVGFlattenOptions { readonly curveSegments?: number; readonly maxPoints?: number }
/** Sample transformed contours for filling, stroking or a shape-geometry adapter. */
export function flattenSVGShape(shape: SVGShape, options: SVGFlattenOptions = {}): readonly (readonly SVGPoint[])[] {
  const curveSegments = positiveLimit(options.curveSegments, 24, "curveSegments");
  const maxPoints = positiveLimit(options.maxPoints, 1_000_000, "maxPoints");
  if (curveSegments > 4096) throw new SVGFormatError("POINT_LIMIT", "curveSegments exceeds 4096");
  const contours: SVGPoint[][] = [];
  let contour: SVGPoint[] | undefined, current: SVGPoint = [0, 0], start: SVGPoint = [0, 0], total = 0;
  const push = (x: number, y: number): void => {
    if (!contour) throw new SVGFormatError("INVALID_PATH", "contour does not start with move-to");
    if (++total > maxPoints) throw new SVGFormatError("POINT_LIMIT", "flattened SVG exceeds maxPoints");
    contour.push(point(shape.transform, x, y));
  };
  for (const segment of shape.segments) {
    if (segment.type === "M") { contour = []; contours.push(contour); current = segment.to; start = segment.to; push(current[0], current[1]); }
    else if (segment.type === "Z") { if (current[0] !== start[0] || current[1] !== start[1]) push(start[0], start[1]); current = start; }
    else if (segment.type === "L") { current = segment.to; push(current[0], current[1]); }
    else if (segment.type === "Q" || segment.type === "C") {
      const origin = current;
      for (let i = 1; i <= curveSegments; i += 1) {
        const t = i / curveSegments, u = 1 - t;
        if (segment.type === "Q") push(u * u * origin[0] + 2 * u * t * segment.control[0] + t * t * segment.to[0], u * u * origin[1] + 2 * u * t * segment.control[1] + t * t * segment.to[1]);
        else push(u ** 3 * origin[0] + 3 * u * u * t * segment.control1[0] + 3 * u * t * t * segment.control2[0] + t ** 3 * segment.to[0],
          u ** 3 * origin[1] + 3 * u * u * t * segment.control1[1] + 3 * u * t * t * segment.control2[1] + t ** 3 * segment.to[1]);
      }
      current = segment.to;
    } else {
      let [rx, ry] = segment.radii;
      const [x1, y1] = current, [x2, y2] = segment.to;
      if (!rx || !ry) { push(x2, y2); current = segment.to; continue; }
      if (x1 === x2 && y1 === y2) { current = segment.to; continue; }
      const phi = segment.rotation * Math.PI / 180, c = Math.cos(phi), s = Math.sin(phi);
      const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
      const xp = c * dx + s * dy, yp = -s * dx + c * dy;
      const lambda = xp * xp / (rx * rx) + yp * yp / (ry * ry);
      if (lambda > 1) { const scale = Math.sqrt(lambda); rx *= scale; ry *= scale; }
      const numerator = Math.max(0, rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp);
      const denominator = rx * rx * yp * yp + ry * ry * xp * xp;
      const factor = (segment.largeArc === segment.sweep ? -1 : 1) * Math.sqrt(denominator ? numerator / denominator : 0);
      const cxp = factor * rx * yp / ry, cyp = -factor * ry * xp / rx;
      const cx = c * cxp - s * cyp + (x1 + x2) / 2, cy = s * cxp + c * cyp + (y1 + y2) / 2;
      const ux = (xp - cxp) / rx, uy = (yp - cyp) / ry, vx = (-xp - cxp) / rx, vy = (-yp - cyp) / ry;
      const angle = Math.atan2(uy, ux);
      let delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      if (!segment.sweep && delta > 0) delta -= 2 * Math.PI;
      if (segment.sweep && delta < 0) delta += 2 * Math.PI;
      const steps = Math.max(1, Math.ceil(curveSegments * Math.abs(delta) / (2 * Math.PI)));
      for (let i = 1; i <= steps; i += 1) {
        if (i === steps) { push(x2, y2); continue; }
        const a = angle + delta * i / steps, cos = Math.cos(a), sin = Math.sin(a);
        push(cx + c * rx * cos - s * ry * sin, cy + s * rx * cos + c * ry * sin);
      }
      current = segment.to;
    }
  }
  return contours;
}
export class SVGLoader implements AssetLoader<SVGAsset> {
  readonly type = "svg";
  constructor(readonly options: SVGImportOptions = {}) {}
  canLoad(request: AssetLoadRequest): boolean {
    return request.type === "svg" || (!request.type && /\.svg(?:[?#]|$)/i.test(request.url));
  }
  parse(source: string, options: SVGImportOptions = this.options): SVGAsset { return parseSVG(source, options); }
  async load(request: AssetLoadRequest, context: LoadContext): Promise<SVGAsset> {
    const maximum = positiveLimit(this.options.maxBytes, 16 * 1024 * 1024, "maxBytes");
    const policy = mergeAssetRequestOptions(context.requestOptionsFor(request.url), request);
    const signal = context.signalFor(request.signal);
    const url = context.dependencyChain.at(-1) === request.url ? request.url : context.resolve(request.url);
    const bytes = await fetchBytes(url, signal, request.onProgress ? (progress) => request.onProgress!({
      url: request.url, phase: "document", loadedBytes: progress.loaded, ...(progress.total !== undefined ? { totalBytes: progress.total } : {})
    }) : undefined, { ...policy, maxBytes: Math.min(policy.maxBytes ?? maximum, maximum) });
    const result = this.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (signal?.aborted) throw signal.reason ?? new DOMException("Asset load aborted", "AbortError");
    return result;
  }
}

export interface SVGMesh { readonly positions: Float32Array; readonly indices: Uint32Array }
export interface SVGGeometryOptions extends SVGFlattenOptions { readonly maxVertices?: number }
function emptyMesh(): SVGMesh { return { positions: new Float32Array(), indices: new Uint32Array() }; }
function area(points: readonly SVGPoint[]): number {
  let result = 0;
  for (let i = 0; i < points.length; i += 1) {
    const a = points[i]!, b = points[(i + 1) % points.length]!; result += a[0] * b[1] - b[0] * a[1];
  }
  return result / 2;
}
function cross(a: SVGPoint, b: SVGPoint, c: SVGPoint): number { return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]); }
function insidePolygon(p: SVGPoint, polygon: readonly SVGPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!;
    if ((a[1] > p[1]) !== (b[1] > p[1]) && p[0] < (b[0] - a[0]) * (p[1] - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
}
function segmentsIntersect(a: SVGPoint, b: SVGPoint, c: SVGPoint, d: SVGPoint): boolean {
  const abC = cross(a, b, c), abD = cross(a, b, d), cdA = cross(c, d, a), cdB = cross(c, d, b);
  const on = (p: SVGPoint, q: SVGPoint, r: SVGPoint) => r[0] >= Math.min(p[0], q[0]) - 1e-10 && r[0] <= Math.max(p[0], q[0]) + 1e-10 && r[1] >= Math.min(p[1], q[1]) - 1e-10 && r[1] <= Math.max(p[1], q[1]) + 1e-10;
  if (Math.abs(abC) < 1e-10 && on(a, b, c)) return true;
  if (Math.abs(abD) < 1e-10 && on(a, b, d)) return true;
  if (Math.abs(cdA) < 1e-10 && on(c, d, a)) return true;
  if (Math.abs(cdB) < 1e-10 && on(c, d, b)) return true;
  return Math.sign(abC) !== Math.sign(abD) && Math.sign(cdA) !== Math.sign(cdB);
}
function cleaned(points: readonly SVGPoint[]): SVGPoint[] {
  const result: SVGPoint[] = [];
  for (const p of points) if (!result.length || p[0] !== result[result.length - 1]![0] || p[1] !== result[result.length - 1]![1]) result.push(p);
  if (result.length > 1 && result[0]![0] === result[result.length - 1]![0] && result[0]![1] === result[result.length - 1]![1]) result.pop();
  return result;
}
function assertSimple(contours: readonly SVGPoint[][]): void {
  for (let a = 0; a < contours.length; a += 1) for (let i = 0; i < contours[a]!.length; i += 1) {
    const p = contours[a]![i]!, q = contours[a]![(i + 1) % contours[a]!.length]!;
    for (let b = a; b < contours.length; b += 1) for (let j = b === a ? i + 1 : 0; j < contours[b]!.length; j += 1) {
      if (a === b && (j === i + 1 || (i === 0 && j === contours[a]!.length - 1))) continue;
      if (segmentsIntersect(p, q, contours[b]![j]!, contours[b]![(j + 1) % contours[b]!.length]!)) throw new SVGFormatError("UNSUPPORTED_FILL", "self-intersecting or touching contours require a winding tessellator");
    }
  }
}
function samePoint(a: SVGPoint, b: SVGPoint): boolean { return a[0] === b[0] && a[1] === b[1]; }
function joinHole(shell: SVGPoint[], hole: SVGPoint[], allHoles: readonly SVGPoint[][]): SVGPoint[] {
  let holeIndex = 0;
  for (let i = 1; i < hole.length; i += 1) {
    if (hole[i]![0] > hole[holeIndex]![0] || (hole[i]![0] === hole[holeIndex]![0] && hole[i]![1] < hole[holeIndex]![1])) holeIndex = i;
  }
  const h = hole[holeIndex]!;
  const candidates = shell.map((p, index) => ({ p, index, distance: (p[0] - h[0]) ** 2 + (p[1] - h[1]) ** 2 })).sort((a, b) => a.distance - b.distance);
  let shellIndex = -1;
  for (const candidate of candidates) {
    const midpoint: SVGPoint = [(h[0] + candidate.p[0]) / 2, (h[1] + candidate.p[1]) / 2];
    if (!insidePolygon(midpoint, shell) || allHoles.some((ring) => insidePolygon(midpoint, ring))) continue;
    let crossed = false;
    for (const ring of [shell, ...allHoles]) {
      for (let i = 0; i < ring.length; i += 1) {
        const a = ring[i]!, b = ring[(i + 1) % ring.length]!;
        if (samePoint(a, h) || samePoint(b, h) || samePoint(a, candidate.p) || samePoint(b, candidate.p)) continue;
        if (segmentsIntersect(h, candidate.p, a, b)) { crossed = true; break; }
      }
      if (crossed) break;
    }
    if (!crossed) { shellIndex = candidate.index; break; }
  }
  if (shellIndex < 0) throw new SVGFormatError("UNSUPPORTED_FILL", "no non-intersecting bridge to hole");
  const walk = Array.from({ length: hole.length }, (_, i) => hole[(holeIndex + i) % hole.length]!);
  return [...shell.slice(0, shellIndex + 1), ...walk, h, shell[shellIndex]!, ...shell.slice(shellIndex + 1)];
}
/** Tessellate simple contours and nested holes under nonzero/evenodd winding; crossing contours fail explicitly. */
export function createSVGFillGeometry(shape: SVGShape, options: SVGGeometryOptions = {}): SVGMesh {
  if (shape.style.fill === "none" || shape.style.fillOpacity === 0 || shape.style.opacity === 0 || !shape.style.visible) return emptyMesh();
  if (/url\(/i.test(shape.style.fill)) throw new SVGFormatError("UNSUPPORTED_PAINT", "paint server is not a solid fill");
  const maxVertices = positiveLimit(options.maxVertices, 4096, "maxVertices");
  if (maxVertices > 4096) throw new SVGFormatError("POINT_LIMIT", "fill tessellation is limited to 4096 vertices");
  const contours = flattenSVGShape(shape, { ...options, maxPoints: Math.min(options.maxPoints ?? maxVertices, maxVertices) }).map(cleaned).filter((p) => p.length >= 3);
  if (!contours.length) return emptyMesh();
  assertSimple(contours);
  const signedAreas = contours.map(area);
  if (signedAreas.some((value) => Math.abs(value) < 1e-12)) throw new SVGFormatError("UNSUPPORTED_FILL", "degenerate contour has zero area");
  const parents = contours.map((ring, i) => {
    let parent = -1;
    for (let j = 0; j < contours.length; j += 1) {
      if (i !== j && Math.abs(signedAreas[j]!) > Math.abs(signedAreas[i]!) && insidePolygon(ring[0]!, contours[j]!) &&
        (parent < 0 || Math.abs(signedAreas[j]!) < Math.abs(signedAreas[parent]!))) parent = j;
    }
    return parent;
  });
  const windingOutside = (index: number): number => {
    let sum = 0, parent = parents[index]!;
    while (parent >= 0) { sum += shape.style.fillRule === "evenodd" ? 1 : Math.sign(signedAreas[parent]!); parent = parents[parent]!; }
    return sum;
  };
  const filled = (winding: number): boolean => shape.style.fillRule === "evenodd" ? Math.abs(winding) % 2 === 1 : winding !== 0;
  const outside = contours.map((_, i) => windingOutside(i));
  const inside = contours.map((_, i) => outside[i]! + (shape.style.fillRule === "evenodd" ? 1 : Math.sign(signedAreas[i]!)));
  const shells = contours.map((_, i) => i).filter((i) => !filled(outside[i]!) && filled(inside[i]!));
  const holes = contours.map((_, i) => i).filter((i) => filled(outside[i]!) && !filled(inside[i]!));
  const positions: number[] = [], indices: number[] = [];
  for (const shellIndex of shells) {
    let contour = signedAreas[shellIndex]! > 0 ? [...contours[shellIndex]!] : [...contours[shellIndex]!].reverse();
    const shellHoles = holes.filter((hole) => {
      let ancestor = parents[hole]!;
      while (ancestor >= 0 && !shells.includes(ancestor)) ancestor = parents[ancestor]!;
      return ancestor === shellIndex;
    }).map((hole) => signedAreas[hole]! < 0 ? [...contours[hole]!] : [...contours[hole]!].reverse());
    shellHoles.sort((a, b) => Math.max(...b.map((p) => p[0])) - Math.max(...a.map((p) => p[0])));
    for (let i = 0; i < shellHoles.length; i += 1) contour = joinHole(contour, shellHoles[i]!, shellHoles.slice(i));
    if (positions.length / 3 + contour.length > maxVertices) throw new SVGFormatError("POINT_LIMIT", "fill mesh exceeds maxVertices");
    const signedArea = area(contour);
    const base = positions.length / 3;
    contour.forEach((p) => positions.push(finiteFloat32(p[0]), finiteFloat32(p[1]), 0));
    const remaining = contour.map((_, i) => i);
    const addTriangle = (a: number, b: number, c: number): void => {
      if (signedArea > 0) indices.push(base + a, base + b, base + c);
      else indices.push(base + c, base + b, base + a);
    };
    let guard = remaining.length * remaining.length;
    while (remaining.length > 3 && guard-- > 0) {
      let found = false;
      for (let i = 0; i < remaining.length; i += 1) {
        const a = remaining[(i + remaining.length - 1) % remaining.length]!, b = remaining[i]!, c = remaining[(i + 1) % remaining.length]!;
        if (cross(contour[a]!, contour[b]!, contour[c]!) * signedArea <= 1e-12) continue;
        const contains = remaining.some((v) => {
          if (v === a || v === b || v === c || samePoint(contour[v]!, contour[a]!) || samePoint(contour[v]!, contour[b]!) || samePoint(contour[v]!, contour[c]!)) return false;
          const p = contour[v]!, s = Math.sign(signedArea);
          return cross(contour[a]!, contour[b]!, p) * s >= -1e-12 && cross(contour[b]!, contour[c]!, p) * s >= -1e-12 && cross(contour[c]!, contour[a]!, p) * s >= -1e-12;
        });
        if (contains) continue;
        addTriangle(a, b, c); remaining.splice(i, 1); found = true; break;
      }
      if (!found) throw new SVGFormatError("UNSUPPORTED_FILL", "contour cannot be tessellated without altering winding");
    }
    if (remaining.length !== 3) throw new SVGFormatError("UNSUPPORTED_FILL", "fill tessellation exceeded its budget");
    addTriangle(remaining[0]!, remaining[1]!, remaining[2]!);
  }
  return { positions: Float32Array.from(positions), indices: Uint32Array.from(indices) };
}

function dashContours(contours: readonly (readonly SVGPoint[])[], style: SVGStyle, maxPoints: number): SVGPoint[][] {
  let pattern = [...style.strokeDasharray];
  if (pattern.length === 0 || pattern.every((value) => value === 0)) return contours.map((points) => [...points]);
  if (pattern.length % 2) pattern = [...pattern, ...pattern];
  const period = pattern.reduce((a, b) => a + b, 0);
  if (!Number.isFinite(period) || period <= 0) throw new SVGFormatError("INVALID_STYLE", "invalid stroke dash period");
  const result: SVGPoint[][] = [];
  let count = 0;
  for (const points of contours) {
    if (points.length < 2) continue;
    let phase = ((style.strokeDashoffset % period) + period) % period, patternIndex = 0;
    while (phase >= pattern[patternIndex]! || pattern[patternIndex] === 0) {
      phase -= pattern[patternIndex]!; patternIndex = (patternIndex + 1) % pattern.length;
    }
    let remain = pattern[patternIndex]! - phase;
    const startResult = result.length;
    let current: SVGPoint[] | undefined;
    for (let i = 0; i + 1 < points.length; i += 1) {
      const a = points[i]!, b = points[i + 1]!, dx = b[0] - a[0], dy = b[1] - a[1], distance = Math.hypot(dx, dy);
      if (!distance) continue;
      let travel = 0;
      while (travel < distance) {
        if (remain <= 0) {
          patternIndex = (patternIndex + 1) % pattern.length; remain = pattern[patternIndex]!;
          if (patternIndex % 2) current = undefined;
          continue;
        }
        const next = Math.min(distance, travel + remain);
        if (next === travel) throw new SVGFormatError("POINT_LIMIT", "dash lengths are too small for the coordinate precision");
        const at = (length: number): SVGPoint => [a[0] + dx * (length / distance), a[1] + dy * (length / distance)];
        if (patternIndex % 2 === 0) {
          if (!current) { current = [at(travel)]; result.push(current); count += 1; }
          current.push(at(next)); count += 1;
          if (count > maxPoints) throw new SVGFormatError("POINT_LIMIT", "dashed strokes exceed maxPoints");
        }
        remain -= next - travel; travel = next;
      }
    }
    const closed = samePoint(points[0]!, points[points.length - 1]!);
    const first = result[startResult], last = result[result.length - 1];
    if (closed && first && last && first !== last && samePoint(first[0]!, points[0]!) && samePoint(last[last.length - 1]!, points[0]!)) {
      result[startResult] = [...last.slice(0, -1), ...first]; result.pop();
    }
  }
  return result;
}
/** Build triangles for SVG strokes, honoring width, dashes, transforms, caps and joins. */
export function createSVGStrokeGeometry(shape: SVGShape, options: SVGGeometryOptions = {}): SVGMesh {
  const style = shape.style;
  if (style.stroke === "none" || style.strokeWidth === 0 || style.strokeOpacity === 0 || style.opacity === 0 || !style.visible) return emptyMesh();
  if (/url\(/i.test(style.stroke)) throw new SVGFormatError("UNSUPPORTED_PAINT", "paint server is not a solid stroke");
  const maxVertices = positiveLimit(options.maxVertices, 1_000_000, "maxVertices");
  const maxPoints = positiveLimit(options.maxPoints, 1_000_000, "maxPoints");
  const contours = dashContours(flattenSVGShape({ ...shape, transform: IDENTITY }, options), style, maxPoints), vertices: number[] = [], indices: number[] = [];
  const half = style.strokeWidth / 2;
  const vertex = (x: number, y: number): number => {
    if (vertices.length / 3 >= maxVertices) throw new SVGFormatError("POINT_LIMIT", "stroke mesh exceeds maxVertices");
    const p = point(shape.transform, x, y); vertices.push(finiteFloat32(p[0]), finiteFloat32(p[1]), 0); return vertices.length / 3 - 1;
  };
  const triangle = (a: SVGPoint, b: SVGPoint, c: SVGPoint): void => {
    const flip = cross(a, b, c) * (shape.transform[0] * shape.transform[3] - shape.transform[1] * shape.transform[2]) < 0;
    indices.push(vertex(a[0], a[1]), ...(flip ? [vertex(c[0], c[1]), vertex(b[0], b[1])] : [vertex(b[0], b[1]), vertex(c[0], c[1])]));
  };
  const fan = (center: SVGPoint, from: number, sweep: number): void => {
    const steps = Math.max(1, Math.ceil(Math.abs(sweep) / (Math.PI / 12)));
    let last: SVGPoint = [center[0] + Math.cos(from) * half, center[1] + Math.sin(from) * half];
    for (let i = 1; i <= steps; i += 1) {
      const angle = from + sweep * i / steps, next: SVGPoint = [center[0] + Math.cos(angle) * half, center[1] + Math.sin(angle) * half];
      triangle(center, last, next); last = next;
    }
  };
  for (const raw of contours) {
    const closed = raw.length > 2 && raw[0]![0] === raw[raw.length - 1]![0] && raw[0]![1] === raw[raw.length - 1]![1];
    const pts = cleaned(raw); if (pts.length < 2) continue;
    const segmentCount = closed ? pts.length : pts.length - 1;
    const directions: SVGPoint[] = [], normals: SVGPoint[] = [];
    for (let i = 0; i < segmentCount; i += 1) {
      const a = pts[i]!, b = pts[(i + 1) % pts.length]!, dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
      const d: SVGPoint = [dx / length, dy / length], n: SVGPoint = [-d[1] * half, d[0] * half]; directions.push(d); normals.push(n);
      const start = !closed && i === 0 && style.strokeLinecap === "square" ? -half : 0;
      const end = !closed && i === segmentCount - 1 && style.strokeLinecap === "square" ? half : 0;
      const a1: SVGPoint = [a[0] + d[0] * start + n[0], a[1] + d[1] * start + n[1]], a2: SVGPoint = [a[0] + d[0] * start - n[0], a[1] + d[1] * start - n[1]];
      const b1: SVGPoint = [b[0] + d[0] * end + n[0], b[1] + d[1] * end + n[1]], b2: SVGPoint = [b[0] + d[0] * end - n[0], b[1] + d[1] * end - n[1]];
      triangle(a1, a2, b1); triangle(a2, b2, b1);
    }
    const firstJoin = closed ? 0 : 1, lastJoin = closed ? pts.length : pts.length - 1;
    for (let i = firstJoin; i < lastJoin; i += 1) {
      const previous = (i - 1 + segmentCount) % segmentCount, next = i % segmentCount, p = pts[i]!, d1 = directions[previous]!, d2 = directions[next]!;
      const turn = d1[0] * d2[1] - d1[1] * d2[0]; if (Math.abs(turn) < 1e-12) continue;
      const side = turn > 0 ? -1 : 1;
      const n1 = normals[previous]!, n2 = normals[next]!;
      const a: SVGPoint = [p[0] + side * n1[0], p[1] + side * n1[1]], b: SVGPoint = [p[0] + side * n2[0], p[1] + side * n2[1]];
      if (style.strokeLinejoin === "round") {
        const a1 = Math.atan2(a[1] - p[1], a[0] - p[0]), a2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
        let sweep = a2 - a1; if (turn > 0 && sweep < 0) sweep += Math.PI * 2; if (turn < 0 && sweep > 0) sweep -= Math.PI * 2;
        fan(p, a1, sweep);
      } else if (style.strokeLinejoin === "miter") {
        const crossD = d1[0] * d2[1] - d1[1] * d2[0];
        const t = ((b[0] - a[0]) * d2[1] - (b[1] - a[1]) * d2[0]) / crossD;
        const m: SVGPoint = [a[0] + d1[0] * t, a[1] + d1[1] * t];
        if (Math.hypot(m[0] - p[0], m[1] - p[1]) <= half * style.strokeMiterlimit) { triangle(a, m, b); continue; }
        triangle(a, p, b);
      } else triangle(a, p, b);
    }
    if (!closed && style.strokeLinecap === "round") {
      const first = pts[0]!, last = pts[pts.length - 1]!, d1 = directions[0]!, d2 = directions[directions.length - 1]!;
      fan(first, Math.atan2(d1[1], d1[0]) + Math.PI / 2, Math.PI);
      fan(last, Math.atan2(d2[1], d2[0]) - Math.PI / 2, Math.PI);
    }
  }
  return { positions: Float32Array.from(vertices), indices: Uint32Array.from(indices) };
}

type SVGColor = readonly [number, number, number, number];
/** Resolve common CSS color syntax. Unsupported paint syntax never silently changes color. */
export function parseSVGColor(value: string): SVGColor {
  const named: Readonly<Record<string, string>> = { black: "#000000", silver: "#c0c0c0", gray: "#808080", grey: "#808080", white: "#ffffff", maroon: "#800000", red: "#ff0000", purple: "#800080", fuchsia: "#ff00ff", green: "#008000", lime: "#00ff00", olive: "#808000", yellow: "#ffff00", navy: "#000080", blue: "#0000ff", teal: "#008080", aqua: "#00ffff", orange: "#ffa500", rebeccapurple: "#663399", transparent: "#00000000" };
  let text = value.trim().toLowerCase(); text = named[text] ?? text;
  const toLinear = (c: number): number => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const clamp = (v: number): number => Math.min(1, Math.max(0, v));
  let rgba: SVGColor;
  if (/^#[0-9a-f]{3,4}$/.test(text)) {
    const channels = text.slice(1).split("").map((n) => Number.parseInt(n + n, 16) / 255);
    rgba = [channels[0]!, channels[1]!, channels[2]!, channels[3] ?? 1];
  } else if (/^#[0-9a-f]{6}(?:[0-9a-f]{2})?$/.test(text)) {
    const channels = text.slice(1).match(/../g)!.map((n) => Number.parseInt(n, 16) / 255);
    rgba = [channels[0]!, channels[1]!, channels[2]!, channels[3] ?? 1];
  } else {
    const match = /^(rgb|rgba|hsl|hsla)\((.*)\)$/.exec(text);
    if (!match) throw new SVGFormatError("UNSUPPORTED_PAINT", `unsupported CSS color ${value}`);
    const values = match[2]!.replace(/\//g, " ").split(/[\s,]+/).filter(Boolean);
    if (values.length < 3 || values.length > 4) throw new SVGFormatError("INVALID_COLOR", `invalid CSS color ${value}`);
    const component = (token: string, scale: number): number => token.endsWith("%") ? validNumber(token.slice(0, -1), "color percentage") / 100 : validNumber(token, "color component") / scale;
    const alpha = values[3] === undefined ? 1 : component(values[3], 1);
    if (match[1]!.startsWith("rgb")) rgba = [clamp(component(values[0]!, 255)), clamp(component(values[1]!, 255)), clamp(component(values[2]!, 255)), clamp(alpha)];
    else {
      const hueText = values[0]!.replace(/deg$/, ""), h = ((validNumber(hueText, "hue") % 360) + 360) % 360 / 360;
      if (!values[1]!.endsWith("%") || !values[2]!.endsWith("%")) throw new SVGFormatError("INVALID_COLOR", "HSL saturation and lightness require percentages");
      const saturation = clamp(component(values[1]!, 1)), light = clamp(component(values[2]!, 1));
      const chroma = (1 - Math.abs(2 * light - 1)) * saturation, middle = chroma * (1 - Math.abs((h * 6) % 2 - 1)), offset = light - chroma / 2;
      const rgb = h < 1 / 6 ? [chroma, middle, 0] : h < 2 / 6 ? [middle, chroma, 0] : h < 3 / 6 ? [0, chroma, middle] : h < 4 / 6 ? [0, middle, chroma] : h < 5 / 6 ? [middle, 0, chroma] : [chroma, 0, middle];
      rgba = [rgb[0]! + offset, rgb[1]! + offset, rgb[2]! + offset, clamp(alpha)];
    }
  }
  return [toLinear(rgba[0]), toLinear(rgba[1]), toLinear(rgba[2]), rgba[3]];
}

/** Build a glTF scene through Aura3D's loader, retaining solid paints and authored node order. */
export async function createSVGGLTFAsset(asset: SVGAsset, options: SVGGeometryOptions = {}): Promise<GLTFAsset> {
  const chunks: Uint8Array[] = [], views: Array<{ buffer: number; byteOffset: number; byteLength: number }> = [];
  const accessors: Array<Record<string, unknown>> = [], materials: Array<Record<string, unknown>> = [], meshes: Array<Record<string, unknown>> = [], nodes: Array<Record<string, unknown>> = [];
  let byteLength = 0;
  const add = (values: Float32Array | Uint32Array): number => {
    const bytes = new Uint8Array(values.length * 4), view = new DataView(bytes.buffer);
    for (let i = 0; i < values.length; i += 1) {
      if (values instanceof Float32Array) view.setFloat32(i * 4, values[i]!, true); else view.setUint32(i * 4, values[i]!, true);
    }
    if (byteLength + bytes.length > 64 * 1024 * 1024) throw new SVGFormatError("OUTPUT_LIMIT", "converted SVG geometry exceeds 64 MiB");
    const index = views.length; views.push({ buffer: 0, byteOffset: byteLength, byteLength: bytes.length }); chunks.push(bytes); byteLength += bytes.length; return index;
  };
  const append = (shape: SVGShape, geometry: SVGMesh, paint: string, opacity: number, suffix: string): void => {
    if (!geometry.indices.length) return;
    const rgba = parseSVGColor(paint), alpha = rgba[3] * opacity;
    if (alpha <= 0) return;
    const positions = new Float32Array(geometry.positions), indices = new Uint32Array(geometry.indices);
    // SVG is y-down; glTF is y-up. Reversing triangle order preserves +Z-facing surfaces.
    for (let i = 1; i < positions.length; i += 3) positions[i] = -positions[i]!;
    for (let i = 0; i < indices.length; i += 3) [indices[i + 1], indices[i + 2]] = [indices[i + 2]!, indices[i + 1]!];
    const normals = new Float32Array(positions.length); for (let i = 2; i < normals.length; i += 3) normals[i] = 1;
    const minimum = [Infinity, Infinity, Infinity], maximum = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < positions.length; i += 3) for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis]!, positions[i + axis]!); maximum[axis] = Math.max(maximum[axis]!, positions[i + axis]!);
    }
    const positionAccessor = accessors.length; accessors.push({ bufferView: add(positions), componentType: 5126, count: positions.length / 3, type: "VEC3", min: minimum, max: maximum });
    const normalAccessor = accessors.length; accessors.push({ bufferView: add(normals), componentType: 5126, count: normals.length / 3, type: "VEC3" });
    const indexAccessor = accessors.length; accessors.push({ bufferView: add(indices), componentType: 5125, count: indices.length, type: "SCALAR" });
    // Keep all paints in the transparent queue so the adapter can enforce the SVG painter's order.
    const material = materials.length; materials.push({ name: `${shape.id ?? shape.sourceElement}-${suffix}-paint`, doubleSided: true, alphaMode: "BLEND",
      pbrMetallicRoughness: { baseColorFactor: [rgba[0], rgba[1], rgba[2], alpha], metallicFactor: 0, roughnessFactor: 1 }, extensions: { KHR_materials_unlit: {} } });
    const name = `${shape.id ?? shape.sourceElement}-${suffix}-${meshes.length}`;
    meshes.push({ name, primitives: [{ attributes: { POSITION: positionAccessor, NORMAL: normalAccessor }, indices: indexAccessor, material }] });
    nodes.push({ name, mesh: meshes.length - 1 });
  };
  for (const shape of asset.shapes) {
    append(shape, createSVGFillGeometry(shape, options), shape.style.fill, shape.style.opacity * shape.style.fillOpacity, "fill");
    append(shape, createSVGStrokeGeometry(shape, options), shape.style.stroke, shape.style.opacity * shape.style.strokeOpacity, "stroke");
  }
  if (!meshes.length) throw new SVGFormatError("EMPTY_SCENE", "SVG has no supported visible geometry");
  const bytes = new Uint8Array(byteLength); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let binary = ""; for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  const json = { asset: { version: "2.0", generator: "Aura3D SVG importer" }, extensionsUsed: ["KHR_materials_unlit"],
    buffers: [{ uri: `data:application/octet-stream;base64,${btoa(binary)}`, byteLength }], bufferViews: views, accessors, materials, meshes, nodes,
    scenes: [{ nodes: nodes.map((_, i) => i) }], scene: 0 };
  return await new GLTFLoader().load({ url: `data:model/gltf+json,${encodeURIComponent(JSON.stringify(json))}`, type: "gltf" }, new NativeLoadContext());
}

/** Explicitly installed registry adapter; output diagnostics remain attached to the source asset. */
export function createSVGFormatAdapter(options: SVGImportOptions & SVGGeometryOptions = {}): FormatAdapter<SVGAsset> {
  return { id: "svg", extensions: ["svg"], mediaTypes: ["image/svg+xml"], loader: new SVGLoader(options),
    async buildRenderableScene(asset, renderOptions) {
      const gltf = await createSVGGLTFAsset(asset, options);
      try {
        const scene = await createRenderableScene({ kind: "gltf", gltf, warnings: asset.diagnostics.map((d) => `${d.code}: ${d.message}`) }, renderOptions);
        try {
          if (!scene.source.scene) throw new SVGFormatError("MISSING_SCENE", "SVG render source has no scene");
          scene.source.scene.traverse((node) => {
            if (!node.renderable) return;
            const order = /-(\d+)$/.exec(node.name);
            if (!order) throw new SVGFormatError("MISSING_ORDER", `cannot resolve SVG draw order for ${node.name}`);
            // Nonzero render order forces sorted blending and avoids weighted transparency.
            node.renderOrder = Number(order[1]) + 1;
            node.renderable.castShadow = false; node.renderable.receiveShadow = false;
          });
          let live = true;
          return { ...scene, dispose() { if (!live) return; live = false; try { scene.dispose(); } finally { new GLTFLoader().dispose(gltf); } } };
        } catch (error) { scene.dispose(); throw error; }
      } catch (error) { new GLTFLoader().dispose(gltf); throw error; }
    } };
}
