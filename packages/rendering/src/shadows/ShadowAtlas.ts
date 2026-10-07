/**
 * ShadowAtlas — spot/point local-shadow tiles on one depth atlas (PRD-02
 * Phase 4, §6.4): point lights take 6 tiles (90° fov faces, 1-texel guard),
 * spots 1 tile. Layout reuses `createShadowAtlasLayout`/`createShadowAtlasPlan`
 * (ShadowMap.ts). Cascades stay on their own 2D depth targets until Q-01-5.
 */

import { createShadowAtlasLayout, createShadowAtlasPlan, type ShadowAtlasAllocation, type ShadowAtlasPlan, type ShadowAtlasRequest } from "../ShadowMap";

export interface AtlasLightRequest {
  readonly lightIndex: number;
  readonly kind: "spot" | "point";
  readonly size: number;
}

export interface AtlasTile {
  readonly lightIndex: number;
  /** Face index for point lights (0..5); 0 for spots. */
  readonly face: number;
  readonly allocation: ShadowAtlasAllocation;
  /** Column-major view-projection into the tile's [0,1]² space (sampling matrix). */
  readonly viewProjection: Float32Array;
  /** Clip-space VP folding the tile rect into the atlas NDC (rasterize matrix). */
  readonly drawViewProjection: Float32Array;
  /** Scissor rect (atlas px) applied per draw — the 1-texel guard lives in `allocation`. */
  readonly scissor: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
}

export interface PlannedShadowAtlas {
  readonly atlasSize: number;
  readonly tiles: readonly AtlasTile[];
  readonly plan: ShadowAtlasPlan;
}

const POINT_FACES: readonly { readonly dir: readonly [number, number, number]; readonly up: readonly [number, number, number] }[] = [
  { dir: [1, 0, 0], up: [0, -1, 0] },
  { dir: [-1, 0, 0], up: [0, -1, 0] },
  { dir: [0, 1, 0], up: [0, 0, 1] },
  { dir: [0, -1, 0], up: [0, 0, -1] },
  { dir: [0, 0, 1], up: [0, -1, 0] },
  { dir: [0, 0, -1], up: [0, -1, 0] }
];

type V3 = readonly [number, number, number];

function normalize(v: V3): V3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function perspective(fovRadians: number, aspect: number, near: number, far: number): Float32Array {
  const f = 1 / Math.tan(fovRadians / 2);
  const nf = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (far + near) * nf, -1,
    0, 0, 2 * far * near * nf, 0
  ]);
}

function lookAt(eye: V3, dir: V3, up: V3): Float32Array {
  const f = normalize(dir);
  const r = normalize([f[1] * up[2] - f[2] * up[1], f[2] * up[0] - f[0] * up[2], f[0] * up[1] - f[1] * up[0]]);
  const u: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return new Float32Array([
    r[0], u[0], -f[0], 0,
    r[1], u[1], -f[1], 0,
    r[2], u[2], -f[2], 0,
    -(r[0] * eye[0] + r[1] * eye[1] + r[2] * eye[2]),
    -(u[0] * eye[0] + u[1] * eye[1] + u[2] * eye[2]),
    f[0] * eye[0] + f[1] * eye[1] + f[2] * eye[2],
    1
  ]);
}

function multiply(a: Float32Array, b: Float32Array): Float32Array {
  const out = new Float32Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      out[c * 4 + r] = a[r]! * b[c * 4]! + a[4 + r]! * b[c * 4 + 1]! + a[8 + r]! * b[c * 4 + 2]! + a[12 + r]! * b[c * 4 + 3]!;
    }
  }
  return out;
}

/** NDC [-1,1] → tile UV [0,1] (applied by the shader via atlas rect uniforms). */
function toTileUv(m: Float32Array): Float32Array {
  const bias = new Float32Array([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1]);
  return multiply(bias, m);
}

