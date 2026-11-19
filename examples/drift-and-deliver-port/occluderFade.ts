/**
 * Owner QA (Nov 18): fade the street trees, palms and lamp posts that stand between the chase eye and the courier.
 * Presentation only (nothing feeds the sim, solids or replay). Each fadeable prop layer is an instanced draw; an instance
 * whose occluder volume (one or more vertical cylinders) cuts the eye-to-courier sightline steps out of its opaque draws
 * into translucent "ghost" draws of the same geometry (two stages, so it eases out over ~0.15 s instead of popping), and
 * steps back once the sightline has been clear for `FADE.holdSeconds`.
 */
import type { AuraColor, AuraTransformSpec } from "@aura3d/engine";

/** A vertical cylinder in world metres (the part of a prop that can hide the car). */
export interface OccluderVolume {
  readonly x: number;
  readonly z: number;
  readonly r: number;
  readonly yMin: number;
  readonly yMax: number;
}

export interface FadeLayer {
  /** Runtime ids of the opaque instanced draws of this prop kind (all share `transforms` order). */
  readonly opaqueIds: readonly string[];
  /** Runtime ids of the ghost draws, most opaque first (one per fade stage). */
  readonly ghostIds: readonly string[];
  /** The instance transforms the opaque draws were built with. */
  readonly transforms: readonly AuraTransformSpec[];
  /** Occluder volumes per instance. */
  readonly volumes: readonly (readonly OccluderVolume[])[];
  /** Per-instance colours of the opaque draws that are tinted per instance (re-sent with every instance write). */
  readonly colors?: Readonly<Record<string, readonly AuraColor[]>>;
}

export const FADE = {
  /** Seconds per ghost stage while fading out / back in. */
  stageSeconds: 0.075,
  /** The sightline must stay clear this long before a prop comes back (no flicker at the edge). */
  holdSeconds: 0.35,
  /** The last metres of the sightline at the courier are ignored (a prop beside the car is not "in front" of it). */
  nearCarMetres: 1.2,
  /** Ghost opacities per stage. */
  opacities: [0.5, 0.2] as const,
  /** Under-the-road parking spot for hidden instances. */
  parkedY: -200
} as const;

type V3 = readonly [number, number, number];

/**
 * Trunk + crown cylinders of a street tree or palm standing at `t` (a model `bounds` = [w, h, d] metres at scale 1,
 * grounded at y = 0): the trunk is a thin post, the crown the wide upper ~55-60 % of the height.
 */
export function vegetationOccluderVolumes(t: AuraTransformSpec, bounds: readonly number[]): OccluderVolume[] {
  const [bw = 3, bh = 5, bd = 3] = bounds;
  const s = typeof t.scale === "number" ? t.scale : 1;
  const x = t.position?.[0] ?? 0, z = t.position?.[2] ?? 0, y = t.position?.[1] ?? 0;
  const top = y + bh * s;
  return [
    { x, z, r: 0.3 * s, yMin: y, yMax: top },
    { x, z, r: 0.45 * Math.max(bw, bd) * s, yMin: y + 0.4 * bh * s, yMax: top }
  ];
}

/**
 * Points on the courier that must stay visible (owner QA Nov 19: a crown covering only the bonnet or the roof edge also
 * hid the car): the body centre plus roof-height and sill-height points at the four corners and both mid-sides.
 * `heading` 0 faces +Z.
 */
export function courierSightTargets(x: number, z: number, heading: number, half = { w: 0.9, l: 2.0, roof: 1.45 }): V3[] {
  const s = Math.sin(heading), c = Math.cos(heading);
  const at = (along: number, across: number, y: number): V3 => [x + s * along + c * across, y, z + c * along - s * across];
  const out: V3[] = [[x, 1.0, z]];
  for (const along of [-half.l, 0, half.l]) for (const across of [-half.w, half.w]) out.push(at(along, across, half.roof), at(along, across, 0.6));
  return out;
}

/**
 * True when the segment `eye -> target` (shortened by `FADE.nearCarMetres` at the target end) passes through the
 * cylinder. Exact: the XZ interval where the segment is inside the circle, then the segment's height over that interval
 * against the cylinder's height range.
 */
export function sightlineHits(eye: V3, target: V3, v: OccluderVolume, nearCar: number = FADE.nearCarMetres): boolean {
  const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
  const len = Math.hypot(dx, dy, dz);
  if (len < 1e-6) return false;
  const sMax = Math.max(0, 1 - nearCar / len);
  const fx = eye[0] - v.x, fz = eye[2] - v.z;
  const a = dx * dx + dz * dz;
  const b = 2 * (fx * dx + fz * dz);
  const c = fx * fx + fz * fz - v.r * v.r;
  let s0: number, s1: number;
  if (a < 1e-9) {
    if (c > 0) return false;
    s0 = 0;
    s1 = sMax;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return false;
    const q = Math.sqrt(disc);
    s0 = Math.max(0, (-b - q) / (2 * a));
    s1 = Math.min(sMax, (-b + q) / (2 * a));
  }
  if (s1 < s0) return false;
  const y0 = eye[1] + dy * s0, y1 = eye[1] + dy * s1;
  return Math.min(y0, y1) <= v.yMax && Math.max(y0, y1) >= v.yMin;
}

