// Pip's Big Leap — kinematic mascot-platformer controller.
//
// Deterministic AABB character controller simulated against the world's
// SolidBox set: axis-separated resolution, step-up, moving-platform carry,
// coyote time + jump buffer via `game.jumpAssist`, variable jump, double
// jump, apex hang, dive, ground pound, cape glide, swim pockets, springs,
// hazards with knockback + i-frames, and checkpoint respawn. Camera-relative
// input: `camYaw` eases behind the hero only while Pip runs forward, so A/D
// strafe along a steady camera axis (W/S still steer the follow camera), and
// `input.orbit` turns the camera directly (mouse drag, Q/E, right stick).

import type { BuiltWorld, WaterZone } from "./world.js";
import type { MoveState, Vec3 } from "./types.js";

const HALF = 0.3;          // xz half extent
const HEIGHT = 0.9;        // capsule box height (feet -> head)
const STEP_EPS = 0.001;

export interface PlayerInput {
  readonly moveX: number;   // -1..1 strafe (right positive)
  readonly moveZ: number;   // -1..1 forward (W positive)
  readonly jumpPressed: boolean;
  readonly jumpHeld: boolean;
  readonly divePressed: boolean;
  readonly poundPressed: boolean;
  /** Camera orbit this step, in radians (positive turns the view right). */
  readonly orbit?: number;
}

export interface PlayerEvent {
  readonly kind:
    | "jump" | "double-jump" | "land" | "glide-start" | "dive" | "pound" | "pound-land"
    | "spring" | "hurt" | "die" | "respawn" | "checkpoint" | "seed" | "acorn" | "heart"
    | "swim" | "gate" | "boss-hit" | "boss-contact";
  readonly id?: string;
  readonly at?: Vec3;
}

export interface PlayerState {
  x: number; y: number; z: number;     // feet position
  vx: number; vy: number; vz: number;
  yaw: number;
  camYaw: number;
  state: MoveState;
  grounded: boolean;
  groundId: string | null;
  coyoteMs: number;
  jumpsLeft: number;
  hearts: number;
  invuln: number;                       // i-frame seconds left
  hurtTimer: number;
  poundTimer: number;                   // brief freeze after pound landing
  swim: WaterZone | null;
  checkpoint: Checkpoint;
  gliding: boolean;
}

/** Hurt lasts this long; afterwards Pip moves again (i-frames run longer). */
export const HURT_SECONDS = 0.55;
/** Pip follows a lift down while his feet stay within this distance of its top. */
const GROUND_PROBE = 0.12;
/** The follow camera chases Pip's heading only while forward input exceeds this. */
const CAMERA_CHASE_MIN_FORWARD = 0.3;

export interface Checkpoint {
  readonly id: string;
  readonly x: number; readonly y: number; readonly z: number;
  readonly yaw: number;
}

interface JumpAssistLike {
  update(dt: number, input: { readonly grounded: boolean; readonly jumpPressed: boolean }): { readonly canJump: boolean; readonly jumpBuffered: boolean };
  consume(): boolean;
}

export function createPlayer(world: BuiltWorld): PlayerState {
  const s = world.spec;
  return {
    x: s.spawn[0], y: s.spawn[1], z: s.spawn[2],
    vx: 0, vy: 0, vz: 0,
    yaw: s.spawnYaw ?? Math.PI,
    camYaw: s.spawnYaw ?? Math.PI,
    state: "grounded",
    grounded: true,
    groundId: null,
    coyoteMs: 0,
    jumpsLeft: 1,
    hearts: 3,
    invuln: 0,
    hurtTimer: 0,
    poundTimer: 0,
    swim: null,
    checkpoint: { id: "spawn", x: s.spawn[0], y: s.spawn[1], z: s.spawn[2], yaw: s.spawnYaw ?? Math.PI },
    gliding: false
  };
}

const overlaps = (p: { x: number; y: number; z: number }, hx: number, hy: number, hz: number, b: { x: number; y: number; z: number; hx: number; hy: number; hz: number }) =>
  Math.abs(p.x - b.x) < hx + b.hx && Math.abs(p.y - b.y) < hy + b.hy && Math.abs(p.z - b.z) < hz + b.hz;

const pbox = (p: PlayerState) => ({ x: p.x, y: p.y + HEIGHT / 2, z: p.z, hx: HALF, hy: HEIGHT / 2, hz: HALF });

