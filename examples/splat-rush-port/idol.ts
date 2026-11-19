/**
 * Splat Rush Idol pass (presentation only): high-detail image-to-3D GLBs (`speridlabs/idol/max`, spec
 * `tools/idol/specs/splat-rush-port.json`, admitted through `tools/idol/admit.sh`) replace the code-built paint-runner
 * mascot on the roller cradle, the floating-island backdrop, the power-up pickups, the carnival milestone arches and the
 * roadside sweeper mascots. `sim.ts` is untouched (the reference replay stays exact); the ball, road, gates, splatters,
 * bunting and particles keep their toon shaders, so every gameplay colour token still reads exactly as before.
 */
import { group, instances, model, type AuraApp } from "@aura3d/engine";
import { SPLAT_IDOL_ASSETS as assets } from "../../apps/showcase-splat-rush-port/src/idol-assets";
import type { Powerup } from "./sim";

type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

/** Idol GLB dimensions after `tools/idol/normalize.mjs` (x width, y height, z length; grounded at y = 0, centred in x/z, front +Z). */
export const IDOL_DIMS = {
  /** Rigged GLBs are stored at unit height (T-pose); `RUNNER_SCALE` is the generator's `normalized.sceneScale`. */
  splatRunnerRig: [0.875, 0.999, 0.398],
  splatFinishArch: [10, 9.413, 2.569],
  splatSweeperBot: [1.83, 1.729, 1.016],
  splatPickupRainbow: [1.984, 2.1, 1.983],
  splatPickupShield: [1.707, 2.1, 0.491],
  splatPickupDouble: [1.961, 2.1, 1.878],
  splatPickupSwitch: [2.1, 1.13, 2.096],
  splatIslandTree: [9.569, 10, 9.182],
  splatIslandTower: [8.582, 12, 8.803],
  splatBalloon: [4.709, 7.5, 4.699],
  splatIslandPaintPot: [9.296, 10, 9.665],
  splatIslandPalette: [8.113, 10, 7.804],
  splatIslandEasel: [9.803, 12, 10.063]
} as const satisfies Record<string, readonly [number, number, number]>;

export type IdolKey = keyof typeof IDOL_DIMS;
/** Every Idol asset key the game mounts (art-direction contract + tests). */
export const SPLAT_IDOL_KEYS = Object.keys(IDOL_DIMS) as IdolKey[];

const maxDim = (key: IdolKey): number => Math.max(...IDOL_DIMS[key]);

/**
 * A typed Idol model wrapped in a runtime group so the group pivot sits at the old procedural pivot: the GLB is scaled to
 * `size` (largest dimension) and lifted by `-anchor * height` (0.5 = centre, 0.42 = the former "waist" anchor).
 */
export function idolPieceNode(
  id: string,
  key: IdolKey,
  opts: { readonly size: number; readonly anchor: number; readonly tilt?: number; readonly castShadow?: boolean; readonly receiveShadow?: boolean }
) {
  const s = opts.size / maxDim(key);
  const lift = opts.anchor * IDOL_DIMS[key][1] * s;
  /* `tilt` pitches the model about its anchor point towards the chase camera (+Z) */
  const t = opts.tilt ?? 0;
  return group(id, [
    model(assets[key], { name: `${id}-idol`, scaleMode: "world", castShadow: opts.castShadow ?? false, receiveShadow: opts.receiveShadow ?? false })
      .position(0, -lift * Math.cos(t), -lift * Math.sin(t))
      .rotation(t, 0, 0)
      .scale(s)
  ]).runtime({ id });
}

/* ------------------------------------------------------------------ hero runner */

/** Runtime id of the Idol paint-runner riding the aft cradle of the roller collar (same transform as `ball-roller`). */
export const HERO_RUNNER_ID = "hero-runner";
/** Cradle deck point in the ball-local frame (the procedural runner stood at z 0.5..0.74; the Idol figure reaches 0.49 m front-to-back, so it stands 0.16 m further aft to keep its hands out of the 0.55 m ball). */
export const HERO_RUNNER_FOOT = { y: -0.15, z: 0.78 } as const;

