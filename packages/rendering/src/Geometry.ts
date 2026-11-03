import { IndexBuffer } from "./IndexBuffer";
import { type PrimitiveTopology, type RenderBuffer, type RenderDevice } from "./RenderDevice";
import { VertexBuffer } from "./VertexBuffer";
import { VertexFormat, type VertexAttributeSemantic } from "./VertexFormat";

export interface Bounds3 {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}

/** SG-05 (threejs-parity L2): three's `GeometryGroup` — a contiguous index range with a material slot. */
export interface GeometryGroup {
  readonly start: number;
  readonly count: number;
  readonly materialIndex?: number;
}

/** SG-05 (L2): three's `setDrawRange` — the subset of the index/vertex stream a draw submits. */
export interface GeometryDrawRange {
  readonly start: number;
  readonly count: number;
}

/** Authored packed vec3 deltas carried on a geometry for the morph path. */
export interface GeometryMorphTarget {
  readonly name?: string;
  readonly positions: Float32Array | readonly number[];
  readonly normals?: Float32Array | readonly number[];
  readonly tangents?: Float32Array | readonly number[];
}

export interface CylinderGeometryOptions {
  /** Legacy shorthand: sets both radii. `radiusTop`/`radiusBottom` win when set. */
  readonly radius?: number;
  readonly radiusTop?: number;
  readonly radiusBottom?: number;
  readonly height?: number;
  readonly segments?: number;
  readonly heightSegments?: number;
  readonly capped?: boolean;
  /** C-07 (PRD-01): `openEnded` is the inverse of `capped`; wins when both are set. */
  readonly openEnded?: boolean;
  readonly textured?: boolean;
}

export interface CapsuleGeometryOptions {
  readonly radius?: number;
  readonly height?: number;
  readonly segments?: number;
  readonly rings?: number;
  /** C-07 (PRD-01 §6.3): x/z radius ratio; 1 = circular cross-section. */
  readonly ellipticity?: number;
  readonly textured?: boolean;
}

/** Torus in the XY plane (axis +Z), engine proportions radius 0.43 / tube 0.045. */
export interface TorusGeometryOptions {
  readonly radius?: number;
  readonly tube?: number;
  /** Divisions around the main ring (legacy `radialSegments`, default 64). */
  readonly radialSegments?: number;
  /** Divisions around the tube cross-section (legacy `tubeSegments`, default 16). */
  readonly tubularSegments?: number;
  readonly textured?: boolean;
}

export interface PlaneGeometryOptions {
  readonly widthSegments?: number;
  readonly heightSegments?: number;
  /** C-07: emit P3N3T4T2 (uv + tangent) instead of P3N3. Default false = legacy. */
  readonly textured?: boolean;
}

export interface BoxGeometryOptions {
  readonly widthSegments?: number;
  readonly heightSegments?: number;
  readonly depthSegments?: number;
  /** Default true for the C-07 path (emits P3N3T4T2). */
  readonly textured?: boolean;
}

export interface WideLineSegment {
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  readonly width: number;
}

/** A polyline for screen-space fat-line rendering. */
export interface ScreenSpaceLineSegment {
  readonly start: readonly [number, number, number];
  readonly end: readonly [number, number, number];
  /** Linear RGBA at each endpoint. Missing colors default to opaque white. */
  readonly startColor?: readonly [number, number, number, number];
  readonly endColor?: readonly [number, number, number, number];
  /** Optional explicit arc-length coordinates, e.g. after a world transform. */
  readonly startDistance?: number;
  readonly endDistance?: number;
}

export interface UVSphereGeometryOptions {
  readonly textured?: boolean;
}

type LinePosition = readonly [number, number, number];
type LineColor = readonly [number, number, number, number];

const LINE_VERTEX_FORMAT = new VertexFormat([
  { semantic: "position", components: 3, offset: 0 },
  { semantic: "color", components: 4, offset: 12 }
]);

type GeometryBuffer = VertexBuffer | IndexBuffer;

// A geometry owns one retain for each buffer it uses. Direct buffer disposal
// remains an explicit invalidation of every user; geometry disposal releases
// only that geometry's retain and disposes on the final release.
const geometryBufferOwners = new WeakMap<GeometryBuffer, number>();
const retiringGeometryBuffers = new WeakSet<GeometryBuffer>();

function retainGeometryBuffer(buffer: GeometryBuffer): void {
  if (retiringGeometryBuffers.has(buffer)) throw new Error("Geometry buffer disposal is in progress");
  const owners = geometryBufferOwners.get(buffer) ?? 0;
  if (owners >= Number.MAX_SAFE_INTEGER) throw new RangeError("Geometry buffer owner count exceeded");
  geometryBufferOwners.set(buffer, owners + 1);
}

function dropGeometryBufferRetain(buffer: GeometryBuffer): void {
  const owners = geometryBufferOwners.get(buffer);
  if (owners === undefined || owners < 1) throw new Error("Geometry buffer ownership is unavailable");
  if (owners === 1) geometryBufferOwners.delete(buffer);
  else geometryBufferOwners.set(buffer, owners - 1);
}

function releaseGeometryBuffer(buffer: GeometryBuffer, disposeWhenUnowned: boolean): void {
  const owners = geometryBufferOwners.get(buffer);
  if (owners === undefined || owners < 1) throw new Error("Geometry buffer ownership is unavailable");
  if (owners !== 1 || !disposeWhenUnowned) {
    dropGeometryBufferRetain(buffer);
    return;
  }
  if (retiringGeometryBuffers.has(buffer)) throw new Error("Geometry buffer disposal is in progress");
  retiringGeometryBuffers.add(buffer);
  try {
    buffer.dispose();
    if (!buffer.disposed) throw new Error("Geometry buffer disposal is in progress");
  } catch (error) {
    // If a child completed before throwing, its retain must not be retried.
    if (buffer.disposed) dropGeometryBufferRetain(buffer);
    throw error;
  } finally {
    retiringGeometryBuffers.delete(buffer);
  }
  dropGeometryBufferRetain(buffer);
}

/** Dispose a buffer relinquished by an assignment only when no peer owns it. */
function disposeUnownedGeometryBuffer(buffer: GeometryBuffer): void {
  if (geometryBufferOwners.has(buffer)) return;
  if (retiringGeometryBuffers.has(buffer)) throw new Error("Geometry buffer disposal is in progress");
  retiringGeometryBuffers.add(buffer);
  try {
    buffer.dispose();
    if (!buffer.disposed) throw new Error("Geometry buffer disposal is in progress");
  } finally {
    retiringGeometryBuffers.delete(buffer);
  }
}

export class Geometry {
  public bounds: Bounds3;
  private primaryVertexBuffer: VertexBuffer | null;
  private currentIndexBuffer: IndexBuffer | null;
  private extraVertexBuffers: readonly VertexBuffer[];

  constructor(
    vertexBuffer: VertexBuffer,
    indexBuffer: IndexBuffer | null = null,
    public readonly topology: PrimitiveTopology = "triangles",
    bounds?: Bounds3,
    additionalVertexBuffers: readonly VertexBuffer[] = []
  ) {
    this.primaryVertexBuffer = vertexBuffer;
    this.currentIndexBuffer = indexBuffer;
    this.extraVertexBuffers = Object.freeze([...additionalVertexBuffers]);
    this.validateVertexStreams();
    // Validate every supplied resource before retaining any of them. In
    // particular, explicit bounds must not hide an already-disposed stream.
    for (const buffer of new Set([vertexBuffer, ...this.extraVertexBuffers])) buffer.readBytes(0, 0);
    indexBuffer?.assertReadable();
    this.bounds = bounds ?? computeBounds(this.getAttributeBuffer("position"), vertexBuffer.vertexCount);
    // An overridden reader can synchronously dispose a different stream while
    // validating. Recheck the underlying built-in resources before retaining.
    for (const buffer of new Set([vertexBuffer, ...this.extraVertexBuffers])) VertexBuffer.prototype.readBytes.call(buffer, 0, 0);
    if (indexBuffer) IndexBuffer.prototype.assertReadable.call(indexBuffer);
    const retained: GeometryBuffer[] = [];
    try {
      for (const buffer of new Set([vertexBuffer, ...this.extraVertexBuffers])) {
        retainGeometryBuffer(buffer);
        retained.push(buffer);
      }
      if (indexBuffer) {
        retainGeometryBuffer(indexBuffer);
        retained.push(indexBuffer);
      }
    } catch (error) {
      for (const buffer of retained) releaseGeometryBuffer(buffer, false);
      throw error;
    }
  }

