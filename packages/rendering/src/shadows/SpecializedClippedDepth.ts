import { invertMat4, multiplyMat4, type Mat4 } from "@aura3d/scene";
import { clippingRetainsPoint, type ClippingBinding } from "../ClippingPlanes";
import { Geometry } from "../Geometry";
import { IndexBuffer } from "../IndexBuffer";
import { VertexBuffer } from "../VertexBuffer";
import { VertexFormat } from "../VertexFormat";
import { RenderDeviceError } from "../RenderDevice";
import type { RenderItem } from "../contracts/renderItem";

/**
 * Depth and shadow submission for clipped specialized primitives.
 *
 * Forward rendering clips these primitives with their own semantics, and the
 * depth submission must reproduce the same retained set:
 *
 * - points are retained or removed as a whole by their unexpanded source
 *   centre (a point primitive has one vertex, so every fragment of the forward
 *   point sees the centre). The depth pass removes clipped points on the CPU
 *   and submits the retained points through the ordinary point depth draw.
 * - billboard sprites are expanded in the scene camera's view space and
 *   clipped per fragment by the expanded corner's world (and object) position.
 *   The depth pass performs the same expansion on the CPU from the raster
 *   camera that drew the sprite, emits the corners in object space and clips
 *   them per fragment with the ordinary clipped depth program. Interpolating a
 *   world-linear attribute over each planar triangle is projection independent,
 *   so the light's raster removes exactly the forward fragments' positions.
 * - screen-space lines use the specialized line depth program, which keeps the
 *   forward scene-camera expansion and clipping and only replaces the final
 *   projection (see `createSpecializedLineDepthShader`).
 *
 * Sprites and lines face the scene camera; their shape in a light's depth map
 * is that camera-facing shape, so the item must carry the raster camera
 * (`RenderItem.clippingRasterCamera`) that drew it.
 */

export interface ClippingRasterCamera {
  readonly view: Mat4;
  readonly viewInverse: Mat4;
  readonly projection: Mat4;
}

export type SpecializedClippedPrimitive = "point" | "sprite" | "line";

const IDENTITY: Mat4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function finiteMatrix(value: unknown): Mat4 | undefined {
  if (!(value instanceof Float32Array) && !Array.isArray(value)) return undefined;
  if (value.length !== 16) return undefined;
  const matrix = Array.from(value as ArrayLike<number>) as Mat4;
  return matrix.every(Number.isFinite) ? matrix : undefined;
}

/** Invert a finite affine matrix, or return undefined for a singular or non-affine one. */
export function invertAffineMat4(value: unknown): Mat4 | undefined {
  const matrix = finiteMatrix(value);
  if (!matrix || matrix[3] !== 0 || matrix[7] !== 0 || matrix[11] !== 0 || matrix[15] !== 1) return undefined;
  const [a, b, c, , d, e, f, , g, h, i] = matrix;
  const determinant = a! * (e! * i! - f! * h!) - d! * (b! * i! - c! * h!) + g! * (b! * f! - c! * e!);
  const scale = Math.max(...matrix.slice(0, 11).map(Math.abs), 1e-30);
  // Relative test: a nearly singular basis cannot be reconstructed reliably.
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= 1e-12 * scale * scale * scale) return undefined;
  const inverse = invertMat4(matrix);
  return inverse.every(Number.isFinite) ? inverse : undefined;
}

function transform4(matrix: Readonly<Mat4>, x: number, y: number, z: number, w: number): [number, number, number, number] {
  return [
    matrix[0]! * x + matrix[4]! * y + matrix[8]! * z + matrix[12]! * w,
    matrix[1]! * x + matrix[5]! * y + matrix[9]! * z + matrix[13]! * w,
    matrix[2]! * x + matrix[6]! * y + matrix[10]! * z + matrix[14]! * w,
    matrix[3]! * x + matrix[7]! * y + matrix[11]! * z + matrix[15]! * w
  ];
}

function isIdentity(value: Float32Array | readonly number[] | undefined): boolean {
  return value === undefined || (value.length === 16 && Array.from(value).every((entry, index) => entry === IDENTITY[index]));
}

/** The specialized clipping semantics an item's depth submission requires, if any. */
export function specializedClippedPrimitive(
  item: RenderItem,
  lineShaderKey: string
): SpecializedClippedPrimitive | undefined {
  const base = item.material && "baseMaterial" in item.material ? (item.material as { baseMaterial: { shaderKey: string } }).baseMaterial : item.material;
  if (base?.shaderKey === lineShaderKey) return "line";
  if (item.material?.getParameter("u_spriteMode") === 1) return "sprite";
  if (item.geometry.topology === "points") return "point";
  return undefined;
}

