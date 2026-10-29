import { game, instances, material, type AuraRuntimeNodeHandle } from "@aura3d/engine";
import { COURT_X, COURT_Y, COURT_Z } from "./constants";
import type { NodeInput } from "./rigPort";

/** Most particles alive at once: the largest burst is 10 and each lives at most 0.54 s, so 48 covers overlapping bursts. */
export const PARTICLE_CAPACITY = 48;
/** World size of a fresh particle (metres); it shrinks to zero over its life. */
export const PARTICLE_SIZE = 0.09;

export interface SimParticle { x: number; y: number; z: number; life: number; maxLife?: number; color?: string }

/** One instanced sphere for every hit, bounce and net particle (C13). Built with all instances hidden at the court centre. */
export function buildParticleNodes(): NodeInput[] {
  const transforms = Array.from({ length: PARTICLE_CAPACITY }, () => ({ position: [0, -1, 0] as [number, number, number], scale: 0 }));
  return [
    instances
      .sphere({
        castShadow: false, name: "hit-particles",
        size: [1, 1, 1],
        material: material.pbr({ color: "#ffffff", roughness: 0.4 }),
        transforms,
        colors: transforms.map(() => "#ffffff")
      })
      .runtime(game.runtimeNode("hit-particles")) as unknown as NodeInput
  ];
}

const linearCache = new Map<string, readonly [number, number, number]>();
const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));

/** `#rrggbb` (or `#rgb`) to linear RGB, cached: the sim reuses a handful of colours. */
export function hexToLinear(hex: string | undefined): readonly [number, number, number] {
  const key = hex ?? "#ffffff";
  const hit = linearCache.get(key);
  if (hit) return hit;
  let h = key.replace("#", "");
  if (h.length === 3) h = h.split("").map((ch) => ch + ch).join("");
  const n = Number.parseInt(h.slice(0, 6), 16);
  const rgb: readonly [number, number, number] = Number.isFinite(n)
    ? [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]
    : [1, 1, 1];
  linearCache.set(key, rgb);
  return rgb;
}

export interface ParticleUpdater {
  /** Writes the live sim particles (court units) into the instanced node; returns how many are drawn. */
  update(handle: AuraRuntimeNodeHandle, particles: readonly SimParticle[] | undefined): number;
  readonly matrices: Float32Array;
  readonly rgba: Float32Array;
}

/** Preallocated writer: dead slots are zero-scale, so the instance count (and the dense buffer) never changes. */
export function createParticleUpdater(): ParticleUpdater {
  const matrices = new Float32Array(PARTICLE_CAPACITY * 16);
  const rgba = new Float32Array(PARTICLE_CAPACITY * 4);
  let lastDrawn = -1;
  return {
    matrices, rgba,
    update(handle, particles) {
      const list = particles ?? [];
      const n = Math.min(PARTICLE_CAPACITY, list.length);
      if (n === 0 && lastDrawn === 0) return 0;
      for (let i = 0; i < PARTICLE_CAPACITY; i++) {
        const o = i * 16;
        const p = i < n ? list[i] : undefined;
        const life = p ? Math.max(0, Math.min(1, p.life / (p.maxLife || 0.54))) : 0;
        const s = p && Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z) ? PARTICLE_SIZE * (0.35 + 0.65 * life) : 0;
        matrices[o] = s; matrices[o + 5] = s; matrices[o + 10] = s; matrices[o + 15] = 1;
        matrices[o + 12] = p && s > 0 ? p.x * COURT_X : 0;
        matrices[o + 13] = p && s > 0 ? Math.max(0.03, p.z * COURT_Y) : -1;
        matrices[o + 14] = p && s > 0 ? p.y * COURT_Z : 0;
        const [r, g, b] = hexToLinear(p?.color);
        rgba[i * 4] = r; rgba[i * 4 + 1] = g; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 1;
      }
      handle.setInstanceMatrices(matrices, PARTICLE_CAPACITY, rgba);
      handle.setVisible(n > 0);
      lastDrawn = n;
      return n;
    }
  };
}
