import type { InputSnapshot } from "../InputSnapshot";
import { type CameraTransformLike, clamp } from "./ControlTypes";

export interface EditorFlyControlsOptions {
  readonly baseSpeed?: number;
  readonly fastMultiplier?: number;
  readonly lookSpeed?: number;
}

export class EditorFlyControls {
  enabled = true;
  private yaw = 0;
  private pitch = 0;
  private readonly baseSpeed: number;
  private readonly fastMultiplier: number;
  private readonly lookSpeed: number;

  constructor(
    private readonly camera: CameraTransformLike,
    options: EditorFlyControlsOptions = {}
  ) {
    this.baseSpeed = options.baseSpeed ?? 3;
    this.fastMultiplier = options.fastMultiplier ?? 4;
    this.lookSpeed = options.lookSpeed ?? 0.0025;
    this.pitch = clamp(camera.rotation?.x ?? 0, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
    this.yaw = camera.rotation?.y ?? 0;
  }

  update(snapshot: InputSnapshot, deltaSeconds: number): void {
    if (!this.enabled) return;
    if (snapshot.button(1).down || snapshot.button(2).down) {
      this.yaw -= snapshot.pointer.deltaX * this.lookSpeed;
      this.pitch = clamp(this.pitch - snapshot.pointer.deltaY * this.lookSpeed, -Math.PI / 2 + 0.001, Math.PI / 2 - 0.001);
      if (this.camera.rotation) {
        this.camera.rotation.x = this.pitch;
        this.camera.rotation.y = this.yaw;
      }
    }

    const speed = this.baseSpeed * (snapshot.key("ShiftLeft").down || snapshot.key("ShiftRight").down ? this.fastMultiplier : 1);
    const forward = (snapshot.key("KeyW").down ? 1 : 0) - (snapshot.key("KeyS").down ? 1 : 0);
    const strafe = (snapshot.key("KeyD").down ? 1 : 0) - (snapshot.key("KeyA").down ? 1 : 0);
    const lift = (snapshot.key("KeyE").down ? 1 : 0) - (snapshot.key("KeyQ").down ? 1 : 0);
    const step = speed * deltaSeconds;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.camera.position.x += (strafe * cos + forward * sin) * step;
    this.camera.position.z += (forward * cos - strafe * sin) * step;
    this.camera.position.y += lift * step;
  }

  dispose(): void {
    this.enabled = false;
  }
}
