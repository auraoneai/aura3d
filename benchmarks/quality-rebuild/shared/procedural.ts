import type { TransformSpec, Vec3 } from "./types";

/** mulberry32: tiny, fast, deterministic across JS engines. */
export function createRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const channel = (n: number): string => {
    const k = (n + h * 12) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}

/** 10k (or any count) instances on a jittered grid, seeded. */
export function instancingGrid(count: number, seed: number): { readonly transforms: TransformSpec[]; readonly colors: string[] } {
  const rng = createRng(seed);
  const side = Math.ceil(Math.sqrt(count));
  const spacing = 0.42;
  const half = ((side - 1) * spacing) / 2;
  const transforms: TransformSpec[] = [];
  const colors: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const ix = index % side;
    const iz = Math.floor(index / side);
    const height = 0.15 + rng() * 0.9;
    const x = ix * spacing - half + (rng() - 0.5) * 0.08;
    const z = iz * spacing - half + (rng() - 0.5) * 0.08;
    const yaw = rng() * Math.PI;
    transforms.push({ position: [x, height / 2, z], rotation: [0, yaw, 0], scale: [1, height / 0.3, 1] });
    colors.push(hslToHex(0.52 + rng() * 0.18, 0.55, 0.38 + rng() * 0.22));
  }
  return { transforms, colors };
}

export interface CityBuilding {
  readonly position: Vec3;
  readonly size: Vec3;
  readonly color: string;
}

/** City blocks: `blocks x blocks` blocks of `perBlock x perBlock` buildings, seeded. */
export function cityBuildings(blocks: number, perBlock: number, seed: number): CityBuilding[] {
  const rng = createRng(seed);
  const blockSize = 6;
  const street = 2.2;
  const pitch = blockSize + street;
  const origin = -((blocks - 1) * pitch) / 2;
  const lot = blockSize / perBlock;
  const palette = ["#b9b2a6", "#8f9aa3", "#c7c1b4", "#6f7b86", "#a39582", "#d3cfc6", "#7d8a8f"];
  const buildings: CityBuilding[] = [];
  for (let bx = 0; bx < blocks; bx += 1) {
    for (let bz = 0; bz < blocks; bz += 1) {
      const cx = origin + bx * pitch;
      const cz = origin + bz * pitch;
      const distance = Math.hypot(cx, cz);
      for (let lx = 0; lx < perBlock; lx += 1) {
        for (let lz = 0; lz < perBlock; lz += 1) {
          const w = lot * (0.72 + rng() * 0.2);
          const d = lot * (0.72 + rng() * 0.2);
          const downtown = Math.max(0, 1 - distance / 40);
          const h = 1.5 + rng() * 4 + downtown * rng() * 14;
          const x = cx - blockSize / 2 + lot * (lx + 0.5);
          const z = cz - blockSize / 2 + lot * (lz + 0.5);
          buildings.push({
            position: [x, h / 2, z],
            size: [w, h, d],
            color: palette[Math.floor(rng() * palette.length)]!
          });
        }
      }
    }
  }
  return buildings;
}

/** Positions for a particle volume (cylinder of `radius` x `height` around center), seeded. */
export function particlePositions(count: number, seed: number, center: Vec3, radius: number, height: number): Float32Array {
  const rng = createRng(seed);
  const out = new Float32Array(count * 3);
  for (let index = 0; index < count; index += 1) {
    const r = Math.sqrt(rng()) * radius;
    const theta = rng() * Math.PI * 2;
    const y = Math.pow(rng(), 0.7) * height;
    // Narrow toward the top like a fountain plume.
    const taper = 1 - (y / height) * 0.55;
    out[index * 3] = center[0] + Math.cos(theta) * r * taper;
    out[index * 3 + 1] = center[1] + y;
    out[index * 3 + 2] = center[2] + Math.sin(theta) * r * taper;
  }
  return out;
}
