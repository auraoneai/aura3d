import { Object3DCompat } from "../core/Object3DCompat";

export class CameraCompat extends Object3DCompat {
  override type = "Camera";
  near: number;
  far: number;

  constructor(near = 0.1, far = 2000) {
    super();
    this.near = near;
    this.far = far;
  }
}

export class PerspectiveCameraCompat extends CameraCompat {
  override type = "PerspectiveCamera";

  constructor(public fov = 50, public aspect = 1, near = 0.1, far = 2000) {
    super(near, far);
  }

  updateProjectionMatrix(): void {
    if (this.aspect <= 0 || this.fov <= 0 || this.fov >= 180) throw new Error("Invalid PerspectiveCameraCompat projection.");
  }
}

export class OrthographicCameraCompat extends CameraCompat {
  override type = "OrthographicCamera";

  constructor(public left = -1, public right = 1, public top = 1, public bottom = -1, near = 0.1, far = 2000) {
    super(near, far);
  }

  updateProjectionMatrix(): void {
    if (this.left === this.right || this.top === this.bottom) throw new Error("Invalid OrthographicCameraCompat projection.");
  }
}