/** Validate the item's recorded raster camera (sprites and screen-space lines). */
export function resolveClippingRasterCamera(item: RenderItem): ClippingRasterCamera {
  const camera = item.clippingRasterCamera;
  const view = finiteMatrix(camera?.viewMatrix);
  const projection = finiteMatrix(camera?.projectionMatrix);
  if (!camera || !view || !projection) {
    throw new RenderDeviceError("Clipped camera-facing depth geometry requires the raster camera that drew it",
      "DEPTH_CLIPPING_RASTER_CAMERA_REQUIRED", { label: item.label });
  }
  const viewInverse = invertAffineMat4(view);
  if (!viewInverse) {
    throw new RenderDeviceError("Clipped camera-facing depth geometry requires a finite, affine and invertible view",
      "DEPTH_CLIPPING_RASTER_CAMERA_REQUIRED", { label: item.label });
  }
  return { view, viewInverse, projection };
}

/** Reject the clipped specialized cases that the depth expansion does not reproduce. */
export function assertSpecializedClippedDepthItem(item: RenderItem, primitive: SpecializedClippedPrimitive, clip: ClippingBinding): void {
  const reject = (reason: string): never => {
    throw new RenderDeviceError(`Clipped ${primitive} depth does not support ${reason}`, "DEPTH_CLIPPING_SPECIALIZED_GEOMETRY_UNSUPPORTED", { label: item.label, reason });
  };
  if (item.instanceTransforms !== undefined || (item.instanceCount !== undefined && item.instanceCount !== 1)
    || item.geometry.vertexBuffer.format.streams.some((stream) => stream.stepMode === "instance")
    || item.instanceAttributes !== undefined) reject("instancing");
  if (item.skinning !== undefined || item.morphTargets !== undefined || item.morphWeights !== undefined) reject("deformation");
  if (!isIdentity(item.geometryMatrix)) reject("a geometry transform");
  const model = finiteMatrix(item.modelMatrix ?? IDENTITY);
  if (!model) reject("a non-finite model transform");
  const local = clip.groups.some((group) => group.space === "local");
  if (primitive === "point") return;
  resolveClippingRasterCamera(item);
  if (primitive === "sprite" && local && !invertAffineMat4(model)) {
    throw new RenderDeviceError("Clipped sprite depth requires a finite, affine and invertible local transform",
      "DEPTH_CLIPPING_SPRITE_TRANSFORM", { label: item.label });
  }
}

function drawIndices(geometry: Geometry, range: { readonly start: number; readonly count: number }): number[] {
  const indices: number[] = [];
  if (geometry.indexBuffer) {
    const data = geometry.indexBuffer.data;
    for (let index = range.start; index < range.start + range.count; index += 1) indices.push(data[index]!);
  } else {
    for (let index = range.start; index < range.start + range.count; index += 1) indices.push(index);
  }
  return indices;
}

/**
 * Remove clipped points by their source centre. Returns undefined when no
 * point is retained, otherwise an independent indexed point geometry that the
 * caller owns and must dispose.
 */
export function retainClippedPoints(
  item: RenderItem,
  clip: ClippingBinding,
  range: { readonly start: number; readonly count: number }
): Geometry | undefined {
  const geometry = item.geometry;
  const model = finiteMatrix(item.modelMatrix ?? IDENTITY)!;
  const positions = geometry.getAttributeBuffer("position");
  const retained: number[] = [];
  for (const vertex of drawIndices(geometry, range)) {
    const [x = 0, y = 0, z = 0] = positions.getDecodedAttribute(vertex, "position");
    const world = transform4(model, x, y, z, 1);
    if (!(world[3] > 0) || !world.every(Number.isFinite)) continue;
    const worldPoint: [number, number, number] = [world[0] / world[3], world[1] / world[3], world[2] / world[3]];
    if (!worldPoint.every(Number.isFinite)) continue;
    if (clippingRetainsPoint(clip, worldPoint, [x, y, z])) retained.push(vertex);
  }
  if (retained.length === 0) return undefined;
  const format = geometry.vertexBuffer.format;
  const buffers: VertexBuffer[] = [];
  let index: IndexBuffer | null = null;
  try {
    for (const stream of format.streams) {
      const source = geometry.getVertexBuffer(stream.slot);
      const copy = new VertexBuffer(format, source.vertexCount, stream.slot);
      new Uint8Array(copy.data).set(new Uint8Array(source.data));
      buffers.push(copy);
    }
    const vertexCount = geometry.vertexBuffer.vertexCount;
    index = new IndexBuffer(vertexCount > 0xffff ? Uint32Array.from(retained) : retained, vertexCount);
    return new Geometry(buffers[0]!, index, "points", undefined, buffers.slice(1));
  } catch (error) {
    for (const buffer of buffers) buffer.dispose();
    index?.dispose();
    throw error;
  }
}

