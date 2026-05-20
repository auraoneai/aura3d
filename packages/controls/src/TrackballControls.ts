import { OrbitControls } from "./OrbitControls";

export type TrackballKey =
  | "ArrowUp"
  | "ArrowDown"
  | "ArrowLeft"
  | "ArrowRight"
  | "KeyQ"
  | "KeyE"
  | "NumpadAdd"
  | "NumpadSubtract"
  | "+"
  | "-"
  | "="
  | "_";

export class TrackballControls extends OrbitControls {
  enableDamping = false;
  dampingFactor = 0.08;
  keyPanSpeed = 0.12;
  keyRollSpeed = 0.06;

  private rotationVelocity = { x: 0, y: 0, z: 0 };
  private panVelocity = { x: 0, y: 0 };
  private dollyVelocity = 0;

  roll(delta: number): void {
    if (!this.state.enabled || !this.enableRotate) return;
    this.state.rotation.z += delta;
    this.rotationVelocity.z += delta;
  }

  override rotate(deltaX: number, deltaY: number): void {
    if (!this.state.enabled || !this.enableRotate) return;
    super.rotate(deltaX, deltaY);
    this.rotationVelocity.x += deltaY;
    this.rotationVelocity.y += deltaX;
  }

  override pan(deltaX: number, deltaY: number): void {
    if (!this.state.enabled || !this.enablePan) return;
    super.pan(deltaX, deltaY);
    this.panVelocity.x += deltaX;
    this.panVelocity.y += deltaY;
  }

  override dolly(scale: number): void {
    if (!this.state.enabled || !this.enableZoom) return;
    super.dolly(scale);
    this.dollyVelocity += scale - 1;
  }

  handleKey(code: TrackballKey): void {
    switch (code) {
      case "ArrowUp":
        this.pan(0, this.keyPanSpeed);
        break;
      case "ArrowDown":
        this.pan(0, -this.keyPanSpeed);
        break;
      case "ArrowLeft":
        this.pan(-this.keyPanSpeed, 0);
        break;
      case "ArrowRight":
        this.pan(this.keyPanSpeed, 0);
        break;
      case "KeyQ":
        this.roll(-this.keyRollSpeed);
        break;
      case "KeyE":
        this.roll(this.keyRollSpeed);
        break;
      case "NumpadAdd":
      case "+":
      case "=":
        this.dolly(0.95);
        break;
      case "NumpadSubtract":
      case "-":
      case "_":
        this.dolly(1.05);
        break;
    }
  }

  update(deltaSeconds = 1 / 60): boolean {
    if (!this.enableDamping) {
      return false;
    }
    const damping = Math.max(0, Math.min(1, this.dampingFactor * deltaSeconds * 60));
    const rotationStep = {
      x: this.rotationVelocity.x * damping,
      y: this.rotationVelocity.y * damping,
      z: this.rotationVelocity.z * damping
    };
    const panStep = {
      x: this.panVelocity.x * damping,
      y: this.panVelocity.y * damping
    };
    const dollyStep = this.dollyVelocity * damping;
    this.state.rotation.x += rotationStep.x;
    this.state.rotation.y += rotationStep.y;
    this.state.rotation.z += rotationStep.z;
    this.state.target.x += panStep.x;
    this.state.target.y += panStep.y;
    this.state.position.z *= 1 + dollyStep;
    this.rotationVelocity.x -= rotationStep.x;
    this.rotationVelocity.y -= rotationStep.y;
    this.rotationVelocity.z -= rotationStep.z;
    this.panVelocity.x -= panStep.x;
    this.panVelocity.y -= panStep.y;
    this.dollyVelocity -= dollyStep;
    return Math.abs(this.rotationVelocity.x) + Math.abs(this.rotationVelocity.y) + Math.abs(this.rotationVelocity.z) +
      Math.abs(this.panVelocity.x) + Math.abs(this.panVelocity.y) + Math.abs(this.dollyVelocity) > 1e-6;
  }
}
