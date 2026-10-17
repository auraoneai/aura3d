// Pip's Big Leap — Brambleback, the Hollow Palace boss.
//
// Three-hit pattern boss per the PRD: ROLL toward Pip (contact hurts),
// WIND-UP (invulnerable, spikes out, telegraphs), then VULNERABLE (spikes
// in, stomp/dive/pound to land a hit). Three hits drop him and unlatch the
// Sun-Gate. The boss is kinematic — main.ts mirrors `pos` into the runtime
// node handles built by world.ts.

import type { Vec3 } from "./types.js";

export type BossPhase = "dormant" | "roll" | "windup" | "vulnerable" | "down";

export interface BossState {
  hp: number;
  phase: BossPhase;
  timer: number;
  x: number; y: number; z: number;   // body centre
  yaw: number;
  arena: { readonly x: number; readonly z: number; readonly hx: number; readonly hz: number; readonly floorY: number };
  active: boolean;
}

export interface BossFrame {
  readonly pos: Vec3;
  readonly vulnerable: boolean;
  readonly events: readonly BossEvent[];
}

export interface BossEvent {
  readonly kind: "activate" | "phase" | "hit" | "down";
  readonly phase?: BossPhase;
  readonly hp?: number;
}

const ARENA = { x: 0, z: -69, hx: 5.4, hz: 4.4, floorY: 2.6 } as const;
const BODY_R = 1.1;
const ROLL_TIME = 1.7;
const WINDUP_TIME = 0.95;
const VULNERABLE_TIME = 1.8;
const ROLL_SPEED = 4.6;

export function createBoss(): BossState {
  return {
    hp: 3,
    phase: "dormant",
    timer: 0,
    x: ARENA.x, y: ARENA.floorY + BODY_R, z: ARENA.z,
    yaw: 0,
    arena: ARENA,
    active: false
  };
}

function setPhase(b: BossState, phase: BossPhase, events: BossEvent[]): void {
  b.phase = phase;
  b.timer = 0;
  events.push({ kind: "phase", phase });
}

/** Advance Brambleback one frame against the player's feet position. */
export function stepBoss(b: BossState, player: Vec3, dt: number): BossFrame {
  const events: BossEvent[] = [];
  b.timer += dt;

  // Wake when Pip crosses into the arena bowl.
  if (b.phase === "dormant") {
    if (!b.active && Math.abs(player[0] - b.arena.x) < b.arena.hx + 1 && Math.abs(player[2] - b.arena.z) < b.arena.hz + 2.2) {
      b.active = true;
      events.push({ kind: "activate" });
      setPhase(b, "roll", events);
    }
    return { pos: [b.x, b.y, b.z], vulnerable: false, events };
  }

  if (b.phase === "down") {
    // Crumple: sink into the arena floor.
    b.y = Math.max(b.arena.floorY + BODY_R * 0.4, b.y - dt * 1.6);
    return { pos: [b.x, b.y, b.z], vulnerable: false, events };
  }

  switch (b.phase) {
    case "roll": {
      // Chase the player along the arena floor.
      const dx = player[0] - b.x, dz = player[2] - b.z;
      const n = Math.hypot(dx, dz) || 1;
      const want = Math.atan2(dx, dz);
      let dy = want - b.yaw;
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      b.yaw += dy * Math.min(1, 5.5 * dt);
      b.x = clampArena(b.x + Math.sin(b.yaw) * ROLL_SPEED * dt, b.arena.x, b.arena.hx);
      b.z = clampArena(b.z + Math.cos(b.yaw) * ROLL_SPEED * dt, b.arena.z, b.arena.hz);
      b.y = b.arena.floorY + BODY_R + Math.abs(Math.sin(b.timer * 10)) * 0.12; // rolling hop
      if (b.timer >= ROLL_TIME) setPhase(b, "windup", events);
      break;
    }
    case "windup": {
      // Rear up and shiver — spikes out, can't be hurt.
      b.y = b.arena.floorY + BODY_R + b.timer * 0.9;
      b.x = clampArena(b.x, b.arena.x, b.arena.hx);
      if (b.timer >= WINDUP_TIME) setPhase(b, "vulnerable", events);
      break;
    }
    case "vulnerable": {
      // Collapsed on the floor, spikes retracted — stompable.
      b.y = b.arena.floorY + BODY_R * 0.55;
      if (b.timer >= VULNERABLE_TIME) setPhase(b, "roll", events);
      break;
    }
    default:
      break;
  }

  return {
    pos: [b.x, b.y, b.z],
    vulnerable: b.phase === "vulnerable",
    events
  };
}

/** A stomp/dive/pound during `vulnerable` lands here. */
export function damageBoss(b: BossState, events: BossEvent[]): void {
  if (b.phase !== "vulnerable") return;
  b.hp -= 1;
  events.push({ kind: "hit", hp: b.hp });
  if (b.hp <= 0) {
    setPhase(b, "down", events);
    events.push({ kind: "down" });
  } else {
    setPhase(b, "roll", events);
  }
}

function clampArena(v: number, centre: number, half: number): number {
  return Math.min(centre + half, Math.max(centre - half, v));
}
