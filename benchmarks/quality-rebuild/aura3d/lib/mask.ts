/**
 * Native object-identity capture for benchmark consumers with a paused device.
 *
 * This is a rendering-internals API: the caller supplies the current native
 * source and camera matrix. It does not discover a createAuraApp renderer.
 * The result is a bottom-left-origin linear RGBA8 image; zero is background,
 * and each remaining 24-bit ID belongs to one scene node or render item. IDs
 * follow source traversal order, independently of the order of draw submission.
 *
 * Only opaque, rigid triangle geometry is supported. Failing a capture is
 * preferable to returning a plausible but incorrect mask for an animated,
 * alpha-tested, clipped, custom-shader or otherwise unsupported draw.
 */
import type { DrawCommand, Geometry, RenderDevice, RenderItem, RenderMaterial, RenderSource, RenderTarget, RenderShaderProgram, UniformValue } from "@aura3d/rendering";
import type { SceneNode } from "@aura3d/scene";

export const MAX_OBJECT_MASK_ID = 0xffffff;
const MAX_MASK_PIXELS = 16_777_216;
const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;
const MASK_MARKER = "AURA_NATIVE_OBJECT_MASK";

export class ObjectMaskError extends Error {
  constructor(readonly code: string, message: string) {
    super(`${code}: ${message}`);
    this.name = "ObjectMaskError";
  }
}

/** The reserved ID 0 encodes transparent background. */
export function encodeObjectMaskId(id: number): readonly [number, number, number, number] {
  if (!Number.isInteger(id) || id < 0 || id > MAX_OBJECT_MASK_ID) {
    throw new ObjectMaskError("OBJECT_MASK_ID_RANGE", `ID must be an integer between 0 and ${MAX_OBJECT_MASK_ID}.`);
  }
  return id === 0 ? [0, 0, 0, 0] : [id % 256, Math.floor(id / 256) % 256, Math.floor(id / 65536), 255];
}

/** Decode one unmodified RGBA8 pixel, rejecting ambiguous or partial values. */
export function decodeObjectMaskId(bytes: ArrayLike<number>, offset = 0): number {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset + 4 > bytes.length) {
    throw new ObjectMaskError("OBJECT_MASK_PIXEL_RANGE", "RGBA pixel is outside the supplied byte array.");
  }
  const rgba = Array.from({ length: 4 }, (_, index) => bytes[offset + index]);
  if (rgba.some((value) => !Number.isInteger(value) || value! < 0 || value! > 255)) {
    throw new ObjectMaskError("OBJECT_MASK_PIXEL_INVALID", "RGBA components must be bytes.");
  }
  const [r, g, b, a] = rgba as [number, number, number, number];
  const id = r + 256 * g + 65536 * b;
  if (a === 0 && id === 0) return 0;
  if (a !== 255 || id === 0) {
    throw new ObjectMaskError("OBJECT_MASK_PIXEL_INVALID", "A pixel must be transparent background or an opaque nonzero ID.");
  }
  return id;
}

export function decodeObjectMaskPixels(bytes: Uint8Array): Uint32Array {
  if (bytes.length % 4 !== 0) throw new ObjectMaskError("OBJECT_MASK_PIXEL_RANGE", "RGBA byte length must be divisible by four.");
  const ids = new Uint32Array(bytes.length / 4);
  for (let index = 0; index < ids.length; index += 1) ids[index] = decodeObjectMaskId(bytes, index * 4);
  return ids;
}

export interface ObjectMaskObject {
  readonly id: number;
  /** Scene node id, or the item label (falling back to its source index). */
  readonly key: string;
  readonly visible: boolean;
}

export interface ObjectMaskResult {
  /** A mock validates submission only; it does not establish rasterized pixels. */
  readonly backend: "webgl2" | "mock";
  readonly width: number;
  readonly height: number;
  readonly origin: "bottom-left";
  readonly rgba: Uint8Array;
  readonly ids: Uint32Array;
  readonly objects: readonly ObjectMaskObject[];
}

type MaskSource = Pick<RenderSource, "scene" | "geometryLibrary" | "materialLibrary" | "renderItems" | "collectRenderItems">;
export interface ObjectMaskOptions {
  readonly device: RenderDevice;
  readonly source: MaskSource;
  readonly width: number;
  readonly height: number;
  /** The same column-major view-projection used by the native frame. */
  readonly viewProjectionMatrix: ArrayLike<number>;
  readonly cameraLayerMask?: number;
  /** Required on WebGL2. It must be the context that owns `device`. */
  readonly webgl2Context?: Pick<WebGL2RenderingContext, "DITHER" | "RASTERIZER_DISCARD" | "SAMPLE_COVERAGE" | "isEnabled" | "disable" | "enable">;
}

