import {
  buildAxesHelper,
  buildBoundsHelper,
  buildCameraFrustumHelper,
  buildDirectionalLightHelper,
  buildGridHelper,
  buildSkeletonHelper,
  type DebugRenderLine,
  type SkeletonHelperJoint
} from "@aura3d/debug";
import type { CameraCompat, OrthographicCameraCompat, PerspectiveCameraCompat } from "../cameras";
import { LineSegmentsCompat, Object3DCompat } from "../core/Object3DCompat";
import { BufferGeometryCompat } from "../geometries";
import type { DirectionalLightCompat } from "../lights";
import { LineBasicMaterialCompat } from "../materials";

type BoundsLike = {
  readonly min?: readonly [number, number, number];
  readonly max?: readonly [number, number, number];
};

export class HelperLineSegmentsCompat extends LineSegmentsCompat {
  override geometry: BufferGeometryCompat;
  override material: LineBasicMaterialCompat;
  readonly lines: readonly DebugRenderLine[];

  constructor(type: string, lines: readonly DebugRenderLine[]) {
    const geometry = lineGeometry(lines);
    const material = new LineBasicMaterialCompat();
    super(geometry, material);
    this.geometry = geometry;
    this.material = material;
    this.type = type;
    this.lines = lines;
  }
}

export class AxesHelperCompat extends HelperLineSegmentsCompat {
  constructor(public size = 1) {
    super("AxesHelper", buildAxesHelper({ size }));
  }
}

export class GridHelperCompat extends HelperLineSegmentsCompat {
  constructor(public size = 10, public divisions = 10) {
    super("GridHelper", buildGridHelper({ size, divisions }));
  }
}

export class BoxHelperCompat extends HelperLineSegmentsCompat {
  constructor(public object: Object3DCompat, public color = 0xffff00) {
    super("BoxHelper", buildBoundsHelper(resolveObjectBounds(object)));
  }
}

export class CameraHelperCompat extends HelperLineSegmentsCompat {
  constructor(public camera: CameraCompat) {
    super("CameraHelper", buildCameraFrustumHelper(resolveCameraFrustum(camera)));
  }
}

export class DirectionalLightHelperCompat extends HelperLineSegmentsCompat {
  constructor(public light: DirectionalLightCompat, public size = 1) {
    super("DirectionalLightHelper", buildDirectionalLightHelper({
      direction: [0, -1, 0],
      origin: [light.position.x, light.position.y, light.position.z],
      length: size
    }));
  }
}

export class SkeletonHelperCompat extends HelperLineSegmentsCompat {
  constructor(public root: Object3DCompat) {
    super("SkeletonHelper", buildSkeletonHelper(collectSkeletonJoints(root)));
  }
}

function lineGeometry(lines: readonly DebugRenderLine[]): BufferGeometryCompat {
  const positions: number[] = [];
  const colors: number[] = [];
  for (const line of lines) {
    positions.push(...line.from, ...line.to);
    colors.push(...line.color, ...line.color);
  }
  return new BufferGeometryCompat()
    .setAttribute("position", { array: positions, itemSize: 3 })
    .setAttribute("color", { array: colors, itemSize: 4 })
    .setDrawRange(0, lines.length * 2);
}

function resolveObjectBounds(object: Object3DCompat): { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } {
  const explicit = object.userData.bounds as BoundsLike | undefined;
  if (isVec3(explicit?.min) && isVec3(explicit?.max)) {
    return { min: explicit.min, max: explicit.max };
  }
  const sx = Math.max(Math.abs(object.scale.x), 1e-6) * 0.5;
  const sy = Math.max(Math.abs(object.scale.y), 1e-6) * 0.5;
  const sz = Math.max(Math.abs(object.scale.z), 1e-6) * 0.5;
  return {
    min: [object.position.x - sx, object.position.y - sy, object.position.z - sz],
    max: [object.position.x + sx, object.position.y + sy, object.position.z + sz]
  };
}

function resolveCameraFrustum(camera: CameraCompat): Parameters<typeof buildCameraFrustumHelper>[0] {
  if (camera.type === "PerspectiveCamera") {
    const perspective = camera as PerspectiveCameraCompat;
    const nearHalfHeight = Math.tan((perspective.fov * Math.PI / 180) * 0.5) * perspective.near;
    const nearHalfWidth = nearHalfHeight * perspective.aspect;
    const farHalfHeight = Math.tan((perspective.fov * Math.PI / 180) * 0.5) * perspective.far;
    const farHalfWidth = farHalfHeight * perspective.aspect;
    return { nearHalfWidth, nearHalfHeight, farHalfWidth, farHalfHeight, nearZ: -perspective.near, farZ: -perspective.far };
  }
  const orthographic = camera as OrthographicCameraCompat;
  return {
    nearHalfWidth: Math.abs(orthographic.right - orthographic.left) * 0.5,
    nearHalfHeight: Math.abs(orthographic.top - orthographic.bottom) * 0.5,
    farHalfWidth: Math.abs(orthographic.right - orthographic.left) * 0.5,
    farHalfHeight: Math.abs(orthographic.top - orthographic.bottom) * 0.5,
    nearZ: -orthographic.near,
    farZ: -orthographic.far
  };
}

function collectSkeletonJoints(root: Object3DCompat): readonly SkeletonHelperJoint[] {
  const joints: SkeletonHelperJoint[] = [];
  root.traverse((object) => {
    joints.push({
      id: object.uuid,
      parentId: object.parent?.uuid,
      position: [object.position.x, object.position.y, object.position.z]
    });
  });
  return joints;
}

function isVec3(value: readonly number[] | undefined): value is readonly [number, number, number] {
  return value?.length === 3 && value.every((component) => Number.isFinite(component));
}