  private closed = false;
  private disposing = false;
  private disposalComplete = false;
  private pendingOwnedDisposals: Set<GeometryBuffer> | null = null;
  private readonly pendingUnownedDisposals = new Set<GeometryBuffer>();
  private readonly unownedDisposalsInFlight = new Set<GeometryBuffer>();
  /** Defined only for geometry created by `screenSpaceLineSegments`. */
  private screenSpaceLineCount?: number;
  /** Defined only for geometry created by `lineSegments`. */
  private lineVertexCount?: number;

  /** True only when all of this geometry's owned cleanup has completed. */
  get disposed(): boolean {
    return this.disposalComplete;
  }

  /** The current primary stream. Assignment transfers this geometry's retain. */
  get vertexBuffer(): VertexBuffer {
    this.assertAlive();
    return this.primaryVertexBuffer!;
  }

  set vertexBuffer(buffer: VertexBuffer) {
    this.assertAlive();
    if (buffer === this.primaryVertexBuffer) return;
    if (this.extraVertexBuffers.includes(buffer)) throw new Error("Geometry primary buffer cannot also be an additional stream");
    const previous = this.primaryVertexBuffer!;
    buffer.readBytes(0, 0);
    this.assertAlive();
    if (this.primaryVertexBuffer !== previous) throw new Error("Geometry primary buffer changed during replacement");
    VertexBuffer.prototype.readBytes.call(buffer, 0, 0);
    retainGeometryBuffer(buffer);
    this.primaryVertexBuffer = buffer;
    // Plain assignment historically left the previous buffer with its caller;
    // preserve that behavior, including assign-and-restore workflows.
    releaseGeometryBuffer(previous, false);
  }

  /** The current index stream. Plain assignment leaves the old buffer live. */
  get indexBuffer(): IndexBuffer | null {
    this.assertAlive();
    return this.currentIndexBuffer;
  }

  set indexBuffer(buffer: IndexBuffer | null) {
    this.assertAlive();
    if (buffer === this.currentIndexBuffer) return;
    const previous = this.currentIndexBuffer;
    buffer?.assertReadable();
    this.assertAlive();
    if (this.currentIndexBuffer !== previous) throw new Error("Geometry index buffer changed during replacement");
    if (buffer) IndexBuffer.prototype.assertReadable.call(buffer);
    if (buffer) retainGeometryBuffer(buffer);
    this.currentIndexBuffer = buffer;
    if (previous) releaseGeometryBuffer(previous, false);
  }

  /** Additional format streams retained until this geometry is disposed. */
  get additionalVertexBuffers(): readonly VertexBuffer[] {
    this.assertAlive();
    return this.extraVertexBuffers;
  }

  /**
   * Replace the index stream and retire the old one once no geometry owns it.
   * Build and validate a replacement before calling this method.
   */
  replaceIndexBuffer(buffer: IndexBuffer | null): void {
    this.assertAlive();
    const previous = this.currentIndexBuffer;
    this.indexBuffer = buffer;
    if (previous && previous !== buffer) this.retireUnownedBuffer(previous);
  }

  /**
   * Make the requested primary and index buffers private to this geometry.
   * Unique buffers are returned unchanged. Shared buffers are copied before
   * either replacement is published, so a failed allocation or validation
   * cannot partially apply the caller's subsequent edits. Direct writes to a
   * buffer without this opt-in remain visible to all geometries sharing it.
   */
  ensureWritableBuffers(options: { readonly vertex?: boolean; readonly index?: boolean } = { vertex: true, index: true }): {
    readonly vertexBuffer: VertexBuffer;
    readonly indexBuffer: IndexBuffer | null;
  } {
    this.assertAlive();
    if (!options || typeof options !== "object") {
      throw new TypeError("Geometry writable buffer options must be booleans");
    }
    const vertexRequested = options.vertex;
    const indexRequested = options.index;
    if ((vertexRequested !== undefined && typeof vertexRequested !== "boolean") ||
        (indexRequested !== undefined && typeof indexRequested !== "boolean")) {
      throw new TypeError("Geometry writable buffer options must be booleans");
    }
    this.assertAlive();
    const previousVertex = this.primaryVertexBuffer!;
    const previousIndex = this.currentIndexBuffer;
    let vertexCopy: VertexBuffer | undefined;
    let indexCopy: IndexBuffer | undefined;
    let vertexInstalled = false;
    let indexInstalled = false;
    try {
      if (vertexRequested) {
        const shared = (geometryBufferOwners.get(previousVertex) ?? 0) > 1;
        const bytes = VertexBuffer.prototype.readBytes.call(previousVertex, 0, shared ? previousVertex.byteLength : 0);
        if (shared) {
          vertexCopy = new VertexBuffer(previousVertex.format, previousVertex.vertexCount, previousVertex.bufferSlot);
          VertexBuffer.prototype.writeBytes.call(vertexCopy, 0, bytes);
        }
      }
      if (indexRequested && previousIndex) {
        IndexBuffer.prototype.assertReadable.call(previousIndex);
        if ((geometryBufferOwners.get(previousIndex) ?? 0) > 1) {
          indexCopy = IndexBuffer.prototype.clone.call(previousIndex);
        }
      }
      this.assertAlive();
      if (this.primaryVertexBuffer !== previousVertex || this.currentIndexBuffer !== previousIndex ||
          (vertexRequested && !vertexCopy && (geometryBufferOwners.get(previousVertex) ?? 0) > 1) ||
          (indexRequested && previousIndex && !indexCopy && (geometryBufferOwners.get(previousIndex) ?? 0) > 1)) {
        throw new Error("Geometry buffer ownership changed during writable preparation");
      }
      if (vertexCopy) {
        this.vertexBuffer = vertexCopy;
        vertexInstalled = true;
      }
      if (indexCopy) {
        this.indexBuffer = indexCopy;
        indexInstalled = true;
      }
    } catch (error) {
      const failures: unknown[] = [error];
      if (!this.closed) {
        if (indexInstalled && this.currentIndexBuffer === indexCopy) {
          try { this.indexBuffer = previousIndex; } catch (rollback) { failures.push(rollback); }
        }
        if (vertexInstalled && this.primaryVertexBuffer === vertexCopy) {
          try { this.vertexBuffer = previousVertex; } catch (rollback) { failures.push(rollback); }
        }
      }
      if (indexCopy) {
        try { this.retireUnownedBuffer(indexCopy); } catch (cleanup) { failures.push(cleanup); }
      }
      if (vertexCopy) {
        try { this.retireUnownedBuffer(vertexCopy); } catch (cleanup) { failures.push(cleanup); }
      }
      if (failures.length > 1) throw new AggregateError(failures, "Geometry writable buffer preparation failed");
      throw error;
    }
    return { vertexBuffer: this.primaryVertexBuffer!, indexBuffer: this.currentIndexBuffer };
  }