interface PreparedDraw {
  readonly id: number;
  readonly item: RenderItem;
  readonly matrix: Float32Array;
  readonly cullMode: "none" | "back" | "front";
  readonly start: number;
  readonly count: number;
  readonly order: number;
  readonly sequence: number;
}

/**
 * Execute between frames, while the owning app is paused. The pass borrows the
 * device, source and geometry; it owns only its temporary shader and target.
 * WebGPU synchronous readback is unavailable and is explicitly rejected.
 */
export function captureNativeObjectMask(options: ObjectMaskOptions): ObjectMaskResult {
  const { device, width, height, source } = options;
  validateSize(width, height);
  const viewProjection = matrix(options.viewProjectionMatrix, "viewProjectionMatrix");
  if (device.disposed || device.contextLost) throw new ObjectMaskError("OBJECT_MASK_DEVICE_UNAVAILABLE", "Device is disposed or context is lost.");
  if (device.kind !== "webgl2" && device.kind !== "mock") throw new ObjectMaskError("OBJECT_MASK_BACKEND_UNSUPPORTED", `${device.kind} synchronous ID capture is unsupported.`);
  if (!device.getRenderTarget) throw new ObjectMaskError("OBJECT_MASK_STATE_UNSUPPORTED", "Device cannot restore the previous render target.");
  const depth = device.getDepthConvention?.();
  if (depth && (depth.mode !== "standard" || depth.clipRange !== "minus-one-to-one")) {
    throw new ObjectMaskError("OBJECT_MASK_DEPTH_UNSUPPORTED", "Only standard WebGL clip-space depth is supported.");
  }
  if (device.kind === "webgl2" && !options.webgl2Context) {
    throw new ObjectMaskError("OBJECT_MASK_DITHER_UNSUPPORTED", "Supply the device's WebGL2 context to restore exact raster state.");
  }
  if (options.cameraLayerMask !== undefined && !Number.isInteger(options.cameraLayerMask)) {
    throw new ObjectMaskError("OBJECT_MASK_LAYER_INVALID", "Camera layer mask must be an integer.");
  }

  const objects: ObjectMaskObject[] = [];
  const draws: PreparedDraw[] = [];
  let sequence = 0;
  function reserve(key: string, visible: boolean): number {
    const id = objects.length + 1;
    if (id > MAX_OBJECT_MASK_ID) throw new ObjectMaskError("OBJECT_MASK_ID_RANGE", "Scene exceeds the 24-bit object-ID capacity.");
    objects.push({ id, key, visible });
    return id;
  }
  function add(item: RenderItem, id: number): void {
    draws.push(...prepareDraws(item, id, viewProjection, () => sequence++));
  }

  if (source.scene) {
    source.scene.updateWorldTransforms();
    const visited = new Set<SceneNode>();
    const visit = (node: SceneNode, parentVisible: boolean): void => {
      if (visited.has(node)) throw new ObjectMaskError("OBJECT_MASK_SCENE_INVALID", "Scene hierarchy contains a cycle or repeated node.");
      visited.add(node);
      const treeVisible = parentVisible && node.visible && !node.disposed;
      const layerVisible = options.cameraLayerMask === undefined || (node.layerMask & options.cameraLayerMask) !== 0;
      if (node.renderable) {
        const visible = treeVisible && layerVisible;
        const id = reserve(node.id, visible);
        if (visible) {
          const geometry = lookup(source.geometryLibrary, node.renderable.geometry);
          const material = lookup(source.materialLibrary, node.renderable.material);
          if (!geometry || !material) {
            throw new ObjectMaskError("OBJECT_MASK_RESOURCE_MISSING", `Node ${node.id} references missing geometry or material.`);
          }
          add({
            geometry, material, label: node.name, modelMatrix: node.transform.worldMatrix,
            renderOrder: node.renderOrder,
            ...(node.renderable.skinning ? { skinning: node.renderable.skinning } : {}),
            ...(node.renderable.morphWeights.length ? { morphWeights: node.renderable.morphWeights } : {}),
            ...(node.renderable.instanceTransforms ? { instanceTransforms: node.renderable.instanceTransforms } : {}),
            ...(node.onBeforeRender ? { onBeforeRender: () => node.onBeforeRender!(undefined, node) } : {})
          }, id);
        }
      }
      for (const child of node.children) visit(child, treeVisible);
    };
    visit(source.scene.root, true);
  }
  const items = [...(source.collectRenderItems?.() ?? []), ...(source.renderItems ?? [])];
  items.forEach((item, index) => {
    const visible = options.cameraLayerMask === undefined || item.layerMask === undefined || (item.layerMask & options.cameraLayerMask) !== 0;
    const id = reserve(item.label ?? `item:${index}`, visible);
    if (visible) add(item, id);
  });
  draws.sort((a, b) => a.order - b.order || a.sequence - b.sequence);

  const previous = device.getRenderTarget();
  let target: RenderTarget | undefined;
  let shader: RenderShaderProgram | undefined;
  let targetTouched = false;
  let frameStarted = false;
  const disabledCapabilities: number[] = [];
  let failed = false;
  let failure: unknown;
  let result: ObjectMaskResult | undefined;
  const cleanupErrors: unknown[] = [];
  const cleanup = (action: () => void): void => { try { action(); } catch (error) { cleanupErrors.push(error); } };
  try {
    target = device.createRenderTarget({ label: "native-object-mask", width, height, format: "rgba8", depth: "renderbuffer", sampleCount: 1 });
    if (target.width !== width || target.height !== height || (target.sampleCount ?? 1) !== 1 || target.colorTexture.format !== "rgba8" || target.colorTexture.colorSpace !== "linear") {
      throw new ObjectMaskError("OBJECT_MASK_TARGET_UNSUPPORTED", "Device did not create a single-sample linear RGBA8 target.");
    }
    shader = device.createShaderProgram({
      label: "native-object-mask", marker: MASK_MARKER,
      vertex: `#version 300 es\n// ${MASK_MARKER}\nin vec3 a_position;\nuniform mat4 u_maskMvp;\nvoid main() { gl_Position = u_maskMvp * vec4(a_position, 1.0); }`,
      fragment: `#version 300 es\n// ${MASK_MARKER}\nprecision highp float;\nuniform vec4 u_maskId;\nout vec4 outColor;\nvoid main() { outColor = u_maskId; }`
    });
    targetTouched = true;
    device.setRenderTarget(target);
    device.beginFrame(width, height);
    frameStarted = true;
    if (device.kind === "webgl2") {
      const gl = options.webgl2Context!;
      // The native command state controls alpha-to-coverage, but the device
      // does not expose these other context states. Preserve them explicitly.
      for (const capability of [gl.DITHER, gl.RASTERIZER_DISCARD, gl.SAMPLE_COVERAGE]) {
        if (gl.isEnabled(capability)) {
          disabledCapabilities.push(capability);
          gl.disable(capability);
        }
      }
    }
    device.clear([0, 0, 0, 0]);
    for (const draw of draws) {
      const geometry = draw.item.geometry;
      const vertexBuffers = geometry.uploadVertexBuffers(device);
      const vertexBuffer = vertexBuffers[0];
      if (!vertexBuffer) throw new ObjectMaskError("OBJECT_MASK_RESOURCE_MISSING", "Geometry has no primary vertex buffer.");
      const indexBuffer = geometry.indexBuffer?.upload(device);
      const rgba = encodeObjectMaskId(draw.id);
      const command: DrawCommand = {
        label: `object-mask:${draw.id}:${draw.item.label ?? "object"}`,
        topology: "triangles", vertexBuffer, vertexBuffers, vertexFormat: geometry.vertexBuffer.format,
        vertexCount: indexBuffer ? geometry.vertexBuffer.vertexCount : draw.count,
        ...(!indexBuffer && draw.start ? { firstVertex: draw.start } : {}),
        ...(indexBuffer ? { indexBuffer, indexType: geometry.indexBuffer!.type, indexCount: draw.count, ...(draw.start ? { firstIndex: draw.start } : {}) } : {}),
        shader,
        uniforms: new Map<string, UniformValue>([["u_maskMvp", draw.matrix], ["u_maskId", rgba.map((value) => value / 255)]]),
        renderState: { depthTest: true, depthWrite: true, depthCompare: "less-equal", cullMode: draw.cullMode, blend: false, alphaToCoverage: false, colorWrite: [true, true, true, true] }
      };
      device.draw(command);
    }
    const rgba = device.readPixels(0, 0, width, height);
    if (rgba.length !== width * height * 4) throw new ObjectMaskError("OBJECT_MASK_READBACK_INVALID", "Readback byte count does not match target dimensions.");
    const ids = decodeObjectMaskPixels(rgba);
    const allowed = new Set(draws.map((draw) => draw.id));
    for (const id of ids) if (id !== 0 && !allowed.has(id)) throw new ObjectMaskError("OBJECT_MASK_READBACK_INVALID", `Readback contains unsubmitted object ID ${id}.`);
    result = { backend: device.kind, width, height, origin: "bottom-left", rgba, ids, objects };
  } catch (error) {
    failed = true;
    failure = error;
  } finally {
    if (frameStarted) cleanup(() => device.endFrame());
    if (targetTouched) cleanup(() => device.setRenderTarget(previous));
    for (const capability of disabledCapabilities.reverse()) cleanup(() => options.webgl2Context!.enable(capability));
    if (shader) cleanup(() => shader!.dispose());
    if (target) cleanup(() => target!.dispose());
  }
  if (cleanupErrors.length) throw new AggregateError(failed ? [failure, ...cleanupErrors] : cleanupErrors, "Object-mask capture cleanup failed.");
  if (failed) throw failure;
  return result!;
}

