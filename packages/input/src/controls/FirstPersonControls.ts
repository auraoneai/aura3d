import type { InputSnapshot } from "../InputSnapshot";
import { clamp, type CameraTransformLike } from "./ControlTypes";

export interface FirstPersonControlsOptions {
  readonly moveSpeed?: number;
  readonly lookSpeed?: number;
  readonly minPitch?: number;
  readonly maxPitch?: number;
}

export class FirstPersonControls {
  enabled = true;

  private yaw = 0;
  private pitch = 0;
  private readonly moveSpeed: number;
  private readonly lookSpeed: number;
  private readonly minPitch: number;
  private readonly maxPitch: number;

  constructor(
    private readonly camera: CameraTransformLike,
    options: FirstPersonControlsOptions = {}
  ) {
    this.moveSpeed = options.moveSpeed ?? 1;
    this.lookSpeed = options.lookSpeed ?? 0.002;
    this.minPitch = options.minPitch ?? -Math.PI / 2 + 0.001;
    this.maxPitch = options.maxPitch ?? Math.PI / 2 - 0.001;
    this.pitch = clamp(camera.rotation?.x ?? 0, this.minPitch, this.maxPitch);
    this.yaw = camera.rotation?.y ?? 0;
  }

  update(snapshot: InputSnapshot, deltaSeconds: number): void {
    if (!this.enabled) {
      return;
    }

    if (snapshot.button(0).down) {
      this.yaw -= snapshot.pointer.deltaX * this.lookSpeed;
      this.pitch = clamp(this.pitch - snapshot.pointer.deltaY * this.lookSpeed, this.minPitch, this.maxPitch);
      if (this.camera.rotation) {
        this.camera.rotation.x = this.pitch;
        this.camera.rotation.y = this.yaw;
      }
    }

    const forward = (snapshot.key("KeyW").down ? 1 : 0) - (snapshot.key("KeyS").down ? 1 : 0);
    const strafe = (snapshot.key("KeyD").down ? 1 : 0) - (snapshot.key("KeyA").down ? 1 : 0);
    const step = this.moveSpeed * deltaSeconds;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);

    this.camera.position.x += (strafe * cos + forward * sin) * step;
    this.camera.position.z += (forward * cos - strafe * sin) * step;
  }

  dispose(): void {
    this.enabled = false;
  }
}