  /** Resolve a declared stream by slot; slot 0 always follows the current primary buffer. */
  getVertexBuffer(slot: number): VertexBuffer {
    this.assertAlive();
    const buffer = slot === 0 ? this.vertexBuffer : this.additionalVertexBuffers.find((candidate) => candidate.bufferSlot === slot);
    if (!buffer) throw new Error(`Geometry has no vertex buffer for slot ${slot}`);
    if (buffer.bufferSlot !== slot || !sameVertexFormat(buffer.format, this.vertexBuffer.format)) {
      throw new Error(`Geometry vertex stream ${slot} does not match the primary buffer's format`);
    }
    return buffer;
  }

  /** Locate the stream containing an attribute without assuming an interleaved layout. */
  getAttributeBuffer(semantic: VertexAttributeSemantic): VertexBuffer {
    this.assertAlive();
    return this.getVertexBuffer(this.vertexBuffer.format.getAttribute(semantic).bufferSlot);
  }

  /** Upload each owned stream into its actual slot, validating record counts first. */
  uploadVertexBuffers(device: RenderDevice, instanceCount = 1): readonly (RenderBuffer | undefined)[] {
    this.assertAlive();
    this.validateVertexStreams(instanceCount);
    const buffers: (RenderBuffer | undefined)[] = [];
    for (const stream of this.vertexBuffer.format.streams) {
      buffers[stream.slot] = this.getVertexBuffer(stream.slot).upload(device);
    }
    return buffers;
  }

  /** Recompute the local bounds after modifying position attributes. */
  refreshBounds(): Bounds3 {
    this.assertAlive();
    const vertexCount = this.screenSpaceLineCount !== undefined ? this.screenSpaceLineCount * 4
      : this.lineVertexCount ?? this.vertexBuffer.vertexCount;
    this.bounds = computeBounds(this.getAttributeBuffer("position"), vertexCount);
    return this.bounds;
  }

  /**
   * SG-05 (threejs-parity L2): three's `geometry.groups` — material-index
   * segments over the index stream. Mutable so `handle.setGeometry` can
   * refresh them on an in-place update.
   */
  public groups?: readonly GeometryGroup[];

  /**
   * SG-05 (L2): three's `geometry.drawRange` — when set, the forward/depth
   * draws submit only this index (or vertex) range instead of the full
   * buffer. Mutable so `handle.setGeometry` can re-clamp without realloc.
   */
  public drawRange?: GeometryDrawRange;

  /**
   * Authored position and optional normal/tangent deltas. Data survives
   * geometry metadata round-trips; the renderer consumes supported channels
   * through the morph-target pipeline.
   */
  public morphTargets?: readonly GeometryMorphTarget[];

  static triangle(): Geometry {
    const vertices = new VertexBuffer(VertexFormat.P3, 3);
    vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
    vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
    vertices.setAttribute(2, "position", [0, 0.5, 0]);
    return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
  }

  static lineSegments(positions: readonly LinePosition[], colors?: readonly LineColor[]): Geometry {
    validateLineVertices(positions, colors, false);
    const vertices = new VertexBuffer(LINE_VERTEX_FORMAT, positions.length);
    writeLineVertices(vertices, positions, colors);
    const geometry = new Geometry(vertices, null, "lines");
    geometry.lineVertexCount = positions.length;
    geometry.drawRange = { start: 0, count: positions.length };
    return geometry;
  }

  /** Update retained native line segments, keeping their uploaded buffer within capacity. */
  updateLineSegments(positions: readonly LinePosition[], colors?: readonly LineColor[]): void {
    this.assertAlive();
    if (this.lineVertexCount === undefined) {
      throw new Error("updateLineSegments requires native line-segment geometry");
    }
    validateLineVertices(positions, colors, true);
    if (positions.length > this.vertexBuffer.vertexCount) {
      const vertices = new VertexBuffer(LINE_VERTEX_FORMAT, Math.max(positions.length, this.vertexBuffer.vertexCount * 2));
      try {
        writeLineVertices(vertices, positions, colors);
      } catch (error) {
        vertices.dispose();
        throw error;
      }
      const oldVertices = this.vertexBuffer;
      this.vertexBuffer = vertices;
      this.retireUnownedBuffer(oldVertices);
    } else {
      writeLineVertices(this.vertexBuffer, positions, colors);
    }
    this.lineVertexCount = positions.length;
    this.drawRange = { start: 0, count: positions.length };
    this.refreshBounds();
  }

  /**
   * Geometry for true screen-space fat lines.
   *
   * Unlike `wideLineSegments`, which bakes a world-space half-width offset into vertex
   * positions, this carries both endpoints and a corner selector per vertex so the
   * *vertex shader* can project the endpoints and expand the quad in pixel space. That
   * is what makes the rendered width independent of distance, field of view, viewport
   * size, and device pixel ratio — the property world-space quads cannot provide,
   * because a world-space offset shrinks with perspective.
   *
   * `lineDistance` accumulates arc length along the polyline so the fragment stage can
   * apply dash patterns in world units.
   */
  static screenSpaceLineSegments(segments: readonly ScreenSpaceLineSegment[]): Geometry {
    if (segments.length === 0) {
      throw new Error("Screen-space line geometry requires at least one segment");
    }
    const distances = resolveScreenSpaceLineDistances(segments);
    const vertices = new VertexBuffer(VertexFormat.SCREEN_SPACE_LINE, segments.length * 4);
    writeScreenSpaceLineVertices(vertices, segments, distances);
    const geometry = new Geometry(vertices, createScreenSpaceLineIndices(segments.length), "triangles");
    geometry.screenSpaceLineCount = segments.length;
    geometry.drawRange = { start: 0, count: segments.length * 6 };
    return geometry;
  }

  /**
   * Replace a retained screen-space line's segments. Updates within capacity
   * reuse both GPU buffers; growth creates new buffers and disposes the old
   * ones. Empty input hides the line while keeping its capacity for reuse.
   */
  updateScreenSpaceLineSegments(segments: readonly ScreenSpaceLineSegment[]): void {
    this.assertAlive();
    if (this.screenSpaceLineCount === undefined || this.indexBuffer === null) {
      throw new Error("updateScreenSpaceLineSegments requires screen-space line geometry");
    }
    // Validate the complete update before mutating existing buffers.
    const distances = resolveScreenSpaceLineDistances(segments);
    const capacity = this.vertexBuffer.vertexCount / 4;
    if (segments.length > capacity) {
      const nextCapacity = Math.max(segments.length, capacity * 2);
      const vertices = new VertexBuffer(VertexFormat.SCREEN_SPACE_LINE, nextCapacity * 4);
      let indices: IndexBuffer | undefined;
      try {
        indices = createScreenSpaceLineIndices(nextCapacity);
        writeScreenSpaceLineVertices(vertices, segments, distances);
      } catch (error) {
        vertices.dispose();
        indices?.dispose();
        throw error;
      }
      const oldVertices = this.vertexBuffer;
      const oldIndices = this.indexBuffer;
      this.vertexBuffer = vertices;
      this.indexBuffer = indices!;
      const errors: unknown[] = [];
      try { this.retireUnownedBuffer(oldVertices); } catch (error) { errors.push(error); }
      try { this.retireUnownedBuffer(oldIndices); } catch (error) { errors.push(error); }
      if (errors.length) throw new AggregateError(errors, "Geometry buffer replacement failed");
    } else {
      writeScreenSpaceLineVertices(this.vertexBuffer, segments, distances);
    }
    this.screenSpaceLineCount = segments.length;
    this.drawRange = { start: 0, count: segments.length * 6 };
    this.refreshBounds();
  }

