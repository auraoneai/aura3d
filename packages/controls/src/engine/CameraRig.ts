import type { CameraTransformLike, Vec3Like } from "./ControlTypes";

export interface CameraRigState {
  readonly position: Vec3Like;
  readonly target?: Vec3Like;
}

export class CameraRig {
  constructor(private readonly camera: CameraTransformLike) {}

  apply(state: CameraRigState): void {
    this.camera.position.x = state.position.x;
    this.camera.position.y = state.position.y;
    this.camera.position.z = state.position.z;
    if (state.target) {
      this.camera.lookAt?.(state.target);
    }
  }

  blend(from: CameraRigState, to: CameraRigState, alpha: number): CameraRigState {
    const t = Math.min(1, Math.max(0, alpha));
    return {
      position: {
        x: from.position.x + (to.position.x - from.position.x) * t,
        y: from.position.y + (to.position.y - from.position.y) * t,
        z: from.position.z + (to.position.z - from.position.z) * t
      },
      target:
        from.target && to.target
          ? {
              x: from.target.x + (to.target.x - from.target.x) * t,
              y: from.target.y + (to.target.y - from.target.y) * t,
              z: from.target.z + (to.target.z - from.target.z) * t
            }
          : (to.target ?? from.target)
    };
  }
}
