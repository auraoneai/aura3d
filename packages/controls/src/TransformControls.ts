import { addVector3, type ControlObject3DLike, type Vector3Like } from "./NativeControlTypes";

export type TransformControlMode = "translate" | "rotate" | "scale";

export class TransformControls {
  object: ControlObject3DLike | null = null;
  mode: TransformControlMode = "translate";

  attach(object: ControlObject3DLike): void { this.object = object; }
  detach(): void { this.object = null; }
  setMode(mode: TransformControlMode): void { this.mode = mode; }

  apply(delta: Vector3Like): void {
    if (!this.object) return;
    if (this.mode === "translate") addVector3(this.object.position, delta);
    if (this.mode === "rotate") addVector3(this.object.rotation, delta);
    if (this.mode === "scale") addVector3(this.object.scale, delta);
  }
}
