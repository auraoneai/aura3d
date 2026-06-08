/**
 * skeleton-overlay.ts — B2 skeleton-overlay strip.
 *
 * The render proof must show MOTION as a SKELETON (per-bone transforms over time), not as a raw
 * pixel-diff. `render-live.ts` already records per-bone local rotation ranges + the per-frame
 * clip-decision log in `render-live-summary.json` (semantic, mouth/caption/camera-free). This module
 * adds the VISUAL counterpart the PRD asks for: a 3-frame (first / mid / final) bone-projection PNG
 * strip per character, saved to the episode dir.
 *
 * It is intentionally browser-FREE and GPU-FREE: it runs forward kinematics on a canonical humanoid
 * rest skeleton, drives it with the SAME shared standard-library clip the player retargets (so the
 * strip reflects the real library motion), projects the world bone positions orthographically, and
 * rasterizes the bone segments. Deterministic — identical bytes every run for the same inputs — so a
 * unit test can assert the strip is produced and that the three frames differ (the body moved).
 */

// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — resolved at runtime to the freshly-built monorepo dist (has co-located .d.ts).
import {
  createStandardHumanoidClipRegistry,
  type AnimationClipRegistry
} from "@aura3d/animation";

type Vec3 = readonly [number, number, number];
type Quat = readonly [number, number, number, number];

/** Canonical rest skeleton: each bone's PARENT and its parent-relative rest offset (metres). */
interface RestBone {
  readonly parent: string | null;
  readonly offset: Vec3;
}

/**
 * A neutral, roughly-proportioned humanoid in metres (hips at ~0.95m). Mirrors the canonical
 * HUMANOID_BONES the shared library animates; only the bones the standard clips touch need offsets.
 */
const REST_SKELETON: Readonly<Record<string, RestBone>> = {
  hips: { parent: null, offset: [0, 0.95, 0] },
  spine: { parent: "hips", offset: [0, 0.12, 0] },
  chest: { parent: "spine", offset: [0, 0.14, 0] },
  upperChest: { parent: "chest", offset: [0, 0.1, 0] },
  neck: { parent: "upperChest", offset: [0, 0.08, 0] },
  head: { parent: "neck", offset: [0, 0.12, 0] },
  leftShoulder: { parent: "upperChest", offset: [0.06, 0.05, 0] },
  leftUpperArm: { parent: "leftShoulder", offset: [0.14, 0, 0] },
  leftLowerArm: { parent: "leftUpperArm", offset: [0.26, 0, 0] },
  leftHand: { parent: "leftLowerArm", offset: [0.24, 0, 0] },
  rightShoulder: { parent: "upperChest", offset: [-0.06, 0.05, 0] },
  rightUpperArm: { parent: "rightShoulder", offset: [-0.14, 0, 0] },
  rightLowerArm: { parent: "rightUpperArm", offset: [-0.26, 0, 0] },
  rightHand: { parent: "rightLowerArm", offset: [-0.24, 0, 0] },
  leftUpperLeg: { parent: "hips", offset: [0.09, -0.04, 0] },
  leftLowerLeg: { parent: "leftUpperLeg", offset: [0, -0.42, 0] },
  leftFoot: { parent: "leftLowerLeg", offset: [0, -0.42, 0.04] },
  rightUpperLeg: { parent: "hips", offset: [-0.09, -0.04, 0] },
  rightLowerLeg: { parent: "rightUpperLeg", offset: [0, -0.42, 0] },
  rightFoot: { parent: "rightLowerLeg", offset: [0, -0.42, 0.04] }
};

/** Draw order: bone segments (parent → child) that form the visible stick figure. */
const BONE_SEGMENTS: readonly (readonly [string, string])[] = Object.entries(REST_SKELETON)
  .filter(([, b]) => b.parent !== null)
  .map(([child, b]) => [b.parent as string, child] as const);

function qMulV(q: Quat, v: Vec3): Vec3 {
  const [x, y, z, w] = q;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (y * v[2] - z * v[1]);
  const ty = 2 * (z * v[0] - x * v[2]);
  const tz = 2 * (x * v[1] - y * v[0]);
  // v + w*t + cross(q.xyz, t)
  return [
    v[0] + w * tx + (y * tz - z * ty),
    v[1] + w * ty + (z * tx - x * tz),
    v[2] + w * tz + (x * ty - y * tx)
  ];
}

