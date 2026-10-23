/**
 * Where the Wind Wanders — meadow simulation (pure, framework-free).
 *
 * Reproduces the original's `ashore` mode movement and collision from the captured module
 * (tests/fixtures/crayon/where-the-wind-wanders/): 3.2 u/s camera-relative walking, the
 * walkable-area clamp, fixed circle colliders, rail polylines resolved by a sub-stepped
 * 4-pass wall slide, letter and bell interaction, facing and stride, and the hop phases.
 * Boat, island and bench modes are NOT ported (see PORTING-NOTES.md).
 *
 * The step order matches the harness and the original event loop: key transitions and the
 * one-shot actions (`E`, `Space`) are applied first, then one frame of `dtMs` is simulated.
 */

export const VIRTUAL_STEP_MS = 16.7;
export const WALK_SPEED = 3.2;
export const PLAYER_RADIUS = 0.38;
export const MAX_DT = 0.04;

export interface Vec2 { x: number; z: number }
export type Facing = "front" | "frontRight" | "right" | "backRight" | "back" | "backLeft" | "left" | "frontLeft";
export type HopPhase = "idle" | "takeoff" | "air" | "landing";

export const BOUNDS = { minX: -59, maxX: 58, minZ: -18, maxZ: 22 } as const;

export const STRUCTURES = {
  cottage: { x: -4, z: -13, height: 12.2, r: 4.25 },
  windmill: { x: 18, z: -11.5, height: 24, r: 4.4 },
  distantCottage: { x: -49, z: -16, height: 11.4, r: 4 }
} as const;

export const CIRCLES: readonly { x: number; z: number; r: number }[] = [
  { x: -25, z: 0, r: 1.2 },
  STRUCTURES.cottage,
  STRUCTURES.windmill,
  STRUCTURES.distantCottage,
  { x: 35, z: 8, r: 1.1 },
  { x: -43, z: -8, r: 1 },
  { x: 49, z: 3, r: 0.8 }
];

export const LETTERS = [
  { id: "oak", place: "The Old Oak Grove", x: -25, z: 3 },
  { id: "mill", place: "The Sleeping Windmill", x: 18, z: -5 },
  { id: "water", place: "The Glasswater Shore", x: 31, z: -15 }
] as const;

export const BELL = { x: 49, z: 5 } as const;
export const LETTER_REACH = 2.65;
export const BELL_REACH = 3.1;
export const START: Vec2 = { x: -12, z: 4 };

/** Where the look target settles relative to the traveller, and the easing rates of target and camera (per second). */
export const CAMERA_FOLLOW = { x: 2, z: -3.5 } as const;
export const TARGET_RATE = 2.5;
export const CAMERA_RATE = 3;

/** Camera offset from its look target. At rest this gives the walking axes below; while walking the lag tilts them (see `cameraAxes`). */
export const CAMERA_OFFSET = { x: -1.4, y: 4.5, z: 20.5 } as const;
const camLen = Math.hypot(CAMERA_OFFSET.x, CAMERA_OFFSET.y, CAMERA_OFFSET.z);
const fwd = { x: -CAMERA_OFFSET.x / camLen, z: -CAMERA_OFFSET.z / camLen };
const rightLen = Math.hypot(-fwd.z, fwd.x);
export const AXIS_RIGHT: Vec2 = { x: -fwd.z / rightLen, z: fwd.x / rightLen };
export const AXIS_UP: Vec2 = { x: -AXIS_RIGHT.z, z: AXIS_RIGHT.x };

/** Walking axes from the camera's current x/z offset: right = (dz, -dx) normalised, up = (-right.z, right.x). */
export function cameraAxes(cam: { bx: number; bz: number; vx: number; vz: number }): { right: Vec2; up: Vec2 } {
  const dx = cam.vx - cam.bx;
  const dz = cam.vz - cam.bz;
  const len = Math.hypot(dx, dz) || 1;
  const right = { x: dz / len, z: -dx / len };
  return { right, up: { x: -right.z, z: right.x } };
}

const lerp = (a: number, b: number, t: number): number => (1 - t) * a + t * b;
const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