interface LayerState {
  readonly layer: FadeLayer;
  /** Per instance: 0 = opaque, 1..stages = ghost stage index + 1. */
  readonly stage: Uint8Array;
  /** Seconds since the instance last occluded (fading in) / in its current stage. */
  readonly clear: Float32Array;
  readonly timer: Float32Array;
  readonly opaque: AuraTransformSpec[];
  readonly ghosts: AuraTransformSpec[][];
  dirty: boolean;
}

const parked = (t: AuraTransformSpec): AuraTransformSpec => ({ ...t, position: [t.position?.[0] ?? 0, FADE.parkedY, t.position?.[2] ?? 0] });

/** Writes instance lists to the runtime draws (`setInstances`); injected so the logic stays testable without an app. */
export type InstanceWriter = (id: string, transforms: readonly AuraTransformSpec[], colors?: readonly AuraColor[]) => void;

export interface OccluderFader {
  /**
   * Steps every layer for this frame's eye and courier point(s); a prop occludes when it cuts the sightline to any of
   * them. Writes only the draws whose lists changed.
   */
  update(dt: number, eye: V3, target: V3 | readonly V3[], write: InstanceWriter): void;
  /** Instances currently out of their opaque draw, per layer (QA / tests). */
  faded(): number[][];
  /** The layers this fader drives. */
  layers(): readonly FadeLayer[];
}

export function createOccluderFader(layers: readonly FadeLayer[]): OccluderFader {
  const stages = FADE.opacities.length;
  const states: LayerState[] = layers.map((layer) => ({
    layer,
    stage: new Uint8Array(layer.transforms.length),
    clear: new Float32Array(layer.transforms.length).fill(Infinity),
    timer: new Float32Array(layer.transforms.length),
    opaque: layer.transforms.map((t) => ({ ...t })),
    ghosts: layer.ghostIds.map(() => []),
    dirty: false
  }));
  return {
    update(dt, eye, target, write) {
      const targets: readonly V3[] = typeof target[0] === "number" ? [target as V3] : (target as readonly V3[]);
      let minX = eye[0], maxX = eye[0], minZ = eye[2], maxZ = eye[2];
      for (const t of targets) {
        minX = Math.min(minX, t[0]); maxX = Math.max(maxX, t[0]);
        minZ = Math.min(minZ, t[2]); maxZ = Math.max(maxZ, t[2]);
      }
      for (const st of states) {
        const { layer } = st;
        for (let i = 0; i < layer.transforms.length; i++) {
          const vols = layer.volumes[i]!;
          let hit = false;
          for (const v of vols) {
            // coarse box reject first: the exact test runs only near the sightline
            if (v.x + v.r < minX || v.x - v.r > maxX || v.z + v.r < minZ || v.z - v.r > maxZ) continue;
            for (const t of targets) {
              if (sightlineHits(eye, t, v)) {
                hit = true;
                break;
              }
            }
            if (hit) break;
          }
          const before = st.stage[i]!;
          st.clear[i] = hit ? 0 : st.clear[i]! + dt;
          st.timer[i] = st.timer[i]! + dt;
          let next = before;
          if (hit && before < stages && (before === 0 || st.timer[i]! >= FADE.stageSeconds)) next = before + 1;
          else if (!hit && before > 0 && st.clear[i]! >= FADE.holdSeconds && st.timer[i]! >= FADE.stageSeconds) next = before - 1;
          if (next !== before) {
            st.stage[i] = next;
            st.timer[i] = 0;
            st.dirty = true;
          }
        }
        if (!st.dirty) continue;
        st.dirty = false;
        for (const g of st.ghosts) g.length = 0;
        layer.transforms.forEach((t, i) => {
          const s = st.stage[i]!;
          st.opaque[i] = s === 0 ? t : parked(t);
          if (s > 0) st.ghosts[s - 1]!.push(t);
        });
        for (const id of layer.opaqueIds) write(id, st.opaque, layer.colors?.[id]);
        layer.ghostIds.forEach((id, k) => write(id, st.ghosts[k]!.length ? st.ghosts[k]! : [parked(layer.transforms[0] ?? {})]));
      }
    },
    layers() {
      return layers;
    },
    faded() {
      return states.map((st) => Array.from(st.stage).flatMap((s, i) => (s > 0 ? [i] : [])));
    }
  };
}

/* ------------------------------------------------------------------ registry filled while the scene is built */

const registry: FadeLayer[] = [];
/** Called by the prop builders for every fadeable layer they mount. */
export function registerFadeLayer(layer: FadeLayer): void {
  if (layer.transforms.length > 0) registry.push(layer);
}
/** Layers registered since the last `takeFadeLayers()` (main.ts takes them after each scene build). */
export function takeFadeLayers(): FadeLayer[] {
  return registry.splice(0, registry.length);
}
