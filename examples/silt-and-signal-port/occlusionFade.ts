/**
 * Line-of-sight fade (Idol wow pass, real-GPU QA F2): a tree between the chase camera and the courier fades to 25%
 * opacity over ~0.15 s and restores after it leaves the sightline. Cheap by construction: each tree is a bounding
 * sphere, and only the trees inside the segment's padded bounding box are sphere-tested (one linear pass over a few
 * hundred spheres per frame, no allocation). Pure logic; world.ts moves faded trees from the opaque instanced pool
 * into a few transparent slot nodes.
 */
export interface OccluderSphere {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly r: number;
}

/** Opacity of a fully faded occluder, and the fade time constant (seconds for a full fade). */
export const FADE_OPACITY = 0.25;
export const FADE_SECONDS = 0.15;
/**
 * Opacity of a crown the chase eye is inside (audit 2026-11-18): trees no longer pull the eye in (camera.ts
 * TREE_CAMERA_MARGIN), so at Turbo past a roadside tree the eye can cross a crown for up to ~0.9 s; at 25% that crown
 * would be a green veil over the whole frame, so it all but vanishes instead.
 */
export const INSIDE_OPACITY = 0.04;

/** True when the segment a->b passes within `pad` of the sphere. */
export function segmentHitsSphere(a: readonly [number, number, number], b: readonly [number, number, number], s: OccluderSphere, pad = 0): boolean {
  const dx = b[0] - a[0], dy = b[1] - a[1], dz = b[2] - a[2];
  const len2 = dx * dx + dy * dy + dz * dz;
  const t = len2 > 1e-9 ? Math.max(0, Math.min(1, ((s.x - a[0]) * dx + (s.y - a[1]) * dy + (s.z - a[2]) * dz) / len2)) : 0;
  const px = a[0] + dx * t - s.x, py = a[1] + dy * t - s.y, pz = a[2] + dz * t - s.z;
  const rr = s.r + pad;
  return px * px + py * py + pz * pz < rr * rr;
}

export interface OcclusionFade {
  /** Per-occluder opacity (1 = opaque), read after `update`. */
  readonly opacity: Float32Array;
  /** Indices currently below full opacity (at most `maxFaded`, nearest-first when more block the view). */
  readonly faded: readonly number[];
  /**
   * Advance one frame: occluders crossing the camera->subject sightline ease towards FADE_OPACITY, the rest back to 1.
   * Returns true when the set of faded indices changed (the caller rewrites its instance pools only then).
   */
  update(eye: readonly [number, number, number], subject: readonly [number, number, number], dt: number): boolean;
}

export function createOcclusionFade(spheres: readonly OccluderSphere[], options: { readonly maxFaded?: number; readonly pad?: number } = {}): OcclusionFade {
  const maxFaded = options.maxFaded ?? 4;
  const pad = options.pad ?? 0.35;
  const opacity = new Float32Array(spheres.length).fill(1);
  let faded: number[] = [];
  const blocking: number[] = [];
  const inside = new Set<number>();
  return {
    opacity,
    get faded() { return faded; },
    update(eye, subject, dt) {
      const minX = Math.min(eye[0], subject[0]) - pad, maxX = Math.max(eye[0], subject[0]) + pad;
      const minY = Math.min(eye[1], subject[1]) - pad, maxY = Math.max(eye[1], subject[1]) + pad;
      const minZ = Math.min(eye[2], subject[2]) - pad, maxZ = Math.max(eye[2], subject[2]) + pad;
      blocking.length = 0;
      inside.clear();
      for (let i = 0; i < spheres.length; i++) {
        const s = spheres[i]!;
        if (s.x + s.r < minX || s.x - s.r > maxX || s.y + s.r < minY || s.y - s.r > maxY || s.z + s.r < minZ || s.z - s.r > maxZ) continue;
        if (segmentHitsSphere(eye, subject, s, pad)) {
          blocking.push(i);
          if ((eye[0] - s.x) ** 2 + (eye[1] - s.y) ** 2 + (eye[2] - s.z) ** 2 < s.r * s.r) inside.add(i);
        }
      }
      if (blocking.length > maxFaded) {
        const d = (i: number) => (spheres[i]!.x - eye[0]) ** 2 + (spheres[i]!.y - eye[1]) ** 2 + (spheres[i]!.z - eye[2]) ** 2;
        blocking.sort((p, q) => d(p) - d(q));
        blocking.length = maxFaded;
      }
      // a crown around the eye is the nearest blocker, so the nearest-first cut above keeps it
      const step = Math.max(0, Math.min(1, dt / FADE_SECONDS)) * (1 - FADE_OPACITY);
      const next: number[] = [];
      // easing the occluders already fading (and the new ones) keeps the scan to the active few
      const active = new Set<number>([...faded, ...blocking]);
      for (const i of active) {
        const target = inside.has(i) ? INSIDE_OPACITY : blocking.includes(i) ? FADE_OPACITY : 1;
        const o = opacity[i]!;
        opacity[i] = target < o ? Math.max(target, o - step) : Math.min(target, o + step);
        if (opacity[i]! < 0.999) next.push(i);
        else opacity[i] = 1;
      }
      next.sort((p, q) => p - q);
      while (next.length > maxFaded) opacity[next.pop()!] = 1;
      const changed = next.length !== faded.length || next.some((i, k) => faded[k] !== i);
      faded = next;
      return changed;
    }
  };
}
