/** Flat vector styles; lighting, textures and shader effects are not reproduced. */
export interface VectorStyle {
  readonly fill?: string;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly opacity?: number;
  readonly pointSize?: number;
  readonly lineCap?: "butt" | "round" | "square";
  readonly lineJoin?: "miter" | "round" | "bevel";
}

interface VectorPositionBuffer {
  readonly vertexCount: number;
  getAttribute(index: number, semantic: "position"): readonly number[];
  getDecodedAttribute?(index: number, semantic: "position"): readonly number[];
}

/** Structurally compatible with Aura3D Geometry's readable CPU buffers. */
export interface VectorGeometry {
  readonly vertexBuffer: VectorPositionBuffer;
  getAttributeBuffer?(semantic: "position"): VectorPositionBuffer;
  readonly indexBuffer?: { readonly data: ArrayLike<number> } | null;
  readonly topology: "triangles" | "lines" | "points";
  readonly drawRange?: { readonly start: number; readonly count: number };
}

export interface VectorRenderItem {
  readonly geometry: VectorGeometry;
  /** Passed through to `resolveStyle`; GPU material behavior is not inferred. */
  readonly material?: unknown;
  readonly label?: string;
  readonly modelMatrix?: ArrayLike<number>;
  readonly geometryMatrix?: ArrayLike<number>;
  /** If supplied, this replaces viewProjectionMatrix × modelMatrix. */
  readonly modelViewProjectionMatrix?: ArrayLike<number>;
  /** Intersected with the geometry's draw range; offsets address indices when present. */
  readonly drawRange?: { readonly start: number; readonly count: number };
  readonly renderOrder?: number;
  /** Per-item fields override the defaults returned by `resolveStyle`. */
  readonly style?: VectorStyle;
  readonly skinning?: unknown;
  readonly morphTargets?: unknown;
  readonly morphWeights?: unknown;
  readonly instanceTransforms?: unknown;
}

export interface VectorViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface VectorView {
  /** Column-major world-to-clip matrix. */
  readonly viewProjectionMatrix: ArrayLike<number>;
  /** Top-left-origin viewport in output pixels; defaults to the whole output. */
  readonly viewport?: VectorViewport;
  readonly depthRange?: "minus-one-to-one" | "zero-to-one";
  /** Set for projections that map the near plane to larger NDC depth. */
  readonly depthOrder?: "standard" | "reversed";
}

export interface VectorRendererOptions {
  readonly width: number;
  readonly height: number;
  readonly background?: string;
  /** Upper bound on submitted primitives, before clipping; default 100,000. */
  readonly maxPrimitives?: number;
  /** Convert an item's material to the supported flat vector styles if desired. */
  readonly resolveStyle?: (item: VectorRenderItem) => VectorStyle;
}

type ClipPoint = readonly [number, number, number, number];
interface VectorPrimitive { readonly order: number; readonly depth: number; readonly sequence: number; readonly markup: string }
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const CLIP_EPSILON = 1e-10;

/**
 * Produce a standalone SVG from CPU-readable, static Aura3D render geometry.
 * Triangles, lines and points are clipped in homogeneous space before the
 * perspective divide. `renderOrder` then far-to-near painter ordering is used;
 * intersecting polygons cannot be depth-tested per pixel. Vector styles are
 * flat and explicit; textures, lighting, shadows and post effects are not
 * exported. Skinned, morphed and instanced draws throw instead of silently
 * exporting an undeformed or partial scene. The renderer owns no geometry.
 */
export class VectorRenderer {
  private width: number;
  private height: number;
  private readonly background?: string;
  private readonly maxPrimitives: number;
  private readonly resolveStyle?: (item: VectorRenderItem) => VectorStyle;
  private disposed = false;

  constructor(options: VectorRendererOptions) {
    this.width = positive(options.width, "width");
    this.height = positive(options.height, "height");
    this.background = options.background;
    const maxPrimitives = options.maxPrimitives ?? 100_000;
    if (!Number.isSafeInteger(maxPrimitives) || maxPrimitives <= 0) throw new RangeError("maxPrimitives must be a positive safe integer.");
    this.maxPrimitives = maxPrimitives;
    this.resolveStyle = options.resolveStyle;
  }

