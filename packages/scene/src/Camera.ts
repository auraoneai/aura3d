import { ValidationError } from "@aura3d/core";
import { Frustum, type ProjectionOptions } from "@aura3d/math";
import { identityMat4, invertMat4, multiplyMat4, resolveProjectionOptions, toMathMat4, type Mat4, type PlaneTuple } from "./MathTypes.js";
import { SceneNode } from "./SceneNode.js";

export interface CameraViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rectangle in a larger image; x and y are measured from its top-left corner. */
export interface CameraViewOffset {
  fullWidth: number;
  fullHeight: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The convention used to produce the currently published projection matrix. */
export interface CameraProjectionMetadata extends Required<ProjectionOptions> {
  kind: "custom" | "perspective" | "orthographic";
  /** Custom cameras may have no finite near/far interpretation. */
  near?: number;
  far?: number;
  viewOffset?: CameraViewOffset;
}

export abstract class Camera extends SceneNode {
  viewport: CameraViewport = { x: 0, y: 0, width: 1, height: 1 };
  readonly frustumPlanes: PlaneTuple[] = [];
  frustum: Frustum = Frustum.fromMatrix(toMathMat4(identityMat4()));
  projectionMatrix: Mat4;
  projectionMatrixInverse: Mat4;
  viewMatrix: Mat4;
  viewProjectionMatrix: Mat4;
  depth: Required<ProjectionOptions>;
  viewOffset?: CameraViewOffset;
  projectionMetadata!: CameraProjectionMetadata;

  protected constructor(name: string, id?: string, depth?: ProjectionOptions, viewOffset?: CameraViewOffset) {
    super({ id, name });
    this.projectionMatrix = identityMat4();
    this.projectionMatrixInverse = identityMat4();
    this.viewMatrix = this.transform.inverseWorldMatrix;
    this.viewProjectionMatrix = multiplyMat4(this.projectionMatrix, this.viewMatrix);
    this.depth = resolveProjectionOptions(depth);
    this.viewOffset = viewOffset === undefined ? undefined : validateCameraViewOffset(viewOffset);
  }

  abstract computeProjectionMatrix(): Mat4;

  /** Override for custom cameras with explicit projection metadata. */
  protected getProjectionDetails(): Pick<CameraProjectionMetadata, "kind" | "near" | "far"> {
    return { kind: "custom" };
  }

  /** Custom projections may opt in after implementing depth and view-offset handling. */
  protected supportsProjectionControls(): boolean { return false; }

  updateCameraMatrices(): void {
    updateAncestors(this);
    this.updateWorldTransform();
    const depth = resolveProjectionOptions(this.depth);
    if (!this.supportsProjectionControls() && (depth.mode !== "standard" || depth.clipRange !== "minus-one-to-one" || this.viewOffset)) {
      throw new ValidationError("CAMERA_PROJECTION_OPTIONS", "Custom camera must implement projection controls before using depth or view offsets.");
    }
    const projectionMatrix = this.computeProjectionMatrix();
    const projectionMatrixInverse = invertMat4(projectionMatrix);
    const viewMatrix = this.transform.inverseWorldMatrix;
    const viewProjectionMatrix = multiplyMat4(projectionMatrix, viewMatrix);
    const details = this.getProjectionDetails();
    const infiniteFar = details.far === Infinity;
    const frustum = Frustum.setFromProjectionMatrix(
      toMathMat4(viewProjectionMatrix), depth.clipRange === "zero-to-one" ? "webgpu" : "webgl", depth.mode === "reversed", infiniteFar
    );
    const frustumPlanes: PlaneTuple[] = frustum.activePlanes.map((plane) => [plane.normal.x, plane.normal.y, plane.normal.z, plane.constant]);
    // Publish the matrix, inverse, metadata and culling planes as a coherent set.
    this.projectionMatrix = projectionMatrix;
    this.projectionMatrixInverse = projectionMatrixInverse;
    this.viewMatrix = viewMatrix;
    this.viewProjectionMatrix = viewProjectionMatrix;
    this.frustum = frustum;
    this.frustumPlanes.splice(0, this.frustumPlanes.length, ...frustumPlanes);
    this.projectionMetadata = {
      ...details, ...depth,
      ...(this.viewOffset ? { viewOffset: { ...this.viewOffset } } : {})
    };
  }

  setDepth(options: ProjectionOptions): void {
    if (!this.supportsProjectionControls()) throw new ValidationError("CAMERA_PROJECTION_OPTIONS", "Custom camera must implement projection controls before changing depth.");
    const previous = this.depth;
    this.depth = resolveProjectionOptions({ ...previous, ...options });
    try { this.updateCameraMatrices(); } catch (error) { this.depth = previous; throw error; }
  }

  setViewOffset(offset: CameraViewOffset): void;
  setViewOffset(fullWidth: number, fullHeight: number, x: number, y: number, width: number, height: number): void;
  setViewOffset(offsetOrWidth: CameraViewOffset | number, fullHeight?: number, x?: number, y?: number, width?: number, height?: number): void {
    if (!this.supportsProjectionControls()) throw new ValidationError("CAMERA_PROJECTION_OPTIONS", "Custom camera must implement projection controls before changing view offset.");
    const offset = typeof offsetOrWidth === "number"
      ? { fullWidth: offsetOrWidth, fullHeight: fullHeight!, x: x!, y: y!, width: width!, height: height! }
      : offsetOrWidth;
    const previous = this.viewOffset;
    this.viewOffset = validateCameraViewOffset(offset);
    try { this.updateCameraMatrices(); } catch (error) { this.viewOffset = previous; throw error; }
  }

  clearViewOffset(): void {
    const previous = this.viewOffset;
    this.viewOffset = undefined;
    try { this.updateCameraMatrices(); } catch (error) { this.viewOffset = previous; throw error; }
  }

  setViewport(viewport: CameraViewport): void {
    if (![viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0) throw new ValidationError("CAMERA_VIEWPORT", "Camera viewport coordinates must be finite and dimensions positive.");
    this.viewport = { ...viewport };
  }
}

export function validateCameraViewOffset(offset: CameraViewOffset): CameraViewOffset {
  const { fullWidth, fullHeight, x, y, width, height } = offset;
  if (![fullWidth, fullHeight, x, y, width, height].every(Number.isFinite) ||
      fullWidth <= 0 || fullHeight <= 0 || width <= 0 || height <= 0 || x < 0 || y < 0 ||
      x + width > fullWidth || y + height > fullHeight) {
    throw new ValidationError("CAMERA_VIEW_OFFSET", "Camera view offset must be a finite positive rectangle inside the full image.");
  }
  return { fullWidth, fullHeight, x, y, width, height };
}

/** Crop a camera-space rectangle to its view tile, measured from the image's top left. */
export function applyCameraViewOffset(left: number, right: number, bottom: number, top: number, offset?: CameraViewOffset): [number, number, number, number] {
  if (!offset) return [left, right, bottom, top];
  const { fullWidth, fullHeight, x, y, width, height } = validateCameraViewOffset(offset);
  const spanX = right - left;
  const spanY = top - bottom;
  return [left + spanX * x / fullWidth, left + spanX * (x + width) / fullWidth,
    top - spanY * (y + height) / fullHeight, top - spanY * y / fullHeight];
}

function updateAncestors(node: SceneNode): void {
  const ancestors: SceneNode[] = [];
  let parent = node.parent;
  while (parent) {
    ancestors.unshift(parent);
    parent = parent.parent;
  }
  for (const ancestor of ancestors) {
    ancestor.transform.updateWorld(ancestor.parent?.transform.worldMatrix);
  }
}
