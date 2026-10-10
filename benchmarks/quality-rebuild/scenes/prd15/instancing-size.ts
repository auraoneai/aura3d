/**
 * Lane 15 scene spec (PRD-15 §16.2): `prd15-instancing-size`.
 *
 * An instanced box batch with a **non-unit `size`** (`[0.4, 0.25, 0.6]`)
 * and a **per-instance `scale`** driven through `TransformSpec.scale` —
 * the axis lane 15 owns (the engine's `instances.box` path must honour both
 * the batch size and each instance's scale, on both adapters).
 *
 * Seeded grid, deterministic colours in the `instancingGrid` palette domain
 * so V2's extent/centroid checks discriminate a renderer that ignores scale
 * (all instances would collapse to identical extents).
 */
import type { SceneSpec, TransformSpec } from "../../shared/types";

function mulberry32(seed: number): () => number {
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

const rng = mulberry32(0xa3d15);
const ITEMS = 64;
const side = 8;
const spacing = 0.55;

const transforms: TransformSpec[] = [];
const colors: string[] = [];
for (let i = 0; i < ITEMS; i++) {
  const col = i % side;
  const row = Math.floor(i / side);
  // Per-instance scale spans 0.5x..2.0x non-uniformly per axis — a renderer
  // that drops `scale` (or the batch `size`) fails the extent check.
  const sx = 0.5 + rng() * 1.5;
  const sy = 0.5 + rng() * 1.5;
  const sz = 0.5 + rng() * 1.5;
  transforms.push({
    position: [
      (col - (side - 1) / 2) * spacing + (rng() - 0.5) * 0.08,
      (0.25 * sy) + 0.001,
      (row - (side - 1) / 2) * spacing + (rng() - 0.5) * 0.08
    ],
    rotation: [0, rng() * Math.PI * 2, 0],
    scale: [sx, sy, sz]
  });
  colors.push(hslToHex(0.5 + rng() * 0.22, 0.25 + rng() * 0.5, 0.45 + rng() * 0.25));
}

export const instancingSizeSpec: SceneSpec = {
  id: "prd15-instancing-size",
  index: 151,
  title: "Instancing — non-unit size + per-instance scale",
  purpose: "Instanced batch must honour batch `size` and each instance's `scale` (16.2 axis)",
  resolution: { width: 1280, height: 720, devicePixelRatio: 1 },
  toneMapping: "aces-filmic",
  exposure: 1,
  time: 0,
  settleFrames: 4,
  camera: { position: [3.2, 3.0, 4.4], target: [0, 0.2, 0], fov: 42, near: 0.05, far: 50 },
  background: { kind: "color", color: "#1d2126" },
  environment: { hdri: "studioSmall08", intensity: 0.55, rotation: 0 },
  lights: [
    { kind: "directional", name: "sun", color: "#fff4e6", intensity: 2.4, position: [4, 6, 3], target: [0, 0, 0], castShadow: true }
  ],
  objects: [
    {
      kind: "primitive",
      name: "ground plane",
      shape: "plane",
      size: [8, 1, 8],
      position: [0, 0, 0],
      material: { color: "#585c63", roughness: 0.92, metalness: 0 },
      castShadow: false,
      receiveShadow: true
    },
    {
      kind: "instanced",
      name: "scaled instances",
      shape: "box",
      size: [0.4, 0.25, 0.6],
      material: { color: "#ffffff", roughness: 0.55, metalness: 0 },
      transforms,
      colors,
      castShadow: true,
      receiveShadow: true
    }
  ],
  shadows: { mapSize: 2048, type: "pcf-soft", directionalExtent: 4, bias: -0.0005, normalBias: 0.02 },
  owner: "prd15",
  referenceProfile: "contract",
  masks: ["object-id", "shadow-receiver", "silhouette-edge"],
  brokenControls: ["no-aa", "no-tonemap", "dpr-half", "albedo-only", "no-shadows"],
  primaryCriterion: "Every instance's screen-space extent matches size * per-instance scale (V2 extent check)",
  primaryRegion: "silhouette-edge",
  qrFlags: ["tiers-batching"]
};
