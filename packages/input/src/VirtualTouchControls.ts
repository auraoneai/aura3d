export interface VirtualJoystickConfig {
  readonly center: readonly [number, number];
  readonly radius: number;
  readonly deadZone?: number;
  readonly maxDistance?: number;
  readonly fixed?: boolean;
  readonly returnToCenter?: boolean;
}

export interface VirtualTouchPoint {
  readonly id: number;
  readonly x: number;
  readonly y: number;
}

export interface VirtualTouchJoystickSnapshot {
  readonly source: "origin-master-touch-joystick-virtual-input-adapted";
  readonly active: boolean;
  readonly activeTouchId: number | null;
  readonly center: readonly [number, number];
  readonly stick: readonly [number, number];
  readonly value: readonly [number, number];
  readonly magnitude: number;
  readonly deadZone: number;
  readonly consumedTouches: number;
  readonly evidence: {
    readonly oldCodebasePort: true;
    readonly virtualJoystick: boolean;
    readonly deadZone: boolean;
    readonly clampedMagnitude: boolean;
    readonly returnToCenter: boolean;
    readonly floatingCenter: boolean;
  };
}

export class VirtualTouchJoystick {
  private readonly initialCenter: readonly [number, number];
  private readonly radius: number;
  private readonly deadZone: number;
  private readonly maxDistance: number;
  private readonly fixed: boolean;
  private readonly returnToCenter: boolean;
  private centerRef: readonly [number, number];
  private stickRef: readonly [number, number];
  private valueRef: readonly [number, number] = [0, 0];
  private activeTouchId: number | null = null;
  private active = false;
  private consumedTouches = 0;

  constructor(config: VirtualJoystickConfig) {
    this.initialCenter = config.center;
    this.centerRef = config.center;
    this.stickRef = config.center;
    this.radius = positive(config.radius, 64);
    this.deadZone = clamp(config.deadZone ?? 0.15, 0, 0.95);
    this.maxDistance = positive(config.maxDistance, this.radius * 0.8);
    this.fixed = config.fixed ?? true;
    this.returnToCenter = config.returnToCenter ?? true;
  }

  touchStart(touch: VirtualTouchPoint): boolean {
    if (this.activeTouchId !== null) return false;
    if (distance([touch.x, touch.y], this.centerRef) > this.radius) return false;
    this.activeTouchId = touch.id;
    this.active = true;
    this.consumedTouches += 1;
    if (!this.fixed) this.centerRef = [touch.x, touch.y];
    this.updateStick([touch.x, touch.y]);
    return true;
  }

  touchMove(touch: VirtualTouchPoint): boolean {
    if (touch.id !== this.activeTouchId) return false;
    this.updateStick([touch.x, touch.y]);
    return true;
  }

  touchEnd(touch: VirtualTouchPoint): boolean {
    if (touch.id !== this.activeTouchId) return false;
    this.activeTouchId = null;
    this.active = false;
    if (this.returnToCenter) {
      this.stickRef = this.centerRef;
      this.valueRef = [0, 0];
    }
    if (!this.fixed) this.centerRef = this.initialCenter;
    return true;
  }

  snapshot(): VirtualTouchJoystickSnapshot {
    return {
      source: "origin-master-touch-joystick-virtual-input-adapted",
      active: this.active,
      activeTouchId: this.activeTouchId,
      center: [round(this.centerRef[0]), round(this.centerRef[1])],
      stick: [round(this.stickRef[0]), round(this.stickRef[1])],
      value: [round(this.valueRef[0]), round(this.valueRef[1])],
      magnitude: round(Math.hypot(this.valueRef[0], this.valueRef[1])),
      deadZone: this.deadZone,
      consumedTouches: this.consumedTouches,
      evidence: {
        oldCodebasePort: true,
        virtualJoystick: true,
        deadZone: true,
        clampedMagnitude: Math.hypot(this.valueRef[0], this.valueRef[1]) <= 1.0001,
        returnToCenter: this.returnToCenter,
        floatingCenter: !this.fixed
      }
    };
  }

  private updateStick(touch: readonly [number, number]): void {
    const dx = touch[0] - this.centerRef[0];
    const dy = touch[1] - this.centerRef[1];
    const rawDistance = Math.hypot(dx, dy);
    if (rawDistance === 0) {
      this.stickRef = this.centerRef;
      this.valueRef = [0, 0];
      return;
    }
    const clampedDistance = Math.min(rawDistance, this.maxDistance);
    const nx = dx / rawDistance;
    const ny = dy / rawDistance;
    this.stickRef = [this.centerRef[0] + nx * clampedDistance, this.centerRef[1] + ny * clampedDistance];
    const normalized = clampedDistance / this.maxDistance;
    if (normalized < this.deadZone) {
      this.valueRef = [0, 0];
      return;
    }
    const remapped = Math.min(1, (normalized - this.deadZone) / (1 - this.deadZone));
    this.valueRef = [nx * remapped, ny * remapped];
  }
}

export function sampleVirtualTouchJoystickFixture(): {
  readonly active: VirtualTouchJoystickSnapshot;
  readonly released: VirtualTouchJoystickSnapshot;
} {
  const joystick = new VirtualTouchJoystick({
    center: [96, 420],
    radius: 72,
    deadZone: 0.2,
    maxDistance: 56,
    fixed: false,
    returnToCenter: true
  });
  joystick.touchStart({ id: 7, x: 90, y: 416 });
  joystick.touchMove({ id: 7, x: 154, y: 376 });
  const active = joystick.snapshot();
  joystick.touchEnd({ id: 7, x: 154, y: 376 });
  return { active, released: joystick.snapshot() };
}

function positive(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function distance(a: readonly [number, number], b: readonly [number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
