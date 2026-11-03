import { Matrix4, Quaternion, Vector3 } from "@aura3d/math";
import { OrthographicCamera, PerspectiveCamera, type Camera } from "@aura3d/scene";
import type { ArcballRay, ArcballViewport } from "../ArcballControls";
import { type CameraTransformLike, type EulerLike, type Vec3Like } from "./ControlTypes";

/** Camera position, target, up, and rays use the camera's parent-local space. */
export interface SceneCameraControlAdapter extends CameraTransformLike {
  readonly camera: Camera;
  readonly position: Vec3Like;
  readonly rotation: EulerLike;
  readonly up: Vec3Like;
  readonly fovYRadians?: number;
  readonly aspect?: number;
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
  zoom?: number;
  near?: number;
  readonly rayFromScreen?: (clientX: number, clientY: number, viewport: ArcballViewport) => ArcballRay;
  /** The optional up is honored; omitting it retains the original look-at behavior. */
  lookAt(target: Vec3Like, up?: Vec3Like): void;
  updateCameraMatrices(): void;
}

export function createSceneCameraControlAdapter(camera: Camera): SceneCameraControlAdapter {
  const euler = quaternionToEuler(camera.transform.rotation);
  const up: Vec3Like = { x: 0, y: 1, z: 0 };
  updateUp(up, camera.transform.rotation);
  const perspective = camera instanceof PerspectiveCamera ? camera : undefined;
  const orthographic = camera instanceof OrthographicCamera ? camera : undefined;
  const projected = perspective ?? orthographic;
  const position = {
    get x(): number {
      return camera.transform.position[0];
    },
    set x(value: number) {
      camera.transform.setPosition(value, camera.transform.position[1], camera.transform.position[2]);
      syncCamera(camera);
    },
    get y(): number {
      return camera.transform.position[1];
    },
    set y(value: number) {
      camera.transform.setPosition(camera.transform.position[0], value, camera.transform.position[2]);
      syncCamera(camera);
    },
    get z(): number {
      return camera.transform.position[2];
    },
    set z(value: number) {
      camera.transform.setPosition(camera.transform.position[0], camera.transform.position[1], value);
      syncCamera(camera);
    }
  };
  const rotation = {
    get x(): number {
      return euler.x;
    },
    set x(value: number) {
      euler.x = value;
      applyEuler(camera, euler);
      updateUp(up, camera.transform.rotation);
    },
    get y(): number {
      return euler.y;
    },
    set y(value: number) {
      euler.y = value;
      applyEuler(camera, euler);
      updateUp(up, camera.transform.rotation);
    },
    get z(): number {
      return euler.z;
    },
    set z(value: number) {
      euler.z = value;
      applyEuler(camera, euler);
      updateUp(up, camera.transform.rotation);
    }
  };

  return {
    camera,
    position,
    rotation,
    up,
    get fovYRadians(): number | undefined { return perspective?.fovYRadians; },
    get aspect(): number | undefined { return perspective?.aspect; },
    get left(): number | undefined { return orthographic?.left; },
    get right(): number | undefined { return orthographic?.right; },
    get top(): number | undefined { return orthographic?.top; },
    get bottom(): number | undefined { return orthographic?.bottom; },
    get zoom(): number | undefined { return orthographic?.zoom; },
    set zoom(value: number | undefined) {
      if (!orthographic || value === undefined) throw new RangeError("Camera adapter zoom requires an orthographic camera.");
      orthographic.zoom = value;
    },
    get near(): number | undefined { return projected?.near; },
    set near(value: number | undefined) {
      if (!projected || value === undefined) throw new RangeError("Camera adapter near requires a perspective or orthographic camera.");
      projected.near = value;
    },
    rayFromScreen: projected
      ? (x, y, viewport) => cameraRayFromScreen(camera, x, y, viewport, !!orthographic)
      : undefined,
    lookAt(target: Vec3Like, requestedUp?: Vec3Like): void {
      const origin = new Vector3(camera.transform.position[0], camera.transform.position[1], camera.transform.position[2]);
      const direction = new Vector3(target.x, target.y, target.z).subtract(origin).normalize();
      if (direction.lengthSquared() === 0) return;
      // Preserve the existing one-argument behavior for other controls.
      const q = requestedUp
        ? lookRotation(direction, requestedUp)
        : Quaternion.fromUnitVectors(Vector3.forward, direction);
      camera.transform.setRotation(q.x, q.y, q.z, q.w);
      const nextEuler = quaternionToEuler([q.x, q.y, q.z, q.w]);
      euler.x = nextEuler.x;
      euler.y = nextEuler.y;
      euler.z = nextEuler.z;
      updateUp(up, camera.transform.rotation);
      syncCamera(camera);
    },
    updateCameraMatrices(): void {
      syncCamera(camera);
    }
  };
}