function qMul(a: Quat, b: Quat): Quat {
  return [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
}

const IDENTITY: Quat = [0, 0, 0, 1];

/** Sample a standard clip at `t` into per-bone local rotations (+ hips translation) (canonical names). */
function samplePose(
  clip: { duration: number; loop: boolean; tracks: readonly { target: string; valueType: string; sample(t: number): readonly number[] }[] },
  t: number
): { rotations: Record<string, Quat>; hipsOffset: Vec3 } {
  const duration = clip.duration > 0 ? clip.duration : 1;
  const local = clip.loop ? t % duration : Math.min(t, duration);
  const rotations: Record<string, Quat> = {};
  let hipsOffset: Vec3 = [0, 0, 0];
  for (const track of clip.tracks) {
    const dot = track.target.lastIndexOf(".");
    if (dot < 0) continue;
    const bone = track.target.slice(0, dot);
    const path = track.target.slice(dot + 1);
    const v = track.sample(local);
    if (path === "rotation" && v.length >= 4) rotations[bone] = [v[0]!, v[1]!, v[2]!, v[3]!];
    else if (path === "translation" && bone === "hips" && v.length >= 3) hipsOffset = [v[0]!, v[1]!, v[2]!];
  }
  return { rotations, hipsOffset };
}

/** Forward kinematics: world positions for every bone given local rotations + a hips offset. */
function solveWorld(rotations: Record<string, Quat>, hipsOffset: Vec3): Record<string, Vec3> {
  const worldPos: Record<string, Vec3> = {};
  const worldRot: Record<string, Quat> = {};
  // REST_SKELETON is declared parent-before-child, so a single pass resolves the chain.
  for (const [bone, rest] of Object.entries(REST_SKELETON)) {
    const localRot = rotations[bone] ?? IDENTITY;
    if (rest.parent === null) {
      worldRot[bone] = localRot;
      worldPos[bone] = [rest.offset[0] + hipsOffset[0], rest.offset[1] + hipsOffset[1], rest.offset[2] + hipsOffset[2]];
    } else {
      const pRot = worldRot[rest.parent] ?? IDENTITY;
      const pPos = worldPos[rest.parent] ?? [0, 0, 0];
      const rotated = qMulV(pRot, rest.offset);
      worldPos[bone] = [pPos[0] + rotated[0], pPos[1] + rotated[1], pPos[2] + rotated[2]];
      worldRot[bone] = qMul(pRot, localRot);
    }
  }
  return worldPos;
}

export interface SkeletonStripOptions {
  /** Intent (standard clip id) the strip should visualize (e.g. the character's dominant beat). */
  readonly intent?: string;
  /** Times (seconds) for the three panels. Defaults to first / mid / final of the clip. */
  readonly times?: readonly [number, number, number];
  /** Per-panel pixel size. */
  readonly panelWidth?: number;
  readonly panelHeight?: number;
  /** Optional shared registry (reuse across characters); built if omitted. */
  readonly registry?: AnimationClipRegistry;
  /**
   * Optional allow-list of canonical bone names to draw. When provided, only joints whose bone is in
   * the list are projected and only bone segments whose BOTH endpoints are in the list are drawn.
   * Used by the B5 retargeting overlay to mask the figure down to the bones a target rig actually
   * maps (a sparse mascot draws a sparser stick figure than a full humanoid). Omit to draw the full
   * canonical skeleton.
   */
  readonly bonesAllow?: readonly string[];
}

export interface SkeletonStripResult {
  /** RGBA bytes for the full 3-panel strip (panelWidth*3 × panelHeight). */
  readonly rgba: Uint8Array;
  readonly width: number;
  readonly height: number;
  /** Per-panel projected joint count (a panel with 0 joints means the FK produced nothing — a bug). */
  readonly panelJointCounts: readonly [number, number, number];
  /** Max pixel-difference between the first and final panels (>0 ⇒ the skeleton visibly moved). */
  readonly firstFinalMaxDiff: number;
  readonly intent: string;
}

/**
 * Build a 3-panel (first / mid / final) skeleton-overlay strip for one character's dominant intent.
 * Returns raw RGBA so the caller can encode a PNG with whatever encoder it has (sharp / pngjs / a
 * browser canvas). Pure + deterministic.
 */
export function buildSkeletonStrip(options: SkeletonStripOptions = {}): SkeletonStripResult {
  const intent = options.intent ?? "walk";
  const panelW = options.panelWidth ?? 160;
  const panelH = options.panelHeight ?? 240;
  const registry = options.registry ?? createStandardHumanoidClipRegistry();
  const clip = (registry.get?.(intent) ?? registry.require?.(intent)) as
    | { duration: number; loop: boolean; tracks: readonly { target: string; valueType: string; sample(t: number): readonly number[] }[] }
    | undefined;
  if (!clip) throw new Error(`skeleton-overlay: no standard clip for intent "${intent}".`);

  const duration = clip.duration > 0 ? clip.duration : 1;
  const times = options.times ?? [0, duration / 2, duration * 0.999];
  const allow = options.bonesAllow ? new Set(options.bonesAllow) : null;
  const boneVisible = (bone: string): boolean => (allow ? allow.has(bone) : true);

  const width = panelW * 3;
  const height = panelH;
  const rgba = new Uint8Array(width * height * 4);
  // Background: dark slate (matches the live route).
  for (let i = 0; i < width * height; i += 1) {
    rgba[i * 4] = 11;
    rgba[i * 4 + 1] = 15;
    rgba[i * 4 + 2] = 26;
    rgba[i * 4 + 3] = 255;
  }

  // Orthographic projection: fit the standing figure (~y 0..1.8m, x ±0.7m) into the panel.
  const project = (p: Vec3, panelIndex: number): [number, number] => {
    const sx = panelW * 0.42; // metres → px (x)
    const sy = panelH * 0.46; // metres → px (y)
    const cx = panelIndex * panelW + panelW / 2;
    const cy = panelH * 0.92; // ground line near the bottom
    return [cx + p[0] * sx, cy - (p[1] - 0.0) * sy];
  };

  const panelJointCounts: [number, number, number] = [0, 0, 0];
  for (let panel = 0; panel < 3; panel += 1) {
    const { rotations, hipsOffset } = samplePose(clip, times[panel]!);
    const world = solveWorld(rotations, hipsOffset);
    panelJointCounts[panel] = Object.keys(world).filter((b) => boneVisible(b)).length;
    // Bone segments (only when both endpoints are visible under the allow-list).
    for (const [a, b] of BONE_SEGMENTS) {
      if (!boneVisible(a) || !boneVisible(b)) continue;
      const wa = world[a];
      const wb = world[b];
      if (!wa || !wb) continue;
      drawLine(rgba, width, height, project(wa, panel), project(wb, panel), [158, 255, 162]);
    }
    // Joint dots (visible bones only).
    for (const [bone, pos] of Object.entries(world)) {
      if (!boneVisible(bone)) continue;
      const [px, py] = project(pos, panel);
      drawDot(rgba, width, height, px, py, [255, 224, 130]);
    }
    // Panel divider.
    if (panel > 0) {
      for (let y = 0; y < height; y += 1) setPixel(rgba, width, height, panel * panelW, y, [40, 56, 80]);
    }
  }

  // First-vs-final visible difference (proves the body moved across the strip).
  let firstFinalMaxDiff = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < panelW; x += 1) {
      const iFirst = (y * width + x) * 4;
      const iFinal = (y * width + (x + panelW * 2)) * 4;
      const d =
        Math.abs(rgba[iFirst]! - rgba[iFinal]!) +
        Math.abs(rgba[iFirst + 1]! - rgba[iFinal + 1]!) +
        Math.abs(rgba[iFirst + 2]! - rgba[iFinal + 2]!);
      firstFinalMaxDiff = Math.max(firstFinalMaxDiff, d);
    }
  }

  return { rgba, width, height, panelJointCounts, firstFinalMaxDiff, intent };
}