function validateSize(width: number, height: number): void {
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width <= 0 || height <= 0 || width > MAX_MASK_PIXELS || height > Math.floor(MAX_MASK_PIXELS / width)) {
    throw new ObjectMaskError("OBJECT_MASK_SIZE_INVALID", `Dimensions must be positive integers with at most ${MAX_MASK_PIXELS} pixels.`);
  }
}

function lookup<T>(library: ReadonlyMap<string, T> | Readonly<Record<string, T>> | undefined, key: string): T | undefined {
  if (!library) return undefined;
  return library instanceof Map ? library.get(key) : (library as Readonly<Record<string, T>>)[key];
}

function prepareDraws(item: RenderItem, id: number, viewProjection: Float32Array, nextSequence: () => number): PreparedDraw[] {
  const geometry = item.geometry;
  const label = item.label ?? `ID ${id}`;
  const unsupported = (reason: string): never => { throw new ObjectMaskError("OBJECT_MASK_DRAW_UNSUPPORTED", `${label}: ${reason}.`); };
  if (geometry.topology !== "triangles") unsupported("only triangle geometry is supported");
  if (item.skinning || item.morphTargets?.length || item.morphWeights?.length) unsupported("skinning and morph deformation are unsupported");
  if (item.instanceAttributes?.length || geometry.vertexBuffer.format.streams.some((stream) => stream.stepMode === "instance")) unsupported("instance-rate vertex streams are unsupported");
  if (item.onBeforeRender) unsupported("draw callbacks are unsupported");
  if (item.renderOrder !== undefined && !Number.isFinite(item.renderOrder)) unsupported("render order must be finite");
  if ((item as RenderItem & { globalClipping?: unknown }).globalClipping || (item as RenderItem & { materialClipping?: unknown }).materialClipping) unsupported("clipping is unsupported");
  if (item.lodFade !== undefined || item.cameraFade !== undefined) unsupported("faded geometry is unsupported");
  const position = geometry.vertexBuffer.format.attributes.find((attribute) => attribute.semantic === "position");
  if (!position || position.components !== 3 || position.integer || position.shaderName !== "a_position") unsupported("position attribute must be a floating shader vec3 named a_position");
  const state = materialState(item.material, unsupported);
  const model = matrix(item.modelMatrix ?? IDENTITY, `${label} modelMatrix`);
  // The native renderer resolves the supplied frame camera against modelMatrix
  // even when a raw item also happens to carry an older projected matrix.
  const baseMvp = multiply(viewProjection, model);
  // Some native generated shaders apply this matrix, while legacy shaders do
  // not. A frame snapshot currently carries no indication of which ran.
  if (item.geometryMatrix && !Array.from(item.geometryMatrix).every((value, index) => value === IDENTITY[index])) unsupported("non-identity geometryMatrix requires the active shader variant");
  const geometryMatrix = matrix(item.geometryMatrix ?? IDENTITY, `${label} geometryMatrix`);
  const { start, count } = drawRange(geometry, item.drawRange);
  if (count === 0) return [];
  const source = item.instanceTransforms;
  const values = source ? Array.from(source) : undefined;
  if (values && (values.length % 16 !== 0 || !values.every(Number.isFinite))) unsupported("instance transforms must contain finite mat4 values");
  if (item.instanceCount !== undefined && (!Number.isSafeInteger(item.instanceCount) || item.instanceCount < 0 || (source ? item.instanceCount !== source.length / 16 : item.instanceCount !== 1))) unsupported("instance count does not match matrix transforms");
  const instances = values ? Array.from({ length: values.length / 16 }, (_, index) => matrix(values.slice(index * 16, index * 16 + 16), `${label} instance`)) : [matrix(IDENTITY, "identity")];
  return instances.map((instance) => {
    const world = multiply(model, instance);
    const cullMode = determinant3(world) < -1e-8 && state !== "none" ? (state === "back" ? "front" : "back") : state;
    return { id, item, matrix: multiply(multiply(baseMvp, instance), geometryMatrix), cullMode, start, count, order: item.renderOrder ?? 0, sequence: nextSequence() };
  });
}

