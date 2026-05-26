import { ControlVector3 } from "./NativeControlTypes";

export interface ThreeCompatControlEvent {
  readonly type: string;
  readonly delta?: ControlVector3;
}

export interface ThreeCompatControlState {
  readonly target: ControlVector3;
  readonly position: ControlVector3;
  readonly rotation: ControlVector3;
  readonly zoom: number;
  readonly enabled: boolean;
}

export function createDefaultControlState(): ThreeCompatControlState {
  return {
    target: new ControlVector3(),
    position: new ControlVector3(0, 0, 5),
    rotation: new ControlVector3(),
    zoom: 1,
    enabled: true
  };
}