/** `splatRunnerRig.idol.json` -> `normalized.sceneScale` (0.62 m tall kid). */
export const RUNNER_SCALE = 0.62;
/** Runtime id of the rigged runner model inside the cradle group (posed and foot-planted every frame by world.ts). */
export const HERO_RUNNER_BODY_ID = "hero-runner-body";

/**
 * The rigged runner is a TOP-LEVEL model node: world.ts composes its world transform every frame from the ball-roller
 * pose (ball position, roller pitch / bank, ball scale) and the planted-feet offset on the cradle deck. A runtime id
 * nested inside a group was positioned in world space by the runtime, which left the runner off the cradle (unseen).
 * `HERO_RUNNER_ID` stays an (empty) runtime group for existing callers. Hidden until its skeleton has loaded.
 */
export function heroRunnerNode() {
  return group(HERO_RUNNER_ID, []).runtime({ id: HERO_RUNNER_ID });
}

export function heroRunnerBodyNode() {
  return model(assets.splatRunnerRig, { name: "hero-runner-idol", scaleMode: "world", castShadow: true, receiveShadow: true, scale: RUNNER_SCALE, visible: false })
    .position(0, -60, 0)
    .runtime({ id: HERO_RUNNER_BODY_ID });
}

/** Cradle-local position (ball-roller frame) that puts the posed feet (model space, unscaled) on the deck; model turned by Ry(pi). */
export function runnerPlant(feet: readonly [number, number, number]): [number, number, number] {
  return [RUNNER_SCALE * feet[0], HERO_RUNNER_FOOT.y - RUNNER_SCALE * feet[1], HERO_RUNNER_FOOT.z + RUNNER_SCALE * feet[2]];
}

type V3 = readonly [number, number, number];
/** Column-major `T · Rz · Ry · Rx · S` (engine node order). */
function trs(t: V3, r: V3, s: number): Float32Array {
  const cx = Math.cos(r[0]), sx = Math.sin(r[0]), cy = Math.cos(r[1]), sy = Math.sin(r[1]), cz = Math.cos(r[2]), sz = Math.sin(r[2]);
  return Float32Array.from([
    cz * cy * s, sz * cy * s, -sy * s, 0,
    (cz * sy * sx - sz * cx) * s, (sz * sy * sx + cz * cx) * s, cy * sx * s, 0,
    (cz * sy * cx + sz * sx) * s, (sz * sy * cx - cz * sx) * s, cy * cx * s, 0,
    t[0], t[1], t[2], 1
  ]);
}
function mul(a: Float32Array, b: Float32Array): Float32Array {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
  return o;
}

/**
 * World transform of the rigged runner: roller frame (`ballPos`, `rollerRot`, `ballScale`) · T(plant) · Ry(pi) ·
 * S(RUNNER_SCALE), decomposed into position / Euler (R = Rz · Ry · Rx) / uniform scale for the runtime handle.
 */
export function runnerWorld(ballPos: V3, rollerRot: V3, ballScale: number, plant: V3): { position: [number, number, number]; rotation: [number, number, number]; scale: number } {
  const m = mul(trs(ballPos, rollerRot, ballScale), trs(plant, [0, Math.PI, 0], RUNNER_SCALE));
  const s = Math.hypot(m[0]!, m[1]!, m[2]!) || 1;
  const ry = Math.asin(Math.max(-1, Math.min(1, -m[2]! / s)));
  return { position: [m[12]!, m[13]!, m[14]!], rotation: [Math.atan2(m[6]! / s, m[10]! / s), ry, Math.atan2(m[1]! / s, m[0]! / s)], scale: s };
}

/* ------------------------------------------------------------------ pickups */

/** The switch charm reconstructs lying flat (a disc facing up): pitch it towards the chase camera so its face reads. */
export const PICKUP_TILT: Record<Powerup["type"], number> = { rainbow: 0, shield: 0, x2: 0, switch: 0.9 };