function materialState(material: RenderMaterial | undefined, unsupported: (reason: string) => never): "none" | "back" | "front" {
  if (!material) return "back";
  const base = "baseMaterial" in material ? material.baseMaterial : material;
  if (base.disposed || !["aura3d/unlit", "aura3d/instanced-unlit", "aura3d/textured-unlit", "aura3d/pbr-direct", "aura3d/instanced-pbr", "aura3d/pbr-normal-map", "aura3d/pbr-textured"].includes(base.shaderKey)) unsupported("custom or disposed materials are unsupported");
  const state = base.renderState;
  if (!state.depthTest || !state.depthWrite || state.depthCompare !== "less-equal" || (state.depthCompareV2 && state.depthCompareV2 !== "less-equal") || state.blend || (state.blendMode && state.blendMode !== "opaque") || state.alphaToCoverage || state.scissor || state.stencil || state.polygonOffset || state.colorWrite.some((enabled) => !enabled)) unsupported("material depth, blending or raster state is unsupported");
  if ((base as typeof base & { clipping?: unknown }).clipping) unsupported("material clipping is unsupported");
  for (const name of ["u_alphaCutoff", "u_transmissionFactor", "u_diffuseTransmissionFactor", "u_volumeThicknessFactor"]) {
    const value = material.getParameter(name);
    if (typeof value === "number" && value > 0) unsupported(`${name} is unsupported`);
  }
  return state.cullMode;
}