  static wideLineSegments(segments: readonly WideLineSegment[]): Geometry {
    if (segments.length === 0) {
      throw new Error("Wide line geometry requires at least one segment");
    }
    const vertices = new VertexBuffer(VertexFormat.P3, segments.length * 4);
    const indices: number[] = [];
    segments.forEach((segment, segmentIndex) => {
      validateWideLineSegment(segment, segmentIndex);
      const [sx, sy, sz] = segment.start;
      const [ex, ey, ez] = segment.end;
      const dx = ex - sx;
      const dy = ey - sy;
      const dz = ez - sz;
      const length = Math.hypot(dx, dy, dz);
      const up = Math.abs(dz / length) > 0.92 ? [0, 1, 0] as const : [0, 0, 1] as const;
      const nx = dy * up[2] - dz * up[1];
      const ny = dz * up[0] - dx * up[2];
      const nz = dx * up[1] - dy * up[0];
      const normalLength = Math.hypot(nx, ny, nz);
      const halfWidth = segment.width * 0.5;
      const ox = nx / normalLength * halfWidth;
      const oy = ny / normalLength * halfWidth;
      const oz = nz / normalLength * halfWidth;
      const base = segmentIndex * 4;
      vertices.setAttribute(base, "position", [sx - ox, sy - oy, sz - oz]);
      vertices.setAttribute(base + 1, "position", [sx + ox, sy + oy, sz + oz]);
      vertices.setAttribute(base + 2, "position", [ex + ox, ey + oy, ez + oz]);
      vertices.setAttribute(base + 3, "position", [ex - ox, ey - oy, ez - oz]);
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    });
    return new Geometry(vertices, new IndexBuffer(indices, segments.length * 4), "triangles");
  }

  static points(positions: readonly (readonly [number, number, number])[]): Geometry {
    if (positions.length === 0) {
      throw new Error("Point geometry requires at least one position");
    }
    const vertices = new VertexBuffer(VertexFormat.P3, positions.length);
    positions.forEach((position, index) => {
      if (position.length !== 3 || !Number.isFinite(position[0]) || !Number.isFinite(position[1]) || !Number.isFinite(position[2])) {
        throw new Error(`Point position ${index} must be a finite vec3`);
      }
      vertices.setAttribute(index, "position", position);
    });
    return new Geometry(vertices, null, "points");
  }

  static litTriangle(): Geometry {
    const vertices = new VertexBuffer(VertexFormat.P3N3, 3);
    vertices.setAttribute(0, "position", [-0.5, -0.5, 0]);
    vertices.setAttribute(0, "normal", [0, 0, 1]);
    vertices.setAttribute(1, "position", [0.5, -0.5, 0]);
    vertices.setAttribute(1, "normal", [0, 0, 1]);
    vertices.setAttribute(2, "position", [0, 0.5, 0]);
    vertices.setAttribute(2, "normal", [0, 0, 1]);
    return new Geometry(vertices, new IndexBuffer([0, 1, 2], 3));
  }

  /** Unit XZ floor plane with upward-facing normals. */
  static litPlane(options: PlaneGeometryOptions = {}): Geometry {
    const widthSegments = Math.max(1, Math.floor(options.widthSegments ?? 1));
    const heightSegments = Math.max(1, Math.floor(options.heightSegments ?? 1));
    const textured = options.textured === true;
    const vertexCount = (widthSegments + 1) * (heightSegments + 1);
    const vertices = new VertexBuffer(textured ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3, vertexCount);
    for (let j = 0; j <= heightSegments; j += 1) {
      for (let i = 0; i <= widthSegments; i += 1) {
        const index = j * (widthSegments + 1) + i;
        vertices.setAttribute(index, "position", [i / widthSegments - 0.5, 0, j / heightSegments - 0.5]);
        vertices.setAttribute(index, "normal", [0, 1, 0]);
        if (textured) {
          vertices.setAttribute(index, "tangent", [1, 0, 0, 1]);
          vertices.setAttribute(index, "uv", [i / widthSegments, j / heightSegments]);
        }
      }
    }
    const indices: number[] = [];
    const stride = widthSegments + 1;
    for (let j = 0; j < heightSegments; j += 1) {
      for (let i = 0; i < widthSegments; i += 1) {
        const a = j * stride + i;
        const b = a + 1;
        const c = a + stride;
        const d = c + 1;
        // CCW from +Y (legacy litPlane winding 0,2,1 / 0,3,2).
        indices.push(a, d, b, a, c, d);
      }
    }
    return new Geometry(vertices, new IndexBuffer(indices, vertexCount));
  }

  static litCube(size = 1): Geometry {
    if (size <= 0) {
      throw new Error("Lit cube size must be positive");
    }
    const half = size / 2;
    const faces: readonly {
      readonly normal: readonly [number, number, number];
      readonly corners: readonly (readonly [number, number, number])[];
    }[] = [
      { normal: [0, 0, 1], corners: [[-half, -half, half], [half, -half, half], [half, half, half], [-half, half, half]] },
      { normal: [0, 0, -1], corners: [[half, -half, -half], [-half, -half, -half], [-half, half, -half], [half, half, -half]] },
      { normal: [1, 0, 0], corners: [[half, -half, half], [half, -half, -half], [half, half, -half], [half, half, half]] },
      { normal: [-1, 0, 0], corners: [[-half, -half, -half], [-half, -half, half], [-half, half, half], [-half, half, -half]] },
      { normal: [0, 1, 0], corners: [[-half, half, half], [half, half, half], [half, half, -half], [-half, half, -half]] },
      { normal: [0, -1, 0], corners: [[-half, -half, -half], [half, -half, -half], [half, -half, half], [-half, -half, half]] }
    ];
    const vertices = new VertexBuffer(VertexFormat.P3N3, faces.length * 4);
    const indices: number[] = [];
    faces.forEach((face, faceIndex) => {
      const offset = faceIndex * 4;
      face.corners.forEach((position, cornerIndex) => {
        vertices.setAttribute(offset + cornerIndex, "position", position);
        vertices.setAttribute(offset + cornerIndex, "normal", face.normal);
      });
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    });
    return new Geometry(vertices, new IndexBuffer(indices, faces.length * 4));
  }

  static texturedCube(size = 1): Geometry {
    if (size <= 0) {
      throw new Error("Textured cube size must be positive");
    }
    const half = size / 2;
    const uv: readonly (readonly [number, number])[] = [[0, 0], [1, 0], [1, 1], [0, 1]];
    const faces: readonly {
      readonly normal: readonly [number, number, number];
      readonly tangent: readonly [number, number, number, number];
      readonly corners: readonly (readonly [number, number, number])[];
    }[] = [
      { normal: [0, 0, 1], tangent: [1, 0, 0, 1], corners: [[-half, -half, half], [half, -half, half], [half, half, half], [-half, half, half]] },
      { normal: [0, 0, -1], tangent: [-1, 0, 0, 1], corners: [[half, -half, -half], [-half, -half, -half], [-half, half, -half], [half, half, -half]] },
      { normal: [1, 0, 0], tangent: [0, 0, -1, 1], corners: [[half, -half, half], [half, -half, -half], [half, half, -half], [half, half, half]] },
      { normal: [-1, 0, 0], tangent: [0, 0, 1, 1], corners: [[-half, -half, -half], [-half, -half, half], [-half, half, half], [-half, half, -half]] },
      { normal: [0, 1, 0], tangent: [1, 0, 0, 1], corners: [[-half, half, half], [half, half, half], [half, half, -half], [-half, half, -half]] },
      { normal: [0, -1, 0], tangent: [1, 0, 0, 1], corners: [[-half, -half, -half], [half, -half, -half], [half, -half, half], [-half, -half, half]] }
    ];
    const vertices = new VertexBuffer(VertexFormat.P3N3T4T2, faces.length * 4);
    const indices: number[] = [];
    faces.forEach((face, faceIndex) => {
      const offset = faceIndex * 4;
      face.corners.forEach((position, cornerIndex) => {
        vertices.setAttribute(offset + cornerIndex, "position", position);
        vertices.setAttribute(offset + cornerIndex, "normal", face.normal);
        vertices.setAttribute(offset + cornerIndex, "tangent", face.tangent);
        vertices.setAttribute(offset + cornerIndex, "uv", uv[cornerIndex]!);
      });
      indices.push(offset, offset + 1, offset + 2, offset, offset + 2, offset + 3);
    });
    return new Geometry(vertices, new IndexBuffer(indices, faces.length * 4));
  }