export const PICKUP_KEY: Record<Powerup["type"], IdolKey> = {
  rainbow: "splatPickupRainbow",
  shield: "splatPickupShield",
  x2: "splatPickupDouble",
  switch: "splatPickupSwitch"
};

/* ------------------------------------------------------------------ pooled instanced pieces */

const PARK_Y = -60;

/**
 * Pooled instanced GLB (`instances.model` + dense `setInstanceMatrices`): `place`/`collapse` per slot like `Batch`,
 * `flush` uploads only the live slots so parked slots never cost vertex work. Transform `T · Ry(yaw) · S`.
 */
export class IdolPool {
  private readonly live: Uint8Array;
  private readonly pose: Float32Array;
  private readonly matrices: Float32Array;
  private dirty = true;
  /** Frame offset baked into every matrix: the dense-matrix path ignores the node's own position (see `flush`). */
  private ox = 0;
  private oy = 0;
  private oz = 0;

  constructor(readonly capacity: number) {
    this.live = new Uint8Array(capacity);
    this.pose = new Float32Array(capacity * 6);
    this.matrices = new Float32Array(capacity * 16);
  }

  /** `lateral` stretches the model across the road (its local x) on top of the uniform `scale`. */
  place(i: number, x: number, y: number, z: number, yaw: number, scale = 1, lateral = 1): void {
    if (i < 0 || i >= this.capacity) return;
    const o = i * 6, p = this.pose;
    if (this.live[i] === 1 && p[o] === x && p[o + 1] === y && p[o + 2] === z && p[o + 3] === yaw && p[o + 4] === scale && p[o + 5] === lateral) return;
    p[o] = x; p[o + 1] = y; p[o + 2] = z; p[o + 3] = yaw; p[o + 4] = scale; p[o + 5] = lateral;
    this.live[i] = 1;
    this.dirty = true;
  }

  collapse(i: number): void {
    if (i < 0 || i >= this.capacity || this.live[i] === 0) return;
    this.live[i] = 0;
    this.dirty = true;
  }

  get liveCount(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) n += this.live[i]!;
    return n;
  }

  /** `offset`: the scrolling road frame; the dense-matrix path ignores the node's own position, so it is baked in here. */
  flush(handle: NodeHandle, force = false, offset: readonly [number, number, number] = [0, 0, 0]): void {
    if (offset[0] !== this.ox || offset[1] !== this.oy || offset[2] !== this.oz) {
      this.ox = offset[0]; this.oy = offset[1]; this.oz = offset[2];
      this.dirty = true;
    }
    if (!this.dirty && !force) return;
    this.dirty = false;
    let n = 0;
    const m = this.matrices, p = this.pose;
    const write = (x: number, y: number, z: number, yaw: number, s: number, lateral = 1): void => {
      const c = Math.cos(yaw) * s, si = Math.sin(yaw) * s, o = n * 16;
      m[o] = c * lateral; m[o + 1] = 0; m[o + 2] = -si * lateral; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = si; m[o + 9] = 0; m[o + 10] = c; m[o + 11] = 0;
      m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
      n++;
    };
    for (let i = 0; i < this.capacity; i++) {
      if (this.live[i] !== 1) continue;
      const o = i * 6;
      write(p[o]! + this.ox, p[o + 1]! + this.oy, p[o + 2]! + this.oz, p[o + 3]!, p[o + 4]!, p[o + 5]!);
    }
    if (n === 0) write(0, PARK_Y, 0, 0, 0.001);
    handle.setInstanceMatrices?.(m, n);
  }
}

/** One pooled instanced Idol GLB node (`runtime id = id`), parked until the first `IdolPool.flush`. */
export function idolInstancedNode(id: string, key: IdolKey, capacity: number, shadow: { cast?: boolean; receive?: boolean } = {}) {
  return instances
    .model(assets[key], {
      name: id,
      scaleMode: "world",
      transforms: Array.from({ length: capacity }, () => ({ position: [0, PARK_Y, 0] as const, scale: 0.001 })),
      castShadow: shadow.cast ?? false,
      receiveShadow: shadow.receive ?? false
    })
    .runtime({ id });
}
