// Pip's Big Leap — demo / `?autoplay=1` autopilot (moved out of main.ts unchanged so the sim test can drive it).
//
// The autopilot only produces a PlayerInput for the normal `stepPlayer` path: it never touches the sim directly
// (except the fall rescue below, which main.ts applies in autopilot mode only), so normal play stays deterministic.

import type { PlayerInput, PlayerState } from "./player.js";
import type { BuiltWorld } from "./world.js";

/** Seconds the results card stays up before the autopilot advances to the next world (AUTOPLAY addendum: ~3 s). */
export const AUTOPLAY_RESULTS_SECONDS = 3;

/** Metres a seed-holding pad may lie further away than the nearest pad and still be the autopilot's next waypoint. */
export const SEED_DETOUR = 2.5;

/** Per-run memory of the autopilot (jump cooldown, stuck detector). */
export interface AutopilotMemory {
  jumpCooldown: number;
  stuckTimer: number;
  lastZ: number;
  /** Seed the autopilot went back for after reaching a Sun-Gate still short of seeds. */
  fetching: string | null;
}

export function createAutopilotMemory(): AutopilotMemory {
  return { jumpCooldown: 0, stuckTimer: 0, lastZ: 0, fetching: null };
}

/** What the autopilot reads from the run besides the player. */
export interface AutopilotView {
  readonly worldClock: number;
  readonly seeds: ReadonlySet<string>;
  readonly bossAlive: boolean;
}

/** True when a course platform top sits under (x, z) within reach of height y. */
export function hasGroundBelow(built: BuiltWorld, x: number, y: number, z: number): boolean {
  for (const s of built.solids) {
    if (!s.active) continue;
    const top = s.y + s.hy;
    if (
      Math.abs(x - s.x) <= s.hx - 0.08 &&
      Math.abs(z - s.z) <= s.hz - 0.08 &&
      top <= y + 0.5 &&
      top >= y - 1.6
    ) {
      return true;
    }
  }
  return false;
}