function setPixel(buf: Uint8Array, w: number, h: number, x: number, y: number, rgb: readonly [number, number, number]): void {
  const xi = Math.round(x);
  const yi = Math.round(y);
  if (xi < 0 || yi < 0 || xi >= w || yi >= h) return;
  const i = (yi * w + xi) * 4;
  buf[i] = rgb[0];
  buf[i + 1] = rgb[1];
  buf[i + 2] = rgb[2];
  buf[i + 3] = 255;
}

function drawDot(buf: Uint8Array, w: number, h: number, x: number, y: number, rgb: readonly [number, number, number]): void {
  for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) setPixel(buf, w, h, x + dx, y + dy, rgb);
}

function drawLine(
  buf: Uint8Array,
  w: number,
  h: number,
  a: readonly [number, number],
  b: readonly [number, number],
  rgb: readonly [number, number, number]
): void {
  let x0 = Math.round(a[0]);
  let y0 = Math.round(a[1]);
  const x1 = Math.round(b[0]);
  const y1 = Math.round(b[1]);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  // Cap iterations defensively.
  for (let guard = 0; guard < 4096; guard += 1) {
    setPixel(buf, w, h, x0, y0, rgb);
    setPixel(buf, w, h, x0 + 1, y0, rgb); // 2px stroke for visibility
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }
}