function drawRange(geometry: Geometry, override: RenderItem["drawRange"]): { start: number; count: number } {
  const available = geometry.indexBuffer?.count ?? geometry.vertexBuffer.vertexCount;
  const authored = geometry.drawRange;
  if (authored && (!Number.isSafeInteger(authored.start) || authored.start < 0 || !Number.isSafeInteger(authored.count) || authored.count < 0)) throw new ObjectMaskError("OBJECT_MASK_DRAW_RANGE_INVALID", "Geometry draw range must contain nonnegative integers.");
  if (override && (!Number.isSafeInteger(override.start) || override.start < 0 || !Number.isSafeInteger(override.count) || override.count <= 0 || override.start + override.count > available)) throw new ObjectMaskError("OBJECT_MASK_DRAW_RANGE_INVALID", "Render-item draw range is outside its geometry.");
  const start = Math.max(authored?.start ?? 0, override?.start ?? 0);
  const end = Math.min(available, authored ? authored.start + authored.count : available, override ? override.start + override.count : available);
  return { start, count: Math.max(0, end - start) };
}

function matrix(value: ArrayLike<number>, field: string): Float32Array {
  if (value.length !== 16 || !Array.from(value).every(Number.isFinite)) throw new ObjectMaskError("OBJECT_MASK_MATRIX_INVALID", `${field} must be a finite mat4.`);
  const result = Float32Array.from(value);
  if (!result.every(Number.isFinite)) throw new ObjectMaskError("OBJECT_MASK_MATRIX_INVALID", `${field} exceeds float32 range.`);
  return result;
}
function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array {
  const result = new Float32Array(16);
  for (let column = 0; column < 4; column += 1) for (let row = 0; row < 4; row += 1) {
    let sum = 0;
    for (let k = 0; k < 4; k += 1) sum += a[k * 4 + row]! * b[column * 4 + k]!;
    result[column * 4 + row] = sum;
  }
  if (!result.every(Number.isFinite)) throw new ObjectMaskError("OBJECT_MASK_MATRIX_INVALID", "Matrix multiplication exceeds float32 range.");
  return result;
}
function determinant3(m: ArrayLike<number>): number {
  return m[0]! * (m[5]! * m[10]! - m[9]! * m[6]!) - m[4]! * (m[1]! * m[10]! - m[9]! * m[2]!) + m[8]! * (m[1]! * m[6]! - m[5]! * m[2]!);
}