  static uvSphere(radius = 0.5, segments = 48, rings = 24, options: UVSphereGeometryOptions = {}): Geometry {
    if (radius <= 0) {
      throw new Error("Sphere radius must be positive");
    }
    if (!Number.isInteger(segments) || !Number.isInteger(rings) || segments < 3 || rings < 2) {
      throw new Error("Sphere segments and rings must be integers with segments >= 3 and rings >= 2");
    }
    const textured = options.textured === true;
    const vertexCount = (rings + 1) * (segments + 1);
    const vertices = new VertexBuffer(textured ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3, vertexCount);
    let vertex = 0;
    for (let ring = 0; ring <= rings; ring += 1) {
      const v = ring / rings;
      const theta = v * Math.PI;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);
      for (let segment = 0; segment <= segments; segment += 1) {
        const u = segment / segments;
        const phi = u * Math.PI * 2;
        const nx = Math.cos(phi) * sinTheta;
        const ny = cosTheta;
        const nz = Math.sin(phi) * sinTheta;
        vertices.setAttribute(vertex, "position", [nx * radius, ny * radius, nz * radius]);
        vertices.setAttribute(vertex, "normal", [nx, ny, nz]);
        if (textured) {
          vertices.setAttribute(vertex, "tangent", [-Math.sin(phi), 0, Math.cos(phi), 1]);
          vertices.setAttribute(vertex, "uv", [u, v]);
        }
        vertex += 1;
      }
    }
    const indices: number[] = [];
    const stride = segments + 1;
    for (let ring = 0; ring < rings; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const a = ring * stride + segment;
        const b = a + stride;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }
    return new Geometry(vertices, new IndexBuffer(indices, vertexCount));
  }

  static cylinder(options: CylinderGeometryOptions = {}): Geometry {
    const radius = options.radius ?? 0.5;
    const radiusTop = options.radiusTop ?? radius;
    const radiusBottom = options.radiusBottom ?? radius;
    const height = options.height ?? 1;
    const segments = options.segments ?? 48;
    const heightSegments = Math.max(1, Math.floor(options.heightSegments ?? 1));
    const capped = options.openEnded !== undefined ? !options.openEnded : (options.capped ?? true);
    // threejs-parity L2: `CylinderGeometry` permits a zero radius at either
    // end — that is exactly how three's `ConeGeometry` builds (radiusTop 0).
    // Keep rejecting negatives and the fully-degenerate 0/0 case.
    validateNonNegativeFinite(radiusTop, "Cylinder radiusTop");
    validateNonNegativeFinite(radiusBottom, "Cylinder radiusBottom");
    if (radiusTop <= 0 && radiusBottom <= 0) {
      throw new Error("Cylinder requires at least one non-zero radius");
    }
    validatePositiveFinite(height, "Cylinder height");
    validateSegments(segments, "Cylinder segments", 3);
    const half = height / 2;
    const textured = options.textured === true;
    // Side normals tilt by the frustum slope (rB - rT)/height.
    const slope = (radiusBottom - radiusTop) / height;
    const slopeLen = Math.hypot(1, slope);
    const vertices: GeneratedVertex[] = [];
    const indices: number[] = [];
    const rows = heightSegments + 1;

    for (let segment = 0; segment <= segments; segment += 1) {
      const u = segment / segments;
      const angle = u * Math.PI * 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const normal: Vec3 = [cos / slopeLen, slope / slopeLen, sin / slopeLen];
      const tangent: Vec4 = [-sin, 0, cos, 1];
      for (let row = 0; row < rows; row += 1) {
        const v = row / heightSegments;
        const r = radiusBottom + (radiusTop - radiusBottom) * v;
        vertices.push(makeGeneratedVertex([cos * r, -half + v * height, sin * r], normal, [u, v], tangent, textured));
      }
    }

    for (let segment = 0; segment < segments; segment += 1) {
      const base = segment * rows;
      for (let row = 0; row < heightSegments; row += 1) {
        const a = base + row;
        const b = a + rows;
        indices.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }

    if (capped) {
      const bottomCenter = vertices.length;
      vertices.push(makeGeneratedVertex([0, -half, 0], [0, -1, 0], [0.5, 0.5], [1, 0, 0, 1], textured));
      const bottomStart = vertices.length;
      for (let segment = 0; segment <= segments; segment += 1) {
        const u = segment / segments;
        const angle = u * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        vertices.push(makeGeneratedVertex([cos * radiusBottom, -half, sin * radiusBottom], [0, -1, 0], [0.5 + cos * 0.5, 0.5 + sin * 0.5], [1, 0, 0, 1], textured));
      }
      for (let segment = 0; segment < segments; segment += 1) {
        indices.push(bottomCenter, bottomStart + segment, bottomStart + segment + 1);
      }

      const topCenter = vertices.length;
      vertices.push(makeGeneratedVertex([0, half, 0], [0, 1, 0], [0.5, 0.5], [1, 0, 0, 1], textured));
      const topStart = vertices.length;
      for (let segment = 0; segment <= segments; segment += 1) {
        const u = segment / segments;
        const angle = u * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        vertices.push(makeGeneratedVertex([cos * radiusTop, half, sin * radiusTop], [0, 1, 0], [0.5 + cos * 0.5, 0.5 + sin * 0.5], [1, 0, 0, 1], textured));
      }
      for (let segment = 0; segment < segments; segment += 1) {
        indices.push(topCenter, topStart + segment + 1, topStart + segment);
      }
    }

    return generatedGeometry(vertices, indices, textured);
  }

  /**
   * threejs-parity L2-01: a cone is the cylinder path with `radiusTop: 0`
   * (the `radiusTop`/`radiusBottom` options at `:30-36`). For three-exact
   * `ConeGeometry` buffers use `coneParityMesh` in `geometry/Cone`.
   */
  static cone(options: Omit<CylinderGeometryOptions, "radiusTop"> = {}): Geometry {
    return Geometry.cylinder({ ...options, radiusTop: 0 });
  }

  static capsule(options: CapsuleGeometryOptions = {}): Geometry {
    const radius = options.radius ?? 0.5;
    const height = options.height ?? 1.8;
    const segments = options.segments ?? 48;
    const rings = options.rings ?? 12;
    validatePositiveFinite(radius, "Capsule radius");
    validatePositiveFinite(height, "Capsule height");
    if (height < radius * 2) {
      throw new Error("Capsule height must be at least diameter");
    }
    validateSegments(segments, "Capsule segments", 3);
    validateSegments(rings, "Capsule rings", 2);
    const ellipticity = options.ellipticity ?? 1;
    validatePositiveFinite(ellipticity, "Capsule ellipticity");
    const cylinderHalf = height / 2 - radius;
    const textured = options.textured === true;
    const vertices: GeneratedVertex[] = [];
    const indices: number[] = [];
    const ringDescriptors: { readonly theta: number; readonly centerOffset: number }[] = [];

    for (let ring = 0; ring <= rings; ring += 1) {
      ringDescriptors.push({ theta: (ring / rings) * (Math.PI / 2), centerOffset: cylinderHalf });
    }
    for (let ring = 0; ring <= rings; ring += 1) {
      ringDescriptors.push({ theta: Math.PI / 2 + (ring / rings) * (Math.PI / 2), centerOffset: -cylinderHalf });
    }

    ringDescriptors.forEach((descriptor, ringIndex) => {
      const radial = Math.sin(descriptor.theta);
      const yNormal = Math.cos(descriptor.theta);
      const y = descriptor.centerOffset + yNormal * radius;
      const v = ringIndex / Math.max(1, ringDescriptors.length - 1);
      for (let segment = 0; segment <= segments; segment += 1) {
        const u = segment / segments;
        const angle = u * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        // Ellipticity scales x only; normals use the inverse-transpose rule.
        const normal: Vec3 = ellipticity === 1
          ? normalize3([cos * radial, yNormal, sin * radial])
          : normalize3([(cos * radial) / ellipticity, yNormal, sin * radial]);
        const tangent: Vec4 = [-sin, 0, cos, 1];
        vertices.push(makeGeneratedVertex([cos * radial * radius * ellipticity, y, sin * radial * radius], normal, [u, v], tangent, textured));
      }
    });

    const stride = segments + 1;
    for (let ring = 0; ring < ringDescriptors.length - 1; ring += 1) {
      for (let segment = 0; segment < segments; segment += 1) {
        const a = ring * stride + segment;
        const b = a + stride;
        indices.push(a, a + 1, b, a + 1, b + 1, b);
      }
    }

    return generatedGeometry(vertices, indices, textured);
  }

  /**
   * Torus in the XY plane (axis +Z) — same orientation and proportions as the
   * legacy engine generator (`index.ts` createTorusGeometry), with UVs and
   * tangents for the C-07 textured path.
   */
  static torus(options: TorusGeometryOptions = {}): Geometry {
    const radius = options.radius ?? 0.43;
    const tube = options.tube ?? 0.045;
    const radialSegments = options.radialSegments ?? 64;
    const tubularSegments = options.tubularSegments ?? 16;
    validatePositiveFinite(radius, "Torus radius");
    validatePositiveFinite(tube, "Torus tube");
    validateSegments(radialSegments, "Torus radialSegments", 3);
    validateSegments(tubularSegments, "Torus tubularSegments", 3);
    const textured = options.textured !== false;
    const vertexCount = (radialSegments + 1) * (tubularSegments + 1);
    const vertices = new VertexBuffer(textured ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3, vertexCount);
    let vertex = 0;
    for (let radial = 0; radial <= radialSegments; radial += 1) {
      const u = radial / radialSegments;
      const phi = u * Math.PI * 2;
      const cosPhi = Math.cos(phi);
      const sinPhi = Math.sin(phi);
      for (let tubeIndex = 0; tubeIndex <= tubularSegments; tubeIndex += 1) {
        const v = tubeIndex / tubularSegments;
        const theta = v * Math.PI * 2;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);
        const nx = cosTheta * cosPhi;
        const ny = cosTheta * sinPhi;
        const nz = sinTheta;
        vertices.setAttribute(vertex, "position", [
          cosPhi * (radius + tube * cosTheta),
          sinPhi * (radius + tube * cosTheta),
          tube * sinTheta
        ]);
        vertices.setAttribute(vertex, "normal", [nx, ny, nz]);
        if (textured) {
          vertices.setAttribute(vertex, "tangent", [-sinPhi, cosPhi, 0, 1]);
          vertices.setAttribute(vertex, "uv", [u, v]);
        }
        vertex += 1;
      }
    }
    const indices: number[] = [];
    const stride = tubularSegments + 1;
    for (let radial = 0; radial < radialSegments; radial += 1) {
      for (let tubeIndex = 0; tubeIndex < tubularSegments; tubeIndex += 1) {
        const a = radial * stride + tubeIndex;
        const b = a + stride;
        indices.push(a, b, a + 1, b, b + 1, a + 1);
      }
    }
    return new Geometry(vertices, new IndexBuffer(indices, vertexCount));
  }

  /**
   * Unit box (−0.5..0.5) with per-face segment subdivision, UVs and tangents
   * (C-07). Segment counts map per face: ±z use width×height, ±x use
   * depth×height, ±y use width×depth.
   */
  static box(options: BoxGeometryOptions = {}): Geometry {
    const widthSegments = Math.max(1, Math.floor(options.widthSegments ?? 1));
    const heightSegments = Math.max(1, Math.floor(options.heightSegments ?? 1));
    const depthSegments = Math.max(1, Math.floor(options.depthSegments ?? 1));
    const textured = options.textured !== false;
    const half = 0.5;
    const positions: number[] = [];
    const normals: number[] = [];
    const uvs: number[] = [];
    const tangents: number[] = [];
    const indices: number[] = [];
    const emitFace = (
      normal: readonly [number, number, number],
      tangent: readonly [number, number, number, number],
      origin: readonly [number, number, number],
      uAxis: readonly [number, number, number],
      vAxis: readonly [number, number, number],
      uSegs: number,
      vSegs: number
    ): void => {
      const base = positions.length / 3;
      for (let j = 0; j <= vSegs; j += 1) {
        for (let i = 0; i <= uSegs; i += 1) {
          const u = i / uSegs;
          const v = j / vSegs;
          positions.push(
            origin[0] + uAxis[0] * u + vAxis[0] * v,
            origin[1] + uAxis[1] * u + vAxis[1] * v,
            origin[2] + uAxis[2] * u + vAxis[2] * v
          );
          normals.push(normal[0], normal[1], normal[2]);
          uvs.push(u, v);
          tangents.push(tangent[0], tangent[1], tangent[2], tangent[3]);
        }
      }
      const stride = uSegs + 1;
      for (let j = 0; j < vSegs; j += 1) {
        for (let i = 0; i < uSegs; i += 1) {
          const a = base + j * stride + i;
          const b = a + 1;
          const c = a + stride;
          const d = c + 1;
          indices.push(a, b, d, a, d, c);
        }
      }
    };
    // Corners/tangents mirror texturedCube so a 1×1×1 box renders identically.
    emitFace([0, 0, 1], [1, 0, 0, 1], [-half, -half, half], [1, 0, 0], [0, 1, 0], widthSegments, heightSegments);
    emitFace([0, 0, -1], [-1, 0, 0, 1], [half, -half, -half], [-1, 0, 0], [0, 1, 0], widthSegments, heightSegments);
    emitFace([1, 0, 0], [0, 0, -1, 1], [half, -half, half], [0, 0, -1], [0, 1, 0], depthSegments, heightSegments);
    emitFace([-1, 0, 0], [0, 0, 1, 1], [-half, -half, -half], [0, 0, 1], [0, 1, 0], depthSegments, heightSegments);
    emitFace([0, 1, 0], [1, 0, 0, 1], [-half, half, half], [1, 0, 0], [0, 0, -1], widthSegments, depthSegments);
    emitFace([0, -1, 0], [1, 0, 0, 1], [-half, -half, -half], [1, 0, 0], [0, 0, 1], widthSegments, depthSegments);
    const count = positions.length / 3;
    const vertices = new VertexBuffer(textured ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3, count);
    for (let i = 0; i < count; i += 1) {
      vertices.setAttribute(i, "position", [positions[i * 3]!, positions[i * 3 + 1]!, positions[i * 3 + 2]!]);
      vertices.setAttribute(i, "normal", [normals[i * 3]!, normals[i * 3 + 1]!, normals[i * 3 + 2]!]);
      if (textured) {
        vertices.setAttribute(i, "uv", [uvs[i * 2]!, uvs[i * 2 + 1]!]);
        vertices.setAttribute(i, "tangent", [tangents[i * 4]!, tangents[i * 4 + 1]!, tangents[i * 4 + 2]!, tangents[i * 4 + 3]!]);
      }
    }
    return new Geometry(vertices, new IndexBuffer(indices, count));
  }

  static cube(size = 1): Geometry {
    if (size <= 0) {
      throw new Error("Cube size must be positive");
    }
    const half = size / 2;
    const positions: readonly (readonly [number, number, number])[] = [
      [-half, -half, -half],
      [half, -half, -half],
      [half, half, -half],
      [-half, half, -half],
      [-half, -half, half],
      [half, -half, half],
      [half, half, half],
      [-half, half, half]
    ];
    const vertices = new VertexBuffer(VertexFormat.P3, positions.length);
    positions.forEach((position, index) => vertices.setAttribute(index, "position", position));
    const indices = [
      0, 1, 2, 0, 2, 3,
      4, 6, 5, 4, 7, 6,
      0, 4, 5, 0, 5, 1,
      1, 5, 6, 1, 6, 2,
      2, 6, 7, 2, 7, 3,
      3, 7, 4, 3, 4, 0
    ];
    return new Geometry(vertices, new IndexBuffer(indices, positions.length));
  }

  dispose(): void {
    if (this.disposalComplete || this.disposing) return;
    if (!this.closed) {
      this.closed = true;
      this.pendingOwnedDisposals = new Set<GeometryBuffer>([this.primaryVertexBuffer!, ...this.extraVertexBuffers]);
      if (this.currentIndexBuffer) this.pendingOwnedDisposals.add(this.currentIndexBuffer);
      // Only failed releases need to keep their buffers reachable for retry.
      this.primaryVertexBuffer = null;
      this.currentIndexBuffer = null;
      this.extraVertexBuffers = [];
    }
    // Mark this geometry dead before releasing: cleanup can invoke user or
    // device callbacks, and peers must retain their own buffers throughout.
    this.disposing = true;
    const errors: unknown[] = [];
    try {
      for (const buffer of [...this.pendingOwnedDisposals!]) {
        try {
          releaseGeometryBuffer(buffer, true);
          this.pendingOwnedDisposals!.delete(buffer);
        } catch (error) {
          if (!geometryBufferOwners.has(buffer)) this.pendingOwnedDisposals!.delete(buffer);
          errors.push(error);
        }
      }
      for (const buffer of [...this.pendingUnownedDisposals]) {
        try { this.retireUnownedBuffer(buffer); } catch (error) { errors.push(error); }
      }
    } finally {
      this.disposing = false;
      this.finishDisposal();
    }
    if (errors.length) throw new AggregateError(errors, "Geometry disposal failed");
  }

  private retireUnownedBuffer(buffer: GeometryBuffer): void {
    if (geometryBufferOwners.has(buffer)) {
      this.pendingUnownedDisposals.delete(buffer);
      this.finishDisposal();
      return;
    }
    this.pendingUnownedDisposals.add(buffer);
    if (this.closed) this.disposalComplete = false;
    if (this.unownedDisposalsInFlight.has(buffer)) throw new Error("Geometry buffer disposal is in progress");
    this.unownedDisposalsInFlight.add(buffer);
    try {
      disposeUnownedGeometryBuffer(buffer);
      this.pendingUnownedDisposals.delete(buffer);
    } catch (error) {
      // A peer may have acquired an overridden buffer before it was closed.
      if (buffer.disposed || geometryBufferOwners.has(buffer)) this.pendingUnownedDisposals.delete(buffer);
      throw error;
    } finally {
      this.unownedDisposalsInFlight.delete(buffer);
      this.finishDisposal();
    }
  }

  private finishDisposal(): void {
    if (this.closed && !this.disposing && this.pendingOwnedDisposals?.size === 0 &&
        this.pendingUnownedDisposals.size === 0 && this.unownedDisposalsInFlight.size === 0) {
      this.disposalComplete = true;
    }
  }

  private validateVertexStreams(instanceCount = 1): void {
    if (!Number.isSafeInteger(instanceCount) || instanceCount <= 0) {
      throw new RangeError("Geometry instance count must be a positive integer");
    }
    const format = this.vertexBuffer.format;
    if (this.vertexBuffer.bufferSlot !== 0 || format.streams.find((stream) => stream.slot === 0)?.stepMode !== "vertex") {
      throw new Error("Geometry primary vertex buffer must contain vertex stream slot 0");
    }
    const supplied = new Map<number, VertexBuffer>([[0, this.vertexBuffer]]);
    for (const buffer of this.additionalVertexBuffers) {
      if (!Number.isSafeInteger(buffer.bufferSlot) || buffer.bufferSlot < 1 || buffer.bufferSlot >= 0xffffffff || supplied.has(buffer.bufferSlot)) {
        throw new Error(`Geometry vertex buffer slot must be unique and representable: ${buffer.bufferSlot}`);
      }
      if (!sameVertexFormat(buffer.format, format)) throw new Error(`Geometry vertex stream ${buffer.bufferSlot} must match the primary buffer's format`);
      supplied.set(buffer.bufferSlot, buffer);
    }
    for (const stream of format.streams) {
      const buffer = supplied.get(stream.slot);
      if (!buffer) throw new Error(`Geometry has no vertex buffer for slot ${stream.slot}`);
      const required = stream.stepMode === "instance" ? Math.ceil(instanceCount / stream.divisor) : this.vertexBuffer.vertexCount;
      if (buffer.vertexCount < required) {
        throw new RangeError(`Geometry vertex stream ${stream.slot} requires ${required} records, got ${buffer.vertexCount}`);
      }
    }
    if (supplied.size !== format.streams.length) throw new Error("Geometry has a vertex buffer for an undeclared stream");
    if (format.hasAttribute("position")) {
      const positionSlot = format.getAttribute("position").bufferSlot;
      if (format.streams.find((stream) => stream.slot === positionSlot)?.stepMode !== "vertex") {
        throw new Error("Geometry position attribute must use a vertex stream");
      }
    }
  }

  private assertAlive(): void {
    if (this.closed) throw new Error("Geometry is disposed");
  }
}

