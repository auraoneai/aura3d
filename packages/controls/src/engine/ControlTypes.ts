export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface EulerLike {
  x: number;
  y: number;
  z: number;
}

export interface CameraTransformLike {
  readonly position: Vec3Like;
  readonly rotation?: EulerLike;
  lookAt?(target: Vec3Like): void;
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