function lookRotation(forward: Vector3, requestedUp: Vec3Like): Quaternion {
  if (![requestedUp.x, requestedUp.y, requestedUp.z].every(Number.isFinite)) {
    throw new RangeError("Camera adapter up must be finite.");
  }
  let right = forward.cross(new Vector3(requestedUp.x, requestedUp.y, requestedUp.z).normalize());
  if (right.lengthSquared() < 1e-24) {
    right = forward.cross(Math.abs(forward.y) < 0.9 ? Vector3.up : Vector3.right);
  }
  right = right.normalize();
  const up = right.cross(forward).normalize();
  const back = forward.negate();
  return Quaternion.fromRotationMatrix(new Matrix4([
    right.x, right.y, right.z, 0,
    up.x, up.y, up.z, 0,
    back.x, back.y, back.z, 0,
    0, 0, 0, 1
  ]));
}

function updateUp(up: Vec3Like, rotation: readonly [number, number, number, number]): void {
  const direction = new Quaternion(...rotation).normalize().rotateVector(Vector3.up);
  up.x = direction.x;
  up.y = direction.y;
  up.z = direction.z;
}

/**
 * Use the current native projection, including film shift, view offsets and
 * depth conventions. The adapter's position and target are parent-local, so
 * transform the unprojected ray by the camera's local, not world, matrix.
 */
function cameraRayFromScreen(
  camera: Camera,
  clientX: number,
  clientY: number,
  viewport: ArcballViewport,
  orthographic: boolean
): ArcballRay {
  if (![clientX, clientY, viewport.left, viewport.top, viewport.width, viewport.height].every(Number.isFinite) ||
      viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError("Camera adapter ray requires finite client coordinates and a positive viewport.");
  }
  camera.updateCameraMatrices();
  const x = (clientX - viewport.left) / viewport.width * 2 - 1;
  const y = 1 - (clientY - viewport.top) / viewport.height * 2;
  // An interior depth avoids the point at infinity of infinite-far cameras.
  const z = camera.projectionMetadata.clipRange === "zero-to-one" ? 0.5 : 0;
  const inverse = camera.projectionMatrixInverse;
  const w = inverse[3] * x + inverse[7] * y + inverse[11] * z + inverse[15];
  if (!Number.isFinite(w) || w === 0) throw new RangeError("Camera adapter cannot unproject this viewport.");
  const point = {
    x: (inverse[0] * x + inverse[4] * y + inverse[8] * z + inverse[12]) / w,
    y: (inverse[1] * x + inverse[5] * y + inverse[9] * z + inverse[13]) / w,
    z: (inverse[2] * x + inverse[6] * y + inverse[10] * z + inverse[14]) / w
  };
  if (![point.x, point.y, point.z].every(Number.isFinite)) {
    throw new RangeError("Camera adapter cannot unproject this viewport.");
  }
  const matrix = camera.transform.localMatrix;
  const transformPoint = (x: number, y: number, z: number): Vec3Like => ({
    x: matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12],
    y: matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13],
    z: matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]
  });
  if (orthographic) {
    return {
      origin: transformPoint(point.x, point.y, 0),
      direction: unitDirection({ x: -matrix[8], y: -matrix[9], z: -matrix[10] })
    };
  }
  const origin = transformPoint(0, 0, 0);
  return {
    origin,
    direction: unitDirection({
      x: matrix[0] * point.x + matrix[4] * point.y + matrix[8] * point.z,
      y: matrix[1] * point.x + matrix[5] * point.y + matrix[9] * point.z,
      z: matrix[2] * point.x + matrix[6] * point.y + matrix[10] * point.z
    })
  };
}

function unitDirection(direction: Vec3Like): Vec3Like {
  const length = Math.hypot(direction.x, direction.y, direction.z);
  if (!Number.isFinite(length) || length === 0) throw new RangeError("Camera adapter ray direction must be finite and non-zero.");
  return { x: direction.x / length, y: direction.y / length, z: direction.z / length };
}

function applyEuler(camera: Camera, euler: EulerLike): void {
  const yaw = Quaternion.fromAxisAngle(Vector3.up, euler.y);
  const pitch = Quaternion.fromAxisAngle(Vector3.right, euler.x);
  const roll = Quaternion.fromAxisAngle(new Vector3(0, 0, 1), euler.z);
  const q = yaw.multiply(pitch).multiply(roll).normalize();
  camera.transform.setRotation(q.x, q.y, q.z, q.w);
  syncCamera(camera);
}

function syncCamera(camera: Camera): void {
  camera.updateCameraMatrices();
}

function quaternionToEuler(rotation: readonly [number, number, number, number]): EulerLike {
  const [x, y, z, w] = rotation;
  const sinPitch = 2 * (w * x - z * y);
  const pitch = Math.abs(sinPitch) >= 1 ? Math.sign(sinPitch) * Math.PI / 2 : Math.asin(sinPitch);
  const yaw = Math.atan2(2 * (w * y + x * z), 1 - 2 * (x * x + y * y));
  const roll = Math.atan2(2 * (w * z + x * y), 1 - 2 * (x * x + z * z));
  return { x: pitch, y: yaw, z: roll };
}