function railLine(x0: number, z0: number, x1: number, z1: number): Vec2[] {
  const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 2.4);
  return Array.from({ length: n + 1 }, (_, i) => ({ x: lerp(x0, x1, i / n), z: lerp(z0, z1, i / n) }));
}

/** Static rails: world edge, the cliff line with its jetty gaps, and the arcs around the three structures. */
export function buildStaticRails(): Vec2[][] {
  const { minX, maxX, minZ, maxZ } = BOUNDS;
  const rails: Vec2[][] = [
    railLine(minX, minZ, minX, maxZ),
    railLine(minX, maxZ, maxX, maxZ),
    railLine(maxX, maxZ, maxX, -13),
    railLine(minX, minZ, 12, minZ),
    railLine(12, minZ, 12, -13),
    railLine(12, -13, 29.6, -13),
    railLine(32.5, -13, 53.6, -13),
    railLine(56.4, -13, maxX, -13)
  ];
  for (const s of Object.values(STRUCTURES)) {
    const arc: Vec2[] = [];
    for (let a = 0; a <= 20; a++) {
      const r = 0.2 * Math.PI + (a / 20) * Math.PI * 1.6;
      arc.push({ x: s.x + Math.sin(r) * (s.r + 0.12), z: s.z + Math.cos(r) * (s.r + 0.12) });
    }
    rails.push(arc);
  }
  return rails;
}

/** The fence sprites' two-point rails. Sprite aspect 570:290, rail half length 0.46 * sprite width, yaw 0. */
export const FENCE_ASPECT = 570 / 290;
export function buildFenceRails(): Vec2[][] {
  const fences: { x: number; z: number; scale: number }[] = [];
  for (let x = -18; x < -7; x += 4) fences.push({ x, z: -4, scale: 1.45 });
  for (let x = 25; x < 42; x += 4) fences.push({ x, z: 7, scale: 1.35 });
  return fences.map((f) => {
    const half = 0.46 * (f.scale * FENCE_ASPECT);
    return [-1, 1].map((side) => ({ x: f.x + side * half * Math.cos(0), z: f.z - side * half * Math.sin(0) }));
  });
}

export const RAILS: readonly (readonly Vec2[])[] = [...buildStaticRails(), ...buildFenceRails()];

/** The original's walkable-area clamp (bounds, jetty gaps in the cliff line, fixed circles). */
export function clampWalkable(p: Vec2): Vec2 {
  const t = {
    x: Math.max(BOUNDS.minX, Math.min(BOUNDS.maxX, p.x)),
    z: Math.max(p.x >= 53.6 && p.x <= 56.4 ? -22 : BOUNDS.minZ, Math.min(BOUNDS.maxZ, p.z))
  };
  if (t.x > 12 && t.z < -13 && !(t.x > 29.6 && t.x < 32.5) && !(t.x >= 53.6 && t.x <= 56.4)) t.z = -13;
  for (const c of CIRCLES) {
    const dx = t.x - c.x;
    const dz = t.z - c.z;
    const d = Math.hypot(dx, dz);
    if (d < c.r) {
      t.x = c.x + (d > 1e-6 ? dx / d : 1) * c.r;
      t.z = c.z + (d > 1e-6 ? dz / d : 0) * c.r;
    }
  }
  return t;
}