function inWater(p: PlayerState, waters: readonly WaterZone[]): WaterZone | null {
  for (const w of waters) {
    if (Math.abs(p.x - w.x) < w.hx && Math.abs(p.z - w.z) < w.hz && p.y > w.floorY && p.y + 0.1 < w.surfaceY + 0.6) return w;
  }
  return null;
}

/**
 * Advance the player one frame. `doubleJump` is the persisted unlock flag.
 * Returns gameplay events for HUD/sfx/juice wiring.
 */
export function stepPlayer(
  p: PlayerState,
  world: BuiltWorld,
  input: PlayerInput,
  dt: number,
  opts: { readonly doubleJump: boolean; readonly assist: JumpAssistLike; readonly bossVulnerable?: boolean; readonly bossAt?: Vec3 }
): PlayerEvent[] {
  const t = world.motion.tuning;
  const events: PlayerEvent[] = [];
  const swimming = inWater(p, world.waters);

  // ------------------------------------------------------------- state gates
  const pounding = p.poundTimer > 0;
  p.invuln = Math.max(0, p.invuln - dt);
  p.hurtTimer = Math.max(0, p.hurtTimer - dt);
  p.poundTimer = Math.max(0, p.poundTimer - dt);
  // Knockback is over once the hurt timer runs out: hand control back
  // (the i-frames keep running, so Pip is not hit again straight away).
  if (p.state === "hurt" && p.hurtTimer <= 0) p.state = p.grounded ? "grounded" : "air";
  const busy = p.state === "hurt" || p.state === "dead" || p.state === "celebrate" || pounding;

  // -------------------------------------------------------------- move input
  const fwd = { x: Math.sin(p.camYaw), z: Math.cos(p.camYaw) };
  const right = { x: -fwd.z, z: fwd.x };
  let mx = input.moveX * right.x + input.moveZ * fwd.x;
  let mz = input.moveX * right.z + input.moveZ * fwd.z;
  const mlen = Math.hypot(mx, mz);
  if (mlen > 1) { mx /= mlen; mz /= mlen; }
  const wantMove = mlen > 0.01 && !busy;

  const speed = p.swim ? t.swimMoveSpeed : t.moveSpeed;
  const accel = p.grounded ? 26 : 26 * t.airControl;
  const targetVx = wantMove ? mx * speed : 0;
  const targetVz = wantMove ? mz * speed : 0;

  if (p.state === "dive") {
    // Dive keeps its burst velocity; mild steer only.
    p.vx += (targetVx * 0.25 - p.vx) * Math.min(1, 4 * dt);
    p.vz += (targetVz * 0.25 - p.vz) * Math.min(1, 4 * dt);
  } else if (p.state !== "pound") {
    p.vx += (targetVx - p.vx) * Math.min(1, accel * dt);
    p.vz += (targetVz - p.vz) * Math.min(1, accel * dt);
  }

  // Hero eases toward the move direction; camera trails behind.
  if (wantMove) {
    const wantYaw = Math.atan2(mx, mz);
    let dyaw = wantYaw - p.yaw;
    while (dyaw > Math.PI) dyaw -= Math.PI * 2;
    while (dyaw < -Math.PI) dyaw += Math.PI * 2;
    p.yaw += dyaw * Math.min(1, 12 * dt);
  }
  // The camera trails Pip's heading only while he runs forward. Strafing and
  // backing up leave it alone, so the strafe axis stays fixed and A/D move
  // sideways instead of circling.
  if (wantMove && input.moveZ > CAMERA_CHASE_MIN_FORWARD) {
    let cd = p.yaw - p.camYaw;
    while (cd > Math.PI) cd -= Math.PI * 2;
    while (cd < -Math.PI) cd += Math.PI * 2;
    p.camYaw += cd * Math.min(1, 2.2 * dt);
  }
  // Positive orbit turns the view right (forward swings toward the right axis).
  if (input.orbit) p.camYaw -= input.orbit;

  // ---------------------------------------------------------------- swimming
  if (swimming && !p.swim && p.vy <= 0.5) {
    p.swim = swimming;
    p.state = "swim";
    p.gliding = false;
    events.push({ kind: "swim" });
  } else if (!swimming && p.swim) {
    p.swim = null;
  }

  // ------------------------------------------------------------------- jumps
  const assist = opts.assist.update(dt, { grounded: p.grounded, jumpPressed: input.jumpPressed });
  if (assist.jumpBuffered && !busy) {
    if (p.swim) {
      p.vy = Math.max(p.vy, world.motion.tuning.swimStrokeVelocity);
      opts.assist.consume();
      events.push({ kind: "jump" });
    } else if (assist.canJump) {
      p.vy = t.jumpVelocity;
      p.grounded = false;
      p.jumpsLeft = opts.doubleJump ? 1 : 0;
      p.state = "jump";
      p.swim = null;
      opts.assist.consume();
      events.push({ kind: "jump", at: [p.x, p.y, p.z] });
    } else if (opts.doubleJump && p.jumpsLeft > 0 && p.state !== "dive" && p.state !== "pound") {
      p.jumpsLeft -= 1;
      p.vy = t.jumpVelocity * 0.92;
      p.gliding = false;
      p.state = "jump";
      opts.assist.consume();
      events.push({ kind: "double-jump", at: [p.x, p.y, p.z] });
    }
  }

  // Variable jump height — releasing early clips the rise.
  if (!input.jumpHeld && p.vy > 0 && p.state === "jump") {
    p.vy *= Math.pow(t.releaseVelocityScale, dt * 60);
  }

  // ------------------------------------------------------------------- moves
  if (input.divePressed && !p.grounded && !p.swim && !busy && p.state !== "dive") {
    const dirX = wantMove ? mx : Math.sin(p.yaw);
    const dirZ = wantMove ? mz : Math.cos(p.yaw);
    const n = Math.hypot(dirX, dirZ) || 1;
    p.vx = (dirX / n) * t.diveSpeed;
    p.vz = (dirZ / n) * t.diveSpeed;
    p.vy = t.diveVy;
    p.gliding = false;
    p.state = "dive";
    events.push({ kind: "dive" });
  }
  if (input.poundPressed && !p.grounded && !p.swim && !busy && p.state !== "pound") {
    p.vx = 0; p.vz = 0;
    p.vy = -t.poundSpeed;
    p.gliding = false;
    p.state = "pound";
    events.push({ kind: "pound" });
  }

  // ------------------------------------------------------------------ glide
  const wasGliding = p.gliding;
  p.gliding =
    !busy && !p.swim && !p.grounded &&
    input.jumpHeld && p.vy < 0 &&
    p.state !== "dive" && p.state !== "pound";
  if (p.gliding && !wasGliding) events.push({ kind: "glide-start" });
  if (p.gliding) p.state = "glide";

  // ----------------------------------------------------------------- gravity
  const grav = p.swim ? t.swimGravity :
    p.gliding ? t.gravity * 0.5 :
    p.vy > 0 ? t.gravity :
    Math.abs(p.vy) < t.apexHangThreshold ? t.gravity * t.apexHangGravityScale :
    t.gravity * t.fallGravityMultiplier;
  p.vy += grav * dt;
  const terminal = p.swim ? t.swimTerminal : p.gliding ? t.glideFallSpeed : p.state === "pound" ? t.poundSpeed : t.terminalVelocity;
  if (p.vy < -terminal) p.vy = -terminal;

  // ------------------------------------------------------------ integrate XZ
  const wasGrounded = p.grounded;
  const prevGroundId = p.groundId;
  const feetBefore = p.y;
  moveAxis(p, world, "x", p.vx * dt);
  moveAxis(p, world, "z", p.vz * dt);

  // ------------------------------------------------------------- integrate Y
  p.y += p.vy * dt;
  p.grounded = false;
  p.groundId = null;
  const box = pbox(p);
  for (const s of world.solids) {
    if (!s.active) continue;
    if (!overlaps(box, box.hx, box.hy, box.hz, s)) continue;
    if (p.vy <= 0 && box.y - box.hy > s.y + s.hy - Math.max(0.6, -p.vy * dt + 0.12)) {
      // Land on top.
      p.y = s.y + s.hy;
      p.vy = 0;
      p.grounded = true;
      p.groundId = s.id;
      // Carry by mover surface velocity, up and down alike.
      p.x += s.vx * dt; p.z += s.vz * dt;
      p.y += s.vy * dt;
    } else if (p.vy > 0 && box.y + box.hy < s.y - s.hy + Math.max(0.3, p.vy * dt + 0.12)) {
      // Bonk head.
      p.y = s.y - s.hy - HEIGHT - STEP_EPS;
      p.vy = Math.min(p.vy, 0);
    } else {
      // Side overlap inside Y band — push out horizontally.
      const pushX = (box.x < s.x) ? box.x + box.hx - s.x + s.hx : -(s.x + s.hx - box.x + box.hx);
      const pushZ = (box.z < s.z) ? box.z + box.hz - s.z + s.hz : -(s.z + s.hz - box.z + box.hz);
      if (Math.abs(pushX) < Math.abs(pushZ)) { p.x += pushX; box.x += pushX; if (p.state !== "dive") p.vx = 0; }
      else { p.z += pushZ; box.z += pushZ; if (p.state !== "dive") p.vz = 0; }
    }
  }

  // Ground probe: a lift that dropped away faster than gravity pulls Pip down
  // (a descending mover) keeps him standing on it instead of flickering
  // airborne and firing "land" every few frames.
  if (!p.grounded && wasGrounded && prevGroundId && p.vy <= 0 && p.state !== "hurt") {
    const s = world.solids.find((solid) => solid.id === prevGroundId);
    if (s && s.active) {
      const top = s.y + s.hy;
      const inside = Math.abs(p.x - s.x) < s.hx + HALF && Math.abs(p.z - s.z) < s.hz + HALF;
      if (inside && top <= feetBefore + STEP_EPS && feetBefore - top <= GROUND_PROBE + Math.abs(s.vy) * dt) {
        p.y = top + s.vy * dt;
        p.vy = 0;
        p.grounded = true;
        p.groundId = s.id;
        p.x += s.vx * dt; p.z += s.vz * dt;
      }
    }
  }

  // Landed this frame.
  if (p.grounded && !wasGrounded) {
    p.jumpsLeft = opts.doubleJump ? 1 : 0;
    p.gliding = false;
    if (p.state === "pound") {
      p.poundTimer = 0.16;
      events.push({ kind: "pound-land", at: [p.x, p.y, p.z] });
    } else if (p.state !== "hurt" && p.state !== "dead") {
      events.push({ kind: "land" });
    }
    if (p.state !== "hurt" && p.state !== "dead") p.state = p.swim ? "swim" : "grounded";
  }
  if (!p.grounded && p.state === "grounded") p.state = p.swim ? "swim" : "air";
  if (p.grounded && p.state === "air") p.state = "grounded";

  // ---------------------------------------------------------------- springs
  for (const spr of world.springs) {
    if (Math.abs(p.x - spr.x) < 0.7 && Math.abs(p.z - spr.z) < 0.7 && p.y >= spr.y - 0.1 && p.y < spr.y + 0.7 && p.vy <= 0.5) {
      p.vy = spr.power ?? world.motion.tuning.springVelocity;
      p.y = spr.y + 0.4;
      p.grounded = false;
      p.swim = null;
      p.gliding = false;
      p.state = "jump";
      p.jumpsLeft = opts.doubleJump ? 1 : 0;
      events.push({ kind: "spring", id: spr.id });
    }
  }

  // ---------------------------------------------------------------- hazards
  for (const hz of world.hazards) {
    if (!overlaps(box, box.hx, box.hy * 0.9, box.hz, hz)) continue;
    if (p.invuln > 0 || p.state === "dead") continue;
    if (p.state === "pound" || p.state === "dive") continue; // attacks pass through
    damage(p, hz.spec.respawn ? "respawn" : "hit", events, t.knockback, [hz.x, hz.y, hz.z]);
    break;
  }

  // Boss contact (arena world) — stomp top while vulnerable, else take a hit.
  if (opts.bossAt) {
    const b = { x: opts.bossAt[0], y: opts.bossAt[1], z: opts.bossAt[2], hx: 1.25, hy: 1.25, hz: 1.25 };
    if (overlaps(box, box.hx, box.hy, box.hz, b) && p.invuln <= 0) {
      const stomp = p.vy <= -1 || p.state === "pound" || p.state === "dive";
      if (stomp && opts.bossVulnerable) {
        p.vy = t.jumpVelocity * 0.8;
        events.push({ kind: "boss-hit" });
      } else if (!stomp) {
        damage(p, "hit", events, t.knockback, [opts.bossAt[0], opts.bossAt[1], opts.bossAt[2]], "boss-contact");
      }
    }
  }

  // --------------------------------------------------------------- fell out
  if (p.y < world.spec.lowerBound && p.state !== "dead") {
    damage(p, "respawn", events, t.knockback);
  }

  // --------------------------------------------------------------- pickups
  for (const seed of world.seeds) {
    if (near3(p, seed, 0.65)) events.push({ kind: "seed", id: seed.id });
  }
  for (const a of world.acorns) {
    if (near3(p, a, 0.6)) events.push({ kind: "acorn", id: a.id });
  }
  for (const h of world.hearts) {
    if (near3(p, h, 0.65)) events.push({ kind: "heart", id: h.id });
  }
  for (const cp of world.checkpoints) {
    if (near3(p, cp, 0.9) && p.checkpoint.id !== cp.id) {
      p.checkpoint = { id: cp.id, x: cp.x, y: cp.y, z: cp.z, yaw: cp.yaw ?? p.yaw };
      events.push({ kind: "checkpoint", id: cp.id });
    }
  }

  // ------------------------------------------------------------------ gate
  const g = world.spec.gate;
  if (near3(p, { ...g, y: g.y + 1 }, 1.5)) events.push({ kind: "gate" });

  // Swim exits: climbing out over a ledge is handled by normal collision;
  // pressing jump at the surface launches a normal jump.
  if (p.swim && p.y + HEIGHT * 0.5 > p.swim.surfaceY + 0.3) {
    // Bob at the surface; don't float higher without a stroke.
    p.vy = Math.min(p.vy, 0.4);
  }

  return events;
}

