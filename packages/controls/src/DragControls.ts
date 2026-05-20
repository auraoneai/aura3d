import { addVector3, type ControlObject3DLike, type Vector3Like } from "./NativeControlTypes";

export class DragControls {
  dragging: ControlObject3DLike | null = null;

  start(object: ControlObject3DLike): void {
    this.dragging = object;
  }

  drag(delta: Vector3Like): void {
    addVector3(this.dragging?.position, delta);
  }

  end(): void {
    this.dragging = null;
  }
}
