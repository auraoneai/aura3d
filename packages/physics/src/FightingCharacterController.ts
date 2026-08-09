import { KinematicBody, type KinematicBodyDescriptor, type KinematicBodyEvent, type KinematicBodySnapshot, type KinematicStepOptions } from "./KinematicBody.js";

export type FightingCharacterControllerState = "idle" | "walk" | "dash" | "jump" | "fast-fall" | "crouch" | "landing";

export type FightingCharacterControllerDescriptor = KinematicBodyDescriptor & {
  readonly walkSpeed?: number;
  readonly crouchSpeed?: number;
  readonly fastFallSpeed?: number;
};

export type FightingCharacterControllerSnapshot = KinematicBodySnapshot & {
  readonly state: FightingCharacterControllerState;
  readonly walkSpeed: number;
  readonly crouchSpeed: number;
  readonly fastFallSpeed: number;
};

/** Authored-unit fighting movement; this is not a physical-simulation controller. */
export class FightingCharacterController {
  readonly body: KinematicBody;
  readonly walkSpeed: number;
  readonly crouchSpeed: number;
  readonly fastFallSpeed: number;
  #state: FightingCharacterControllerState = "idle";

  constructor(descriptor: FightingCharacterControllerDescriptor = {}) {
    this.walkSpeed = positive(descriptor.walkSpeed ?? descriptor.maxSpeed ?? 4.5, "fighting controller walkSpeed");
    this.crouchSpeed = positive(descriptor.crouchSpeed ?? this.walkSpeed * 0.45, "fighting controller crouchSpeed");
    this.fastFallSpeed = positive(descriptor.fastFallSpeed ?? descriptor.maxFallSpeed ?? 20, "fighting controller fastFallSpeed");
    this.body = new KinematicBody({
      ...descriptor,
      id: descriptor.id ?? "fighter",
      halfExtents: descriptor.halfExtents ?? [0.32, 0.9, 0.25],
      maxSpeed: descriptor.maxSpeed ?? this.walkSpeed,
      acceleration: descriptor.acceleration ?? 54,
      airAcceleration: descriptor.airAcceleration ?? 24,
      groundFriction: descriptor.groundFriction ?? 56,
      airFriction: descriptor.airFriction ?? 4,
      gravity: descriptor.gravity ?? 26,
      jumpSpeed: descriptor.jumpSpeed ?? 9.4,
      maxFallSpeed: descriptor.maxFallSpeed ?? Math.max(this.fastFallSpeed, 20),
      dashSpeed: descriptor.dashSpeed ?? 8.6,
      dashDuration: descriptor.dashDuration ?? 0.12,
      dashCooldown: descriptor.dashCooldown ?? 0.18,
      groundSnapDistance: descriptor.groundSnapDistance ?? 0.06,
      lockDepth: descriptor.lockDepth ?? true
    });
  }

  walk(direction: number, speed?: number): void {
    const magnitude = Math.min(1, Math.abs(finiteOrZero(direction)));
    const facing = direction < 0 ? -1 : 1;
    const targetSpeed = speed ?? (this.body.snapshot().crouching ? this.crouchSpeed : this.walkSpeed);
    const normalizedSpeed = this.body.maxSpeed > 0 ? Math.min(1, positive(targetSpeed, "fighting controller walk speed") / this.body.maxSpeed) : 0;
    this.body.move(facing * magnitude * normalizedSpeed);
    this.#state = magnitude > 0 ? "walk" : this.#derive([]);
  }

  stop(): void { this.body.move(0); this.#state = this.#derive([]); }
  jump(): void { this.body.jump(); this.#state = "jump"; }
  dash(direction?: number): void { this.body.dash(direction); this.#state = "dash"; }
  fastFall(speed = this.fastFallSpeed): void { this.body.fastFall(speed); if (!this.body.grounded) this.#state = "fast-fall"; }
  crouch(active = true): void { this.body.crouch(active); this.#state = active ? "crouch" : this.#derive([]); }

  step(dt: number, options: KinematicStepOptions = {}): readonly KinematicBodyEvent[] {
    const events = this.body.step(dt, options);
    this.#state = this.#derive(events);
    return events;
  }

  snapshot(): FightingCharacterControllerSnapshot {
    return { ...this.body.snapshot(), state: this.#state, walkSpeed: this.walkSpeed, crouchSpeed: this.crouchSpeed, fastFallSpeed: this.fastFallSpeed };
  }

  #derive(events: readonly KinematicBodyEvent[]): FightingCharacterControllerState {
    if (events.some((event) => event.type === "land")) return "landing";
    const snapshot = this.body.snapshot();
    if (snapshot.crouching) return "crouch";
    if (snapshot.dashFramesRemaining > 0) return "dash";
    if (!snapshot.grounded) return snapshot.velocity[1] < -this.fastFallSpeed * 0.5 ? "fast-fall" : "jump";
    return Math.abs(snapshot.velocity[0]) > 0.05 ? "walk" : "idle";
  }
}

export function createFightingCharacterController(descriptor: FightingCharacterControllerDescriptor = {}): FightingCharacterController {
  return new FightingCharacterController(descriptor);
}

function positive(value: number, label: string): number {
  if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${label} must be finite and positive.`);
  return value;
}

function finiteOrZero(value: number): number { return Number.isFinite(value) ? value : 0; }