/** Equivalent separately created formats are interchangeable for a stream. */
function sameVertexFormat(a: VertexFormat, b: VertexFormat): boolean {
  if (a === b) return true;
  if (a.attributes.length !== b.attributes.length || a.streams.length !== b.streams.length) return false;
  return a.streams.every((stream) => {
    const other = b.streams.find((candidate) => candidate.slot === stream.slot);
    return other !== undefined && stream.stride === other.stride && stream.stepMode === other.stepMode && stream.divisor === other.divisor;
  }) && a.attributes.every((attribute) => {
    const other = b.attributes.find((candidate) => candidate.semantic === attribute.semantic);
    return other !== undefined && attribute.components === other.components && attribute.offset === other.offset
      && attribute.type === other.type && attribute.normalized === other.normalized && attribute.integer === other.integer
      && attribute.bufferSlot === other.bufferSlot && attribute.shaderLocation === other.shaderLocation && attribute.shaderName === other.shaderName;
  });
}

type LineDistanceRange = readonly [number, number];

function validateLineVertices(positions: readonly LinePosition[], colors: readonly LineColor[] | undefined, allowEmpty: boolean): void {
  if ((!allowEmpty && positions.length === 0) || positions.length % 2 !== 0) {
    throw new Error("Line segment geometry requires one or more pairs of positions");
  }
  if (colors !== undefined && colors.length !== positions.length) {
    throw new Error("Line segment colors must match the number of positions");
  }
  Array.from(positions).forEach((position, index) => {
    if (!position || position.length !== 3 || [...position].some((value) => !isFiniteFloat32(value))) {
      throw new Error(`Line segment position ${index} must be a finite vec3`);
    }
    const color = colors?.[index];
    if (colors !== undefined && (!color || color.length !== 4 || [...color].some((value) => !isFiniteFloat32(value)))) {
      throw new Error(`Line segment color ${index} must be a finite vec4`);
    }
  });
}