/** Unbiased clip-space VP for one point-light cube face (90° fov, square). */
function pointFaceClip(position: V3, range: number, face: number): Float32Array {
  const f = POINT_FACES[face];
  if (!f) throw new Error(`point shadow face must be 0..5, got ${face}`);
  const near = Math.max(0.01, range * 0.005);
  const far = Math.max(near + 0.01, range);
  return multiply(perspective(Math.PI / 2, 1, near, far), lookAt(position, f.dir, f.up));
}

/** Perspective VP for one point-light cube face (90° fov, square aspect). */
export function pointShadowFaceMatrix(position: V3, range: number, face: number): Float32Array {
  return toTileUv(pointFaceClip(position, range, face));
}

function spotClip(position: V3, direction: V3, range: number, outerAngleRadians: number): Float32Array {
  const near = Math.max(0.01, range * 0.005);
  const far = Math.max(near + 0.01, range);
  const fov = Math.min(Math.PI - 1e-3, Math.max(1e-3, outerAngleRadians * 2));
  const up: V3 = Math.abs(normalize(direction)[1]!) > 0.999 ? [1, 0, 0] : [0, 1, 0];
  return multiply(perspective(fov, 1, near, far), lookAt(position, normalize(direction), up));
}

/** Perspective VP for a spot light (cone angle = full outer angle, square). */
export function spotShadowMatrix(position: V3, direction: V3, range: number, outerAngleRadians: number): Float32Array {
  return toTileUv(spotClip(position, direction, range, outerAngleRadians));
}

/** NDC → tile rect NDC (atlas draw): scale by tile fraction, offset to its corner. */
function atlasTileClipMatrix(alloc: ShadowAtlasAllocation, atlasSize: number): Float32Array {
  const sx = alloc.width / atlasSize;
  const sy = alloc.height / atlasSize;
  const tx = (2 * alloc.x) / atlasSize - 1;
  const ty = (2 * alloc.y) / atlasSize - 1;
  return new Float32Array([
    sx, 0, 0, 0,
    0, sy, 0, 0,
    0, 0, 1, 0,
    tx, ty, 0, 1
  ]);
}

/**
 * Plan atlas tiles: each spot → 1 tile, each point → 6. `size` is per-tile
 * shadow resolution; `atlasSize` is the square atlas edge (px).
 */
export function planLocalShadowAtlas(
  lights: readonly (AtlasLightRequest & {
    readonly position: V3;
    readonly direction: V3;
    readonly range: number;
    readonly outerAngleRadians?: number;
  })[],
  atlasSize: number
): PlannedShadowAtlas {
  const requests: ShadowAtlasRequest[] = [];
  for (const light of lights) {
    const faces = light.kind === "point" ? 6 : 1;
    for (let face = 0; face < faces; face += 1) {
      requests.push({ id: `l${light.lightIndex}-f${face}`, size: light.size });
    }
  }
  const plan = createShadowAtlasPlan(requests, atlasSize);
  const allocationById = new Map(plan.allocations.map((a) => [a.id, a]));
  const tiles: AtlasTile[] = [];
  for (const light of lights) {
    const faces = light.kind === "point" ? 6 : 1;
    for (let face = 0; face < faces; face += 1) {
      const alloc = allocationById.get(`l${light.lightIndex}-f${face}`);
      if (!alloc) continue;
      const clip = light.kind === "point"
        ? pointFaceClip(light.position, light.range, face)
        : spotClip(light.position, light.direction, light.range, light.outerAngleRadians ?? Math.PI / 4);
      tiles.push({
        lightIndex: light.lightIndex,
        face,
        allocation: alloc,
        viewProjection: toTileUv(clip),
        drawViewProjection: multiply(atlasTileClipMatrix(alloc, atlasSize), clip),
        scissor: { x: alloc.x, y: alloc.y, width: alloc.width, height: alloc.height }
      });
    }
  }
  return { atlasSize, tiles, plan };
}