function near3(p: PlayerState, at: { readonly x: number; readonly y: number; readonly z: number }, r: number): boolean {
  const dx = p.x - at.x, dy = (p.y + HEIGHT / 2) - at.y, dz = p.z - at.z;
  return dx * dx + dy * dy + dz * dz < r * r;
}

function damage(
  p: PlayerState,
  mode: "hit" | "respawn",
  events: PlayerEvent[],
  knockback: { readonly h: number; readonly v: number },
  source?: Vec3,
  kind?: PlayerEvent["kind"]
): void {
  if (p.state === "dead") return;
  p.hearts -= 1;
  p.gliding = false;
  p.swim = null;
  events.push({ kind: kind ?? "hurt", at: source });
  if (p.hearts <= 0) {
    p.state = "dead";
    events.push({ kind: "die" });
    return;
  }
  if (mode === "respawn") {
    p.x = p.checkpoint.x; p.y = p.checkpoint.y + 0.05; p.z = p.checkpoint.z;
    p.yaw = p.checkpoint.yaw; p.camYaw = p.checkpoint.yaw;
    p.vx = 0; p.vy = 0; p.vz = 0;
    p.state = "air";
    p.invuln = 1.6;
    events.push({ kind: "respawn" });
    return;
  }
  // Knockback away from the source, scaled by this world's derived tuning.
  if (source) {
    const dx = p.x - source[0], dz = p.z - source[2];
    const n = Math.hypot(dx, dz) || 1;
    p.vx = (dx / n) * knockback.h;
    p.vz = (dz / n) * knockback.h;
  }
  p.vy = knockback.v;
  p.state = "hurt";
  p.hurtTimer = HURT_SECONDS;
  p.invuln = 1.4;
  p.grounded = false;
}