function writeLineVertices(vertices: VertexBuffer, positions: readonly LinePosition[], colors: readonly LineColor[] | undefined): void {
  const white = [1, 1, 1, 1] as const;
  positions.forEach((position, index) => {
    vertices.setAttribute(index, "position", position);
    vertices.setAttribute(index, "color", colors?.[index] ?? white);
  });
}

function createScreenSpaceLineIndices(segmentCapacity: number): IndexBuffer {
  const indices: number[] = [];
  for (let i = 0; i < segmentCapacity; i += 1) {
    const base = i * 4;
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  return new IndexBuffer(indices, segmentCapacity * 4);
}

function resolveScreenSpaceLineDistances(segments: readonly ScreenSpaceLineSegment[]): readonly LineDistanceRange[] {
  let distance = 0;
  return Array.from(segments, (segment, index) => {
    validateScreenSpaceLineSegment(segment, index);
    const start = segment.startDistance ?? distance;
    const end = segment.endDistance ?? start + Math.hypot(
      segment.end[0] - segment.start[0],
      segment.end[1] - segment.start[1],
      segment.end[2] - segment.start[2]
    );
    if (!isFiniteFloat32(start) || !isFiniteFloat32(end) || end < start) {
      throw new Error(`Screen-space line segment ${index} distances must be finite and nondecreasing`);
    }
    distance = end;
    return [start, end] as const;
  });
}

function writeScreenSpaceLineVertices(
  vertices: VertexBuffer,
  segments: readonly ScreenSpaceLineSegment[],
  distances: readonly LineDistanceRange[]
): void {
  const white = [1, 1, 1, 1] as const;
  // The +1 side first yields counter-clockwise triangles after expansion.
  const corners: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [-1, 1], [1, 1]];
  segments.forEach((segment, segmentIndex) => {
    const [startDistance, endDistance] = distances[segmentIndex]!;
    const startColor = segment.startColor ?? white;
    const endColor = segment.endColor ?? white;
    corners.forEach((corner, cornerIndex) => {
      const atEnd = corner[1] === 1;
      const index = segmentIndex * 4 + cornerIndex;
      vertices.setAttribute(index, "position", atEnd ? segment.end : segment.start);
      vertices.setAttribute(index, "lineStart", segment.start);
      vertices.setAttribute(index, "lineEnd", segment.end);
      vertices.setAttribute(index, "lineCorner", corner);
      vertices.setAttribute(index, "lineDistance", [atEnd ? endDistance : startDistance]);
      vertices.setAttribute(index, "color", atEnd ? endColor : startColor);
      vertices.setAttribute(index, "custom:lineOtherColor", atEnd ? startColor : endColor);
      vertices.setAttribute(index, "custom:lineOtherDistance", [atEnd ? startDistance : endDistance]);
    });
  });
}