/**
 * Expand a clipped billboard sprite exactly as the generated forward sprite
 * vertex stage does: offset in the raster camera's view space, scaled by the
 * model's x/y basis lengths (and by -viewZ for a perspective sprite without
 * size attenuation), rotated in the screen plane about the anchor. Corners are
 * returned in object space with the original model when it is invertible
 * (local clipping then reads the same object coordinates as forward), and in
 * world space with an identity model otherwise (world-only clipping).
 * The caller owns and must dispose the returned geometry.
 */
export function expandClippedSprite(
  item: RenderItem,
  camera: ClippingRasterCamera,
  range: { readonly start: number; readonly count: number }
): { readonly geometry: Geometry; readonly modelMatrix: Mat4 } {
  const material = item.material!;
  const model = finiteMatrix(item.modelMatrix ?? IDENTITY)!;
  const modelInverse = invertAffineMat4(model);
  const number = (name: string, fallback: number): number => {
    const value = material.getParameter(name);
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
  };
  const centerValue = material.getParameter("u_spriteCenter");
  const center = (centerValue instanceof Float32Array || Array.isArray(centerValue)) && centerValue.length === 2
    && Array.from(centerValue).every(Number.isFinite) ? [Number(centerValue[0]), Number(centerValue[1])] : [0.5, 0.5];
  const rotation = number("u_spriteRotation", 0);
  const attenuation = number("u_spriteSizeAttenuation", 1);
  const centerView = transform4(camera.view, model[12]!, model[13]!, model[14]!, 1);
  let scaleX = Math.hypot(model[0]!, model[1]!, model[2]!);
  let scaleY = Math.hypot(model[4]!, model[5]!, model[6]!);
  if (attenuation < 0.5 && camera.projection[11]! < -0.5) {
    scaleX *= -centerView[2];
    scaleY *= -centerView[2];
  }
  const cos = Math.cos(rotation), sin = Math.sin(rotation);
  const source = item.geometry;
  const positions = source.getAttributeBuffer("position");
  const vertexCount = source.vertexBuffer.vertexCount;
  const vertices = new VertexBuffer(VertexFormat.P3, vertexCount);
  let index: IndexBuffer | null = null;
  try {
    for (let vertex = 0; vertex < vertexCount; vertex += 1) {
      const [x = 0, y = 0] = positions.getDecodedAttribute(vertex, "position");
      const alignedX = (x - (center[0]! - 0.5)) * scaleX;
      const alignedY = (y - (center[1]! - 0.5)) * scaleY;
      const viewX = centerView[0] + cos * alignedX - sin * alignedY;
      const viewY = centerView[1] + sin * alignedX + cos * alignedY;
      const world = transform4(camera.viewInverse, viewX, viewY, centerView[2], centerView[3]);
      const worldPoint = [world[0] / world[3], world[1] / world[3], world[2] / world[3]] as const;
      const corner = modelInverse ? transform4(modelInverse, worldPoint[0], worldPoint[1], worldPoint[2], 1) : [...worldPoint, 1];
      if (!corner.every(Number.isFinite)) {
        throw new RenderDeviceError("Clipped sprite depth corner is not finite", "DEPTH_CLIPPING_SPRITE_TRANSFORM", { label: item.label });
      }
      vertices.setAttribute(vertex, "position", [corner[0]!, corner[1]!, corner[2]!]);
    }
    index = new IndexBuffer(drawIndices(source, range), vertexCount);
    const geometry = new Geometry(vertices, index, source.topology);
    return { geometry, modelMatrix: modelInverse ? model : [...IDENTITY] as Mat4 };
  } catch (error) {
    vertices.dispose();
    index?.dispose();
    throw error;
  }
}

/** The line program's transforms: the inverse maps an expanded GL clip corner to object space. */
export function clippedLineDepthTransforms(item: RenderItem, camera: ClippingRasterCamera): {
  readonly model: Mat4;
  readonly modelViewProjection: Mat4;
  readonly inverse: Float32Array;
} {
  const model = finiteMatrix(item.modelMatrix ?? IDENTITY)!;
  if (model[3] !== 0 || model[7] !== 0 || model[11] !== 0 || model[15] !== 1) {
    throw new RenderDeviceError("Clipped line depth requires an affine model", "DEPTH_CLIPPING_LINE_TRANSFORM", { label: item.label });
  }
  const modelViewProjection = multiplyMat4(multiplyMat4(camera.projection, camera.view), model);
  const inverse = new Float32Array(invertMat4(modelViewProjection));
  if (!inverse.every(Number.isFinite) || inverse.every((value) => value === 0)) {
    throw new RenderDeviceError("Clipped line depth requires a finite invertible raster transform", "DEPTH_CLIPPING_LINE_TRANSFORM", { label: item.label });
  }
  return { model, modelViewProjection, inverse };
}