  setSize(width: number, height: number): void {
    this.assertAlive();
    const nextWidth = positive(width, "width");
    const nextHeight = positive(height, "height");
    this.width = nextWidth;
    this.height = nextHeight;
  }

  render(items: readonly VectorRenderItem[], view: VectorView): string {
    this.assertAlive();
    const viewMatrix = matrix(view.viewProjectionMatrix, "viewProjectionMatrix");
    const viewport = view.viewport ?? { x: 0, y: 0, width: this.width, height: this.height };
    validateViewport(viewport, this.width, this.height);
    const depthRange = view.depthRange ?? "minus-one-to-one";
    if (depthRange !== "minus-one-to-one" && depthRange !== "zero-to-one") throw new RangeError("Unknown vector depth range.");
    const depthOrder = view.depthOrder ?? "standard";
    if (depthOrder !== "standard" && depthOrder !== "reversed") throw new RangeError("Unknown vector depth order.");
    const planes = clipPlanes(depthRange);
    const primitives: VectorPrimitive[] = [];
    let submitted = 0;
    let sequence = 0;

    for (const item of items) {
      if (item.skinning !== undefined || item.morphTargets !== undefined || item.morphWeights !== undefined || item.instanceTransforms !== undefined) {
        throw new Error("VectorRenderer requires static, non-instanced geometry; bake skinning, morphs and instances first.");
      }
      const order = item.renderOrder ?? 0;
      if (!Number.isFinite(order)) throw new RangeError("Vector renderOrder must be finite.");
      const topology = item.geometry.topology;
      const step = topology === "triangles" ? 3 : topology === "lines" ? 2 : topology === "points" ? 1 : 0;
      if (!step) throw new Error(`Unsupported vector topology: ${String(topology)}`);
      const buffer = item.geometry.vertexBuffer;
      if (!Number.isSafeInteger(buffer.vertexCount) || buffer.vertexCount < 0) throw new RangeError("Geometry vertexCount must be a non-negative safe integer.");
      const positions = item.geometry.getAttributeBuffer?.("position") ?? buffer;
      const indices = item.geometry.indexBuffer?.data;
      const count = indices?.length ?? buffer.vertexCount;
      // Both windows constrain the GPU draw. Replacing the geometry range
      // with an item override exports vertices the actual draw never submits.
      const geometryRange = drawWindow(item.geometry.drawRange, count);
      const itemRange = drawWindow(item.drawRange, count);
      const start = Math.max(geometryRange.start, itemRange.start);
      const end = Math.min(geometryRange.end, itemRange.end);
      const primitiveCount = Math.floor(Math.max(0, end - start) / step);
      submitted += primitiveCount;
      if (submitted > this.maxPrimitives) throw new RangeError(`VectorRenderer exceeds its ${this.maxPrimitives} primitive budget.`);
      const model = item.modelViewProjectionMatrix
        ? matrix(item.modelViewProjectionMatrix, "modelViewProjectionMatrix")
        : multiply(viewMatrix, matrix(item.modelMatrix ?? IDENTITY, "modelMatrix"));
      const transform = multiply(model, matrix(item.geometryMatrix ?? IDENTITY, "geometryMatrix"));
      if (!transform.every(Number.isFinite)) throw new RangeError("Vector transformation overflowed.");
      const style = validateStyle({ ...this.resolveStyle?.(item), ...item.style });
      const attributes = styleAttributes(style, topology);

      const pointAt = (streamIndex: number): ClipPoint => {
        const vertexIndex = indices ? indices[streamIndex] : streamIndex;
        if (!Number.isInteger(vertexIndex) || vertexIndex < 0 || vertexIndex >= buffer.vertexCount) throw new RangeError(`Vector vertex index ${vertexIndex} is out of range.`);
        const position = positions.getDecodedAttribute
          ? positions.getDecodedAttribute(vertexIndex, "position")
          : positions.getAttribute(vertexIndex, "position");
        if (position.length < 3 || ![position[0], position[1], position[2]].every(Number.isFinite)) throw new RangeError("Vector positions must contain three finite numbers.");
        return transformPoint(transform, position);
      };

      for (let index = start; index + step <= end; index += step) {
        const points: ClipPoint[] = [];
        for (let offset = 0; offset < step; offset++) points.push(pointAt(index + offset));
        const clipped = topology === "triangles" ? clipPolygon(points, planes)
          : topology === "lines" ? clipLine(points[0], points[1], planes)
          : planes.every((plane) => clipDistance(plane, points[0]) >= 0) ? points : [];
        if (clipped.length < step) continue;
        const projected = clipped.map((point) => project(point, viewport));
        const depth = clipped.reduce((sum, point) => sum + point[2] / point[3], 0) / clipped.length;
        const markup = topology === "points"
          ? `<circle cx="${number(projected[0][0])}" cy="${number(projected[0][1])}" r="${number((style.pointSize ?? 4) / 2)}" ${attributes}/>`
          : `<${topology === "triangles" ? "polygon" : "polyline"} points="${projected.map(([x, y]) => `${number(x)},${number(y)}`).join(" ")}" ${attributes}/>`;
        primitives.push({ order, depth, sequence: sequence++, markup });
      }
    }
    primitives.sort((a, b) => a.order - b.order || (depthOrder === "reversed" ? a.depth - b.depth : b.depth - a.depth) || a.sequence - b.sequence);
    const bg = this.background === undefined ? "" : `<rect width="100%" height="100%" fill="${escapeAttribute(this.background)}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${number(this.width)}" height="${number(this.height)}" viewBox="0 0 ${number(this.width)} ${number(this.height)}">${bg}<svg x="${number(viewport.x)}" y="${number(viewport.y)}" width="${number(viewport.width)}" height="${number(viewport.height)}" viewBox="${number(viewport.x)} ${number(viewport.y)} ${number(viewport.width)} ${number(viewport.height)}" overflow="hidden">${primitives.map((primitive) => primitive.markup).join("")}</svg></svg>`;
  }

