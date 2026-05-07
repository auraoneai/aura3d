import type { PointerTouch } from "./InputSnapshot";

export interface PointerEventLike {
  readonly clientX: number;
  readonly clientY: number;
  readonly button?: number;
  readonly buttons?: number;
  readonly pointerId?: number;
  preventDefault?(): void;
}

export interface WheelEventLike {
  readonly deltaX: number;
  readonly deltaY: number;
  preventDefault?(): void;
}

export class PointerDevice {
  x = 0;
  y = 0;
  deltaX = 0;
  deltaY = 0;
  wheelX = 0;
  wheelY = 0;

  private readonly buttons = new Set<number>();
  private previousButtons = new Set<number>();
  private readonly touches = new Map<number, PointerTouch>();
  private pixelRatio = 1;

  setDevicePixelRatio(value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error("Device pixel ratio must be positive");
    }
    this.pixelRatio = value;
  }

  move(event: PointerEventLike): void {
    const nextX = event.clientX * this.pixelRatio;
    const nextY = event.clientY * this.pixelRatio;
    this.deltaX += nextX - this.x;
    this.deltaY += nextY - this.y;
    this.x = nextX;
    this.y = nextY;

    if (event.pointerId !== undefined) {
      this.touches.set(event.pointerId, { id: event.pointerId, x: this.x, y: this.y });
    }
  }

  down(event: PointerEventLike): void {
    this.move(event);
    this.buttons.add(event.button ?? 0);
  }

  up(event: PointerEventLike): void {
    this.move(event);
    this.buttons.delete(event.button ?? 0);
    if (event.pointerId !== undefined) {
      this.touches.delete(event.pointerId);
    }
  }

  wheel(event: WheelEventLike): void {
    this.wheelX += event.deltaX;
    this.wheelY += event.deltaY;
  }

  blur(): void {
    this.buttons.clear();
    this.touches.clear();
  }

  snapshotData() {
    const buttonMap = new Map<number, { down: boolean; pressed: boolean; released: boolean }>();
    for (const button of this.buttons) {
      buttonMap.set(button, { down: true, pressed: false, released: false });
    }

    return {
      pointer: {
        x: this.x,
        y: this.y,
        deltaX: this.deltaX,
        deltaY: this.deltaY,
        wheelX: this.wheelX,
        wheelY: this.wheelY,
        buttons: buttonMap,
        touches: [...this.touches.values()]
      },
      previousPointerButtons: new Set(this.previousButtons)
    };
  }

  endFrame(): void {
    this.previousButtons = new Set(this.buttons);
    this.deltaX = 0;
    this.deltaY = 0;
    this.wheelX = 0;
    this.wheelY = 0;
  }
}