/** The autopilot's input for one fixed step. */
export function autopilotInput(
  mem: AutopilotMemory,
  built: BuiltWorld,
  p: PlayerState,
  view: AutopilotView,
  seconds: number,
  bossVulnerable: boolean,
  bossAt?: readonly [number, number, number]
): PlayerInput {
  const spec = built.spec;
  mem.jumpCooldown = Math.max(0, mem.jumpCooldown - seconds);

  // Brief opening showcase beat on the starting platform so Pip, his sidekick,
  // and the Whispering Forest jump course are framed cleanly on initial load.
  if (view.worldClock < 1.15) {
    return {
      moveX: 0,
      moveZ: view.worldClock > 0.45 ? 0.35 : 0,
      jumpPressed: false,
      jumpHeld: false,
      divePressed: false,
      poundPressed: false
    };
  }

  if (Math.abs(p.z - mem.lastZ) < 0.12 && Math.hypot(p.vx, p.vz) < 0.7) {
    mem.stuckTimer += seconds;
  } else {
    mem.stuckTimer = 0;
    mem.lastZ = p.z;
  }

  // Pick next waypoint: boss (if in W5 arena), next platform/seed ahead, or Sun-Gate.
  let tx = spec.gate.x;
  let ty = spec.gate.y;
  let tz = spec.gate.z;

  // AUTOPLAY addendum: at a Sun-Gate still short of seeds, go back for the nearest one instead of waiting at the lock.
  const short = view.seeds.size < spec.gateSeeds;
  const missing = short && Math.hypot(p.x - spec.gate.x, p.z - spec.gate.z) < 9
    ? spec.seeds.filter((sd) => !view.seeds.has(sd.id)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y, a.z - p.z) - Math.hypot(b.x - p.x, b.y - p.y, b.z - p.z))[0]
    : undefined;
  if (missing) mem.fetching = missing.id;
  const fetch = mem.fetching && short ? spec.seeds.find((sd) => sd.id === mem.fetching && !view.seeds.has(sd.id)) : undefined;
  if (!fetch) mem.fetching = null;

  if (fetch) {
    tx = fetch.x;
    ty = fetch.y;
    tz = fetch.z;
  } else if (view.bossAlive && p.z < -52 && bossAt) {
    if (bossVulnerable) {
      tx = bossAt[0];
      ty = bossAt[1] + 1.1;
      tz = bossAt[2];
    } else {
      const orbitA = view.worldClock * 1.6;
      tx = Math.sin(orbitA) * 4.2;
      ty = 2.0;
      tz = -69 + Math.cos(orbitA) * 4.2;
    }
  } else {
    // Step platform-by-platform along the course so Pip never skips intermediate pads.
    let currentPlat: (typeof built.solids)[number] | null = null;
    for (const s of built.solids) {
      // Pass-through pass: decor bodies (trees, rocks…) are obstacles, never autopilot waypoints.
      if (!s.active || s.decor) continue;
      if (Math.abs(p.x - s.x) <= s.hx + 0.35 && Math.abs(p.z - s.z) <= s.hz + 0.35) {
        currentPlat = s;
        break;
      }
    }
    const frontEdgeZ = currentPlat ? currentPlat.z - currentPlat.hz : p.z - 0.4;
    let nextPlat: (typeof built.solids)[number] | null = null;
    let bestNextDist = Infinity;
    for (const s of built.solids) {
      if (!s.active || s.decor || s === currentPlat) continue;
      if (s.z >= frontEdgeZ + 0.2) continue;
      // AUTOPLAY addendum (collects): a pad holding an uncollected sun-seed wins over a slightly nearer bare one, so the
      // demo detours for seeds and reaches the Sun-Gate with enough to open it.
      const seedBonus = spec.seeds.some((sd) => !view.seeds.has(sd.id) && Math.abs(sd.x - s.x) <= s.hx && Math.abs(sd.z - s.z) <= s.hz && sd.y >= s.y + s.hy - 0.2 && sd.y <= s.y + s.hy + 1.6) ? SEED_DETOUR : 0;
      const d = Math.hypot((s.x - p.x) * 0.9, s.z - frontEdgeZ) - seedBonus;
      if (d < bestNextDist) {
        bestNextDist = d;
        nextPlat = s;
      }
    }
    if (nextPlat) {
      tx = nextPlat.x;
      ty = nextPlat.y + nextPlat.hy;
      tz = nextPlat.z;
    }

    // If an uncollected seed sits on the current or next platform, steer through it.
    for (const s of spec.seeds) {
      if (view.seeds.has(s.id)) continue;
      if (s.z <= p.z + 1.0 && s.z >= tz - 1.5 && Math.abs(s.x - tx) <= 2.4) {
        tx = s.x;
        ty = s.y;
        tz = s.z;
        break;
      }
    }
  }

  let dx = tx - p.x;
  let dz = tz - p.z;
  // Pass-through pass: decor bodies are solid now, so steer round one standing on the straight line to the waypoint
  // (aim past its nearer side edge) instead of walking into it.
  for (const s of built.solids) {
    if (!s.decor || !s.active) continue;
    if (p.y + 0.9 < s.y - s.hy || p.y > s.y + s.hy - 0.3) continue;
    const len = Math.hypot(dx, dz);
    if (len < 0.05) break;
    const ux = dx / len, uz = dz / len;
    const along = (s.x - p.x) * ux + (s.z - p.z) * uz;
    if (along <= 0 || along > Math.min(len, 3.5)) continue;
    const r = Math.hypot(s.hx, s.hz) + 0.45;
    const side = (s.x - p.x) * -uz + (s.z - p.z) * ux;
    if (Math.abs(side) >= r) continue;
    const sign = side > 0 ? -1 : 1;
    dx = s.x + -uz * sign * r - p.x;
    dz = s.z + ux * sign * r - p.z;
    break;
  }
  const distXZ = Math.hypot(tx - p.x, tz - p.z);
  const steer = Math.hypot(dx, dz);
  const dirX = steer > 0.05 ? dx / steer : 0;
  const dirZ = steer > 0.05 ? dz / steer : -1;

  // Convert desired world direction (dirX, dirZ) into camera-relative moveX, moveZ.
  const fwdX = Math.sin(p.camYaw);
  const fwdZ = Math.cos(p.camYaw);
  const rightX = -fwdZ;
  const rightZ = fwdX;
  const moveZ = Math.max(-1, Math.min(1, dirX * fwdX + dirZ * fwdZ));
  const moveX = Math.max(-1, Math.min(1, dirX * rightX + dirZ * rightZ));

  // Determine jump triggers right near the platform edge (0.42m ahead) so Pip never jumps early into a gap.
  const lookX = p.x + dirX * 0.42;
  const lookZ = p.z + dirZ * 0.42;
  const groundAhead = hasGroundBelow(built, lookX, p.y, lookZ);
  const hazardAhead = built.hazards.some(
    (h) => Math.abs(lookX - h.x) <= h.hx + 0.5 && Math.abs(lookZ - h.z) <= h.hz + 0.5 && Math.abs(p.y - h.y) <= 1.4
  );
  const wantStepJump = ty > p.y + 0.45 && distXZ < 3.4 && !groundAhead;
  const wantGapJump = p.grounded && !groundAhead && distXZ > 0.7;
  const wantBossJump = Boolean(bossVulnerable && bossAt && Math.hypot(bossAt[0] - p.x, bossAt[2] - p.z) < 3.4);

  let jumpPressed = false;
  if (mem.jumpCooldown <= 0) {
    if (p.grounded && (wantGapJump || hazardAhead || wantStepJump || wantBossJump || mem.stuckTimer > 0.55)) {
      jumpPressed = true;
      mem.jumpCooldown = 0.28;
      mem.stuckTimer = 0;
    } else if (!p.grounded && p.vy < -0.4 && p.jumpsLeft > 0 && !hasGroundBelow(built, p.x, p.y, p.z)) {
      jumpPressed = true;
      mem.jumpCooldown = 0.32;
    }
  }

  const jumpHeld = !p.grounded && (distXZ > 1.4 || ty > p.y - 0.2);
  const divePressed = !p.grounded && p.vy < -1.8 && distXZ > 3.6 && !hasGroundBelow(built, p.x, p.y, p.z);

  return {
    moveX,
    moveZ,
    jumpPressed,
    jumpHeld,
    divePressed,
    poundPressed: false
  };
}

/**
 * Autopilot fall rescue: once Pip drops below the spawn height (missed a jump), put him back on the nearest course
 * platform so the demo keeps playing. Returns true when it moved him.
 */
export function autopilotRescue(built: BuiltWorld, p: PlayerState): boolean {
  if (p.swim || p.y >= built.spec.spawn[1] - 0.15) return false;
  let nearest: BuiltWorld["solids"][number] | null = null;
  let bestD = Infinity;
  for (const s of built.solids) {
    if (!s.active || s.decor) continue;
    const d = Math.hypot(s.x - p.x, s.z - p.z);
    if (d < bestD) {
      bestD = d;
      nearest = s;
    }
  }
  if (!nearest) return false;
  p.x = nearest.x;
  p.y = nearest.y + nearest.hy;
  p.z = nearest.z;
  p.vx = 0;
  p.vy = 0;
  p.vz = 0;
  p.grounded = true;
  p.groundId = nearest.id;
  p.state = "grounded";
  return true;
}