  dispose(): void { this.disposed = true; }
  private assertAlive(): void { if (this.disposed) throw new Error("VectorRenderer is disposed."); }
}

function positive(value: number, name: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name} must be positive and finite.`);
  return value;
}

function validateViewport(view: VectorViewport, width: number, height: number): void {
  if (![view.x, view.y, view.width, view.height].every(Number.isFinite) || view.x < 0 || view.y < 0 || view.width <= 0 || view.height <= 0 || view.x + view.width > width || view.y + view.height > height) throw new RangeError("Vector viewport must fit within the renderer size.");
}

function drawWindow(range: VectorGeometry["drawRange"], available: number): { start: number; end: number } {
  if (!Number.isSafeInteger(available) || available < 0) throw new RangeError("Geometry index count must be a non-negative safe integer.");
  if (!range) return { start: 0, end: available };
  if (!Number.isSafeInteger(range.start) || range.start < 0 || !Number.isSafeInteger(range.count) || range.count < 0) throw new RangeError("Vector draw range must contain non-negative safe integers.");
  // Avoid adding two safe integers whose sum is no longer exactly representable.
  const start = Math.min(available, range.start);
  return { start, end: start + Math.min(range.count, available - start) };
}

function matrix(value: ArrayLike<number>, name: string): number[] {
  if (value.length !== 16) throw new RangeError(`${name} must contain 16 column-major values.`);
  const result = Array.from(value);
  if (!result.every(Number.isFinite)) throw new RangeError(`${name} must contain finite values.`);
  return result;
}

function multiply(a: readonly number[], b: readonly number[]): number[] {
  const result = new Array<number>(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) result[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return result;
}

function transformPoint(m: readonly number[], p: readonly number[]): ClipPoint {
  const [x, y, z] = p;
  const result: ClipPoint = [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14], m[3] * x + m[7] * y + m[11] * z + m[15]];
  if (!result.every(Number.isFinite)) throw new RangeError("Transformed vector position is not finite.");
  return result;
}

type ClipPlane = (point: ClipPoint) => number;
function clipPlanes(depthRange: NonNullable<VectorView["depthRange"]>): readonly ClipPlane[] {
  return [(p) => p[3] - CLIP_EPSILON, (p) => p[3] + p[0], (p) => p[3] - p[0], (p) => p[3] + p[1], (p) => p[3] - p[1], (p) => depthRange === "zero-to-one" ? p[2] : p[3] + p[2], (p) => p[3] - p[2]];
}

function interpolate(a: ClipPoint, b: ClipPoint, t: number): ClipPoint {
  const s = 1 - t;
  return [a[0] * s + b[0] * t, a[1] * s + b[1] * t, a[2] * s + b[2] * t, a[3] * s + b[3] * t];
}

function clipDistance(plane: ClipPlane, point: ClipPoint): number {
  const distance = plane(point);
  if (!Number.isFinite(distance)) throw new RangeError("Vector clipping overflowed.");
  return distance;
}

// Endpoints straddle the plane. Scaling first avoids overflowing the sum of
// large finite signed distances while computing their intersection fraction.
function intersectionFraction(first: number, second: number): number {
  const a = Math.abs(first), b = Math.abs(second);
  const scale = Math.max(a, b);
  return (a / scale) / (a / scale + b / scale);
}

function clipPolygon(input: readonly ClipPoint[], planes: readonly ClipPlane[]): ClipPoint[] {
  let result = [...input];
  for (const plane of planes) {
    if (result.length === 0) break;
    const next: ClipPoint[] = [];
    let previous = result[result.length - 1];
    let previousDistance = clipDistance(plane, previous);
    for (const current of result) {
      const distance = clipDistance(plane, current);
      if ((distance >= 0) !== (previousDistance >= 0)) next.push(interpolate(previous, current, intersectionFraction(previousDistance, distance)));
      if (distance >= 0) next.push(current);
      previous = current;
      previousDistance = distance;
    }
    result = next;
  }
  return result;
}

function clipLine(first: ClipPoint, second: ClipPoint, planes: readonly ClipPlane[]): ClipPoint[] {
  let a = first, b = second;
  for (const plane of planes) {
    const da = clipDistance(plane, a), db = clipDistance(plane, b);
    if (da < 0 && db < 0) return [];
    if (da < 0) a = interpolate(a, b, intersectionFraction(da, db));
    else if (db < 0) b = interpolate(a, b, intersectionFraction(da, db));
  }
  return [a, b];
}

function project(point: ClipPoint, view: VectorViewport): readonly [number, number] {
  return [view.x + (point[0] / point[3] * 0.5 + 0.5) * view.width, view.y + (0.5 - point[1] / point[3] * 0.5) * view.height];
}

function validateStyle(style: VectorStyle): VectorStyle {
  if (style.opacity !== undefined && (!Number.isFinite(style.opacity) || style.opacity < 0 || style.opacity > 1)) throw new RangeError("Vector opacity must be in [0, 1].");
  if (style.strokeWidth !== undefined && (!Number.isFinite(style.strokeWidth) || style.strokeWidth < 0)) throw new RangeError("Vector strokeWidth must be finite and non-negative.");
  if (style.pointSize !== undefined) positive(style.pointSize, "pointSize");
  if (style.lineCap !== undefined && !["butt", "round", "square"].includes(style.lineCap)) throw new RangeError("Unknown vector line cap.");
  if (style.lineJoin !== undefined && !["miter", "round", "bevel"].includes(style.lineJoin)) throw new RangeError("Unknown vector line join.");
  return style;
}

function styleAttributes(style: VectorStyle, topology: VectorGeometry["topology"]): string {
  const fill = style.fill ?? (topology === "lines" ? "none" : "#fff");
  const stroke = style.stroke ?? (topology === "lines" ? "#fff" : "none");
  return `fill="${escapeAttribute(fill)}" stroke="${escapeAttribute(stroke)}" stroke-width="${number(style.strokeWidth ?? 1)}" opacity="${number(style.opacity ?? 1)}" stroke-linecap="${style.lineCap ?? "butt"}" stroke-linejoin="${style.lineJoin ?? "miter"}"`;
}

function escapeAttribute(value: string): string {
  // XML cannot represent NUL, most controls or unpaired UTF-16 surrogates,
  // even as character references. Reject them instead of returning a broken SVG.
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (!(code === 0x09 || code === 0x0a || code === 0x0d || (code >= 0x20 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff))) {
      throw new RangeError("Vector SVG attributes must contain valid XML characters.");
    }
  }
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Fixed decimal places round sufficiently small valid dimensions to zero.
function number(value: number): string { return String(Number(value.toPrecision(12))); }
