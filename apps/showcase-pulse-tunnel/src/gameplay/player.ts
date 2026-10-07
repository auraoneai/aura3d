/**
 * Pulse Tunnel player — authored kinematic lane/jump/slide with buffered input.
 *
 * No physics engine: this is authored arcade motion on the proven tunnel path
 * (PRD section 5 explicitly keeps collisions as overlap checks against gate
 * volumes). The lane switch buffer is 120 ms per the controls table.
 */

export const PULSE_LANE_X = [-0.75, 0, 0.75] as const;
export const PULSE_LANE_SWITCH_BUFFER_MS = 120;
/** Jump tuning: clears the low gate (0.34 u) with a visible but snappy arc. */
export const PULSE_JUMP_APEX = 0.55;
export const PULSE_JUMP_SECONDS = 0.55;
/** Apex h at T/2 needs v0 = 4h/T and g = 2v0/T (symmetric parabola). */
export const PULSE_JUMP_VELOCITY = (4 * PULSE_JUMP_APEX) / PULSE_JUMP_SECONDS;
export const PULSE_JUMP_GRAVITY = -(2 * PULSE_JUMP_VELOCITY) / PULSE_JUMP_SECONDS;
export const PULSE_SLIDE_SECONDS = 0.6;
/** Standing capsule top; sliding drops it below the high-gate lintel underside. */
export const PULSE_PLAYER_STAND_TOP = 0.72;
export const PULSE_PLAYER_SLIDE_TOP = 0.3;
export const PULSE_PLAYER_HALF_WIDTH = 0.16;
/** Invulnerability window after a shield hit (PRD: brief invulnerability). */
export const PULSE_INVULN_SECONDS = 1.2;

export type PulsePlayerAction = "left" | "right" | "jump" | "slide";

interface BufferedIntent {
  readonly action: PulsePlayerAction;
  /** Frame-clock ms timestamp when the press arrived. */
  readonly atMs: number;
}

export interface PulsePlayerState {
  readonly lane: number;
  readonly targetLane: number;
  readonly x: number;
  readonly y: number;
  readonly vy: number;
  readonly airborne: boolean;
  readonly sliding: boolean;
  readonly colliderTop: number;
  readonly invulnRemaining: number;
  /** Events observed this step, e.g. "jump" | "slide" | "lane-left" | "lane-right" | "land". */
  readonly events: readonly string[];
}

export interface PulsePlayerSystem {
  step(dtSeconds: number, nowMs: number, pressed: { left: boolean; right: boolean; jump: boolean; slide: boolean }): PulsePlayerState;
  snapshot(): PulsePlayerState;
  /** Grant the post-hit invulnerability window. */
  applyInvuln(seconds: number): void;
  reset(): void;
}

export function createPulsePlayer(): PulsePlayerSystem {
  let lane = 1;
  let targetLane = 1;
  let x = PULSE_LANE_X[1];
  let y = 0;
  let vy = 0;
  let airborne = false;
  let sliding = false;
  let slideRemaining = 0;
  let invulnRemaining = 0;
  let queue: BufferedIntent[] = [];
  let events: string[] = [];

  function pushIntents(nowMs: number, pressed: { left: boolean; right: boolean; jump: boolean; slide: boolean }): void {
    if (pressed.left) queue.push({ action: "left", atMs: nowMs });
    if (pressed.right) queue.push({ action: "right", atMs: nowMs });
    if (pressed.jump) queue.push({ action: "jump", atMs: nowMs });
    if (pressed.slide) queue.push({ action: "slide", atMs: nowMs });
  }

  function drainExpired(nowMs: number): void {
    // Drop intents older than the published 120 ms buffer.
    queue = queue.filter((intent) => nowMs - intent.atMs <= PULSE_LANE_SWITCH_BUFFER_MS);
  }

  return {
    step(dtSeconds, nowMs, pressed) {
      events = [];
      pushIntents(nowMs, pressed);
      drainExpired(nowMs);

      // One buffered action resolves per frame, in arrival order.
      while (queue.length > 0) {
        const intent = queue.shift()!;
        if (intent.action === "left") {
          if (targetLane > 0) {
            targetLane -= 1;
            events.push("lane-left");
          }
          break;
        }
        if (intent.action === "right") {
          if (targetLane < 2) {
            targetLane += 1;
            events.push("lane-right");
          }
          break;
        }
        if (intent.action === "jump") {
          if (!airborne) {
            airborne = true;
            vy = PULSE_JUMP_VELOCITY;
            sliding = false;
            slideRemaining = 0;
            events.push("jump");
          }
          break;
        }
        if (intent.action === "slide") {
          if (!sliding) {
            sliding = true;
            slideRemaining = PULSE_SLIDE_SECONDS;
            events.push("slide");
          } else {
            slideRemaining = PULSE_SLIDE_SECONDS;
          }
          break;
        }
      }

      lane = targetLane;
      // Horizontal easing toward the target lane reads as a switch without physics.
      const targetX = PULSE_LANE_X[targetLane];
      const ease = Math.min(1, dtSeconds / 0.09);
      x += (targetX - x) * ease;

      if (airborne) {
        vy += PULSE_JUMP_GRAVITY * dtSeconds;
        y += vy * dtSeconds;
        if (y <= 0 && vy < 0) {
          y = 0;
          vy = 0;
          airborne = false;
          events.push("land");
        }
      }

      if (sliding) {
        slideRemaining -= dtSeconds;
        if (slideRemaining <= 0) {
          sliding = false;
          slideRemaining = 0;
        }
      }

      if (invulnRemaining > 0) invulnRemaining = Math.max(0, invulnRemaining - dtSeconds);

      return {
        lane,
        targetLane,
        x,
        y,
        vy,
        airborne,
        sliding,
        colliderTop: sliding && !airborne ? PULSE_PLAYER_SLIDE_TOP : PULSE_PLAYER_STAND_TOP,
        invulnRemaining,
        events
      };
    },
    snapshot() {
      return {
        lane,
        targetLane,
        x,
        y,
        vy,
        airborne,
        sliding,
        colliderTop: sliding && !airborne ? PULSE_PLAYER_SLIDE_TOP : PULSE_PLAYER_STAND_TOP,
        invulnRemaining,
        events
      };
    },
    applyInvuln(seconds) {
      invulnRemaining = Math.max(invulnRemaining, seconds);
    },
    reset() {
      lane = 1;
      targetLane = 1;
      x = PULSE_LANE_X[1];
      y = 0;
      vy = 0;
      airborne = false;
      sliding = false;
      slideRemaining = 0;
      invulnRemaining = 0;
      queue = [];
      events = [];
    },
    ...{}
  };
}

/**
 * Overlap check used at the pass moment (pure; unit-tested).
 * `playerBottom` is the player's feet height at the pass.
 */
export function pulsePlayerOverlapsGate(
  playerX: number,
  playerBottom: number,
  playerTop: number,
  gate: { centerX: number; halfWidth: number; bottomY: number; topY: number }
): boolean {
  const horizontalOverlap =
    Math.abs(playerX - gate.centerX) < gate.halfWidth + PULSE_PLAYER_HALF_WIDTH;
  const verticalOverlap = playerBottom < gate.topY && playerTop > gate.bottomY;
  return horizontalOverlap && verticalOverlap;
}
