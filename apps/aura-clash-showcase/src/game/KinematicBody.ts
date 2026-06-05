import type { AuraClashVec2 } from "./types";

export interface KinematicBodyOptions {
  id: string;
  position: AuraClashVec2;
  velocity?: AuraClashVec2;
  radius?: number;
  height?: number;
  gravity?: number;
  groundY?: number;
  bounds?: { minX: number; maxX: number };
}

export interface KinematicMoveInput {
  axisX?: -1 | 0 | 1;
  jump?: boolean;
  crouch?: boolean;
  dash?: boolean;
  knockback?: AuraClashVec2;
}

export interface KinematicCollisionResolution {
  kind: "body-separation";
  selfId: string;
  otherId: string;
  overlap: number;
  correction: number;
  direction: -1 | 1;
  positions: {
    self: AuraClashVec2;
    other: AuraClashVec2;
  };
}

export class KinematicBody {
  readonly id: string;
  readonly radius: number;
  readonly height: number;
  readonly gravity: number;
  readonly groundY: number;
  readonly bounds: { minX: number; maxX: number };
  position: AuraClashVec2;
  velocity: AuraClashVec2;
  grounded = true;
  crouching = false;
  facing: -1 | 1 = 1;

  constructor(options: KinematicBodyOptions) {
    this.id = options.id;
    this.position = { ...options.position };
    this.velocity = { ...(options.velocity ?? { x: 0, y: 0 }) };
    this.radius = options.radius ?? 0.36;
    this.height = options.height ?? 1.8;
    this.gravity = options.gravity ?? 28;
    this.groundY = options.groundY ?? 0;
    this.bounds = options.bounds ?? { minX: -3.2, maxX: 3.2 };
  }

  get hurtboxHeight(): number {
    return this.crouching ? this.height * 0.62 : this.height;
  }

  move(input: KinematicMoveInput, dt: number): void {
    this.crouching = Boolean(input.crouch && this.grounded && !input.knockback);
    const walkSpeed = input.dash ? 7.4 : this.crouching ? 1.45 : 3.4;

    if (input.axisX && input.axisX !== 0) {
      this.facing = input.axisX > 0 ? 1 : -1;
      this.velocity.x = input.axisX * walkSpeed;
    } else {
      this.velocity.x *= Math.pow(0.08, dt);
    }

    if (input.jump && this.grounded && !this.crouching) {
      this.velocity.y = 8.5;
      this.grounded = false;
    }

    if (input.knockback) {
      this.crouching = false;
      this.velocity.x += input.knockback.x;
      this.velocity.y += input.knockback.y;
      this.grounded = false;
    }

    this.velocity.y -= this.gravity * dt;
    this.position.x = clamp(this.position.x + this.velocity.x * dt, this.bounds.minX, this.bounds.maxX);
    this.position.y += this.velocity.y * dt;

    if (this.position.y <= this.groundY) {
      this.position.y = this.groundY;
      this.velocity.y = 0;
      this.grounded = true;
    }
  }

  pushAwayFrom(other: KinematicBody): KinematicCollisionResolution | null {
    const minDistance = this.radius + other.radius;
    const delta = this.position.x - other.position.x;
    const distance = Math.abs(delta);

    if (distance >= minDistance || distance === 0) {
      return null;
    }

    const overlap = minDistance - distance;
    const correction = (minDistance - distance) / 2;
    const direction = delta > 0 ? 1 : -1;
    this.position.x = clamp(this.position.x + correction * direction, this.bounds.minX, this.bounds.maxX);
    other.position.x = clamp(other.position.x - correction * direction, other.bounds.minX, other.bounds.maxX);

    return {
      kind: "body-separation",
      selfId: this.id,
      otherId: other.id,
      overlap,
      correction,
      direction,
      positions: {
        self: { ...this.position },
        other: { ...other.position },
      },
    };
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