/** Move along one axis, resolving against solids (with step-up). */
function moveAxis(p: PlayerState, world: BuiltWorld, axis: "x" | "z", delta: number): void {
  if (delta === 0) return;
  p[axis] += delta;
  const box = pbox(p);
  for (const s of world.solids) {
    if (!s.active) continue;
    if (!overlaps(box, box.hx, box.hy, box.hz, s)) continue;
    // Step-up: ledge within reach — climb instead of blocking.
    const topY = s.y + s.hy;
    if (topY - p.y <= world.motion.tuning.stepUpHeight && p.vy <= 0.01) {
      p.y = topY + STEP_EPS;
      box.y = p.y + HEIGHT / 2;
      p.grounded = true;
      p.groundId = s.id;
      continue;
    }
    const sign = delta > 0 ? 1 : -1;
    const sHalf = axis === "x" ? s.hx : s.hz;
    const bHalf = axis === "x" ? box.hx : box.hz;
    const push = sign > 0
      ? (s[axis] - sHalf) - (box[axis] + bHalf) - STEP_EPS
      : (s[axis] + sHalf) - (box[axis] - bHalf) + STEP_EPS;
    p[axis] += push;
    box[axis] += push;
    if (p.state !== "dive") { if (axis === "x") p.vx = 0; else p.vz = 0; }
  }
}
export {};