function validateScreenSpaceLineSegment(segment: ScreenSpaceLineSegment, index: number): void {
  if (!segment || !segment.start || !segment.end) {
    throw new Error(`Screen-space line segment ${index} requires start and end points`);
  }
  for (const [label, point] of [["start", segment.start], ["end", segment.end]] as const) {
    if (point.length !== 3 || [...point].some((component) => !isFiniteFloat32(component))) {
      throw new Error(`Screen-space line segment ${index} ${label} must contain three finite components`);
    }
  }
  const length = Math.hypot(
    segment.end[0] - segment.start[0],
    segment.end[1] - segment.start[1],
    segment.end[2] - segment.start[2]
  );
  // A zero-length segment has no direction, so the shader cannot derive a perpendicular
  // to expand along and would emit a degenerate quad.
  if (!Number.isFinite(length) || length <= 1e-6) {
    throw new Error(`Screen-space line segment ${index} must have non-zero length`);
  }
  if (segment.start.every((value, axis) => Math.fround(value) === Math.fround(segment.end[axis]!))) {
    throw new Error(`Screen-space line segment ${index} must have non-zero length after float32 conversion`);
  }
  for (const [label, color] of [["startColor", segment.startColor], ["endColor", segment.endColor]] as const) {
    if (color !== undefined && (!color || color.length !== 4 || [...color].some((component) => !isFiniteFloat32(component)))) {
      throw new Error(`Screen-space line segment ${index} ${label} must contain four finite components`);
    }
  }
  if ((segment.startDistance === undefined) !== (segment.endDistance === undefined)) {
    throw new Error(`Screen-space line segment ${index} must provide both startDistance and endDistance`);
  }
}

function isFiniteFloat32(value: number): boolean {
  return Number.isFinite(value) && Number.isFinite(Math.fround(value));
}

function validateWideLineSegment(segment: WideLineSegment, index: number): void {
  if (segment.start.length !== 3 || segment.end.length !== 3) {
    throw new Error(`Wide line segment ${index} endpoints must be vec3 values`);
  }
  if ([...segment.start, ...segment.end].some((value) => !Number.isFinite(value))) {
    throw new Error(`Wide line segment ${index} endpoints must be finite`);
  }
  if (!Number.isFinite(segment.width) || segment.width <= 0) {
    throw new Error(`Wide line segment ${index} width must be finite and positive`);
  }
  if (Math.hypot(
    segment.end[0] - segment.start[0],
    segment.end[1] - segment.start[1],
    segment.end[2] - segment.start[2]
  ) <= 1e-8) {
    throw new Error(`Wide line segment ${index} must have non-zero length`);
  }
}

export function computeBounds(vertexBuffer: VertexBuffer, vertexCount = vertexBuffer.vertexCount): Bounds3 {
  if (!vertexBuffer.format.hasAttribute("position")) {
    throw new Error("Cannot compute geometry bounds without position attribute");
  }
  if (!Number.isInteger(vertexCount) || vertexCount < 0 || vertexCount > vertexBuffer.vertexCount) {
    throw new RangeError("Bounds vertex count must be within the vertex buffer");
  }
  if (vertexCount === 0) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min: [number, number, number] = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max: [number, number, number] = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let i = 0; i < vertexCount; i += 1) {
    const [x = 0, y = 0, z = 0] = vertexBuffer.getDecodedAttribute(i, "position");
    min[0] = Math.min(min[0], x);
    min[1] = Math.min(min[1], y);
    min[2] = Math.min(min[2], z);
    max[0] = Math.max(max[0], x);
    max[1] = Math.max(max[1], y);
    max[2] = Math.max(max[2], z);
  }
  return { min, max };
}

type Vec2 = readonly [number, number];
type Vec3 = readonly [number, number, number];
type Vec4 = readonly [number, number, number, number];

interface GeneratedVertex {
  readonly position: Vec3;
  readonly normal: Vec3;
  readonly uv?: Vec2;
  readonly tangent?: Vec4;
}

function generatedGeometry(vertices: readonly GeneratedVertex[], indices: readonly number[], textured: boolean): Geometry {
  const format = textured ? VertexFormat.P3N3T4T2 : VertexFormat.P3N3;
  const buffer = new VertexBuffer(format, vertices.length);
  vertices.forEach((vertex, index) => {
    buffer.setAttribute(index, "position", vertex.position);
    buffer.setAttribute(index, "normal", vertex.normal);
    if (textured) {
      buffer.setAttribute(index, "tangent", vertex.tangent ?? [1, 0, 0, 1]);
      buffer.setAttribute(index, "uv", vertex.uv ?? [0, 0]);
    }
  });
  return new Geometry(buffer, new IndexBuffer([...indices], vertices.length));
}

function makeGeneratedVertex(position: Vec3, normal: Vec3, uv: Vec2, tangent: Vec4, textured: boolean): GeneratedVertex {
  return textured ? { position, normal, uv, tangent } : { position, normal };
}

function validatePositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be finite and positive`);
  }
}

function validateNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be finite and non-negative`);
  }
}

function validateSegments(value: number, label: string, minimum: number): void {
  if (!Number.isInteger(value) || value < minimum) {
    throw new Error(`${label} must be an integer >= ${minimum}`);
  }
}

function normalize3(value: Vec3): Vec3 {
  const length = Math.hypot(value[0], value[1], value[2]);
  if (length <= 1e-8) return [0, 1, 0];
  return [value[0] / length, value[1] / length, value[2] / length];
}
