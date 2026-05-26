import { Ray, Vector3 } from "@aura3d/math";
import { invertMat4, type Camera } from "@aura3d/scene";

type Tuple3 = readonly [number, number, number];
type TupleMat4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number
];

export interface PickingRayViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function pickingRayFromCamera(
  camera: Camera,
  screenX: number,
  screenY: number,
  viewport: PickingRayViewport = camera.viewport
): Ray {
  camera.updateCameraMatrices();
  const ndcX = ((screenX - viewport.x) / viewport.width) * 2 - 1;
  const ndcY = 1 - ((screenY - viewport.y) / viewport.height) * 2;
  const inverseViewProjection = invertMat4(camera.viewProjectionMatrix) as TupleMat4;
  const near = transformClip(inverseViewProjection, [ndcX, ndcY, -1]);
  const far = transformClip(inverseViewProjection, [ndcX, ndcY, 1]);
  return new Ray(toVector3(near), toVector3(far).subtract(toVector3(near)));
}

function transformClip(matrix: TupleMat4, point: Tuple3): Tuple3 {
  const x = point[0];
  const y = point[1];
  const z = point[2];
  const w = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
  const invW = Math.abs(w) <= 1e-8 ? 1 : 1 / w;
  return [
    (matrix[0] * x + matrix[4] * y + matrix[8] * z + matrix[12]) * invW,
    (matrix[1] * x + matrix[5] * y + matrix[9] * z + matrix[13]) * invW,
    (matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14]) * invW
  ];
}

function toVector3(value: Tuple3): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}