/** Sub-stepped wall slide against rail polylines (4 passes per sub-step, rails in order). */
export function slideAlongRails(from: Vec2, to: Vec2, rails: readonly (readonly Vec2[])[], radius = PLAYER_RADIUS): Vec2 {
  const n = Math.max(1, Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / (0.4 * radius)));
  const ox = (to.x - from.x) / n;
  const oz = (to.z - from.z) / n;
  const s = { x: from.x, z: from.z };
  for (let k = 0; k < n; k++) {
    const prev = { x: s.x, z: s.z };
    s.x += ox;
    s.z += oz;
    for (let pass = 0; pass < 4; pass++) {
      for (const rail of rails) {
        for (let a = 1; a < rail.length; a++) {
          const p0 = rail[a - 1]!;
          const p1 = rail[a]!;
          const ix = p1.x - p0.x;
          const iz = p1.z - p0.z;
          const len2 = ix * ix + iz * iz;
          const t = len2 ? Math.max(0, Math.min(1, ((s.x - p0.x) * ix + (s.z - p0.z) * iz) / len2)) : 0;
          const cx = p0.x + t * ix;
          const cz = p0.z + t * iz;
          let fx = s.x - cx;
          let fz = s.z - cz;
          let d = Math.hypot(fx, fz);
          if (d >= radius) continue;
          if (d < 1e-8) {
            fx = prev.x - cx;
            fz = prev.z - cz;
            d = Math.hypot(fx, fz);
            if (d < 1e-8) {
              fx = -iz;
              fz = ix;
              d = Math.hypot(fx, fz) || 1;
            }
          }
          s.x = cx + (fx / d) * (radius + 1e-4);
          s.z = cz + (fz / d) * (radius + 1e-4);
        }
      }
    }
  }
  return s;
}

const FACINGS: readonly Facing[] = ["front", "frontRight", "right", "backRight", "back", "backLeft", "left", "frontLeft"];

/** The original's facing selector: keeps the current facing inside a hysteresis cone, else snaps to 45 degrees. */
export function nextFacing(gx: number, gz: number, current: Facing): Facing {
  if (Math.hypot(gx, gz) < 1e-4) return current;
  const heading = Math.atan2(gx, gz);
  const base = (FACINGS.indexOf(current) * Math.PI) / 4;
  const delta = Math.atan2(Math.sin(heading - base), Math.cos(heading - base));
  return Math.abs(delta) < Math.PI / 8 + 0.06 ? current : FACINGS[(Math.round(heading / (Math.PI / 4)) + 8) % 8]!;
}

export interface Held { W: boolean; A: boolean; S: boolean; D: boolean }
export type Action = "E" | "Space" | null;
export interface FrameInput { keys: string; act: Action }

export interface WindState {
  step: number;
  pos: Vec2;
  facing: Facing;
  stride: number;
  found: number[];
  complete: boolean;
  hop: { phase: HopPhase; elapsed: number; height: number };
  messages: string[];
  moved: boolean;
  /** Camera look target and position (x/z only; they set the walking axes). Starts at rest. */
  cam: { bx: number; bz: number; vx: number; vz: number };
}

export function createState(): WindState {
  return {
    step: 0, pos: { ...START }, facing: "front", stride: 0, found: [], complete: false, hop: { phase: "idle", elapsed: 0, height: 0 }, messages: [], moved: false,
    cam: { bx: START.x + CAMERA_FOLLOW.x, bz: START.z + CAMERA_FOLLOW.z, vx: START.x + CAMERA_FOLLOW.x + CAMERA_OFFSET.x, vz: START.z + CAMERA_FOLLOW.z + CAMERA_OFFSET.z }
  };
}

/** Nearest un-found letter inside the reach radius, and whether the bell is in reach. */
export function nearbyInteraction(pos: Vec2, found: readonly number[]): { letter: number; bell: boolean } {
  let letter = -1;
  let best = LETTER_REACH;
  LETTERS.forEach((l, i) => {
    const d = Math.hypot(pos.x - l.x, pos.z - l.z);
    if (!found.includes(i) && d < best) {
      letter = i;
      best = d;
    }
  });
  return { letter, bell: Math.hypot(pos.x - BELL.x, pos.z - BELL.z) < BELL_REACH };
}

function interact(s: WindState): void {
  const near = nearbyInteraction(s.pos, s.found);
  if (near.letter >= 0) {
    s.found.push(near.letter);
    s.messages.push(`letter:${LETTERS[near.letter]!.id}`);
  } else if (near.bell) {
    if (s.found.length === 3) {
      s.complete = true;
      s.messages.push("bell:complete");
    } else s.messages.push("bell:locked");
  } else s.messages.push("hint");
}

