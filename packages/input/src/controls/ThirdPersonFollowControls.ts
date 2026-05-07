import { type CameraTransformLike, type Vec3Like } from "./ControlTypes";

export interface ThirdPersonFollowControlsOptions {
  readonly offset?: Vec3Like;
  readonly damping?: number;
}

export class ThirdPersonFollowControls {
  enabled = true;
  target?: { readonly position: Vec3Like };
  readonly offset: Vec3Like;
  damping: number;

  constructor(
    private readonly camera: CameraTransformLike,
    target?: { readonly position: Vec3Like },
    options: ThirdPersonFollowControlsOptions = {}
  ) {
    this.target = target;
    this.offset = { ...(options.offset ?? { x: 0, y: 2, z: 6 }) };
    this.damping = options.damping ?? 12;
  }

  update(deltaSeconds: number): void {
    if (!this.enabled || !this.target) return;
    const desired = {
      x: this.target.position.x + this.offset.x,
      y: this.target.position.y + this.offset.y,
      z: this.target.position.z + this.offset.z
    };
    const alpha = 1 - Math.exp(-this.damping * Math.max(0, deltaSeconds));
    this.camera.position.x += (desired.x - this.camera.position.x) * alpha;
    this.camera.position.y += (desired.y - this.camera.position.y) * alpha;
    this.camera.position.z += (desired.z - this.camera.position.z) * alpha;
    this.camera.lookAt?.(this.target.position);
  }

  dispose(): void {
    this.enabled = false;
    this.target = undefined;
  }
}