function advanceHop(h: WindState["hop"], dt: number): void {
  let remaining = Math.max(0, dt);
  while (remaining > 0 && h.phase !== "idle") {
    const dur = h.phase === "takeoff" ? 0.1 : h.phase === "air" ? 11.2 / 13 : 0.16;
    const used = Math.min(remaining, dur - h.elapsed);
    h.elapsed += used;
    remaining -= used;
    h.height = h.phase === "air" ? Math.max(0, 5.6 * h.elapsed - 6.5 * h.elapsed ** 2) : 0;
    if (h.elapsed >= dur - 1e-9) {
      h.phase = h.phase === "takeoff" ? "air" : h.phase === "air" ? "landing" : "idle";
      h.elapsed = 0;
      h.height = 0;
    }
  }
}

/** Advance one frame. `keys` holds the held movement keys (letters W/A/S/D). */
export function stepFrame(s: WindState, input: FrameInput, dtMs = VIRTUAL_STEP_MS): WindState {
  s.messages = [];
  if (input.act === "E") interact(s);
  if (input.act === "Space" && s.hop.phase === "idle") {
    s.hop.phase = "takeoff";
    s.hop.elapsed = 0;
  }
  const dt = clamp(dtMs / 1000, 0, MAX_DT);
  const gx = (input.keys.includes("D") ? 1 : 0) - (input.keys.includes("A") ? 1 : 0);
  const gz = (input.keys.includes("S") ? 1 : 0) - (input.keys.includes("W") ? 1 : 0);
  let moved = false;
  if (gx || gz) {
    const len = Math.hypot(gx, gz);
    const axes = cameraAxes(s.cam);
    const nx = (axes.right.x * gx + axes.up.x * gz) / len;
    const nz = (axes.right.z * gx + axes.up.z * gz) / len;
    s.facing = nextFacing(gx, gz, s.facing);
    const stepLen = WALK_SPEED * dt;
    const wanted = { x: s.pos.x + nx * stepLen, z: s.pos.z + nz * stepLen };
    const resolved = slideAlongRails(s.pos, clampWalkable(wanted), RAILS);
    const travelled = Math.hypot(resolved.x - s.pos.x, resolved.z - s.pos.z);
    moved = travelled >= 1e-4;
    s.pos = resolved;
    s.stride += travelled / 2.2;
  }
  advanceHop(s.hop, dt);
  // camera follow runs after movement, as in the original frame: target eases to the traveller, camera eases to target + offset
  const kb = 1 - Math.exp(-TARGET_RATE * dt);
  s.cam.bx += (s.pos.x + CAMERA_FOLLOW.x - s.cam.bx) * kb;
  s.cam.bz += (s.pos.z + CAMERA_FOLLOW.z - s.cam.bz) * kb;
  const kv = 1 - Math.exp(-CAMERA_RATE * dt);
  s.cam.vx += (s.cam.bx + CAMERA_OFFSET.x - s.cam.vx) * kv;
  s.cam.vz += (s.cam.bz + CAMERA_OFFSET.z - s.cam.vz) * kv;
  s.moved = moved;
  s.step++;
  return s;
}

export interface ScriptSegment { keys: string; act: Action; steps: number }

export function expandScript(segments: readonly ScriptSegment[]): FrameInput[] {
  const out: FrameInput[] = [];
  for (const seg of segments) for (let i = 0; i < seg.steps; i++) out.push({ keys: seg.keys, act: i === 0 ? seg.act : null });
  return out;
}

/** The harness records an action as its own one-step segment; this keeps the mapping explicit. */
export function runScript(segments: readonly ScriptSegment[], dtMs = VIRTUAL_STEP_MS): { xs: number[]; zs: number[]; state: WindState; messages: { step: number; text: string }[] } {
  const s = createState();
  const xs: number[] = [];
  const zs: number[] = [];
  const messages: { step: number; text: string }[] = [];
  for (const frame of expandScript(segments)) {
    stepFrame(s, frame, dtMs);
    xs.push(s.pos.x);
    zs.push(s.pos.z);
    for (const m of s.messages) messages.push({ step: s.step, text: m });
  }
  return { xs, zs, state: s, messages };
}
